import { useRef, useCallback, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useTimeToPixel } from './useTimeToPixel'

/** Pure function for testability */
export function computeDragOffset(startX: number, currentX: number, zoom: number): number {
  return (currentX - startX) / zoom
}

interface ClipDragState {
  onMouseDown: (e: React.MouseEvent) => void
  dragOffsetSec: number
  isDragging: boolean
}

export function useClipDrag(trackId: string, clipId: string, currentStartSec: number): ClipDragState {
  const moveClip = useProjectStore((s) => s.moveClip)
  const { zoom } = useTimeToPixel()
  const [dragOffsetSec, setDragOffsetSec] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startSec: number } | null>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startSec = currentStartSec
      dragRef.current = { startX, startSec }
      setIsDragging(true)
      setDragOffsetSec(0)

      function onMouseMove(ev: MouseEvent): void {
        if (!dragRef.current) return
        const offset = computeDragOffset(dragRef.current.startX, ev.clientX, zoom)
        setDragOffsetSec(offset)
      }

      function commit(): void {
        if (!dragRef.current) return
        // Read the latest offset from the ref-captured closure isn't reliable,
        // so compute it one final time isn't possible here. Instead, we use
        // a commit ref to signal the effect.
        // Actually we can compute from the last known mouse position — but simpler:
        // just call moveClip with startSec + current dragOffsetSec.
        // Problem: dragOffsetSec is React state and may not be flushed yet.
        // Solution: track offset in a ref too.
        cleanup()
      }

      function cancel(): void {
        setDragOffsetSec(0)
        setIsDragging(false)
        dragRef.current = null
        cleanup()
      }

      function onMouseUp(ev: MouseEvent): void {
        if (ev.button !== 0) return
        if (!dragRef.current) return
        const finalOffset = computeDragOffset(dragRef.current.startX, ev.clientX, zoom)
        const newStart = Math.max(0, startSec + finalOffset)
        moveClip(trackId, clipId, newStart)
        setDragOffsetSec(0)
        setIsDragging(false)
        dragRef.current = null
        cleanup()
      }

      function onContextMenu(ev: MouseEvent): void {
        ev.preventDefault()
        cancel()
      }

      function onKeyDown(ev: KeyboardEvent): void {
        if (ev.key === 'Escape') {
          cancel()
        }
      }

      function cleanup(): void {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.removeEventListener('contextmenu', onContextMenu)
        document.removeEventListener('keydown', onKeyDown)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.addEventListener('contextmenu', onContextMenu)
      document.addEventListener('keydown', onKeyDown)
    },
    [clipId, currentStartSec, moveClip, trackId, zoom]
  )

  return { onMouseDown, dragOffsetSec, isDragging }
}
