import React from 'react'
import { useTransportStore } from '../../store/transportStore'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import styles from './Playhead.module.css'

interface Props {
  totalWidth: number
  rulerHeight: number
}

export function Playhead({ rulerHeight }: Props): React.ReactElement {
  const playheadSec = useTransportStore((s) => s.playheadSec)
  const isPlaying = useTransportStore((s) => s.state === 'playing')
  const transportState = useTransportStore((s) => s.state)
  const playStartSec = useTransportStore((s) => s.playStartSec)
  const seekTo = useTransportStore((s) => s.seekTo)
  const { timeToPixel, pixelToTime } = useTimeToPixel()

  const x = timeToPixel(playheadSec)
  const ghostX = playStartSec != null ? timeToPixel(playStartSec) : null

  function handleRulerClick(e: React.MouseEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = e.clientX - rect.left
    seekTo(Math.max(0, pixelToTime(relX)))
  }

  return (
    <>
      {/* Clickable ruler overlay for seeking */}
      <div
        className={styles.rulerOverlay}
        style={{ height: rulerHeight, top: 0 }}
        onClick={handleRulerClick}
      />
      {/* Ghost playhead (play-start marker) */}
      {ghostX != null && transportState !== 'stopped' && (
        <div className={styles.ghost} style={{ left: ghostX, top: rulerHeight }}>
          <div className={styles.ghostHandle} />
          <div className={styles.ghostLine} />
        </div>
      )}
      {/* Playhead line */}
      <div
        className={styles.playhead}
        style={{ left: x, top: rulerHeight }}
      >
        <div className={`${styles.handle} ${isPlaying ? styles['handle--playing'] : ''}`} />
        <div className={`${styles.line} ${isPlaying ? styles['line--playing'] : ''}`} />
      </div>
    </>
  )
}
