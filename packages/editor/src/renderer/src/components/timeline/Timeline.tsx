import React, { useRef, useCallback, useEffect } from 'react'
import { TimelineRuler } from './TimelineRuler'
import { TrackLane } from './TrackLane'
import { TrackHeader } from './TrackHeader'
import { Playhead } from './Playhead'
import { Minimap } from './Minimap'
import { useProjectStore } from '../../store/projectStore'
import { useTransportStore } from '../../store/transportStore'
import { useUiStore, MIN_ZOOM, MAX_ZOOM, PLAYHEAD_SNAP_PX } from '../../store/uiStore'
import { useTimeToPixel } from '../../hooks/useTimeToPixel'
import { TRACK_HEIGHT, RULER_HEIGHT, HEADER_WIDTH } from '../../constants'
import { findClipCollision, snapToAdjacentClip } from '../../utils/clipCollision'
import { ToastMessage } from './ToastMessage'
import styles from './Timeline.module.css'

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
  const setTimelineViewportWidth = useUiStore((s) => s.setTimelineViewportWidth)
  const totalWidth = Math.max(timeToPixel(durationSec), 2000)

  // Track viewport width for zoom-to-fit
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const update = (): void => setTimelineViewportWidth(container.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [setTimelineViewportWidth])

  // Sync horizontal scroll
  function handleScroll(e: React.UIEvent<HTMLDivElement>): void {
    setScrollLeft(e.currentTarget.scrollLeft)
  }

  // Wheel-to-zoom anchored to cursor position (Ctrl/Cmd + scroll)
  const zoom = useUiStore((s) => s.zoom)
  const setZoom = useUiStore((s) => s.setZoom)
  const deselectAll = useUiStore((s) => s.deselectAll)

  // Refs for native wheel listener (avoid stale closures)
  const zoomRef = useRef(zoom)
  const scrollLeftRef = useRef(scrollLeft)

  // Keep refs in sync
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { scrollLeftRef.current = scrollLeft }, [scrollLeft])

  // Native wheel listener with { passive: false } so preventDefault works
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    function handleWheel(e: WheelEvent): void {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const rect = container!.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const curZoom = zoomRef.current
        const curScroll = scrollLeftRef.current
        const timeSec = (curScroll + mouseX) / curZoom
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, curZoom + (-e.deltaY * 0.5)))
        setZoom(newZoom)
        setScrollLeft(timeSec * newZoom - mouseX)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [setZoom, setScrollLeft])

  function handleScrollAreaClick(e: React.MouseEvent): void {
    if (e.target === e.currentTarget) deselectAll()
  }

  // Handle audio file drop onto timeline (creates a new track if needed)
  const handleDrop = useCallback(
    async (e: React.DragEvent, targetTrackId?: string) => {
      e.preventDefault()
      const audioPath = e.dataTransfer.getData('application/octanis-audio-path')
      if (!audioPath) return

      const rect = scrollContainerRef.current!.getBoundingClientRect()
      const relativeX = e.clientX - rect.left + scrollContainerRef.current!.scrollLeft
      let dropTimeSec = Math.max(0, pixelToTime(relativeX))

      // Snap to playhead or ghost play-start marker if within threshold
      const snapping = useUiStore.getState().snapping
      if (snapping) {
        const { playheadSec, playStartSec } = useTransportStore.getState()
        const snapThresholdSec = pixelToTime(PLAYHEAD_SNAP_PX)
        if (Math.abs(dropTimeSec - playheadSec) <= snapThresholdSec) {
          dropTimeSec = playheadSec
        } else if (playStartSec != null && Math.abs(dropTimeSec - playStartSec) <= snapThresholdSec) {
          dropTimeSec = playStartSec
        }
      }

      let audioFile
      try {
        audioFile = await window.octanis.ffmpeg.inspectAudio(audioPath)
      } catch (err) {
        console.error('[Octanis:DnD] inspectAudio FAILED', audioPath, err)
        return
      }
      addAudioFile(audioFile)

      // Collision checking when dropping onto an existing track
      if (targetTrackId) {
        const currentTracks = useProjectStore.getState().projectFile.project.tracks
        const currentAudioFiles = useProjectStore.getState().projectFile.audioFiles
        const targetTrack = currentTracks.find((t) => t.id === targetTrackId)
        if (targetTrack) {
          const snapSec = pixelToTime(PLAYHEAD_SNAP_PX)
          dropTimeSec = snapToAdjacentClip(targetTrack, audioFile.durationSec, dropTimeSec, null, currentAudioFiles, snapSec)
          const collision = findClipCollision(targetTrack, audioFile.durationSec, dropTimeSec, null, currentAudioFiles)
          if (collision) {
            useUiStore.getState().showToast('Area too small, try elsewhere', 'error')
            useUiStore.getState().setClipCollisionFlash({ trackId: targetTrackId })
            setTimeout(() => useUiStore.getState().setClipCollisionFlash(null), 600)
            return
          }
        }
      }

      const trackId = targetTrackId ?? addTrack()
      addClip(trackId, audioFile.id, dropTimeSec)
    },
    [addAudioFile, addClip, addTrack, pixelToTime]
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
        onClick={handleScrollAreaClick}
        onDrop={(e) => {
          const rect = scrollContainerRef.current!.getBoundingClientRect()
          const relativeY = e.clientY - rect.top + scrollContainerRef.current!.scrollTop
          const adjustedY = relativeY - RULER_HEIGHT
          let targetTrackId: string | undefined
          if (adjustedY >= 0) {
            const trackIndex = Math.floor(adjustedY / TRACK_HEIGHT)
            if (trackIndex < tracks.length) {
              targetTrackId = tracks[trackIndex].id
            }
          }
          handleDrop(e, targetTrackId)
        }}
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
                totalWidth={totalWidth}
              />
            ))}
            {/* Drop zone for creating new tracks */}
            <div
              className={styles.dropZone}
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
      <Minimap scrollContainerRef={scrollContainerRef} />
      <ToastMessage />
    </div>
  )
}
