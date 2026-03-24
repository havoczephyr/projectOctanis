import React, { useEffect } from 'react'
import styles from './AudioContextMenu.module.css'

interface Props {
  x: number
  y: number
  visible: boolean
  isPlayingThis: boolean
  onPreview: () => void
  onStop: () => void
  onClose: () => void
}

export function AudioContextMenu({ x, y, visible, isPlayingThis, onPreview, onStop, onClose }: Props): React.ReactElement | null {
  useEffect(() => {
    if (!visible) return
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [visible, onClose])

  if (!visible) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.menu} style={{ left: x, top: y }}>
        {isPlayingThis ? (
          <div
            className={styles.menuItem}
            onClick={() => { onStop(); onClose() }}
          >
            ■ Stop
          </div>
        ) : (
          <div
            className={styles.menuItem}
            onClick={() => { onPreview(); onClose() }}
          >
            ▶ Preview
          </div>
        )}
      </div>
    </>
  )
}
