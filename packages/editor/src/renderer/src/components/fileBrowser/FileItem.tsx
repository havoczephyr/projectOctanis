import React from 'react'
import type { FileEntry } from '../../../../ipcTypes'
import styles from './FileItem.module.css'

interface Props {
  entry: FileEntry
  depth: number
  expanded?: boolean
  previewing?: boolean
  onToggleDir: (path: string) => void
  onContextMenu?: (e: React.MouseEvent, entry: FileEntry) => void
  onClickFile?: (entry: FileEntry) => void
}

const AUDIO_ICONS: Record<string, string> = {
  '.mp3': '♪',
  '.wav': '◉',
  '.flac': '◈',
  '.ogg': '○',
  '.aac': '◆',
  '.m4a': '◇',
  '.opus': '◐',
}

function getIcon(entry: FileEntry, previewing?: boolean): string {
  if (previewing) return '▶'
  if (entry.isDirectory) return '▸'
  const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
  return AUDIO_ICONS[ext] ?? '·'
}

export function FileItem({ entry, depth, expanded, previewing, onToggleDir, onContextMenu, onClickFile }: Props): React.ReactElement {
  function handleClick(): void {
    if (entry.isDirectory) {
      onToggleDir(entry.path)
    } else {
      onClickFile?.(entry)
    }
  }

  function handleDragStart(e: React.DragEvent): void {
    if (!entry.isAudioFile) return
    console.debug('[Octanis:DnD] dragstart', { path: entry.path, isAudioFile: entry.isAudioFile })
    e.dataTransfer.setData('application/octanis-audio-path', entry.path)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      className={`${styles.item} ${entry.isAudioFile ? styles.audioFile : ''} ${entry.isDirectory ? styles.directory : ''} ${previewing ? styles.previewing : ''}`}
      style={{ paddingLeft: `${10 + depth * 14}px` }}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu?.(e, entry)}
      draggable={entry.isAudioFile}
      onDragStart={handleDragStart}
      title={entry.path}
    >
      <span className={styles.icon}>
        {entry.isDirectory && expanded ? '▾' : getIcon(entry, previewing)}
      </span>
      <span className={styles.name}>{entry.name}</span>
    </div>
  )
}
