import { useRef, useCallback, useEffect } from 'react'
import { useUiStore } from '../store/uiStore'

interface Props {
  analyser: AnalyserNode | undefined
  transportState: 'stopped' | 'playing' | 'paused'
}

const BAR_COUNT = 64
const ATTACK = 0.4
const RELEASE = 0.06

// Pre-computed HSL gradient: green (120°) → cyan (180°) → magenta (300°)
const BAR_COLORS: string[] = Array.from({ length: BAR_COUNT }, (_, i) => {
  const t = i / (BAR_COUNT - 1)
  const hue = 120 + t * 180
  return `hsl(${hue}, 100%, 55%)`
})

const BAR_GLOW_COLORS: string[] = Array.from({ length: BAR_COUNT }, (_, i) => {
  const t = i / (BAR_COUNT - 1)
  const hue = 120 + t * 180
  return `hsla(${hue}, 100%, 55%, 0.5)`
})

export function Spectrograph({ analyser, transportState }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastDrawRef = useRef<number>(0)
  const smoothedRef = useRef(new Float32Array(BAR_COUNT))
  const freqDataRef = useRef<Uint8Array | null>(null)
  const uiIntensity = useUiStore((s) => s.uiIntensity)

  const draw = useCallback(() => {
    rafRef.current = requestAnimationFrame(draw)

    const now = performance.now()
    const minInterval = uiIntensity === 'low' ? 80 : uiIntensity === 'balanced' ? 50 : 0
    if (now - lastDrawRef.current < minInterval) return
    lastDrawRef.current = now

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // DPR scaling
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const isPlaying = analyser && transportState === 'playing'
    const sb = smoothedRef.current

    // Audio processing
    if (isPlaying) {
      if (!freqDataRef.current || freqDataRef.current.length !== analyser.frequencyBinCount) {
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount)
      }
      analyser.getByteFrequencyData(freqDataRef.current)

      const binsPerBar = Math.floor(freqDataRef.current.length / BAR_COUNT)
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0
        for (let b = i * binsPerBar; b < (i + 1) * binsPerBar && b < freqDataRef.current.length; b++) {
          sum += freqDataRef.current[b]
        }
        const raw = sum / binsPerBar / 255
        if (raw > sb[i]) {
          sb[i] += (raw - sb[i]) * ATTACK
        } else {
          sb[i] += (raw - sb[i]) * RELEASE
        }
      }
    } else {
      // Decay toward idle breathing
      for (let i = 0; i < BAR_COUNT; i++) {
        sb[i] *= 0.95
      }
    }

    // Render
    const cy = h / 2
    const barW = w / BAR_COUNT
    const maxBarH = cy - 4
    const highQ = uiIntensity === 'high'
    const medQ = uiIntensity === 'balanced'

    for (let i = 0; i < BAR_COUNT; i++) {
      let barH: number
      if (isPlaying) {
        barH = Math.max(2, sb[i] * maxBarH)
      } else {
        // Idle: gentle breathing
        const breathe = Math.sin(now * 0.0008 + i * 0.15) * 1.5 + 2
        barH = Math.max(2, sb[i] * maxBarH + breathe)
      }

      const x = i * barW

      // Glow pass (high/balanced only)
      if (highQ || medQ) {
        ctx.shadowBlur = highQ ? 10 : 5
        ctx.shadowColor = BAR_GLOW_COLORS[i]
      }

      ctx.fillStyle = BAR_COLORS[i]

      // Top half (grows upward from center)
      ctx.fillRect(x, cy - barH, barW - 1, barH)
      // Bottom half (mirror, grows downward from center)
      ctx.fillRect(x, cy, barW - 1, barH)
    }

    // Reset shadow
    ctx.shadowBlur = 0
  }, [analyser, transportState, uiIntensity])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
