import { useEffect, useRef, useCallback } from 'react'
import { useTransportStore } from '../store/transportStore'
import { useProjectStore } from '../store/projectStore'
import type { OctanisProjectFile } from '@octanis/shared'

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

  console.debug('[Octanis:Audio] buffer cache MISS — reading via IPC', { audioFileId, absolutePath })
  const arrayBuffer = await window.octanis.fs.readAudioFile(absolutePath)
  console.debug('[Octanis:Audio] decoding audio data', { audioFileId, bytes: arrayBuffer.byteLength })
  const decoded = await ctx.decodeAudioData(arrayBuffer)
  console.debug('[Octanis:Audio] decoded buffer', { audioFileId, durationSec: decoded.duration, sampleRate: decoded.sampleRate, channels: decoded.numberOfChannels })
  bufferCache.set(audioFileId, decoded)
  return decoded
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

          // Apply volume envelope via automation
          for (let i = 0; i < clip.envelope.length; i++) {
            const pt = clip.envelope[i]
            const absTime = ctx.currentTime + (clip.startSec + pt.timeSec - fromSec)
            if (absTime >= ctx.currentTime) {
              gainNode.gain.setValueAtTime(
                pt.gain * clip.volume * track.volume * masterVolume,
                absTime
              )
            }
          }

          // Fade in
          if (clip.fadeIn.durationSec > 0) {
            const fadeStart = ctx.currentTime + Math.max(0, clip.startSec - fromSec)
            gainNode.gain.setValueAtTime(0, fadeStart)
            gainNode.gain.linearRampToValueAtTime(
              clip.volume * track.volume * masterVolume,
              fadeStart + clip.fadeIn.durationSec
            )
          }

          // Fade out
          if (clip.fadeOut.durationSec > 0) {
            const fadeOutStart =
              ctx.currentTime + Math.max(0, clip.startSec + clipDuration - clip.fadeOut.durationSec - fromSec)
            gainNode.gain.setValueAtTime(
              clip.volume * track.volume * masterVolume,
              fadeOutStart
            )
            gainNode.gain.linearRampToValueAtTime(
              0,
              fadeOutStart + clip.fadeOut.durationSec
            )
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

  return { analyser: analyserRef.current ?? undefined }
}
