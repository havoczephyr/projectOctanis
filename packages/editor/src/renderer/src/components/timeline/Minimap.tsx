import React, { useRef, useEffect, useCallback } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { useTransportStore } from '../../store/transportStore'
import { usePeaksCache } from '../../store/peaksCache'
import styles from './Minimap.module.css'

const MINIMAP_WIDTH = 280
const TRACK_HEIGHT = 12
const PADDING = 4
const MIN_HEIGHT = 32

export function Minimap(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)

  const tracks = useProjectStore((s) => s.projectFile.project.tracks)
  const audioFiles = useProjectStore((s) => s.projectFile.audioFiles)
  const durationSec = useProjectStore((s) => s.projectFile.project.durationSec)
  const scrollLeft = useUiStore((s) => s.scrollLeft)
  const setScrollLeft = useUiStore((s) => s.setScrollLeft)
  const zoom = useUiStore((s) => s.zoom)
  const viewportWidth = useUiStore((s) => s.timelineViewportWidth)
  const playheadSec = useTransportStore((s) => s.playheadSec)
  const playStartSec = useTransportStore((s) => s.playStartSec)
  const transportState = useTransportStore((s) => s.state)
  const allPeaks = usePeaksCache((s) => s.peaks)

  // Compute effective project end (furthest clip end)
  let maxEnd = durationSec
  for (const track of tracks) {
    for (const clip of track.clips) {
      const af = audioFiles[clip.audioFileId]
      if (!af) continue
      const clipDur = clip.trimEndSec != null ? clip.trimEndSec - clip.trimStartSec : af.durationSec
      const loopExtra = clip.loop
        ? (clip.loop.endSec - clip.loop.startSec) * (typeof clip.loop.count === 'number' ? clip.loop.count : 10)
        : 0
      maxEnd = Math.max(maxEnd, clip.startSec + clipDur + loopExtra)
    }
  }

  const totalDuration = Math.max(maxEnd, 1)
  const canvasHeight = Math.max(MIN_HEIGHT, tracks.length * TRACK_HEIGHT + PADDING * 2)
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  // Draw minimap
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = MINIMAP_WIDTH
    const h = canvasHeight

    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    // Background
    ctx.clearRect(0, 0, w, h)

    // Draw tracks and clips
    for (let ti = 0; ti < tracks.length; ti++) {
      const track = tracks[ti]
      const trackY = PADDING + ti * TRACK_HEIGHT
      const trackH = TRACK_HEIGHT - 1

      // Track lane background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
      ctx.fillRect(0, trackY, w, trackH)

      // Draw clips
      for (const clip of track.clips) {
        const af = audioFiles[clip.audioFileId]
        if (!af) continue
        const clipDur = clip.trimEndSec != null ? clip.trimEndSec - clip.trimStartSec : af.durationSec
        const loopExtra = clip.loop
          ? (clip.loop.endSec - clip.loop.startSec) * (typeof clip.loop.count === 'number' ? clip.loop.count : 10)
          : 0
        const effectiveDur = clipDur + loopExtra

        const clipX = (clip.startSec / totalDuration) * w
        const clipW = Math.max(1, (effectiveDur / totalDuration) * w)

        // Clip background
        ctx.fillStyle = track.color
        ctx.globalAlpha = 0.25
        ctx.fillRect(clipX, trackY, clipW, trackH)

        // Mini waveform from cached peaks
        const peaks = allPeaks[clip.audioFileId]
        if (peaks && peaks.count > 0) {
          ctx.fillStyle = track.color
          ctx.globalAlpha = 0.7
          const mid = trackY + trackH / 2
          const halfH = trackH / 2

          for (let px = 0; px < clipW; px++) {
            const t = px / clipW
            const peakIdx = Math.min(peaks.count - 1, Math.floor(t * peaks.count))
            const peakMax = peaks.max[peakIdx] ?? 0
            const peakMin = peaks.min[peakIdx] ?? 0

            const yTop = mid - peakMax * halfH
            const yBot = mid - peakMin * halfH
            ctx.fillRect(clipX + px, yTop, 1, Math.max(1, yBot - yTop))
          }
        }

        ctx.globalAlpha = 1
      }
    }

    // Visible area indicator
    const totalWidthPx = totalDuration * zoom
    const viewStartFrac = scrollLeft / totalWidthPx
    const viewEndFrac = Math.min(1, (scrollLeft + viewportWidth) / totalWidthPx)
    const viewX = viewStartFrac * w
    const viewW = Math.max(2, (viewEndFrac - viewStartFrac) * w)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
    ctx.fillRect(viewX, 0, viewW, h)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(viewX + 0.5, 0.5, viewW - 1, h - 1)

    // Ghost playhead
    if (playStartSec != null && transportState !== 'stopped') {
      const ghostFrac = playStartSec / totalDuration
      const ghostXPx = ghostFrac * w
      ctx.strokeStyle = 'var(--accent-cyan)'
      // Fallback to a visible cyan
      ctx.strokeStyle = 'rgba(0, 255, 204, 0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(ghostXPx, 0)
      ctx.lineTo(ghostXPx, h)
      ctx.stroke()
    }

    // Playhead
    const playFrac = playheadSec / totalDuration
    const playXPx = playFrac * w
    ctx.strokeStyle = 'rgba(255, 51, 102, 0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(playXPx, 0)
    ctx.lineTo(playXPx, h)
    ctx.stroke()
  }, [tracks, audioFiles, durationSec, totalDuration, scrollLeft, zoom, viewportWidth, playheadSec, playStartSec, transportState, allPeaks, canvasHeight, dpr])

  // Click/drag to navigate
  const navigateTo = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const timeSec = frac * totalDuration
      const targetScrollLeft = timeSec * zoom - viewportWidth / 2
      setScrollLeft(Math.max(0, targetScrollLeft))
    },
    [totalDuration, zoom, viewportWidth, setScrollLeft]
  )

  function handleMouseDown(e: React.MouseEvent): void {
    if (e.button !== 0) return
    e.preventDefault()
    isDraggingRef.current = true
    navigateTo(e.clientX)

    function onMouseMove(ev: MouseEvent): void {
      if (!isDraggingRef.current) return
      navigateTo(ev.clientX)
    }
    function onMouseUp(): void {
      isDraggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className={styles.minimap} onMouseDown={handleMouseDown}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: MINIMAP_WIDTH, height: canvasHeight }}
      />
    </div>
  )
}
