import { useRef, useCallback } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useTimeToPixel } from './useTimeToPixel'

export function useClipDrag(trackId: string, clipId: string, currentStartSec: number) {
  const moveClip = useProjectStore((s) => s.moveClip)
  const { pixelToTime } = useTimeToPixel()
  const dragRef = useRef<{ startX: number; startSec: number } | null>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { startX: e.clientX, startSec: currentStartSec }

      function onMouseMove(ev: MouseEvent): void {
        if (!dragRef.current) return
        const dx = ev.clientX - dragRef.current.startX
        const newStart = dragRef.current.startSec + pixelToTime(dx)
        moveClip(trackId, clipId, newStart)
      }

      function onMouseUp(): void {
        dragRef.current = null
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [clipId, currentStartSec, moveClip, pixelToTime, trackId]
  )

  return { onMouseDown }
}
