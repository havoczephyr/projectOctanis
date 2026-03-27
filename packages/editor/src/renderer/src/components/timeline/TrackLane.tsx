import React from 'react'
import type { Track } from '@octanis/shared'
import { ClipView } from './ClipView'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import styles from './TrackLane.module.css'

interface Props {
  track: Track
  height: number
  totalWidth: number
}

export function TrackLane({ track, height, totalWidth: parentTotalWidth }: Props): React.ReactElement {
  const durationSec = useProjectStore((s) => s.projectFile.project.durationSec)
  const audioFiles = useProjectStore((s) => s.projectFile.audioFiles)
  const deselectAll = useUiStore((s) => s.deselectAll)
  const setHoveredTrack = useUiStore((s) => s.setHoveredTrack)
  const collisionFlash = useUiStore((s) => s.clipCollisionFlash)
  const { timeToPixel } = useTimeToPixel()

  // Account for loop extensions when computing lane width
  let maxClipEnd = 0
  for (const clip of track.clips) {
    const af = audioFiles[clip.audioFileId]
    if (!af) continue
    const clipDur = clip.trimEndSec != null ? clip.trimEndSec - clip.trimStartSec : af.durationSec
    const loopExtra = clip.loop
      ? (clip.loop.endSec - clip.loop.startSec) * (typeof clip.loop.count === 'number' ? clip.loop.count : 10)
      : 0
    maxClipEnd = Math.max(maxClipEnd, clip.startSec + clipDur + loopExtra)
  }
  const laneWidth = Math.max(parentTotalWidth, timeToPixel(Math.max(durationSec, maxClipEnd)), 2000)

  function handleClick(e: React.MouseEvent): void {
    // Deselect if clicking the lane or its bg, not a clip
    const target = e.target as HTMLElement
    if (target === e.currentTarget || target.closest(`.${styles.lane}`) === e.currentTarget && !target.closest('.clip-block')) {
      deselectAll()
    }
  }

  return (
    <div
      className={styles.lane}
      data-track-id={track.id}
      style={
        {
          height,
          width: laneWidth,
          '--track-color': track.color,
        } as React.CSSProperties
      }
      onClick={handleClick}
      onMouseEnter={() => setHoveredTrack(track.id)}
      onMouseLeave={() => setHoveredTrack(null)}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
    >
      {/* Background grid lines */}
      <div className={styles.bg} />

      {/* Clips */}
      {track.clips.map((clip) => (
        <ClipView key={clip.id} track={track} clip={clip} laneHeight={height} />
      ))}

      {/* Collision flash overlay */}
      {collisionFlash?.trackId === track.id && (
        <div className={styles.collisionFlash} />
      )}
    </div>
  )
}
