import { useEffect } from 'react'
import { nanoid } from 'nanoid'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import { useTransportStore } from '../store/transportStore'
import { copyToClipboard, getClipboard } from '../utils/clipboard'
import { findClipCollision, getClipDurationSec } from '../utils/clipCollision'

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      const isTextInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // ── Undo / Redo ──────────────────────────────────────────────

      if (mod && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        useProjectStore.temporal.getState().undo()
      }
      if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        useProjectStore.temporal.getState().redo()
      }

      // ── Zoom ─────────────────────────────────────────────────────

      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        useUiStore.getState().zoomBy(30)
      }
      if (mod && e.key === '-') {
        e.preventDefault()
        useUiStore.getState().zoomBy(-30)
      }
      if (mod && e.key === '0') {
        e.preventDefault()
        const { timelineViewportWidth } = useUiStore.getState()
        const { durationSec } = useProjectStore.getState().projectFile.project
        useUiStore.getState().zoomToFit(timelineViewportWidth, durationSec)
      }

      // ── Copy clip (Ctrl+C) ───────────────────────────────────────

      if (mod && !e.shiftKey && e.key === 'c' && !isTextInput) {
        e.preventDefault()
        const clipId = useUiStore.getState().selectedClipIds[0]
        if (!clipId) {
          useUiStore.getState().showToast('No clip selected', 'info')
          return
        }
        const { tracks } = useProjectStore.getState().projectFile.project
        for (const track of tracks) {
          const clip = track.clips.find((c) => c.id === clipId)
          if (clip) {
            copyToClipboard({ clip, audioFileId: clip.audioFileId })
            useUiStore.getState().showToast('Clip copied', 'info')
            return
          }
        }
      }

      // ── Cut clip (Ctrl+X) ────────────────────────────────────────

      if (mod && !e.shiftKey && e.key === 'x' && !isTextInput) {
        e.preventDefault()
        const clipId = useUiStore.getState().selectedClipIds[0]
        if (!clipId) {
          useUiStore.getState().showToast('No clip selected', 'info')
          return
        }
        const { tracks } = useProjectStore.getState().projectFile.project
        for (const track of tracks) {
          const clip = track.clips.find((c) => c.id === clipId)
          if (clip) {
            copyToClipboard({ clip, audioFileId: clip.audioFileId })
            useProjectStore.getState().removeClip(track.id, clip.id)
            useUiStore.getState().deselectAll()
            useUiStore.getState().showToast('Clip cut', 'info')
            return
          }
        }
      }

      // ── Paste clip (Ctrl+Shift+V) ────────────────────────────────

      if (mod && e.shiftKey && (e.key === 'v' || e.key === 'V') && !isTextInput) {
        e.preventDefault()
        const entry = getClipboard()
        if (!entry) {
          useUiStore.getState().showToast('Nothing to paste', 'info')
          return
        }
        const hoveredTrackId = useUiStore.getState().hoveredTrackId
        if (!hoveredTrackId) {
          useUiStore.getState().showToast('Hover over a track to paste', 'info')
          return
        }
        const { playheadSec } = useTransportStore.getState()
        const store = useProjectStore.getState()
        const { tracks } = store.projectFile.project
        const { audioFiles } = store.projectFile
        const track = tracks.find((t) => t.id === hoveredTrackId)
        if (!track) return

        const clipDuration = getClipDurationSec(entry.clip, audioFiles)
        const collision = findClipCollision(track, clipDuration, playheadSec, null, audioFiles)
        if (collision) {
          useUiStore.getState().showToast('Cannot paste — clips would overlap', 'error')
          useUiStore.getState().setClipCollisionFlash({ trackId: hoveredTrackId })
          return
        }

        // Create new clip with regenerated IDs
        const newClipId = store.addClip(hoveredTrackId, entry.audioFileId, playheadSec)
        store.updateClip(hoveredTrackId, newClipId, {
          trimStartSec: entry.clip.trimStartSec,
          trimEndSec: entry.clip.trimEndSec,
          volume: entry.clip.volume,
          fadeRegions: structuredClone(entry.clip.fadeRegions).map((r) => ({
            ...r,
            id: nanoid(),
            controlPoints: r.controlPoints.map((p) => ({ ...p, id: nanoid() })),
          })),
          muteRegions: structuredClone(entry.clip.muteRegions).map((r) => ({
            ...r,
            id: nanoid(),
          })),
          loop: entry.clip.loop ? structuredClone(entry.clip.loop) : null,
        })
        useUiStore.getState().showToast('Clip pasted', 'info')
      }

      // ── Loop selection (Ctrl+L) ──────────────────────────────────

      if (mod && !e.shiftKey && e.key === 'l' && !isTextInput) {
        e.preventDefault()
        const rangeSelection = useUiStore.getState().rangeSelection
        if (!rangeSelection) {
          useUiStore.getState().showToast('Select a range first', 'info')
          return
        }
        useUiStore.getState().openShortcutPrompt({
          type: 'loop',
          clipId: rangeSelection.clipId,
          trackId: rangeSelection.trackId,
        })
      }

      // ── Gain/Fade on selection (Ctrl+G) ──────────────────────────

      if (mod && !e.shiftKey && e.key === 'g' && !isTextInput) {
        e.preventDefault()
        const rangeSelection = useUiStore.getState().rangeSelection
        if (!rangeSelection) {
          useUiStore.getState().showToast('Select a range first', 'info')
          return
        }
        const { tracks } = useProjectStore.getState().projectFile.project
        const track = tracks.find((t) => t.id === rangeSelection.trackId)
        const clip = track?.clips.find((c) => c.id === rangeSelection.clipId)
        if (!clip || !track) return

        const regionId = nanoid()
        useProjectStore.getState().addFadeRegion(track.id, clip.id, {
          id: regionId,
          startSec: rangeSelection.startSec,
          endSec: rangeSelection.endSec,
          startGain: clip.volume,
          endGain: clip.volume,
          controlPoints: [],
        })
        useUiStore.getState().openFadeGainEditor(track.id, clip.id, regionId)
        useUiStore.getState().clearRangeSelection()
      }

      // ── Duck selection (Ctrl+D) ──────────────────────────────────

      if (mod && !e.shiftKey && e.key === 'd' && !isTextInput) {
        e.preventDefault()
        const rangeSelection = useUiStore.getState().rangeSelection
        if (!rangeSelection) {
          useUiStore.getState().showToast('Select a range first', 'info')
          return
        }
        useUiStore.getState().openShortcutPrompt({
          type: 'duck',
          clipId: rangeSelection.clipId,
          trackId: rangeSelection.trackId,
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
