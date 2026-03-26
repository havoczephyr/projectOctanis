import { useRef, useEffect } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'

const ROTATION_MIN = -135
const ROTATION_MAX = 135
const SENSITIVITY = 0.004 // volume change per pixel of horizontal drag

export function VolumeKnob(): JSX.Element {
  const masterVolume = useBroadcasterStore((s) => s.masterVolume)
  const setMasterVolume = useBroadcasterStore((s) => s.setMasterVolume)
  const knobRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const rotation = ROTATION_MIN + masterVolume * (ROTATION_MAX - ROTATION_MIN)
  const pct = Math.round(masterVolume * 100)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      // movementX works with pointer lock — gives delta even past window edges
      const cur = useBroadcasterStore.getState().masterVolume
      setMasterVolume(Math.max(0, Math.min(1, cur + e.movementX * SENSITIVITY)))
    }

    const onMouseUp = (): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.exitPointerLock()
    }

    const onPointerLockChange = (): void => {
      // If pointer lock was released externally (e.g. Escape key), stop dragging
      if (!document.pointerLockElement && draggingRef.current) {
        draggingRef.current = false
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
    }
  }, [setMasterVolume])

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    draggingRef.current = true
    knobRef.current?.requestPointerLock()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {/* Knob body */}
      <div
        ref={knobRef}
        onMouseDown={onMouseDown}
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, #2a2a3a 0%, #0d0d1a 80%)',
          border: '2px solid #3a3a4a',
          boxShadow:
            'inset 0 2px 6px rgba(0,0,0,0.6), 0 0 12px rgba(0, 255, 204, 0.08)',
          cursor: 'grab',
          position: 'relative',
          transform: `rotate(${rotation}deg)`,
          transition: draggingRef.current ? 'none' : 'transform 0.08s ease',
          userSelect: 'none',
        }}
      >
        {/* Notch indicator */}
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 3,
            height: 10,
            borderRadius: 2,
            background: 'var(--accent-cyan)',
            boxShadow: '0 0 6px var(--accent-cyan)',
          }}
        />
        {/* Center cap */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#1a1a2a',
            border: '1px solid #3a3a4a',
          }}
        />
      </div>
      {/* Readout */}
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.05em',
        }}
      >
        {pct}%
      </div>
    </div>
  )
}
