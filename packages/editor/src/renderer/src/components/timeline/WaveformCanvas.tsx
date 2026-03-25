import React, { useEffect, useRef } from 'react'
import { usePeaks } from '../../hooks/usePeaks'
import { interpolateFadeRegions, type FadeRegion, type MuteRegion, type LoopRegion } from '@octanis/shared'
import type { PeaksResult } from '../../../../ipcTypes'
import styles from './WaveformCanvas.module.css'

interface Props {
  audioFileId: string
  clipDurationSec: number
  effectiveDuration?: number
  trimStartSec: number
  fadeRegions: FadeRegion[]
  muteRegions: MuteRegion[]
  clipVolume: number
  trackColor: string
  width: number
  height: number
  loop?: LoopRegion | null
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: PeaksResult,
  fadeRegions: FadeRegion[],
  muteRegions: MuteRegion[],
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
    const gain = interpolateFadeRegions(fadeRegions, timeSec, clipVolume, muteRegions)

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

  // Draw mute region dim overlay
  for (const region of muteRegions) {
    const xStart = Math.floor((region.startSec / clipDurationSec) * w)
    const xEnd = Math.ceil((region.endSec / clipDurationSec) * w)
    ctx.fillStyle = 'rgba(255, 50, 80, 0.08)'
    ctx.fillRect(xStart, 0, xEnd - xStart, h)
  }

  ctx.globalAlpha = 1
}

export function WaveformCanvas({
  audioFileId,
  clipDurationSec,
  effectiveDuration,
  fadeRegions,
  muteRegions,
  clipVolume,
  trackColor,
  width,
  height,
  loop,
}: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { peaks, state } = usePeaks(audioFileId)
  const totalDuration = effectiveDuration ?? clipDurationSec

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
      if (loop) {
        // ─── 3-segment in-place loop model ─────────────────────────────
        const loopDur = loop.endSec - loop.startSec
        const loopCount = typeof loop.count === 'number' ? loop.count : 10
        const mid = height / 2

        /** Draw a waveform segment mapping source audio [srcStart, srcEnd] to pixels [pxStart, pxEnd] */
        function drawSegment(
          pxStart: number, pxEnd: number,
          srcStartSec: number, srcEndSec: number,
          alpha: number, applyAutomation: boolean
        ): void {
          const segW = pxEnd - pxStart
          const srcDur = srcEndSec - srcStartSec
          if (segW <= 0 || srcDur <= 0) return

          for (let px = 0; px < segW; px++) {
            const localT = px / segW
            const srcTimeSec = srcStartSec + localT * srcDur
            const gain = applyAutomation
              ? interpolateFadeRegions(fadeRegions, srcTimeSec, clipVolume, muteRegions)
              : clipVolume

            const peakT = srcTimeSec / clipDurationSec
            const peakIdx = Math.min(peaks!.count - 1, Math.max(0, Math.floor(peakT * peaks!.count)))
            const peakMax = (peaks!.max[peakIdx] ?? 0) * gain
            const peakMin = (peaks!.min[peakIdx] ?? 0) * gain
            const yTop = mid - peakMax * mid
            const yBot = mid - peakMin * mid

            ctx.fillStyle = trackColor
            ctx.globalAlpha = alpha * 0.75
            ctx.fillRect(pxStart + px, yTop, 1, Math.max(1, yBot - yTop))
          }

          // Center line for segment
          ctx.fillStyle = trackColor
          ctx.globalAlpha = alpha * 0.95
          ctx.fillRect(pxStart, mid - 0.5, segW, 1)
        }

        // Segment 1: pre-loop + first pass [0 → loop.endSec]
        const seg1PxEnd = Math.round((loop.endSec / totalDuration) * width)
        drawSegment(0, seg1PxEnd, 0, loop.endSec, 1.0, true)

        // Mute overlay for segment 1
        for (const region of muteRegions) {
          if (region.endSec <= 0 || region.startSec >= loop.endSec) continue
          const mxStart = Math.floor((Math.max(0, region.startSec) / totalDuration) * width)
          const mxEnd = Math.ceil((Math.min(loop.endSec, region.endSec) / totalDuration) * width)
          ctx.fillStyle = 'rgba(255, 50, 80, 0.08)'
          ctx.globalAlpha = 1
          ctx.fillRect(mxStart, 0, mxEnd - mxStart, height)
        }

        // Segment 2: loop repeats (in-place, at loop.endSec + i*loopDur)
        for (let i = 0; i < loopCount; i++) {
          const repStartSec = loop.endSec + i * loopDur
          const pxStart = Math.round((repStartSec / totalDuration) * width)
          const pxEnd = Math.round(((repStartSec + loopDur) / totalDuration) * width)
          drawSegment(pxStart, pxEnd, loop.startSec, loop.endSec, 0.5, false)

          // Dotted border at start of each repetition
          ctx.globalAlpha = 0.4
          ctx.strokeStyle = trackColor
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.moveTo(pxStart, 0)
          ctx.lineTo(pxStart, height)
          ctx.stroke()
          ctx.setLineDash([])
        }

        // Segment 3: post-loop remainder [loop.endSec → clipDurationSec], shifted right
        const remainderDur = clipDurationSec - loop.endSec
        if (remainderDur > 0) {
          const seg3TimeStart = loop.endSec + loopCount * loopDur
          const seg3PxStart = Math.round((seg3TimeStart / totalDuration) * width)
          const seg3PxEnd = Math.round(((seg3TimeStart + remainderDur) / totalDuration) * width)
          drawSegment(seg3PxStart, seg3PxEnd, loop.endSec, clipDurationSec, 1.0, false)
        }

        ctx.globalAlpha = 1
      } else {
        // No loop — draw full clip normally
        drawWaveform(ctx, peaks, fadeRegions, muteRegions, clipVolume, clipDurationSec, trackColor, width, height)
      }
    } else if (state === 'loading') {
      ctx.fillStyle = 'rgba(0,255,204,0.08)'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(0,255,204,0.3)'
      ctx.font = `10px monospace`
      ctx.fillText('Loading...', 6, height / 2 + 4)
    }
  }, [peaks, state, fadeRegions, muteRegions, clipVolume, clipDurationSec, totalDuration, trackColor, width, height, loop])

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      style={{ width, height }}
    />
  )
}
