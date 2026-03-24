import React, { useEffect, useRef } from 'react'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import { useProjectStore } from '../../store/projectStore'
import styles from './TimelineRuler.module.css'

interface Props {
  height: number
  totalWidth: number
  scrollLeft: number
}

export function TimelineRuler({ height, totalWidth, scrollLeft }: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { zoom } = useTimeToPixel()
  const bpm = useProjectStore((s) => s.projectFile.project.bpm)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    // Background
    const bgColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--ruler-bg')
      .trim()
    ctx.fillStyle = bgColor || '#050a16'
    ctx.fillRect(0, 0, w, h)

    // Determine tick interval
    const beatSec = 60 / bpm
    const beatPx = beatSec * zoom

    // Choose a sensible major/minor interval
    let minorPx = beatPx
    let majorEvery = 4 // beats per bar

    // If beats are too dense, show only bars
    if (beatPx < 8) {
      minorPx = beatPx * 4
      majorEvery = 4
    }
    // If beats are very spread, show sub-beat ticks
    else if (beatPx > 120) {
      minorPx = beatPx / 4
      majorEvery = 4
    }

    const startOffset = scrollLeft % (minorPx * majorEvery)
    const startTime = scrollLeft / zoom

    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--ruler-mark')
      .trim() || 'rgba(0,255,204,0.4)'
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--ruler-text')
      .trim() || '#3a6a8a'
    ctx.font = `10px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace'}`

    let x = -startOffset
    let tickIndex = Math.floor(scrollLeft / minorPx)

    while (x < w) {
      const isMajor = tickIndex % majorEvery === 0
      const timeSec = (scrollLeft + x) / zoom

      ctx.globalAlpha = isMajor ? 0.85 : 0.4
      ctx.beginPath()
      ctx.moveTo(x, isMajor ? 0 : h * 0.6)
      ctx.lineTo(x, h)
      ctx.stroke()

      if (isMajor && x >= 0) {
        ctx.globalAlpha = 1
        const label = formatTime(timeSec)
        ctx.fillText(label, x + 3, h - 4)
      }

      x += minorPx
      tickIndex++
    }

    // Bottom border line
    ctx.globalAlpha = 1
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--border')
      .trim() || 'rgba(0,255,204,0.25)'
    ctx.beginPath()
    ctx.moveTo(0, h - 0.5)
    ctx.lineTo(w, h - 0.5)
    ctx.stroke()
  }, [zoom, bpm, scrollLeft, totalWidth])

  return (
    <div className={styles.ruler} style={{ height }}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
