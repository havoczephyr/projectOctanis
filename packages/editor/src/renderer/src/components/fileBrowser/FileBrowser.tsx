import React, { useEffect, useState, useCallback } from 'react'
import { FileItem } from './FileItem'
import { AudioContextMenu } from './AudioContextMenu'
import { useAudioPreview } from '../../hooks/useAudioPreview'
import type { FileEntry } from '../../../../ipcTypes'
import styles from './FileBrowser.module.css'

interface Props {
  rootPath: string
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  audioPath: string
}

const MENU_HIDDEN: ContextMenuState = { visible: false, x: 0, y: 0, audioPath: '' }

export function FileBrowser({ rootPath }: Props): React.ReactElement {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>(MENU_HIDDEN)
  const { preview, stopPreview, isPlaying, currentPath } = useAudioPreview()

  useEffect(() => {
    setLoading(true)
    window.octanis.fs
      .readdir(rootPath)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [rootPath])

  function toggleDir(path: string): void {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    if (!entry.isAudioFile) return
    e.preventDefault()
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, audioPath: entry.path })
  }, [])

  const closeMenu = useCallback(() => setCtxMenu(MENU_HIDDEN), [])

  const handlePreview = useCallback(() => {
    if (ctxMenu.audioPath) preview(ctxMenu.audioPath)
  }, [ctxMenu.audioPath, preview])

  const handleClickFile = useCallback((entry: FileEntry) => {
    if (entry.isAudioFile && isPlaying && currentPath === entry.path) {
      stopPreview()
    }
  }, [isPlaying, currentPath, stopPreview])

  if (loading) {
    return <div className={styles.loading}>Loading...</div>
  }

  return (
    <div className={styles.browser}>
      <div className={styles.rootLabel} title={rootPath}>
        {rootPath.split('/').pop()}
      </div>
      <div className={styles.list}>
        {entries.filter((e) => e.isDirectory || e.isAudioFile).map((entry) => (
          <FileItem
            key={entry.path}
            entry={entry}
            depth={0}
            expanded={expandedDirs.has(entry.path)}
            previewing={isPlaying && currentPath === entry.path}
            onToggleDir={toggleDir}
            onContextMenu={handleContextMenu}
            onClickFile={handleClickFile}
          />
        ))}
      </div>
      <AudioContextMenu
        x={ctxMenu.x}
        y={ctxMenu.y}
        visible={ctxMenu.visible}
        isPlayingThis={isPlaying && currentPath === ctxMenu.audioPath}
        onPreview={handlePreview}
        onStop={stopPreview}
        onClose={closeMenu}
      />
    </div>
  )
}
