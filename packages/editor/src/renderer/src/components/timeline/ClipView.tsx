import React from 'react'
import type { Track, Clip } from '@octanis/shared'
import { WaveformCanvas } from './WaveformCanvas'
import { FadeRegionOverlay } from './FadeRegionOverlay'
import { LoopRegion } from './LoopRegion'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import { useClipDrag } from '../../hooks/useClipDrag'
import { useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'

interface Props {
  track: Track
  clip: Clip
  laneHeight: number
}

export function ClipView({ track, clip, laneHeight }: Props): React.ReactElement {
  const { timeToPixel } = useTimeToPixel()
  const selectedClipIds = useUiStore((s) => s.selectedClipIds)
  const rangeSelection = useUiStore((s) => s.rangeSelection)
  const openContextMenu = useUiStore((s) => s.openContextMenu)
  const audioFiles = useProjectStore((s) => s.projectFile.audioFiles)
  const audioFile = audioFiles[clip.audioFileId]

  const clipDurationSec =
    clip.trimEndSec != null
      ? clip.trimEndSec - clip.trimStartSec
      : audioFile?.durationSec ?? 30

  const { onMouseDown, dragOffsetSec, isDragging, isRangeSelecting } = useClipDrag(
    track.id, clip.id, clip.startSec, clipDurationSec
  )

  const clipX = timeToPixel(Math.max(0, clip.startSec + dragOffsetSec))
  const clipWidth = Math.max(4, timeToPixel(clipDurationSec))
  const isSelected = selectedClipIds.includes(clip.id)

  // Range selection highlight for this clip
  const hasRange = rangeSelection?.clipId === clip.id
  const rangeLeftPx = hasRange ? timeToPixel(rangeSelection.startSec) : 0
  const rangeWidthPx = hasRange ? timeToPixel(rangeSelection.endSec - rangeSelection.startSec) : 0

  function handleContextMenu(e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu(e.clientX, e.clientY, clip.id, track.id)
  }

  // Cursor depends on interaction state
  let cursor = 'default'
  if (isDragging) cursor = 'grabbing'
  else if (isRangeSelecting) cursor = 'text'

  const className = [
    'clip-block',
    isSelected ? 'clip-block--selected' : '',
    isDragging ? 'clip-block--dragging' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      style={
        {
          left: clipX,
          width: clipWidth,
          cursor,
          '--track-color': track.color,
        } as React.CSSProperties
      }
      onMouseDown={onMouseDown}
      onContextMenu={handleContextMenu}
    >
      {/* Waveform (bottom layer) */}
      <WaveformCanvas
        audioFileId={clip.audioFileId}
        clipDurationSec={clipDurationSec}
        trimStartSec={clip.trimStartSec}
        fadeRegions={clip.fadeRegions}
        clipVolume={clip.volume}
        trackColor={track.color}
        width={clipWidth}
        height={laneHeight}
      />

      {/* Loop region */}
      {clip.loop && (
        <LoopRegion
          trackId={track.id}
          clip={clip}
          height={laneHeight}
          trackColor={track.color}
        />
      )}

      {/* Fade region overlay (only when single-selected) */}
      {isSelected && selectedClipIds.length === 1 && (
        <FadeRegionOverlay
          trackId={track.id}
          clipId={clip.id}
          fadeRegions={clip.fadeRegions}
          clipDurationSec={clipDurationSec}
          clipVolume={clip.volume}
          width={clipWidth}
          height={laneHeight}
          trackColor={track.color}
        />
      )}

      {/* Range selection highlight */}
      {hasRange && rangeWidthPx > 0 && (
        <div
          style={{
            position: 'absolute',
            left: rangeLeftPx,
            top: 0,
            width: rangeWidthPx,
            height: '100%',
            background: 'rgba(0, 255, 204, 0.15)',
            borderLeft: '1px solid rgba(0, 255, 204, 0.5)',
            borderRight: '1px solid rgba(0, 255, 204, 0.5)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}

      {/* Clip name label */}
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: 6,
          fontSize: 9,
          color: track.color,
          opacity: 0.9,
          pointerEvents: 'none',
          textShadow: `0 0 4px ${track.color}`,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          maxWidth: clipWidth - 12,
        }}
      >
        {audioFile?.absolutePath.split('/').pop() ?? ''}
      </div>
    </div>
  )
}
