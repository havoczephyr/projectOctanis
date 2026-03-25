import { useRef, useCallback, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import { useTransportStore } from '../store/transportStore'
import { useTimeToPixel } from './useTimeToPixel'
import { TRACK_HEIGHT } from '../constants'
import { findClipCollision, snapToAdjacentClip } from '../utils/clipCollision'

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
  dragTrackOffset: number
}

export function useClipDrag(
  trackId: string,
  clipId: string,
  currentStartSec: number,
  clipDurationSec: number
): ClipDragState {
  const moveClip = useProjectStore((s) => s.moveClip)
  const moveClipToTrack = useProjectStore((s) => s.moveClipToTrack)
  const selectClip = useUiStore((s) => s.selectClip)
  const setRangeSelection = useUiStore((s) => s.setRangeSelection)
  const clearRangeSelection = useUiStore((s) => s.clearRangeSelection)
  const seekTo = useTransportStore((s) => s.seekTo)
  const { zoom, pixelToTime } = useTimeToPixel()
  const [dragOffsetSec, setDragOffsetSec] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isRangeSelecting, setIsRangeSelecting] = useState(false)
  const [dragTrackOffset, setDragTrackOffset] = useState(0)
  const stateRef = useRef<{
    startX: number
    startY: number
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
        startY: e.clientY,
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

          // Snap to ghost playhead (play-start marker) when within range
          const { playStartSec } = useTransportStore.getState()
          if (playStartSec != null) {
            const ghostClipRelSec = playStartSec - currentStartSec
            if (ghostClipRelSec >= 0 && ghostClipRelSec <= clipDurationSec) {
              const ghostPx = ghostClipRelSec * zoom
              if (Math.abs(relCurrentX - ghostPx) < EDGE_SNAP_PX) currentTimeSec = ghostClipRelSec
              if (Math.abs(relStartX - ghostPx) < EDGE_SNAP_PX) startTimeSec = ghostClipRelSec
            }
          }
          setRangeSelection({
            clipId,
            trackId,
            startSec: Math.min(startTimeSec, currentTimeSec),
            endSec: Math.max(startTimeSec, currentTimeSec),
          })
        } else if (stateRef.current.mode === 'grab') {
          const offset = computeDragOffset(stateRef.current.startX, ev.clientX, zoom)
          setDragOffsetSec(offset)
          const dy = ev.clientY - stateRef.current.startY
          setDragTrackOffset(Math.round(dy / TRACK_HEIGHT))
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
          let newStart = Math.max(0, stateRef.current.startSec + finalOffset)

          // Determine target track from vertical movement
          const allTracks = useProjectStore.getState().projectFile.project.tracks
          const allAudioFiles = useProjectStore.getState().projectFile.audioFiles
          const currentIdx = allTracks.findIndex((t) => t.id === trackId)
          const dy = ev.clientY - stateRef.current.startY
          const targetIdx = Math.max(0, Math.min(allTracks.length - 1, currentIdx + Math.round(dy / TRACK_HEIGHT)))
          const targetTrack = allTracks[targetIdx]

          // Snap to adjacent clips on target track
          const snapSec = pixelToTime(EDGE_SNAP_PX)
          newStart = snapToAdjacentClip(targetTrack, clipDurationSec, newStart, clipId, allAudioFiles, snapSec)

          // Collision check
          const collision = findClipCollision(targetTrack, clipDurationSec, newStart, clipId, allAudioFiles)
          if (collision) {
            useUiStore.getState().showToast('Area too small, try elsewhere', 'error')
            useUiStore.getState().setClipCollisionFlash({ trackId: targetTrack.id })
            setTimeout(() => useUiStore.getState().setClipCollisionFlash(null), 600)
          } else if (targetTrack.id === trackId) {
            moveClip(trackId, clipId, newStart)
          } else {
            moveClipToTrack(trackId, clipId, targetTrack.id, newStart)
          }
        }
        // range-select: selection stays (finalized on mouseup)

        setDragOffsetSec(0)
        setDragTrackOffset(0)
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
          setDragTrackOffset(0)
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
          setDragTrackOffset(0)
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
    [clipId, trackId, currentStartSec, clipDurationSec, moveClip, moveClipToTrack, selectClip, setRangeSelection, clearRangeSelection, seekTo, zoom, pixelToTime]
  )

  return { onMouseDown, dragOffsetSec, isDragging, isRangeSelecting, dragTrackOffset }
}
