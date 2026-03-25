import React, { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { createDuckOnTimeline } from '../../hooks/useFadeRegionActions'
import styles from './ClipContextMenu.module.css'

export function ClipContextMenu(): React.ReactElement | null {
  const contextMenu = useUiStore((s) => s.contextMenu)
  const closeContextMenu = useUiStore((s) => s.closeContextMenu)
  const rangeSelection = useUiStore((s) => s.rangeSelection)
  const clearRangeSelection = useUiStore((s) => s.clearRangeSelection)
  const openFadeGainEditor = useUiStore((s) => s.openFadeGainEditor)
  const addFadeRegion = useProjectStore((s) => s.addFadeRegion)
  const addMuteRegion = useProjectStore((s) => s.addMuteRegion)
  const setLoop = useProjectStore((s) => s.setLoop)
  const removeClip = useProjectStore((s) => s.removeClip)
  const moveClip = useProjectStore((s) => s.moveClip)
  const setRangeSelection = useUiStore((s) => s.setRangeSelection)
  const menuRef = useRef<HTMLDivElement>(null)
  const [showLoopInput, setShowLoopInput] = useState(false)
  const [loopCount, setLoopCount] = useState('2')
  const [showDuckInput, setShowDuckInput] = useState(false)
  const [duckAmount, setDuckAmount] = useState('70')

  // Find the clip and its fade regions
  const tracks = useProjectStore((s) => s.projectFile.project.tracks)
  const audioFiles = useProjectStore((s) => s.projectFile.audioFiles)
  const bpm = useProjectStore((s) => s.projectFile.project.bpm)

  const track = contextMenu ? tracks.find((t) => t.id === contextMenu.trackId) : null
  const clip = track ? track.clips.find((c) => c.id === contextMenu?.clipId) : null
  const audioFile = clip ? audioFiles[clip.audioFileId] : null

  const clipDurationSec = clip
    ? clip.trimEndSec != null
      ? clip.trimEndSec - clip.trimStartSec
      : audioFile?.durationSec ?? 30
    : 0

  // Close on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return

    function handleClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeContextMenu()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu, closeContextMenu])

  if (!contextMenu || !clip || !track) return null

  const hasRange = rangeSelection?.clipId === clip.id &&
    rangeSelection.endSec - rangeSelection.startSec > 0.01

  const hasFullClipOverlap = clip.fadeRegions.some(
    (r) => 0 < r.endSec && clipDurationSec > r.startSec
  )

  const beatDurationSec = 60 / bpm

  function handleEditFadeGain(): void {
    if (!rangeSelection || !clip || !track) return
    const regionId = nanoid()
    addFadeRegion(track.id, clip.id, {
      id: regionId,
      startSec: rangeSelection.startSec,
      endSec: rangeSelection.endSec,
      startGain: clip.volume,
      endGain: clip.volume,
      controlPoints: [],
    })
    openFadeGainEditor(track.id, clip.id, regionId)
    clearRangeSelection()
    closeContextMenu()
  }

  function handleMuteSelection(): void {
    if (!rangeSelection || !clip || !track) return
    const regionId = nanoid()
    addMuteRegion(track.id, clip.id, {
      id: regionId,
      startSec: rangeSelection.startSec,
      endSec: rangeSelection.endSec,
    })
    clearRangeSelection()
    closeContextMenu()
  }

  function handleDuckWithAmount(): void {
    if (!rangeSelection || !clip || !track) return
    const pct = parseInt(duckAmount, 10)
    if (isNaN(pct) || pct < 1 || pct > 99) return
    const duckGain = clip.volume * (1 - pct / 100)
    createDuckOnTimeline(
      track.id,
      clip.id,
      rangeSelection.startSec,
      rangeSelection.endSec,
      duckGain,
      clip.volume
    )
    clearRangeSelection()
    closeContextMenu()
  }

  function handleLoopSelection(): void {
    if (!rangeSelection || !clip || !track) return
    const count = loopCount === 'infinite' ? 'infinite' as const : parseInt(loopCount, 10)
    if (typeof count === 'number' && (isNaN(count) || count < 1)) return
    setLoop(track.id, clip.id, {
      startSec: rangeSelection.startSec,
      endSec: rangeSelection.endSec,
      count,
    })
    clearRangeSelection()
    closeContextMenu()
  }

  function handleRemoveLoop(): void {
    if (!clip || !track) return
    setLoop(track.id, clip.id, null)
    closeContextMenu()
  }

  function handleDeleteMuteRegion(regionId: string): void {
    if (!clip || !track) return
    useProjectStore.getState().removeMuteRegion(track.id, clip.id, regionId)
    closeContextMenu()
  }

  function handleFadeEntireClip(): void {
    if (!clip || !track || hasFullClipOverlap) return
    const regionId = nanoid()
    addFadeRegion(track.id, clip.id, {
      id: regionId,
      startSec: 0,
      endSec: clipDurationSec,
      startGain: clip.volume,
      endGain: clip.volume,
      controlPoints: [],
    })
    openFadeGainEditor(track.id, clip.id, regionId)
    clearRangeSelection()
    closeContextMenu()
  }

  function handleSelectEntireClip(): void {
    if (!clip || !track) return
    setRangeSelection({
      clipId: clip.id,
      trackId: track.id,
      startSec: 0,
      endSec: clipDurationSec,
    })
    closeContextMenu()
  }

  function handleMoveForward(): void {
    if (!clip || !track) return
    moveClip(track.id, clip.id, clip.startSec + beatDurationSec)
    closeContextMenu()
  }

  function handleMoveBackward(): void {
    if (!clip || !track) return
    moveClip(track.id, clip.id, Math.max(0, clip.startSec - beatDurationSec))
    closeContextMenu()
  }

  function handleDeleteClip(): void {
    if (!clip || !track) return
    removeClip(track.id, clip.id)
    closeContextMenu()
  }

  function handleEditRegion(regionId: string): void {
    if (!clip || !track) return
    openFadeGainEditor(track.id, clip.id, regionId)
    closeContextMenu()
  }

  function handleDeleteRegion(regionId: string): void {
    if (!clip || !track) return
    useProjectStore.getState().removeFadeRegion(track.id, clip.id, regionId)
    closeContextMenu()
  }

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        className={styles.item}
        disabled={!hasRange}
        onClick={handleEditFadeGain}
      >
        Edit Fade Gain{!hasRange ? ' (select range first)' : ''}
      </button>

      <button
        className={styles.item}
        disabled={!hasRange}
        onClick={handleMuteSelection}
      >
        Mute Selection{!hasRange ? ' (select range first)' : ''}
      </button>

      {!showDuckInput ? (
        <button
          className={styles.item}
          disabled={!hasRange}
          onClick={() => setShowDuckInput(true)}
        >
          Duck Selection{!hasRange ? ' (select range first)' : ''}
        </button>
      ) : (
        <div className={styles.loopInputRow}>
          <span className={styles.loopLabel}>Duck %:</span>
          <input
            className={styles.loopInput}
            type="number"
            min={1}
            max={99}
            value={duckAmount}
            onChange={(e) => setDuckAmount(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDuckWithAmount()
              if (e.key === 'Escape') setShowDuckInput(false)
            }}
          />
          <button className={styles.loopConfirm} onClick={handleDuckWithAmount}>
            OK
          </button>
        </div>
      )}

      {!showLoopInput ? (
        <button
          className={styles.item}
          disabled={!hasRange}
          onClick={() => setShowLoopInput(true)}
        >
          Loop Selection{!hasRange ? ' (select range first)' : ''}
        </button>
      ) : (
        <div className={styles.loopInputRow}>
          <span className={styles.loopLabel}>Repeats:</span>
          <input
            className={styles.loopInput}
            type="number"
            min={1}
            max={99}
            value={loopCount}
            onChange={(e) => setLoopCount(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLoopSelection()
              if (e.key === 'Escape') setShowLoopInput(false)
            }}
          />
          <button className={styles.loopConfirm} onClick={handleLoopSelection}>
            OK
          </button>
        </div>
      )}

      <button
        className={styles.item}
        disabled={hasFullClipOverlap}
        onClick={handleFadeEntireClip}
      >
        Fade Entire Clip{hasFullClipOverlap ? ' (has regions)' : ''}
      </button>

      <button className={styles.item} onClick={handleSelectEntireClip}>
        Select Entire Clip
      </button>

      <div className={styles.separator} />

      <button className={styles.item} onClick={handleMoveForward}>
        Move Forward 1 Beat
      </button>
      <button className={styles.item} onClick={handleMoveBackward}>
        Move Backward 1 Beat
      </button>

      <div className={styles.separator} />

      <button className={styles.destructive} onClick={handleDeleteClip}>
        Delete Clip
      </button>

      {/* Existing fade regions */}
      {clip.fadeRegions.length > 0 && (
        <>
          <div className={styles.separator} />
          <div className={styles.sectionLabel}>Fade Regions</div>
          {clip.fadeRegions.map((region, i) => (
            <React.Fragment key={region.id}>
              <button
                className={styles.item}
                onClick={() => handleEditRegion(region.id)}
              >
                Edit Region #{i + 1}
              </button>
              <button
                className={styles.destructive}
                onClick={() => handleDeleteRegion(region.id)}
              >
                Delete Region #{i + 1}
              </button>
            </React.Fragment>
          ))}
        </>
      )}

      {/* Loop */}
      {clip.loop && (
        <>
          <div className={styles.separator} />
          <div className={styles.sectionLabel}>
            Loop ({typeof clip.loop.count === 'number' ? `${clip.loop.count}x` : 'infinite'})
          </div>
          <button className={styles.destructive} onClick={handleRemoveLoop}>
            Remove Loop
          </button>
        </>
      )}

      {/* Existing mute regions */}
      {clip.muteRegions.length > 0 && (
        <>
          <div className={styles.separator} />
          <div className={styles.sectionLabel}>Mute Regions</div>
          {clip.muteRegions.map((region, i) => (
            <button
              key={region.id}
              className={styles.destructive}
              onClick={() => handleDeleteMuteRegion(region.id)}
            >
              Delete Mute #{i + 1}
            </button>
          ))}
        </>
      )}
    </div>
  )
}
