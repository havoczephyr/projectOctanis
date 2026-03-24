import React from 'react'
import type { Track } from '@octanis/shared'
import { ClipView } from './ClipView'
import { useProjectStore } from '../../store/projectStore'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import styles from './TrackLane.module.css'

interface Props {
  track: Track
  height: number
  onDrop: (e: React.DragEvent) => void
}

export function TrackLane({ track, height, onDrop }: Props): React.ReactElement {
  const durationSec = useProjectStore((s) => s.projectFile.project.durationSec)
  const { timeToPixel } = useTimeToPixel()
  const totalWidth = Math.max(timeToPixel(durationSec), 2000)

  return (
    <div
      className={styles.lane}
      style={
        {
          height,
          width: totalWidth,
          '--track-color': track.color,
        } as React.CSSProperties
      }
      onDrop={(e) => { console.debug('[Octanis:DnD] TrackLane drop', { trackId: track.id, trackName: track.name }); e.stopPropagation(); onDrop(e) }}
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
    </div>
  )
}
