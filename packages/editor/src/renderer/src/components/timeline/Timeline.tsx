import React, { useRef, useCallback } from 'react'
import { TimelineRuler } from './TimelineRuler'
import { TrackLane } from './TrackLane'
import { TrackHeader } from './TrackHeader'
import { Playhead } from './Playhead'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore, MIN_ZOOM, MAX_ZOOM } from '../../store/uiStore'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import { copyAudioToProject } from '../../utils/copyAudioToProject'
import styles from './Timeline.module.css'

const RULER_HEIGHT = 28
const TRACK_HEIGHT = 80
const HEADER_WIDTH = 160

export function Timeline(): React.ReactElement {
  const tracks = useProjectStore((s) => s.projectFile.project.tracks)
  const durationSec = useProjectStore((s) => s.projectFile.project.durationSec)
  const addTrack = useProjectStore((s) => s.addTrack)
  const addClip = useProjectStore((s) => s.addClip)
  const addAudioFile = useProjectStore((s) => s.addAudioFile)
  const scrollLeft = useUiStore((s) => s.scrollLeft)
  const setScrollLeft = useUiStore((s) => s.setScrollLeft)
  const { timeToPixel, pixelToTime } = useTimeToPixel()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const totalWidth = Math.max(timeToPixel(durationSec), 2000)

  // Sync horizontal scroll
  function handleScroll(e: React.UIEvent<HTMLDivElement>): void {
    setScrollLeft(e.currentTarget.scrollLeft)
  }

  // Wheel-to-zoom anchored to cursor position (Ctrl/Cmd + scroll)
  const zoom = useUiStore((s) => s.zoom)
  const setZoom = useUiStore((s) => s.setZoom)
  const deselectAll = useUiStore((s) => s.deselectAll)

  function handleWheel(e: React.WheelEvent): void {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const container = scrollContainerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const timeSec = (scrollLeft + mouseX) / zoom

      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + (-e.deltaY * 0.5)))
      setZoom(newZoom)
      setScrollLeft(timeSec * newZoom - mouseX)
    }
  }

  function handleScrollAreaClick(e: React.MouseEvent): void {
    if (e.target === e.currentTarget) deselectAll()
  }

  // Handle audio file drop onto timeline (creates a new track if needed)
  const handleDrop = useCallback(
    async (e: React.DragEvent, targetTrackId?: string) => {
      e.preventDefault()
      // Capture everything synchronously before any async boundary —
      // React synthetic events are pooled and currentTarget is nullified after the handler returns
      const audioPath = e.dataTransfer.getData('application/octanis-audio-path')
      console.debug('[Octanis:DnD] handleDrop fired', { audioPath, targetTrackId, hasData: !!audioPath })
      if (!audioPath) {
        console.debug('[Octanis:DnD] handleDrop aborted — no audio path in dataTransfer')
        return
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      // scrollArea does NOT include the header column, so no HEADER_WIDTH subtraction
      const relativeX = e.clientX - rect.left + scrollLeft
      const dropTimeSec = Math.max(0, pixelToTime(relativeX))
      console.debug('[Octanis:DnD] drop position', { clientX: e.clientX, rectLeft: rect.left, scrollLeft, relativeX, dropTimeSec })

      // Safe to await now that all sync values are captured
      // Copy the audio file into the project folder if a project is open
      let resolvedPath = audioPath
      const currentFilePath = useProjectStore.getState().currentFilePath
      if (currentFilePath) {
        try {
          resolvedPath = await copyAudioToProject(audioPath, currentFilePath)
          console.debug('[Octanis:DnD] copied audio to project', { from: audioPath, to: resolvedPath })
        } catch (copyErr) {
          console.error('[Octanis:DnD] copyAudioToProject FAILED, using original path', copyErr)
        }
      }

      let audioFile
      try {
        console.debug('[Octanis:DnD] calling inspectAudio...', { audioPath: resolvedPath })
        audioFile = await window.octanis.ffmpeg.inspectAudio(resolvedPath)
        console.debug('[Octanis:DnD] inspectAudio result', audioFile)
      } catch (err) {
        console.error('[Octanis:DnD] inspectAudio FAILED', audioPath, err)
        return
      }
      addAudioFile(audioFile)

      const trackId = targetTrackId ?? addTrack()
      const clipId = addClip(trackId, audioFile.id, dropTimeSec)
      console.debug('[Octanis:DnD] clip created', { trackId, clipId, audioFileId: audioFile.id, dropTimeSec })
    },
    [addAudioFile, addClip, addTrack, pixelToTime, scrollLeft]
  )

  return (
    <div className={styles.container}>
      {/* Fixed header column */}
      <div className={styles.headers} style={{ width: HEADER_WIDTH }}>
        <div className={styles.rulerCorner} style={{ height: RULER_HEIGHT }} />
        {tracks.map((track) => (
          <TrackHeader key={track.id} track={track} height={TRACK_HEIGHT} />
        ))}
        <button
          className={`btn ${styles.addTrackBtn}`}
          onClick={() => addTrack()}
        >
          + Add Track
        </button>
      </div>

      {/* Scrollable timeline area */}
      <div
        ref={scrollContainerRef}
        className={styles.scrollArea}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onClick={handleScrollAreaClick}
        onDrop={(e) => handleDrop(e)}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
      >
        <div className={styles.inner} style={{ width: totalWidth }}>
          <TimelineRuler height={RULER_HEIGHT} totalWidth={totalWidth} scrollLeft={scrollLeft} />
          <div className={styles.tracks}>
            {tracks.map((track) => (
              <TrackLane
                key={track.id}
                track={track}
                height={TRACK_HEIGHT}
                onDrop={(e) => handleDrop(e, track.id)}
              />
            ))}
            {/* Drop zone for creating new tracks */}
            <div
              className={styles.dropZone}
              onDrop={(e) => { e.stopPropagation(); handleDrop(e) }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
            >
              Drop audio here to add a new track
            </div>
          </div>
          <Playhead totalWidth={totalWidth} rulerHeight={RULER_HEIGHT} />
        </div>
      </div>
    </div>
  )
}
