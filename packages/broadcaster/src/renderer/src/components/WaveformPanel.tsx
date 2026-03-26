import { useRef, useEffect, useCallback } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'
import { usePeaksCache } from '../store/peaksCache'
import type { OctanisProjectFile } from '@octanis/shared'

const PEAKS_PER_SEC = 100
const MIN_DRAW_INTERVAL = 80 // ~12fps

export function WaveformPanel(): JSX.Element {
  const projectFile = useBroadcasterStore((s) => s.projectFile)

  if (!projectFile) {
    return (
      <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>
        No project loaded.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {projectFile.project.tracks.map((track, i) => (
        <TrackWaveform
          key={track.id}
          track={track}
          index={i}
          projectFile={projectFile}
        />
      ))}
    </div>
  )
}

interface TrackWaveformProps {
  track: OctanisProjectFile['project']['tracks'][number]
  index: number
  projectFile: OctanisProjectFile
}

function TrackWaveform({ track, index, projectFile }: TrackWaveformProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastDrawRef = useRef(0)
  const rafRef = useRef(0)
  const playheadSec = useBroadcasterStore((s) => s.playheadSec)
  const transportState = useBroadcasterStore((s) => s.transportState)

  // Load peaks for each clip in this track
  const peaksCache = usePeaksCache()

  useEffect(() => {
    for (const clip of track.clips) {
      const audioFile = projectFile.audioFiles[clip.audioFileId]
      if (!audioFile) continue
      if (peaksCache.getLoadState(clip.audioFileId) !== 'idle') continue

      peaksCache.setLoadState(clip.audioFileId, 'loading')
      window.octanis.ffmpeg
        .extractPeaks(audioFile.absolutePath, { peaksPerSecond: PEAKS_PER_SEC })
        .then((result) => peaksCache.setPeaks(clip.audioFileId, result))
        .catch(() => peaksCache.setLoadState(clip.audioFileId, 'error'))
    }
  }, [track.clips, projectFile.audioFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const now = performance.now()
    if (now - lastDrawRef.current < MIN_DRAW_INTERVAL) {
      if (transportState === 'playing') {
        rafRef.current = requestAnimationFrame(draw)
      }
      return
    }
    lastDrawRef.current = now

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }

    ctx.clearRect(0, 0, w, h)

    const totalDuration = projectFile.project.durationSec
    if (totalDuration <= 0) return

    const midY = h / 2

    // Draw each clip's waveform
    for (const clip of track.clips) {
      const peaks = peaksCache.getPeaks(clip.audioFileId)
      if (!peaks) continue

      const clipStartPx = (clip.startSec / totalDuration) * w
      const clipDur = peaks.durationSec
      const clipWidthPx = (clipDur / totalDuration) * w

      ctx.save()
      ctx.beginPath()
      ctx.rect(clipStartPx, 0, clipWidthPx, h)
      ctx.clip()

      ctx.fillStyle = track.color + '30'
      ctx.fillRect(clipStartPx, 0, clipWidthPx, h)

      // Draw waveform
      ctx.fillStyle = track.color
      const samplesPerPx = peaks.count / clipWidthPx
      for (let px = 0; px < clipWidthPx; px++) {
        const sampleIdx = Math.floor(px * samplesPerPx)
        if (sampleIdx >= peaks.count) break

        const minVal = peaks.min[sampleIdx] ?? 0
        const maxVal = peaks.max[sampleIdx] ?? 0

        const top = midY - maxVal * midY
        const bottom = midY - minVal * midY
        ctx.fillRect(clipStartPx + px, top, 1, Math.max(1, bottom - top))
      }

      ctx.restore()
    }

    // Draw playhead
    if (playheadSec > 0 && playheadSec <= totalDuration) {
      const px = (playheadSec / totalDuration) * w
      ctx.fillStyle = 'var(--playhead, #ff3366)'
      ctx.fillRect(px - 0.5, 0, 1, h)
    }

    if (transportState === 'playing') {
      rafRef.current = requestAnimationFrame(draw)
    }
  }, [track, projectFile, playheadSec, transportState, peaksCache])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 3,
          height: 32,
          borderRadius: 2,
          background: track.color,
          boxShadow: `0 0 6px ${track.color}`,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 9, marginBottom: 2 }}>
          {track.name || `Track ${index + 1}`}
        </div>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: 28,
            display: 'block',
            borderRadius: 2,
            background: 'rgba(0, 0, 0, 0.3)',
          }}
        />
      </div>
    </div>
  )
}
