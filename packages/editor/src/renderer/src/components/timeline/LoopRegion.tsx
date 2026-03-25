import React, { useRef, useCallback } from 'react'
import type { Clip, LoopRegion as LoopRegionType } from '@octanis/shared'
import { useProjectStore } from '../../store/projectStore'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'

interface Props {
  trackId: string
  clip: Clip
  clipDurationSec: number
  height: number
  trackColor: string
}

export function LoopRegion({ trackId, clip, clipDurationSec, height, trackColor }: Props): React.ReactElement | null {
  const setLoop = useProjectStore((s) => s.setLoop)
  const { timeToPixel, pixelToTime } = useTimeToPixel()

  if (!clip.loop) return null

  const { startSec, endSec, count } = clip.loop
  const loopDur = endSec - startSec
  const x = timeToPixel(startSec)
  const w = timeToPixel(loopDur)
  const repeatCount = typeof count === 'number' ? count : 10

  function DragHandle({ edge }: { edge: 'start' | 'end' }): React.ReactElement {
    const dragRef = useRef<{ startX: number; originalSec: number } | null>(null)

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        dragRef.current = {
          startX: e.clientX,
          originalSec: edge === 'start' ? startSec : endSec,
        }

        function onMouseMove(ev: MouseEvent): void {
          if (!dragRef.current || !clip.loop) return
          const dx = ev.clientX - dragRef.current.startX
          const newSec = Math.max(0, dragRef.current.originalSec + pixelToTime(dx))
          const newLoop: LoopRegionType = {
            ...clip.loop,
            startSec: edge === 'start' ? Math.min(newSec, endSec - 0.1) : startSec,
            endSec: edge === 'end' ? Math.max(newSec, startSec + 0.1) : endSec,
          }
          setLoop(trackId, clip.id, newLoop)
        }

        function onMouseUp(): void {
          dragRef.current = null
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      },
      []
    )

    const handleX = edge === 'start' ? x - 3 : x + w - 3
    return (
      <div
        style={{
          position: 'absolute',
          left: handleX,
          top: 0,
          width: 6,
          height,
          cursor: 'ew-resize',
          background: trackColor,
          opacity: 0.8,
          zIndex: 4,
        }}
        onMouseDown={handleMouseDown}
      />
    )
  }

  // Build repetition overlays
  const repetitions: React.ReactElement[] = []
  for (let i = 0; i < repeatCount; i++) {
    const offsetSec = endSec + i * loopDur
    const repX = timeToPixel(offsetSec)
    const repW = timeToPixel(loopDur)

    repetitions.push(
      <div
        key={`rep-${i}`}
        style={{
          position: 'absolute',
          left: repX,
          top: 0,
          width: repW,
          height,
          background: trackColor,
          opacity: 0.18,
          borderLeft: `2px dotted ${trackColor}`,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <span
          style={{
            position: 'absolute',
            bottom: 2,
            right: 4,
            fontSize: 8,
            color: trackColor,
            opacity: 0.6,
            fontFamily: 'monospace',
          }}
        >
          x{i + 1}
        </span>
      </div>
    )
  }

  return (
    <>
      {/* Original loop source region */}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: 0,
          width: w,
          height,
          background: trackColor,
          opacity: 0.15,
          borderLeft: `2px solid ${trackColor}`,
          borderRight: `2px solid ${trackColor}`,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      <DragHandle edge="start" />
      <DragHandle edge="end" />

      {/* Loop label on source region */}
      <div
        style={{
          position: 'absolute',
          left: x + 4,
          bottom: 2,
          fontSize: 8,
          color: trackColor,
          opacity: 0.7,
          fontFamily: 'monospace',
          pointerEvents: 'none',
          zIndex: 3,
        }}
      >
        LOOP {typeof count === 'number' ? `${count}x` : '∞'}
      </div>

      {/* Ghost repetitions */}
      {repetitions}
    </>
  )
}
