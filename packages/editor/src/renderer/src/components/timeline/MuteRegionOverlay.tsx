import React, { useCallback } from 'react'
import { type MuteRegion } from '@octanis/shared'
import { useProjectStore } from '../../store/projectStore'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import styles from './MuteRegionOverlay.module.css'

interface Props {
  trackId: string
  clipId: string
  muteRegions: MuteRegion[]
  clipDurationSec: number
  width: number
  height: number
}

const BOOKMARK_SIZE = 8
const MUTE_COLOR = '#FF3366'

export function MuteRegionOverlay({
  trackId,
  clipId,
  muteRegions,
  clipDurationSec,
  width,
  height,
}: Props): React.ReactElement {
  const { timeToPixel } = useTimeToPixel()
  const removeMuteRegion = useProjectStore((s) => s.removeMuteRegion)

  const onBookmarkDoubleClick = useCallback(
    (e: React.MouseEvent, regionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      removeMuteRegion(trackId, clipId, regionId)
    },
    [trackId, clipId, removeMuteRegion]
  )

  return (
    <svg
      className={styles.overlay}
      width={width}
      height={height}
    >
      {/* Hatch pattern definition */}
      <defs>
        <pattern
          id={`mute-hatch-${clipId}`}
          patternUnits="userSpaceOnUse"
          width={6}
          height={6}
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={6} stroke={MUTE_COLOR} strokeWidth={1} strokeOpacity={0.3} />
        </pattern>
      </defs>

      {/* Mute region rectangles with hatch fill */}
      {muteRegions.map((region) => {
        const x = timeToPixel(region.startSec)
        const w = timeToPixel(region.endSec) - x

        return (
          <g key={region.id}>
            {/* Semi-transparent background */}
            <rect
              x={x}
              y={0}
              width={w}
              height={height}
              fill={MUTE_COLOR}
              fillOpacity={0.1}
            />
            {/* Diagonal hatch overlay */}
            <rect
              x={x}
              y={0}
              width={w}
              height={height}
              fill={`url(#mute-hatch-${clipId})`}
            />
            {/* Left/right border lines */}
            <line x1={x} y1={0} x2={x} y2={height} stroke={MUTE_COLOR} strokeWidth={1} strokeOpacity={0.4} />
            <line x1={x + w} y1={0} x2={x + w} y2={height} stroke={MUTE_COLOR} strokeWidth={1} strokeOpacity={0.4} />
          </g>
        )
      })}

      {/* Bookmark markers at bottom */}
      {muteRegions.map((region) => {
        const cx = timeToPixel((region.startSec + region.endSec) / 2)
        const by = height - 2

        return (
          <g
            key={`bm-${region.id}`}
            className={styles.bookmark}
            onDoubleClick={(e) => onBookmarkDoubleClick(e, region.id)}
          >
            <polygon
              points={`${cx - BOOKMARK_SIZE / 2},${by} ${cx + BOOKMARK_SIZE / 2},${by} ${cx},${by - BOOKMARK_SIZE}`}
              fill={MUTE_COLOR}
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
