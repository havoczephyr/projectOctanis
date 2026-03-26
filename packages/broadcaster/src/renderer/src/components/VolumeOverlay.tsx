import { useRef, useState, useEffect } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'

const TOTAL_SEGMENTS = 16
const FADE_DELAY_MS = 2000
const FADE_DURATION_MS = 300

export function VolumeOverlay(): JSX.Element | null {
  const masterVolume = useBroadcasterStore((s) => s.masterVolume)
  const [visible, setVisible] = useState(false)
  const [opacity, setOpacity] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const prevVolumeRef = useRef(masterVolume)
  const mountedRef = useRef(false)

  useEffect(() => {
    // Skip initial mount
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    if (masterVolume === prevVolumeRef.current) return
    prevVolumeRef.current = masterVolume

    // Show overlay
    setVisible(true)
    setOpacity(1)

    // Clear any pending timers
    if (timerRef.current) clearTimeout(timerRef.current)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)

    // Start fade-out after delay
    timerRef.current = setTimeout(() => {
      setOpacity(0)
      fadeTimerRef.current = setTimeout(() => {
        setVisible(false)
      }, FADE_DURATION_MS)
    }, FADE_DELAY_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [masterVolume])

  if (!visible) return null

  const filledCount = Math.round(masterVolume * TOTAL_SEGMENTS)
  const filled = '\u2588'.repeat(filledCount)
  const empty = '\u2591'.repeat(TOTAL_SEGMENTS - filledCount)

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      opacity,
      transition: `opacity ${FADE_DURATION_MS}ms ease`,
      pointerEvents: 'none',
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: 14,
      color: '#39ff14',
      textShadow: '0 0 8px #39ff14, 0 0 16px rgba(57, 255, 20, 0.4)',
      background: 'rgba(0, 0, 0, 0.7)',
      padding: '6px 12px',
      borderRadius: 2,
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
    }}>
      VOLUME {filled}{empty}
    </div>
  )
}
