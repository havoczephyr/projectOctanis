import React from 'react'
import type { Track, Clip } from '@octanis/shared'
import { WaveformCanvas } from './WaveformCanvas'
import { EnvelopeOverlay } from './EnvelopeOverlay'
import { FadeHandle } from './FadeHandle'
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
  const selectClip = useUiStore((s) => s.selectClip)
  const audioFiles = useProjectStore((s) => s.projectFile.audioFiles)
  const audioFile = audioFiles[clip.audioFileId]

  const clipDurationSec =
    clip.trimEndSec != null
      ? clip.trimEndSec - clip.trimStartSec
      : audioFile?.durationSec ?? 30

  const { onMouseDown, dragOffsetSec, isDragging } = useClipDrag(track.id, clip.id, clip.startSec)

  const clipX = timeToPixel(clip.startSec + dragOffsetSec)
  const clipWidth = Math.max(4, timeToPixel(clipDurationSec))
  const isSelected = selectedClipIds.includes(clip.id)

  function handleMouseDown(e: React.MouseEvent): void {
    selectClip(clip.id, e.shiftKey)
    onMouseDown(e)
  }

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
          '--track-color': track.color,
        } as React.CSSProperties
      }
      onMouseDown={handleMouseDown}
    >
      {/* Waveform (bottom layer) */}
      <WaveformCanvas
        audioFileId={clip.audioFileId}
        clipDurationSec={clipDurationSec}
        trimStartSec={clip.trimStartSec}
        envelope={clip.envelope}
        trackColor={track.color}
        width={clipWidth}
        height={laneHeight}
      />

      {/* SVG layer for fades */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: clipWidth, height: laneHeight, pointerEvents: 'none' }}
      >
        <FadeHandle
          trackId={track.id}
          clip={clip}
          side="in"
          height={laneHeight}
          clipWidth={clipWidth}
        />
        <FadeHandle
          trackId={track.id}
          clip={clip}
          side="out"
          height={laneHeight}
          clipWidth={clipWidth}
        />
      </svg>

      {/* Loop region */}
      {clip.loop && (
        <LoopRegion
          trackId={track.id}
          clip={clip}
          height={laneHeight}
          trackColor={track.color}
        />
      )}

      {/* Envelope overlay (top layer — only for single-selected clips) */}
      {isSelected && selectedClipIds.length === 1 && (
        <EnvelopeOverlay
          trackId={track.id}
          clipId={clip.id}
          envelope={clip.envelope}
          clipDurationSec={clipDurationSec}
          width={clipWidth}
          height={laneHeight}
          trackColor={track.color}
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
