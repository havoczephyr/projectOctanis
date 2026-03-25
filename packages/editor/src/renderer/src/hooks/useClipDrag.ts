import { useRef, useCallback, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import { useTransportStore } from '../store/transportStore'
import { useTimeToPixel } from './useTimeToPixel'

/** Pure function for testability */
export function computeDragOffset(startX: number, currentX: number, zoom: number): number {
  return (currentX - startX) / zoom
}

const HOLD_DELAY_MS = 380
const DRAG_THRESHOLD_PX = 3
const EDGE_SNAP_PX = 8

type InteractionMode = 'pending' | 'range-select' | 'grab'

interface ClipDragState {
  onMouseDown: (e: React.MouseEvent) => void
  dragOffsetSec: number
  isDragging: boolean
  isRangeSelecting: boolean
}

export function useClipDrag(
  trackId: string,
  clipId: string,
  currentStartSec: number,
  clipDurationSec: number
): ClipDragState {
  const moveClip = useProjectStore((s) => s.moveClip)
  const selectClip = useUiStore((s) => s.selectClip)
  const setRangeSelection = useUiStore((s) => s.setRangeSelection)
  const clearRangeSelection = useUiStore((s) => s.clearRangeSelection)
  const seekTo = useTransportStore((s) => s.seekTo)
  const { zoom, pixelToTime } = useTimeToPixel()
  const [dragOffsetSec, setDragOffsetSec] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isRangeSelecting, setIsRangeSelecting] = useState(false)
  const stateRef = useRef<{
    startX: number
    startSec: number
    mode: InteractionMode
    holdTimer: ReturnType<typeof setTimeout> | null
    clipElementRect: DOMRect
  } | null>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const clipElement = e.currentTarget as HTMLElement
      const clipRect = clipElement.getBoundingClientRect()
      const startX = e.clientX

      stateRef.current = {
        startX,
        startSec: currentStartSec,
        mode: 'pending',
        holdTimer: null,
        clipElementRect: clipRect,
      }

      // Select the clip immediately on mousedown
      selectClip(clipId, e.shiftKey)

      // Start hold timer — if it fires, we enter grab mode
      const holdTimer = setTimeout(() => {
        if (!stateRef.current || stateRef.current.mode !== 'pending') return
        stateRef.current.mode = 'grab'
        setIsDragging(true)
        setDragOffsetSec(0)
      }, HOLD_DELAY_MS)

      stateRef.current.holdTimer = holdTimer

      function onMouseMove(ev: MouseEvent): void {
        if (!stateRef.current) return
        const dx = ev.clientX - stateRef.current.startX

        if (stateRef.current.mode === 'pending') {
          if (Math.abs(dx) > DRAG_THRESHOLD_PX) {
            // Movement before hold timer → range selection
            if (stateRef.current.holdTimer) {
              clearTimeout(stateRef.current.holdTimer)
              stateRef.current.holdTimer = null
            }
            stateRef.current.mode = 'range-select'
            setIsRangeSelecting(true)
          } else {
            return // Not enough movement yet, still pending
          }
        }

        if (stateRef.current.mode === 'range-select') {
          const rect = stateRef.current.clipElementRect
          const relStartX = stateRef.current.startX - rect.left
          const relCurrentX = ev.clientX - rect.left
          const clipWidthPx = rect.width

          let startTimeSec = Math.max(0, Math.min(clipDurationSec, pixelToTime(relStartX)))
          let currentTimeSec = Math.max(0, Math.min(clipDurationSec, pixelToTime(relCurrentX)))

          // Snap to clip edges when near the boundary or past it
          if (relStartX < EDGE_SNAP_PX) startTimeSec = 0
          if (relStartX > clipWidthPx - EDGE_SNAP_PX) startTimeSec = clipDurationSec
          if (relCurrentX < EDGE_SNAP_PX) currentTimeSec = 0
          if (relCurrentX > clipWidthPx - EDGE_SNAP_PX) currentTimeSec = clipDurationSec
          setRangeSelection({
            clipId,
            trackId,
            startSec: Math.min(startTimeSec, currentTimeSec),
            endSec: Math.max(startTimeSec, currentTimeSec),
          })
        } else if (stateRef.current.mode === 'grab') {
          const offset = computeDragOffset(stateRef.current.startX, ev.clientX, zoom)
          setDragOffsetSec(offset)
        }
      }

      function onMouseUp(ev: MouseEvent): void {
        if (ev.button !== 0 || !stateRef.current) return

        if (stateRef.current.holdTimer) {
          clearTimeout(stateRef.current.holdTimer)
          stateRef.current.holdTimer = null
        }

        if (stateRef.current.mode === 'pending') {
          // Fast click — move playhead to click position and clear any range selection
          const rect = stateRef.current.clipElementRect
          const relX = ev.clientX - rect.left
          const clickTimeSec = currentStartSec + pixelToTime(relX)
          seekTo(Math.max(0, clickTimeSec))
          clearRangeSelection()
        } else if (stateRef.current.mode === 'grab') {
          const finalOffset = computeDragOffset(stateRef.current.startX, ev.clientX, zoom)
          const newStart = Math.max(0, stateRef.current.startSec + finalOffset)
          moveClip(trackId, clipId, newStart)
        }
        // range-select: selection stays (finalized on mouseup)

        setDragOffsetSec(0)
        setIsDragging(false)
        setIsRangeSelecting(false)
        stateRef.current = null
        cleanup()
      }

      function onContextMenu(ev: MouseEvent): void {
        // Cancel any in-progress drag/range-select on right-click
        if (stateRef.current?.mode === 'grab') {
          ev.preventDefault()
          setDragOffsetSec(0)
          setIsDragging(false)
        }
        if (stateRef.current?.mode === 'range-select') {
          setIsRangeSelecting(false)
        }
        if (stateRef.current?.holdTimer) {
          clearTimeout(stateRef.current.holdTimer)
        }
        stateRef.current = null
        cleanup()
      }

      function onKeyDown(ev: KeyboardEvent): void {
        if (ev.key === 'Escape') {
          if (stateRef.current?.holdTimer) {
            clearTimeout(stateRef.current.holdTimer)
          }
          setDragOffsetSec(0)
          setIsDragging(false)
          setIsRangeSelecting(false)
          stateRef.current = null
          cleanup()
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
    [clipId, trackId, currentStartSec, clipDurationSec, moveClip, selectClip, setRangeSelection, clearRangeSelection, seekTo, zoom, pixelToTime]
  )

  return { onMouseDown, dragOffsetSec, isDragging, isRangeSelecting }
}
