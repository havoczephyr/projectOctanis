import React from 'react'
import { useProjectStore } from '../../store/projectStore'
import styles from './ImportedFilesList.module.css'

const AUDIO_ICONS: Record<string, string> = {
  '.mp3': '♪',
  '.wav': '◉',
  '.flac': '◈',
  '.ogg': '○',
  '.aac': '◆',
  '.m4a': '◇',
  '.opus': '◐',
}

function getIcon(name: string): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return AUDIO_ICONS[ext] ?? '·'
}

interface Props {
  selectedPath: string | null
  onSelect: (path: string) => void
}

export function ImportedFilesList({ selectedPath, onSelect }: Props): React.ReactElement {
  const audioFiles = useProjectStore((s) => s.projectFile.audioFiles)
  const removeAudioFile = useProjectStore((s) => s.removeAudioFile)
  const entries = Object.values(audioFiles)

  return (
    <div className={styles.list}>
      {entries.map((af) => {
        const fileName = af.absolutePath.split('/').pop() ?? af.id
        const isSelected = selectedPath === af.absolutePath
        return (
          <div
            key={af.id}
            className={`${styles.item} ${isSelected ? styles.selected : ''}`}
            draggable
            onClick={() => onSelect(af.absolutePath)}
            onDragStart={(e) => {
              e.dataTransfer.setData('application/octanis-audio-path', af.absolutePath)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            title={af.absolutePath}
          >
            <span className={styles.icon}>{getIcon(fileName)}</span>
            <span className={styles.name}>{fileName}</span>
            <button
              className={styles.deleteBtn}
              onClick={(e) => {
                e.stopPropagation()
                removeAudioFile(af.id)
              }}
              title="Remove from project"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
