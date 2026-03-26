import { useEffect, useRef } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'

const POLL_INTERVAL = 33 // ~30fps
const HYSTERESIS_DB = 3

/**
 * Microphone hook: captures mic input, routes through master gain,
 * and performs RMS-based duck detection to ramp the music gain node.
 *
 * Signal chain:
 * getUserMedia → MediaStreamSource → micGainNode → masterGainNode (from useAudioEngine)
 *                                          ↓
 *                                   micAnalyser → RMS → duck musicGainNode
 */
export function useMicrophone(
  musicGainNode: GainNode | undefined,
  masterGainNode?: GainNode
): void {
  const micActive = useBroadcasterStore((s) => s.micActive)
  const micDuckAmount = useBroadcasterStore((s) => s.micDuckAmount)
  const micThreshold = useBroadcasterStore((s) => s.micThreshold)
  const duckAttackMs = useBroadcasterStore((s) => s.duckAttackMs)
  const duckReleaseMs = useBroadcasterStore((s) => s.duckReleaseMs)

  const streamRef = useRef<MediaStream | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micGainRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isDuckingRef = useRef(false)
  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!micActive || !musicGainNode) {
      // Clean up mic if deactivated
      cleanup()
      // Restore music gain
      if (musicGainNode && isDuckingRef.current) {
        musicGainNode.gain.setTargetAtTime(1.0, musicGainNode.context.currentTime, 0.05)
        isDuckingRef.current = false
      }
      return
    }

    let cancelled = false

    async function startMic(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        // Use musicGainNode's context
        const ctx = musicGainNode!.context as AudioContext
        ctxRef.current = ctx

        const source = ctx.createMediaStreamSource(stream)
        sourceRef.current = source

        const micGain = ctx.createGain()
        micGainRef.current = micGain
        source.connect(micGain)

        // Route mic to master if available (local monitoring)
        if (masterGainNode) {
          micGain.connect(masterGainNode)
        }

        // Analyser for RMS detection
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        source.connect(analyser)
        analyserRef.current = analyser

        // Start polling RMS for duck detection
        const timeDomainData = new Float32Array(analyser.fftSize)

        intervalRef.current = setInterval(() => {
          if (!analyserRef.current || !musicGainNode) return

          analyserRef.current.getFloatTimeDomainData(timeDomainData)

          // Compute RMS → dBFS
          let sumSq = 0
          for (let i = 0; i < timeDomainData.length; i++) {
            sumSq += timeDomainData[i] * timeDomainData[i]
          }
          const rms = Math.sqrt(sumSq / timeDomainData.length)
          const dbFS = rms > 0 ? 20 * Math.log10(rms) : -100

          const { micThreshold, micDuckAmount, duckAttackMs, duckReleaseMs } =
            useBroadcasterStore.getState()

          if (dbFS > micThreshold && !isDuckingRef.current) {
            // Start ducking
            isDuckingRef.current = true
            const targetGain = Math.max(0, 1 - micDuckAmount)
            const attackTime = duckAttackMs / 1000
            musicGainNode.gain.setTargetAtTime(
              targetGain,
              musicGainNode.context.currentTime,
              attackTime / 3 // time constant ≈ 1/3 of desired ramp
            )
          } else if (dbFS < micThreshold - HYSTERESIS_DB && isDuckingRef.current) {
            // Release duck
            isDuckingRef.current = false
            const releaseTime = duckReleaseMs / 1000
            musicGainNode.gain.setTargetAtTime(
              1.0,
              musicGainNode.context.currentTime,
              releaseTime / 3
            )
          }
        }, POLL_INTERVAL)
      } catch (err) {
        console.error('[Broadcaster:Mic] Failed to start microphone:', err)
      }
    }

    startMic()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [micActive, musicGainNode, masterGainNode]) // eslint-disable-line react-hooks/exhaustive-deps

  function cleanup(): void {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (micGainRef.current) {
      micGainRef.current.disconnect()
      micGainRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect()
      analyserRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }
}
