import React, { useRef } from 'react'
import { type FadeRegion, quadBezier } from '@octanis/shared'
import { useFadeRegionDrag } from '../../hooks/useFadeRegionDrag'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import { useUiStore } from '../../store/uiStore'
import styles from './FadeRegionOverlay.module.css'

interface Props {
  trackId: string
  clipId: string
  fadeRegions: FadeRegion[]
  clipDurationSec: number
  clipVolume: number
  width: number
  height: number
  trackColor: string
}

const CONTROL_RADIUS = 6
const BOOKMARK_SIZE = 8
const CURVE_SAMPLES = 40

function gainToY(gain: number, height: number): number {
  return height - (gain / 2) * height
}

function buildBezierPath(
  region: FadeRegion,
  clipVolume: number,
  timeToPixel: (t: number) => number,
  height: number
): string {
  const steps = CURVE_SAMPLES
  const points: string[] = []
  const duration = region.endSec - region.startSec

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const timeSec = region.startSec + t * duration
    const gain = quadBezier(clipVolume, region.peakGain, clipVolume, t)
    const x = timeToPixel(timeSec)
    const y = gainToY(gain, height)
    points.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`)
  }

  return points.join(' ')
}

function buildFillPath(
  region: FadeRegion,
  clipVolume: number,
  timeToPixel: (t: number) => number,
  height: number
): string {
  const curvePath = buildBezierPath(region, clipVolume, timeToPixel, height)
  const startX = timeToPixel(region.startSec)
  const endX = timeToPixel(region.endSec)
  const baseY = gainToY(clipVolume, height)
  return `${curvePath} L ${endX} ${baseY} L ${startX} ${baseY} Z`
}

export function FadeRegionOverlay({
  trackId,
  clipId,
  fadeRegions,
  clipDurationSec,
  clipVolume,
  width,
  height,
  trackColor,
}: Props): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const { timeToPixel } = useTimeToPixel()
  const editingClipId = useUiStore((s) => s.editingFadeRegionClipId)
  const editingRegionId = useUiStore((s) => s.editingFadeRegionId)
  const isEditing = editingClipId === clipId

  const {
    onBackgroundMouseDown,
    onControlPointMouseDown,
    onEdgeMouseDown,
    onRegionDoubleClick,
    onBookmarkClick,
  } = useFadeRegionDrag({
    trackId,
    clipId,
    clipDurationSec,
    canvasWidth: width,
    canvasHeight: height,
  })

  return (
    <svg
      ref={svgRef}
      className={`${styles.overlay} ${isEditing ? styles.overlayEditing : ''}`}
      width={width}
      height={height}
      onMouseDown={isEditing ? (e) => onBackgroundMouseDown(e) : undefined}
    >
      {/* Always render: curve visualization for all regions */}
      {fadeRegions.map((region) => {
        const fillPath = buildFillPath(region, clipVolume, timeToPixel, height)
        const curvePath = buildBezierPath(region, clipVolume, timeToPixel, height)
        const isSwell = region.peakGain > clipVolume

        return (
          <g key={region.id}>
            {/* Fill under/over curve */}
            <path
              d={fillPath}
              fill={trackColor}
              fillOpacity={0.15}
              stroke="none"
            />
            {/* Curve line */}
            <path
              d={curvePath}
              fill="none"
              stroke={trackColor}
              strokeWidth={isEditing && editingRegionId === region.id ? 2 : 1.5}
              strokeOpacity={0.8}
            />
          </g>
        )
      })}

      {/* Collapsed mode: bookmark markers at bottom */}
      {!isEditing && fadeRegions.map((region) => {
        const cx = timeToPixel((region.startSec + region.endSec) / 2)
        const by = height - 2

        return (
          <g
            key={`bm-${region.id}`}
            className={styles.bookmark}
            onClick={(e) => onBookmarkClick(e, region.id)}
          >
            {/* Bookmark triangle */}
            <polygon
              points={`${cx - BOOKMARK_SIZE / 2},${by} ${cx + BOOKMARK_SIZE / 2},${by} ${cx},${by - BOOKMARK_SIZE}`}
              fill={trackColor}
              fillOpacity={0.7}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={0.5}
            />
          </g>
        )
      })}

      {/* Editing mode: interactive handles */}
      {isEditing && fadeRegions.map((region) => {
        const duration = region.endSec - region.startSec
        const midTimeSec = region.startSec + duration * region.controlPointX
        const controlX = timeToPixel(midTimeSec)
        const controlY = gainToY(region.peakGain, height)
        const startX = timeToPixel(region.startSec)
        const endX = timeToPixel(region.endSec)
        const baseY = gainToY(clipVolume, height)
        const isActive = editingRegionId === region.id

        return (
          <g key={`edit-${region.id}`}>
            {/* Region background highlight */}
            <rect
              x={startX}
              y={0}
              width={endX - startX}
              height={height}
              fill={trackColor}
              fillOpacity={isActive ? 0.06 : 0.03}
            />

            {/* Edge handles */}
            <line
              x1={startX} y1={0} x2={startX} y2={height}
              stroke={trackColor}
              strokeWidth={2}
              strokeOpacity={0.6}
              className={styles.edgeHandle}
              onMouseDown={(e) => onEdgeMouseDown(
                e as unknown as React.MouseEvent<SVGElement>,
                region, 'start', svgRef.current ?? undefined
              )}
              onDoubleClick={(e) => onRegionDoubleClick(e, region.id)}
            />
            <line
              x1={endX} y1={0} x2={endX} y2={height}
              stroke={trackColor}
              strokeWidth={2}
              strokeOpacity={0.6}
              className={styles.edgeHandle}
              onMouseDown={(e) => onEdgeMouseDown(
                e as unknown as React.MouseEvent<SVGElement>,
                region, 'end', svgRef.current ?? undefined
              )}
              onDoubleClick={(e) => onRegionDoubleClick(e, region.id)}
            />

            {/* Dashed line from base to control point */}
            <line
              x1={controlX} y1={baseY} x2={controlX} y2={controlY}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />

            {/* Control point handle */}
            <circle
              cx={controlX}
              cy={controlY}
              r={CONTROL_RADIUS}
              fill="#fff"
              stroke={trackColor}
              strokeWidth={2}
              className={styles.controlPoint}
              onMouseDown={(e) => onControlPointMouseDown(
                e as unknown as React.MouseEvent<SVGElement>,
                region, svgRef.current ?? undefined
              )}
              onDoubleClick={(e) => onRegionDoubleClick(e, region.id)}
            />
          </g>
        )
      })}
    </svg>
  )
}
