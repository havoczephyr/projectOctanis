import React from 'react'
import { type FadeRegion, interpolateFadeRegionGain } from '@octanis/shared'
import { useFadeRegionActions } from '../../hooks/useFadeRegionActions'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
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

const BOOKMARK_SIZE = 8
const CURVE_SAMPLES = 40

function gainToY(gain: number, height: number): number {
  return height - (gain / 2) * height
}

function buildCurvePath(
  region: FadeRegion,
  timeToPixel: (t: number) => number,
  height: number
): string {
  const steps = CURVE_SAMPLES
  const points: string[] = []
  const duration = region.endSec - region.startSec

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const timeSec = region.startSec + t * duration
    const gain = interpolateFadeRegionGain(region, t)
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
  const curvePath = buildCurvePath(region, timeToPixel, height)
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
  const { timeToPixel } = useTimeToPixel()
  const { onRegionDoubleClick, onBookmarkClick } = useFadeRegionActions({ trackId, clipId })

  return (
    <svg
      className={styles.overlay}
      width={width}
      height={height}
    >
      {/* Curve visualization for all regions */}
      {fadeRegions.map((region) => {
        const fillPath = buildFillPath(region, clipVolume, timeToPixel, height)
        const curvePath = buildCurvePath(region, timeToPixel, height)

        return (
          <g key={region.id}>
            <path
              d={fillPath}
              fill={trackColor}
              fillOpacity={0.15}
              stroke="none"
            />
            <path
              d={curvePath}
              fill="none"
              stroke={trackColor}
              strokeWidth={1.5}
              strokeOpacity={0.8}
            />
          </g>
        )
      })}

      {/* Bookmark markers at bottom */}
      {fadeRegions.map((region) => {
        const cx = timeToPixel((region.startSec + region.endSec) / 2)
        const by = height - 2

        return (
          <g
            key={`bm-${region.id}`}
            className={styles.bookmark}
            onClick={(e) => onBookmarkClick(e, region.id)}
            onDoubleClick={(e) => onRegionDoubleClick(e, region.id)}
          >
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
    </svg>
  )
}
