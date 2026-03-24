import React, { useEffect, useRef } from 'react'
import { useTransportStore } from '../../store/transportStore'
import styles from './SpectrumBars.module.css'

const BAR_COUNT = 24

// Idle animation — each bar has a slightly different pattern
const IDLE_PATTERNS = Array.from({ length: BAR_COUNT }, (_, i) => ({
  base: 8 + Math.sin(i * 0.8) * 6,
  amp: 6 + Math.cos(i * 1.1) * 4,
  freq: 0.6 + i * 0.07,
  phase: (i * Math.PI * 2) / BAR_COUNT,
}))

export function SpectrumBars({
  analyser,
}: {
  analyser?: AnalyserNode
}): React.ReactElement {
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number | undefined>(undefined)
  const isPlaying = useTransportStore((s) => s.state === 'playing')

  useEffect(() => {
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null

    function tick(t: number): void {
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray)
        const step = Math.floor(dataArray.length / BAR_COUNT)
        barsRef.current.forEach((bar, i) => {
          if (!bar) return
          const val = dataArray[i * step] / 255
          bar.style.height = `${Math.max(6, val * 100)}%`
        })
      } else {
        // Idle animation
        const tSec = t / 1000
        barsRef.current.forEach((bar, i) => {
          if (!bar) return
          const p = IDLE_PATTERNS[i]
          const h = p.base + p.amp * Math.sin(tSec * p.freq + p.phase)
          bar.style.height = `${Math.max(4, h)}%`
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [analyser, isPlaying])

  return (
    <div className={styles.container}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className={styles.bar}
          ref={(el) => { barsRef.current[i] = el }}
          style={{
            // Color gradient: green (low) → cyan (mid) → magenta (high)
            background: `hsl(${160 - (i / BAR_COUNT) * 120}deg, 100%, 60%)`,
          }}
        />
      ))}
    </div>
  )
}
