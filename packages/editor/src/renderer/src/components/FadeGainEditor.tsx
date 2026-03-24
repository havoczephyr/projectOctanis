import React, { useEffect, useRef, useCallback, useState } from 'react'
import { nanoid } from 'nanoid'
import { type FadeRegion, interpolateFadeRegionGain } from '@octanis/shared'
import { useUiStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { usePeaks } from '../hooks/usePeaks'
import type { PeaksResult } from '../../../ipcTypes'
import styles from './FadeGainEditor.module.css'

const PANEL_W = 640
const PANEL_H = 380
const HEADER_H = 33
const FOOTER_H = 29
const CANVAS_W = PANEL_W
const CANVAS_H = PANEL_H - HEADER_H - FOOTER_H
const CURVE_SAMPLES = 200
const ANCHOR_SIZE = 10
const POINT_RADIUS = 6
const GAIN_MIN = 0
const GAIN_MAX = 2

function gainToY(gain: number): number {
  return CANVAS_H - (gain / GAIN_MAX) * CANVAS_H
}

function yToGain(y: number): number {
  return Math.max(GAIN_MIN, Math.min(GAIN_MAX, ((CANVAS_H - y) / CANVAS_H) * GAIN_MAX))
}

function xToNormalized(x: number): number {
  return Math.max(0, Math.min(1, x / CANVAS_W))
}

/** Draw gain-modulated waveform at low opacity */
function drawWaveformRegion(
  ctx: CanvasRenderingContext2D,
  peaks: PeaksResult,
  region: FadeRegion,
  clipDurationSec: number,
  trackColor: string,
  w: number,
  h: number
): void {
  ctx.clearRect(0, 0, w, h)
  const mid = h / 2
  const { min, max, count } = peaks
  const regionDur = region.endSec - region.startSec

  for (let px = 0; px < w; px++) {
    const t = px / w
    const timeSec = region.startSec + t * regionDur
    const normalizedPos = timeSec / clipDurationSec
    const peakIdx = Math.min(count - 1, Math.max(0, Math.floor(normalizedPos * count)))
    const gain = interpolateFadeRegionGain(region, t)
    const peakMax = (max[peakIdx] ?? 0) * gain
    const peakMin = (min[peakIdx] ?? 0) * gain

    const yTop = mid - peakMax * mid
    const yBot = mid - peakMin * mid

    ctx.fillStyle = trackColor
    ctx.globalAlpha = 0.35
    ctx.fillRect(px, yTop, 1, Math.max(1, yBot - yTop))
  }

  ctx.globalAlpha = 1
}

/** Build SVG path for the gain curve */
function buildCurvePath(region: FadeRegion): string {
  const points: string[] = []
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES
    const x = t * CANVAS_W
    const gain = interpolateFadeRegionGain(region, t)
    const y = gainToY(gain)
    points.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`)
  }
  return points.join(' ')
}

/** Build SVG fill path between curve and baseline */
function buildFillPath(region: FadeRegion, baselineGain: number): string {
  const curve = buildCurvePath(region)
  const baseY = gainToY(baselineGain)
  return `${curve} L ${CANVAS_W} ${baseY} L 0 ${baseY} Z`
}

type DragTarget =
  | { type: 'start-anchor' }
  | { type: 'end-anchor' }
  | { type: 'control-point'; pointId: string }

export function FadeGainEditor(): React.ReactElement | null {
  const editorState = useUiStore((s) => s.fadeGainEditor)
  const closeFadeGainEditor = useUiStore((s) => s.closeFadeGainEditor)
  const tracks = useProjectStore((s) => s.projectFile.project.tracks)
  const audioFiles = useProjectStore((s) => s.projectFile.audioFiles)
  const updateFadeRegion = useProjectStore((s) => s.updateFadeRegion)
  const addControlPoint = useProjectStore((s) => s.addControlPoint)
  const updateControlPoint = useProjectStore((s) => s.updateControlPoint)
  const removeControlPoint = useProjectStore((s) => s.removeControlPoint)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null)
  const [localRegion, setLocalRegion] = useState<FadeRegion | null>(null)
  const dragStartRef = useRef<{ y: number; x: number } | null>(null)

  // Resolve track/clip/region from store
  const track = editorState ? tracks.find((t) => t.id === editorState.trackId) : null
  const clip = track ? track.clips.find((c) => c.id === editorState?.clipId) : null
  const audioFile = clip ? audioFiles[clip.audioFileId] : null
  const region = clip ? clip.fadeRegions.find((r) => r.id === editorState?.regionId) : null
  const clipDurationSec = clip
    ? clip.trimEndSec != null
      ? clip.trimEndSec - clip.trimStartSec
      : audioFile?.durationSec ?? 30
    : 0

  const trackColor = track?.color ?? '#00ffcc'
  const clipVolume = clip?.volume ?? 1.0

  // The region we render — local state during drag, store state otherwise
  const displayRegion = localRegion ?? region

  const { peaks, state: peaksState } = usePeaks(clip?.audioFileId ?? '')

  // Sync local region from store when not dragging
  useEffect(() => {
    if (!dragTarget && region) {
      setLocalRegion(null)
    }
  }, [region, dragTarget])

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !displayRegion || !peaks || peaksState !== 'ready') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = CANVAS_W * dpr
    canvas.height = CANVAS_H * dpr
    ctx.scale(dpr, dpr)

    drawWaveformRegion(
      ctx, peaks, displayRegion,
      clipDurationSec, trackColor,
      CANVAS_W, CANVAS_H
    )
  }, [peaks, peaksState, displayRegion, clipDurationSec, clipVolume, trackColor])

  // Close on Escape
  useEffect(() => {
    if (!editorState) return
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeFadeGainEditor()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [editorState, closeFadeGainEditor])

  // ─── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragTarget || !dragStartRef.current || !displayRegion) return

    const dy = e.clientY - dragStartRef.current.y
    const dx = e.clientX - dragStartRef.current.x

    setLocalRegion((prev) => {
      const base = prev ?? displayRegion
      if (dragTarget.type === 'start-anchor') {
        const newGain = yToGain(gainToY(displayRegion.startGain) + dy)
        return { ...base, startGain: newGain }
      }
      if (dragTarget.type === 'end-anchor') {
        const newGain = yToGain(gainToY(displayRegion.endGain) + dy)
        return { ...base, endGain: newGain }
      }
      if (dragTarget.type === 'control-point') {
        const point = base.controlPoints.find((p) => p.id === dragTarget.pointId)
        if (!point) return base
        const svgX = point.x * CANVAS_W + dx
        const svgY = gainToY(point.gain) + dy
        const newX = xToNormalized(svgX)
        const newGain = yToGain(svgY)
        return {
          ...base,
          controlPoints: base.controlPoints
            .map((p) => p.id === dragTarget.pointId ? { ...p, x: newX, gain: newGain } : p)
            .sort((a, b) => a.x - b.x),
        }
      }
      return base
    })

    dragStartRef.current = { y: e.clientY, x: e.clientX }
  }, [dragTarget, displayRegion])

  const handleDragEnd = useCallback(() => {
    if (!editorState || !localRegion || !dragTarget) {
      setDragTarget(null)
      setLocalRegion(null)
      return
    }

    // Commit to store
    if (dragTarget.type === 'start-anchor') {
      updateFadeRegion(editorState.trackId, editorState.clipId, editorState.regionId, {
        startGain: localRegion.startGain,
      })
    } else if (dragTarget.type === 'end-anchor') {
      updateFadeRegion(editorState.trackId, editorState.clipId, editorState.regionId, {
        endGain: localRegion.endGain,
      })
    } else if (dragTarget.type === 'control-point') {
      const point = localRegion.controlPoints.find((p) => p.id === dragTarget.pointId)
      if (point) {
        updateControlPoint(editorState.trackId, editorState.clipId, editorState.regionId, dragTarget.pointId, {
          x: point.x,
          gain: point.gain,
        })
      }
    }

    setDragTarget(null)
    setLocalRegion(null)
  }, [editorState, localRegion, dragTarget, updateFadeRegion, updateControlPoint])

  useEffect(() => {
    if (!dragTarget) return
    document.addEventListener('mousemove', handleDragMove)
    document.addEventListener('mouseup', handleDragEnd)
    return () => {
      document.removeEventListener('mousemove', handleDragMove)
      document.removeEventListener('mouseup', handleDragEnd)
    }
  }, [dragTarget, handleDragMove, handleDragEnd])

  // ─── Interaction callbacks ──────────────────────────────────────────────────

  const startAnchorDrag = useCallback((e: React.MouseEvent, target: DragTarget) => {
    e.preventDefault()
    e.stopPropagation()
    if (!region) return
    dragStartRef.current = { y: e.clientY, x: e.clientX }
    setLocalRegion({ ...region })
    setDragTarget(target)
  }, [region])

  const handleSvgContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    if (!editorState || !region) return
    // Only handle right-clicks on the SVG background (not on anchors/points)
    if ((e.target as Element).tagName !== 'svg') return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const normalizedX = xToNormalized(x)
    const gain = yToGain(y)

    // Place point at click position with the current interpolated gain (so it appears on the curve)
    const interpolatedGain = interpolateFadeRegionGain(region, normalizedX)
    // Use the interpolated gain so the point starts on the line, unless click is far from line
    const distFromCurve = Math.abs(gainToY(interpolatedGain) - y)
    const pointGain = distFromCurve < 20 ? interpolatedGain : gain

    addControlPoint(editorState.trackId, editorState.clipId, editorState.regionId, {
      id: nanoid(),
      x: normalizedX,
      gain: pointGain,
    })
  }, [editorState, region, addControlPoint])

  const handlePointContextMenu = useCallback((e: React.MouseEvent, pointId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!editorState) return
    removeControlPoint(editorState.trackId, editorState.clipId, editorState.regionId, pointId)
  }, [editorState, removeControlPoint])

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!editorState || !displayRegion || !clip || !track) return null

  const curvePath = buildCurvePath(displayRegion)
  const fillPath = buildFillPath(displayRegion, clipVolume)
  const baselineY = gainToY(clipVolume)
  const startAnchorY = gainToY(displayRegion.startGain)
  const endAnchorY = gainToY(displayRegion.endGain)

  return (
    <>
      <div className={styles.backdrop} onClick={closeFadeGainEditor} />
      <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            Fade Gain Editor — {displayRegion.startSec.toFixed(2)}s to {displayRegion.endSec.toFixed(2)}s
          </span>
          <button className={styles.closeBtn} onClick={closeFadeGainEditor}>
            Close
          </button>
        </div>

        <div className={styles.canvasContainer}>
          {/* Waveform layer */}
          <canvas
            ref={canvasRef}
            className={styles.waveformCanvas}
            style={{ width: CANVAS_W, height: CANVAS_H }}
          />

          {/* SVG editing layer */}
          <svg
            className={styles.svgLayer}
            width={CANVAS_W}
            height={CANVAS_H}
            onContextMenu={handleSvgContextMenu}
          >
            {/* Baseline reference — original clip volume */}
            <line
              x1={0} y1={baselineY}
              x2={CANVAS_W} y2={baselineY}
              stroke="cyan"
              strokeOpacity={0.3}
              strokeWidth={1}
              strokeDasharray="6 4"
            />

            {/* Gain scale reference lines */}
            {[0, 0.5, 1.0, 1.5, 2.0].map((g) => (
              <line
                key={g}
                x1={0} y1={gainToY(g)}
                x2={CANVAS_W} y2={gainToY(g)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={0.5}
              />
            ))}

            {/* Fill between curve and baseline */}
            <path
              d={fillPath}
              fill={trackColor}
              fillOpacity={0.1}
              stroke="none"
              pointerEvents="none"
            />

            {/* Gain curve */}
            <path
              d={curvePath}
              fill="none"
              stroke={trackColor}
              strokeWidth={2}
              strokeOpacity={0.9}
              pointerEvents="none"
            />

            {/* Left anchor */}
            <g
              className={styles.anchor}
              onMouseDown={(e) => startAnchorDrag(e, { type: 'start-anchor' })}
            >
              <rect
                x={-1}
                y={startAnchorY - ANCHOR_SIZE / 2}
                width={ANCHOR_SIZE}
                height={ANCHOR_SIZE}
                rx={2}
                fill={trackColor}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={1}
              />
            </g>

            {/* Right anchor */}
            <g
              className={styles.anchor}
              onMouseDown={(e) => startAnchorDrag(e, { type: 'end-anchor' })}
            >
              <rect
                x={CANVAS_W - ANCHOR_SIZE + 1}
                y={endAnchorY - ANCHOR_SIZE / 2}
                width={ANCHOR_SIZE}
                height={ANCHOR_SIZE}
                rx={2}
                fill={trackColor}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={1}
              />
            </g>

            {/* Control points */}
            {displayRegion.controlPoints.map((point) => {
              const cx = point.x * CANVAS_W
              const cy = gainToY(point.gain)
              return (
                <g
                  key={point.id}
                  className={styles.controlPoint}
                  onMouseDown={(e) => startAnchorDrag(e, { type: 'control-point', pointId: point.id })}
                  onContextMenu={(e) => handlePointContextMenu(e, point.id)}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={POINT_RADIUS}
                    fill="white"
                    stroke={trackColor}
                    strokeWidth={2}
                  />
                </g>
              )
            })}

            {/* Gain scale labels */}
            {[0, 0.5, 1.0, 1.5, 2.0].map((g) => (
              <text
                key={`label-${g}`}
                x={CANVAS_W - 4}
                y={gainToY(g) - 3}
                textAnchor="end"
                fill="rgba(255,255,255,0.2)"
                fontSize={9}
                fontFamily="monospace"
                pointerEvents="none"
              >
                {g.toFixed(1)}
              </text>
            ))}
          </svg>
        </div>

        <div className={styles.footer}>
          <span>
            Start: {displayRegion.startGain.toFixed(2)} | End: {displayRegion.endGain.toFixed(2)}
          </span>
          <span>
            {displayRegion.controlPoints.length} control point{displayRegion.controlPoints.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </>
  )
}
