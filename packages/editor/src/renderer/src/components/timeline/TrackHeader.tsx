import React from 'react'
import type { Track } from '@octanis/shared'
import { useProjectStore } from '../../store/projectStore'
import styles from './TrackHeader.module.css'

interface Props {
  track: Track
  height: number
}

const VOLUME_SNAP_THRESHOLD = 0.04

export function TrackHeader({ track, height }: Props): React.ReactElement {
  const updateTrack = useProjectStore((s) => s.updateTrack)
  const removeTrack = useProjectStore((s) => s.removeTrack)

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>): void {
    let vol = parseFloat(e.target.value)
    if (Math.abs(vol - 1.0) <= VOLUME_SNAP_THRESHOLD) vol = 1.0
    updateTrack(track.id, { volume: vol })
  }

  return (
    <div
      className={styles.header}
      style={{ height, '--track-color': track.color } as React.CSSProperties}
    >
      <div className="track-color-strip" />
      <div className={styles.content}>
        <input
          className={styles.nameInput}
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          onFocus={(e) => e.target.select()}
        />
        <div className={styles.controls}>
          <button
            className={`btn btn--icon ${track.muted ? styles.active : ''}`}
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
            title="Mute"
            style={track.muted ? { color: 'var(--accent-yellow)' } : {}}
          >
            M
          </button>
          <button
            className={`btn btn--icon ${track.soloed ? styles.active : ''}`}
            onClick={() => updateTrack(track.id, { soloed: !track.soloed })}
            title="Solo"
            style={track.soloed ? { color: 'var(--accent-green)' } : {}}
          >
            S
          </button>
          <button
            className="btn btn--icon"
            onClick={() => removeTrack(track.id)}
            title="Remove track"
            style={{ color: 'var(--text-dim)' }}
          >
            ✕
          </button>
        </div>
        <div className={styles.volumeRow}>
          <input
            className={styles.volumeSlider}
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={track.volume}
            onChange={handleVolumeChange}
            title={`Volume: ${Math.round(track.volume * 100)}%`}
          />
          <span className={styles.volumeLabel}>{Math.round(track.volume * 100)}%</span>
        </div>
      </div>
    </div>
  )
}
