import React, { useEffect, useRef } from 'react'
import { usePeaks } from '../../hooks/usePeaks'
import { interpolateFadeRegions, type FadeRegion } from '@octanis/shared'
import type { PeaksResult } from '../../../../ipcTypes'
import styles from './WaveformCanvas.module.css'

interface Props {
  audioFileId: string
  clipDurationSec: number
  trimStartSec: number
  fadeRegions: FadeRegion[]
  clipVolume: number
  trackColor: string
  width: number
  height: number
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: PeaksResult,
  fadeRegions: FadeRegion[],
  clipVolume: number,
  clipDurationSec: number,
  trackColor: string,
  w: number,
  h: number
): void {
  ctx.clearRect(0, 0, w, h)

  const mid = h / 2
  const { min, max, count } = peaks

  for (let px = 0; px < w; px++) {
    const timeSec = (px / w) * clipDurationSec
    const gain = interpolateFadeRegions(fadeRegions, timeSec, clipVolume)

    const peakIdx = Math.floor((px / w) * count)
    const peakMax = (max[peakIdx] ?? 0) * gain
    const peakMin = (min[peakIdx] ?? 0) * gain

    const yTop = mid - peakMax * mid
    const yBot = mid - peakMin * mid

    ctx.fillStyle = trackColor
    ctx.globalAlpha = 0.75
    ctx.fillRect(px, yTop, 1, Math.max(1, yBot - yTop))

    ctx.fillStyle = trackColor
    ctx.globalAlpha = 0.95
    ctx.fillRect(px, mid - 0.5, 1, 1)
  }

  ctx.globalAlpha = 1
}

export function WaveformCanvas({
  audioFileId,
  clipDurationSec,
  fadeRegions,
  clipVolume,
  trackColor,
  width,
  height,
}: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { peaks, state } = usePeaks(audioFileId)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    if (peaks && state === 'ready') {
      drawWaveform(ctx, peaks, fadeRegions, clipVolume, clipDurationSec, trackColor, width, height)
    } else if (state === 'loading') {
      ctx.fillStyle = 'rgba(0,255,204,0.08)'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(0,255,204,0.3)'
      ctx.font = `10px monospace`
      ctx.fillText('Loading...', 6, height / 2 + 4)
    }
  }, [peaks, state, fadeRegions, clipVolume, clipDurationSec, trackColor, width, height])

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      style={{ width, height }}
    />
  )
}
