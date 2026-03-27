import React, { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { createDuckOnTimeline } from '../hooks/useFadeRegionActions'
import styles from './ShortcutPrompt.module.css'

export function ShortcutPrompt(): React.ReactElement | null {
  const shortcutPrompt = useUiStore((s) => s.shortcutPrompt)
  const closeShortcutPrompt = useUiStore((s) => s.closeShortcutPrompt)
  const rangeSelection = useUiStore((s) => s.rangeSelection)
  const clearRangeSelection = useUiStore((s) => s.clearRangeSelection)
  const setLoop = useProjectStore((s) => s.setLoop)

  const tracks = useProjectStore((s) => s.projectFile.project.tracks)

  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset value and focus when prompt opens
  useEffect(() => {
    if (shortcutPrompt) {
      setValue(shortcutPrompt.type === 'loop' ? '2' : '70')
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [shortcutPrompt])

  // Close on click outside
  useEffect(() => {
    if (!shortcutPrompt) return
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeShortcutPrompt()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [shortcutPrompt, closeShortcutPrompt])

  if (!shortcutPrompt) return null

  const { type, clipId, trackId } = shortcutPrompt
  const track = tracks.find((t) => t.id === trackId)
  const clip = track?.clips.find((c) => c.id === clipId)

  if (!track || !clip || !rangeSelection) {
    return null
  }

  function handleConfirm(): void {
    if (!clip || !track || !rangeSelection) return
    const num = parseInt(value, 10)

    if (type === 'loop') {
      if (isNaN(num) || num < 1) return
      setLoop(trackId, clipId, {
        startSec: rangeSelection.startSec,
        endSec: rangeSelection.endSec,
        count: num,
      })
    } else {
      if (isNaN(num) || num < 1 || num > 99) return
      const duckGain = clip.volume * (1 - num / 100)
      createDuckOnTimeline(
        trackId,
        clipId,
        rangeSelection.startSec,
        rangeSelection.endSec,
        duckGain,
        clip.volume
      )
    }

    clearRangeSelection()
    closeShortcutPrompt()
  }

  return (
    <div className={styles.overlay} onMouseDown={closeShortcutPrompt}>
      <div className={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.title}>
          {type === 'loop' ? 'Loop Selection' : 'Duck Selection'}
        </div>
        <div className={styles.row}>
          <span className={styles.label}>
            {type === 'loop' ? 'Repeats:' : 'Duck %:'}
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            type="number"
            min={1}
            max={type === 'loop' ? 99 : 99}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
              if (e.key === 'Escape') closeShortcutPrompt()
            }}
          />
          <button className={styles.confirm} onClick={handleConfirm}>
            OK
          </button>
        </div>
        <div className={styles.hint}>Enter to confirm, Esc to cancel</div>
      </div>
    </div>
  )
}
