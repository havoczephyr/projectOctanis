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
  const seekTo = useTransportStore((s) => s.seekTo)
  const { timeToPixel, pixelToTime } = useTimeToPixel()

  const x = timeToPixel(playheadSec)

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
