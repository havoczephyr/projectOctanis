import React, { useRef, useCallback } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import type { Clip } from '@octanis/shared'

interface Props {
  trackId: string
  clip: Clip
  side: 'in' | 'out'
  height: number
  clipWidth: number
}

export function FadeHandle({ trackId, clip, side, height, clipWidth }: Props): React.ReactElement {
  const setFadeIn = useProjectStore((s) => s.setFadeIn)
  const setFadeOut = useProjectStore((s) => s.setFadeOut)
  const { pixelToTime, timeToPixel } = useTimeToPixel()

  const fadeDuration = side === 'in' ? clip.fadeIn.durationSec : clip.fadeOut.durationSec
  const fadePx = timeToPixel(fadeDuration)

  // Triangle points for the fade wedge
  const points =
    side === 'in'
      ? `0,${height} ${fadePx},0 ${fadePx},${height}`
      : `${clipWidth - fadePx},0 ${clipWidth},${height} ${clipWidth - fadePx},${height}`

  const dragRef = useRef<{ startX: number; startDuration: number } | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startDuration: fadeDuration }

      function onMouseMove(ev: MouseEvent): void {
        if (!dragRef.current) return
        const dx = ev.clientX - dragRef.current.startX
        const newDuration = Math.max(
          0,
          Math.min(
            dragRef.current.startDuration + (side === 'in' ? pixelToTime(dx) : pixelToTime(-dx)),
            clip.trimEndSec != null
              ? clip.trimEndSec - clip.trimStartSec
              : 9999
          )
        )
        if (side === 'in') setFadeIn(trackId, clip.id, { durationSec: newDuration })
        else setFadeOut(trackId, clip.id, { durationSec: newDuration })
      }

      function onMouseUp(): void {
        dragRef.current = null
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [clip, fadeDuration, pixelToTime, setFadeIn, setFadeOut, side, trackId]
  )

  return (
    <polygon
      points={points}
      fill="rgba(0,0,0,0.35)"
      stroke="rgba(255,255,255,0.3)"
      strokeWidth={1}
      style={{ cursor: side === 'in' ? 'ew-resize' : 'ew-resize', position: 'absolute' }}
      onMouseDown={handleMouseDown}
    />
  )
}
