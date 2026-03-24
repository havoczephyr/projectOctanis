import React from 'react'
import { useTransportStore } from '../../store/transportStore'
import styles from './PlayControls.module.css'

export function PlayControls(): React.ReactElement {
  const state = useTransportStore((s) => s.state)
  const play = useTransportStore((s) => s.play)
  const pause = useTransportStore((s) => s.pause)
  const stop = useTransportStore((s) => s.stop)
  const playheadSec = useTransportStore((s) => s.playheadSec)

  const isPlaying = state === 'playing'

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    const cs = Math.floor((sec % 1) * 100)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }

  return (
    <div className={styles.controls}>
      <button
        className={`btn btn--icon ${isPlaying ? 'btn--primary' : ''}`}
        onClick={isPlaying ? pause : play}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button className="btn btn--icon" onClick={stop} title="Stop">
        ⏹
      </button>
      <div className={styles.timecode}>
        <span className={`${styles.timecodeValue} ${isPlaying ? 'glow-text' : ''}`}>
          {formatTime(playheadSec)}
        </span>
      </div>
    </div>
  )
}
