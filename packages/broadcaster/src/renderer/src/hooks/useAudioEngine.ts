import { useEffect, useRef, useCallback } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'
import {
  type OctanisProjectFile,
  interpolateFadeRegionGain,
  interpolateFadeRegions,
  isTimeMuted,
  DUCK_OFFSET,
} from '@octanis/shared'
import { pcmToAudioBuffer } from '../utils/pcmToAudioBuffer'

const bufferCache = new Map<string, AudioBuffer>()

async function getAudioBuffer(
  ctx: AudioContext,
  absolutePath: string,
  audioFileId: string,
  audioFiles: OctanisProjectFile['audioFiles']
): Promise<AudioBuffer> {
  const cached = bufferCache.get(audioFileId)
  if (cached) return cached

  const af = audioFiles[audioFileId]
  const { pcmData, sampleRate, channels } = await window.octanis.ffmpeg.decodeAudioFile(
    absolutePath,
    af?.sampleRate,
    af?.channels
  )
  const buffer = pcmToAudioBuffer(ctx, pcmData, sampleRate, channels)
  bufferCache.set(audioFileId, buffer)
  return buffer
}

export interface AudioEngineResult {
  analyser: AnalyserNode | undefined
  musicGainNode: GainNode | undefined
  masterGainNode: GainNode | undefined
}

/**
 * Broadcaster audio engine — read-only playback with musicGainNode for mic ducking.
 *
 * Signal chain:
 * [BufferSourceNodes] → [TrackGainNodes] → [MusicGainNode] → [MasterGainNode] → [AnalyserNode] → destination
 *                                                ↑ (duck target for mic)
 */
export function useAudioEngine(): AudioEngineResult {
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const musicGainRef = useRef<GainNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const trackGainNodesRef = useRef<Map<string, GainNode>>(new Map())
  const startWallTimeRef = useRef(0)
  const startPlayheadRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  const transportState = useBroadcasterStore((s) => s.transportState)
  const setPlayhead = useBroadcasterStore((s) => s.setPlayhead)

  // Eagerly init AudioContext so masterGainNode is always available (e.g. for SFU capture)
  useEffect(() => {
    if (!ctxRef.current) {
      const ctx = new AudioContext({ latencyHint: 'playback' })
      ctxRef.current = ctx

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.connect(ctx.destination)
      analyserRef.current = analyser

      const masterGain = ctx.createGain()
      masterGain.connect(analyser)
      masterGainRef.current = masterGain

      const musicGain = ctx.createGain()
      musicGain.connect(masterGain)
      musicGainRef.current = musicGain
    }
  }, [])

  function getCtx(): AudioContext {
    return ctxRef.current!
  }

  function getTrackGainNode(trackId: string): GainNode {
    const ctx = getCtx()
    const existing = trackGainNodesRef.current.get(trackId)
    if (existing) return existing
    const node = ctx.createGain()
    node.connect(musicGainRef.current!)
    trackGainNodesRef.current.set(trackId, node)
    return node
  }

  function stopAll(): void {
    sourcesRef.current.forEach((src) => {
      try { src.stop() } catch {}
    })
    sourcesRef.current = []
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }

  const schedulePlayback = useCallback(async (projectFile: OctanisProjectFile, fromSec: number) => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    stopAll()

    startWallTimeRef.current = ctx.currentTime
    startPlayheadRef.current = fromSec

    const { tracks, masterVolume } = projectFile.project
    const audioFiles = projectFile.audioFiles
    const bcastVol = useBroadcasterStore.getState().masterVolume
    if (masterGainRef.current) masterGainRef.current.gain.value = masterVolume * bcastVol

    for (const track of tracks) {
      if (track.muted) continue
      const trackGainNode = getTrackGainNode(track.id)
      trackGainNode.gain.value = track.volume

      for (const clip of track.clips) {
        const audioFile = audioFiles[clip.audioFileId]
        if (!audioFile) continue

        const clipDuration = clip.trimEndSec != null
          ? clip.trimEndSec - clip.trimStartSec
          : audioFile.durationSec
        const loopExtension = clip.loop
          ? (clip.loop.endSec - clip.loop.startSec) * (typeof clip.loop.count === 'number' ? clip.loop.count : 10)
          : 0
        const effectiveDuration = clipDuration + loopExtension
        const clipEndSec = clip.startSec + effectiveDuration
        if (clipEndSec < fromSec) continue

        try {
          const buffer = await getAudioBuffer(ctx, audioFile.absolutePath, clip.audioFileId, audioFiles)

          function scheduleSegment(
            absStartSec: number,
            bufferOffset: number,
            segDuration: number,
            applyAutomation: boolean
          ): void {
            if (segDuration <= 0) return
            if (absStartSec + segDuration < fromSec) return

            const source = ctx.createBufferSource()
            source.buffer = buffer

            const gainNode = ctx.createGain()
            gainNode.gain.value = clip.volume
            source.connect(gainNode)
            gainNode.connect(trackGainNode)

            if (applyAutomation) {
              for (const region of clip.fadeRegions) {
                const regionDuration = region.endSec - region.startSec
                if (regionDuration <= 0) continue

                const regionClipStart = clip.startSec + region.startSec
                const regionClipEnd = clip.startSec + region.endSec
                if (fromSec > regionClipStart && fromSec < regionClipEnd) {
                  const tAtPlayhead = (fromSec - regionClipStart) / regionDuration
                  gainNode.gain.setValueAtTime(
                    interpolateFadeRegionGain(region, tAtPlayhead) * clip.volume,
                    ctx.currentTime
                  )
                }

                const steps = Math.max(10, Math.ceil(regionDuration * 50))
                for (let i = 0; i <= steps; i++) {
                  const t = i / steps
                  const isDuckNeighbor = region.controlPoints.some(
                    (cp) => cp.duck && Math.abs(t - cp.x) < DUCK_OFFSET * 2
                  )
                  if (isDuckNeighbor) continue
                  const timeSec = region.startSec + t * regionDuration
                  const absTime = ctx.currentTime + (clip.startSec + timeSec - fromSec)
                  if (absTime < ctx.currentTime) continue
                  gainNode.gain.setValueAtTime(interpolateFadeRegionGain(region, t) * clip.volume, absTime)
                }

                for (const cp of region.controlPoints) {
                  if (!cp.duck) continue
                  const cpTimeSec = region.startSec + cp.x * regionDuration
                  const cpAbsTime = ctx.currentTime + (clip.startSec + cpTimeSec - fromSec)
                  if (cpAbsTime < ctx.currentTime) continue
                  gainNode.gain.setValueAtTime(cp.gain * clip.volume, cpAbsTime)
                }
              }

              if (isTimeMuted(clip.muteRegions, Math.max(0, fromSec - clip.startSec))) {
                gainNode.gain.setValueAtTime(0, ctx.currentTime)
              }
              for (const muteRegion of clip.muteRegions) {
                const muteStartAbs = ctx.currentTime + (clip.startSec + muteRegion.startSec - fromSec)
                const muteEndAbs = ctx.currentTime + (clip.startSec + muteRegion.endSec - fromSec)
                if (muteEndAbs < ctx.currentTime) continue
                gainNode.gain.setValueAtTime(0, Math.max(ctx.currentTime, muteStartAbs))
                if (muteEndAbs >= ctx.currentTime) {
                  const restoreGain = interpolateFadeRegions(clip.fadeRegions, muteRegion.endSec, clip.volume)
                  gainNode.gain.setValueAtTime(restoreGain, muteEndAbs)
                }
              }
            }

            const when = Math.max(0, ctx.currentTime + absStartSec - fromSec)
            const skipInto = Math.max(0, fromSec - absStartSec)
            const playOffset = bufferOffset + skipInto
            const playDuration = segDuration - skipInto

            if (playDuration > 0) {
              source.start(when, playOffset, playDuration)
              sourcesRef.current.push(source)
            }
          }

          if (clip.loop) {
            const loopDur = clip.loop.endSec - clip.loop.startSec
            const loopCount = typeof clip.loop.count === 'number' ? clip.loop.count : 10

            scheduleSegment(clip.startSec, clip.trimStartSec, clip.loop.endSec, true)
            for (let li = 0; li < loopCount; li++) {
              scheduleSegment(clip.startSec + clip.loop.endSec + li * loopDur, clip.trimStartSec + clip.loop.startSec, loopDur, false)
            }
            const remainder = clipDuration - clip.loop.endSec
            if (remainder > 0) {
              scheduleSegment(clip.startSec + clip.loop.endSec + loopCount * loopDur, clip.trimStartSec + clip.loop.endSec, remainder, false)
            }
          } else {
            scheduleSegment(clip.startSec, clip.trimStartSec, clipDuration, true)
          }
        } catch (err) {
          console.error('[Broadcaster:Audio] Failed to schedule clip', clip.id, err)
        }
      }
    }

    // Playhead animation
    function tick(): void {
      const elapsed = (ctxRef.current?.currentTime ?? 0) - startWallTimeRef.current
      setPlayhead(startPlayheadRef.current + elapsed)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [setPlayhead])

  // React to transport state changes
  useEffect(() => {
    const { projectFile, playheadSec } = useBroadcasterStore.getState()
    if (transportState === 'playing' && projectFile) {
      schedulePlayback(projectFile, playheadSec)
    } else if (transportState === 'paused' || transportState === 'stopped') {
      stopAll()
    }
  }, [transportState, schedulePlayback])

  // React to broadcaster master volume changes
  const broadcasterVolume = useBroadcasterStore((s) => s.masterVolume)
  useEffect(() => {
    if (masterGainRef.current) {
      const projectVol = useBroadcasterStore.getState().projectFile?.project?.masterVolume ?? 1.0
      masterGainRef.current.gain.setTargetAtTime(
        projectVol * broadcasterVolume,
        masterGainRef.current.context.currentTime,
        0.015
      )
    }
  }, [broadcasterVolume])

  return {
    analyser: analyserRef.current ?? undefined,
    musicGainNode: musicGainRef.current ?? undefined,
    masterGainNode: masterGainRef.current ?? undefined,
  }
}
