import React from 'react'
import { type EnvelopePoint, interpolateEnvelope } from '@octanis/shared'
import { useWaveformDrag } from '../../hooks/useWaveformDrag'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import styles from './EnvelopeOverlay.module.css'

interface Props {
  trackId: string
  clipId: string
  envelope: EnvelopePoint[]
  clipDurationSec: number
  width: number
  height: number
  trackColor: string
}

const HANDLE_RADIUS = 5

export function EnvelopeOverlay({
  trackId,
  clipId,
  envelope,
  clipDurationSec,
  width,
  height,
  trackColor,
}: Props): React.ReactElement {
  const { timeToPixel } = useTimeToPixel()
  const { onSvgMouseDown, onHandleDoubleClick } = useWaveformDrag({
    trackId,
    clipId,
    clipDurationSec,
    canvasWidth: width,
    canvasHeight: height,
  })

  // Build SVG polyline points from envelope
  function envToSvgPoint(p: EnvelopePoint): string {
    const x = timeToPixel(p.timeSec)
    // gain 0 = bottom, gain 1 = middle, gain 2 = top
    const y = height - (p.gain / 2) * height
    return `${x},${y}`
  }

  // Build a path that covers the area under the envelope (for fill)
  const hasEnvelope = envelope.length > 0
  const points = hasEnvelope ? envelope.map(envToSvgPoint).join(' ') : ''

  // Sample the gain at regular intervals for the continuous line across full width
  const linePoints: string[] = []
  const steps = Math.max(2, Math.floor(width / 4))
  for (let i = 0; i <= steps; i++) {
    const timeSec = (i / steps) * clipDurationSec
    const x = (i / steps) * width
    const gain = interpolateEnvelope(envelope, timeSec)
    const y = height - (gain / 2) * height
    linePoints.push(`${x},${y}`)
  }

  return (
    <svg
      className={styles.overlay}
      width={width}
      height={height}
      onMouseDown={(e) => onSvgMouseDown(e)}
    >
      {/* Gain fill area */}
      {linePoints.length > 0 && (
        <polygon
          points={`0,${height} ${linePoints.join(' ')} ${width},${height}`}
          fill={trackColor}
          fillOpacity={0.08}
          stroke="none"
        />
      )}

      {/* Envelope line */}
      <polyline
        points={linePoints.join(' ')}
        fill="none"
        stroke={trackColor}
        strokeWidth={1.5}
        strokeOpacity={0.6}
      />

      {/* Draggable handle circles */}
      {envelope.map((point) => {
        const x = timeToPixel(point.timeSec)
        const y = height - (point.gain / 2) * height
        return (
          <circle
            key={point.timeSec}
            cx={x}
            cy={y}
            r={HANDLE_RADIUS}
            fill={trackColor}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={1}
            className={styles.handle}
            onMouseDown={(e) => {
              e.stopPropagation()
              onSvgMouseDown(e as unknown as React.MouseEvent<SVGElement>, point)
            }}
            onDoubleClick={(e) => onHandleDoubleClick(e as unknown as React.MouseEvent, point.timeSec)}
          />
        )
      })}
    </svg>
  )
}
