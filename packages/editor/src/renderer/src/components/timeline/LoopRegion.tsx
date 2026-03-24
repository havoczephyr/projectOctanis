import React, { useRef, useCallback } from 'react'
import type { Clip, LoopRegion as LoopRegionType } from '@octanis/shared'
import { useProjectStore } from '../../store/projectStore'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'

interface Props {
  trackId: string
  clip: Clip
  height: number
  trackColor: string
}

export function LoopRegion({ trackId, clip, height, trackColor }: Props): React.ReactElement | null {
  const setLoop = useProjectStore((s) => s.setLoop)
  const { timeToPixel, pixelToTime } = useTimeToPixel()

  if (!clip.loop) return null

  const { startSec, endSec } = clip.loop
  const x = timeToPixel(startSec)
  const w = timeToPixel(endSec - startSec)

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

  return (
    <>
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
    </>
  )
}
