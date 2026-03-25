import { useRef, useCallback, useState } from 'react'
import { pcmToAudioBuffer } from '../utils/pcmToAudioBuffer'

let sharedCtx: AudioContext | null = null

function getPreviewCtx(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext()
    console.debug('[Octanis:Preview] AudioContext created', { sampleRate: sharedCtx.sampleRate })
  }
  return sharedCtx
}

export function useAudioPreview(): {
  preview: (audioPath: string) => Promise<void>
  stopPreview: () => void
  isPlaying: boolean
  currentPath: string | null
} {
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const stopPreview = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch {}
      sourceRef.current = null
      console.debug('[Octanis:Preview] stopped', { path: currentPath })
    }
    setCurrentPath(null)
    setIsPlaying(false)
  }, [currentPath])

  const preview = useCallback(async (audioPath: string) => {
    // Stop any current preview
    stopPreview()

    console.debug('[Octanis:Preview] starting preview', { audioPath })
    const ctx = getPreviewCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    try {
      const { pcmData, sampleRate, channels } = await window.octanis.ffmpeg.decodeAudioFile(audioPath)
      console.debug('[Octanis:Preview] decoded via ffmpeg', { bytes: pcmData.byteLength, sampleRate, channels })

      const buffer = pcmToAudioBuffer(ctx, pcmData, sampleRate, channels)
      console.debug('[Octanis:Preview] AudioBuffer created', { durationSec: buffer.duration, sampleRate: buffer.sampleRate })

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.onended = () => {
        if (sourceRef.current === source) {
          sourceRef.current = null
          setCurrentPath(null)
          setIsPlaying(false)
          console.debug('[Octanis:Preview] playback ended naturally')
        }
      }
      source.start()
      sourceRef.current = source
      setCurrentPath(audioPath)
      setIsPlaying(true)
      console.debug('[Octanis:Preview] playing', { audioPath })
    } catch (err) {
      console.error('[Octanis:Preview] failed', { audioPath, err })
    }
  }, [stopPreview])

  return { preview, stopPreview, isPlaying, currentPath }
}
