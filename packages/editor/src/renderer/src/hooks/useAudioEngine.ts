import { useEffect, useRef, useCallback } from 'react'
import { useTransportStore } from '../store/transportStore'
import { useProjectStore } from '../store/projectStore'
import { type OctanisProjectFile, interpolateFadeRegionGain } from '@octanis/shared'
import { pcmToAudioBuffer } from '../utils/pcmToAudioBuffer'

// Cache for decoded AudioBuffers by audioFileId
const bufferCache = new Map<string, AudioBuffer>()

async function getAudioBuffer(
  ctx: AudioContext,
  absolutePath: string,
  audioFileId: string
): Promise<AudioBuffer> {
  const cached = bufferCache.get(audioFileId)
  if (cached) {
    console.debug('[Octanis:Audio] buffer cache HIT', { audioFileId, durationSec: cached.duration })
    return cached
  }

  console.debug('[Octanis:Audio] buffer cache MISS — decoding via ffmpeg IPC', { audioFileId, absolutePath })
  const audioFiles = useProjectStore.getState().projectFile.audioFiles
  const af = audioFiles[audioFileId]

  const { pcmData, sampleRate, channels } = await window.octanis.ffmpeg.decodeAudioFile(
    absolutePath,
    af?.sampleRate,
    af?.channels
  )
  console.debug('[Octanis:Audio] decoded PCM', { audioFileId, bytes: pcmData.byteLength, sampleRate, channels })

  const buffer = pcmToAudioBuffer(ctx, pcmData, sampleRate, channels)
  console.debug('[Octanis:Audio] AudioBuffer created', { audioFileId, durationSec: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels })
  bufferCache.set(audioFileId, buffer)
  return buffer
}

export function useAudioEngine(): { analyser: AnalyserNode | undefined } {
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const startWallTimeRef = useRef<number>(0)
  const startPlayheadRef = useRef<number>(0)
  const rafRef = useRef<number | undefined>(undefined)

  const transportState = useTransportStore((s) => s.state)
  const setPlayhead = useTransportStore((s) => s.setPlayhead)

  function getCtx(): AudioContext {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
      console.debug('[Octanis:Audio] AudioContext created', { sampleRate: ctxRef.current.sampleRate, state: ctxRef.current.state })
      const analyser = ctxRef.current.createAnalyser()
      analyser.fftSize = 256
      analyser.connect(ctxRef.current.destination)
      analyserRef.current = analyser
    }
    return ctxRef.current
  }

  function stopAll(): void {
    console.debug('[Octanis:Audio] stopAll', { sourceCount: sourcesRef.current.length })
    sourcesRef.current.forEach((src) => {
      try { src.stop() } catch {}
    })
    sourcesRef.current = []
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }

  // Schedule audio playback
  const schedulePlayback = useCallback(async (projectFile: OctanisProjectFile, fromSec: number) => {
    const ctx = getCtx()
    console.debug('[Octanis:Audio] schedulePlayback', {
      fromSec,
      ctxState: ctx.state,
      trackCount: projectFile.project.tracks.length,
      totalClips: projectFile.project.tracks.reduce((n, t) => n + t.clips.length, 0),
      masterVolume: projectFile.project.masterVolume,
    })
    if (ctx.state === 'suspended') await ctx.resume()
    stopAll()

    startWallTimeRef.current = ctx.currentTime
    startPlayheadRef.current = fromSec

    const { tracks, masterVolume } = projectFile.project
    const audioFiles = projectFile.audioFiles

    for (const track of tracks) {
      if (track.muted) { console.debug('[Octanis:Audio] skipping muted track', track.id); continue }

      for (const clip of track.clips) {
        const audioFile = audioFiles[clip.audioFileId]
        if (!audioFile) { console.debug('[Octanis:Audio] clip missing audioFile', { clipId: clip.id, audioFileId: clip.audioFileId }); continue }

        // Only schedule clips that haven't ended before fromSec
        const clipDuration = clip.trimEndSec != null
          ? clip.trimEndSec - clip.trimStartSec
          : audioFile.durationSec
        const clipEndSec = clip.startSec + clipDuration
        if (clipEndSec < fromSec) continue

        try {
          const buffer = await getAudioBuffer(ctx, audioFile.absolutePath, clip.audioFileId)
          const source = ctx.createBufferSource()
          source.buffer = buffer

          const gainNode = ctx.createGain()
          gainNode.gain.value = clip.volume * track.volume * masterVolume
          source.connect(gainNode)
          gainNode.connect(analyserRef.current ?? ctx.destination)

          // Apply fade regions via multi-point interpolation
          for (const region of clip.fadeRegions) {
            const regionDuration = region.endSec - region.startSec
            if (regionDuration <= 0) continue

            // If playback starts mid-region, inject gain at current time
            const regionClipStart = clip.startSec + region.startSec
            const regionClipEnd = clip.startSec + region.endSec
            if (fromSec > regionClipStart && fromSec < regionClipEnd) {
              const tAtPlayhead = (fromSec - regionClipStart) / regionDuration
              const regionGainAtPlayhead = interpolateFadeRegionGain(region, tAtPlayhead)
              gainNode.gain.setValueAtTime(
                regionGainAtPlayhead * clip.volume * track.volume * masterVolume,
                ctx.currentTime
              )
            }

            const steps = Math.max(10, Math.ceil(regionDuration * 50))
            for (let i = 0; i <= steps; i++) {
              const t = i / steps
              const timeSec = region.startSec + t * regionDuration
              const absTime = ctx.currentTime + (clip.startSec + timeSec - fromSec)
              if (absTime < ctx.currentTime) continue
              const regionGain = interpolateFadeRegionGain(region, t)
              const gain = regionGain * clip.volume * track.volume * masterVolume
              gainNode.gain.setValueAtTime(gain, absTime)
            }
          }

          // Schedule the clip
          const when = Math.max(0, ctx.currentTime + clip.startSec - fromSec)
          const offset = clip.trimStartSec + Math.max(0, fromSec - clip.startSec)
          const duration = clipDuration - Math.max(0, fromSec - clip.startSec)

          console.debug('[Octanis:Audio] scheduling clip', { clipId: clip.id, audioFileId: clip.audioFileId, when, offset, duration, startSec: clip.startSec })
          source.start(when, offset, duration)
          sourcesRef.current.push(source)
        } catch (err) {
          console.error('[Octanis:Audio] failed to schedule clip', { clipId: clip.id, err })
        }
      }
    }

    // Animate playhead
    function tick(): void {
      const elapsed = (ctxRef.current?.currentTime ?? 0) - startWallTimeRef.current
      setPlayhead(startPlayheadRef.current + elapsed)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [setPlayhead])

  useEffect(() => {
    const { state, playheadSec } = useTransportStore.getState()
    const { projectFile } = useProjectStore.getState()
    console.debug('[Octanis:Audio] transport effect', { transportState, playheadSec })

    if (transportState === 'playing') {
      schedulePlayback(projectFile, playheadSec)
    } else if (transportState === 'paused' || transportState === 'stopped') {
      stopAll()
    }
  }, [transportState, schedulePlayback])

  // Re-schedule when project state changes during playback
  useEffect(() => {
    const unsub = useProjectStore.subscribe(
      (s) => s.projectFile,
      (projectFile) => {
        const { state, playheadSec } = useTransportStore.getState()
        if (state === 'playing') {
          schedulePlayback(projectFile, playheadSec)
        }
      }
    )
    return unsub
  }, [schedulePlayback])

  return { analyser: analyserRef.current ?? undefined }
}
