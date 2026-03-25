import React from 'react'
import { PlayControls } from '../transport/PlayControls'
import { SpectrumBars } from '../transport/SpectrumBars'
import { useAudioEngine } from '../../hooks/useAudioEngine'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import styles from './TransportBar.module.css'

export function TransportBar(): React.ReactElement {
  const { analyser } = useAudioEngine()
  const bpm = useProjectStore((s) => s.projectFile.project.bpm)
  const setBpm = useProjectStore((s) => s.setBpm)
  const snapping = useUiStore((s) => s.snapping)
  const toggleSnapping = useUiStore((s) => s.toggleSnapping)
  const zoom = useUiStore((s) => s.zoom)
  const zoomBy = useUiStore((s) => s.zoomBy)
  const durationSec = useProjectStore((s) => s.projectFile.project.durationSec)

  function handleZoomToFit(): void {
    const { timelineViewportWidth } = useUiStore.getState()
    useUiStore.getState().zoomToFit(timelineViewportWidth, durationSec)
  }

  return (
    <div className={`${styles.bar} panel`}>
      <PlayControls />

      <div className={styles.divider} />

      {/* BPM */}
      <div className={styles.field}>
        <label className={styles.label}>BPM</label>
        <input
          className={styles.numInput}
          type="number"
          min={40}
          max={300}
          value={bpm}
          onChange={(e) => setBpm(Math.min(300, Math.max(40, parseInt(e.target.value) || 120)))}
        />
      </div>

      {/* Snap toggle */}
      <button
        className={`btn ${snapping ? 'btn--primary' : ''}`}
        onClick={toggleSnapping}
        title="Toggle beat snapping"
      >
        SNAP
      </button>

      {/* Zoom */}
      <div className={styles.field}>
        <label className={styles.label}>ZOOM</label>
        <div className={styles.zoomControls}>
          <button className="btn btn--icon" onClick={() => zoomBy(-20)}>−</button>
          <span className={styles.zoomValue}>{Math.round(zoom)}px/s</span>
          <button className="btn btn--icon" onClick={() => zoomBy(20)}>+</button>
          <button className="btn btn--icon" onClick={handleZoomToFit} title="Zoom to fit (Cmd+0)">FIT</button>
        </div>
      </div>

      <div className={styles.spacer} />

      {/* Spectrum bars */}
      <SpectrumBars analyser={analyser} />
    </div>
  )
}
