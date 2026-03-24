import React, { useEffect, useRef } from 'react'
import { type EnvelopePoint, interpolateEnvelope } from '@octanis/shared'
import { useWaveformDrag } from '../../hooks/useWaveformDrag'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import { useUiStore, isPointSelected } from '../../store/uiStore'
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
const SELECTED_RADIUS = 7

export function EnvelopeOverlay({
  trackId,
  clipId,
  envelope,
  clipDurationSec,
  width,
  height,
  trackColor,
}: Props): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const { timeToPixel } = useTimeToPixel()
  const selectedPoints = useUiStore((s) => s.selectedEnvelopePoints)
  const deselectAllEnvelopePoints = useUiStore((s) => s.deselectAllEnvelopePoints)
  const { onSvgMouseDown, onHandleMouseDown, onHandleDoubleClick } = useWaveformDrag({
    trackId,
    clipId,
    clipDurationSec,
    canvasWidth: width,
    canvasHeight: height,
  })

  // Clear envelope selection when this overlay unmounts
  useEffect(() => {
    return () => deselectAllEnvelopePoints()
  }, [deselectAllEnvelopePoints])

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
      ref={svgRef}
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
        const selected = isPointSelected(selectedPoints, point.timeSec)
        return (
          <circle
            key={point.timeSec}
            cx={x}
            cy={y}
            r={selected ? SELECTED_RADIUS : HANDLE_RADIUS}
            fill={selected ? '#fff' : trackColor}
            stroke={selected ? trackColor : 'rgba(255,255,255,0.5)'}
            strokeWidth={selected ? 2 : 1}
            className={`${styles.handle} ${selected ? styles.handleSelected : ''}`}
            onMouseDown={(e) => {
              e.stopPropagation()
              onHandleMouseDown(
                e as unknown as React.MouseEvent<SVGElement>,
                point,
                svgRef.current ?? undefined
              )
            }}
            onDoubleClick={(e) =>
              onHandleDoubleClick(e as unknown as React.MouseEvent, point.timeSec)
            }
          />
        )
      })}
    </svg>
  )
}
