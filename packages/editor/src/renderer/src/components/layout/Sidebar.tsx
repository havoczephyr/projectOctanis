import React from 'react'
import { FileBrowser } from '../fileBrowser/FileBrowser'
import { useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import styles from './Sidebar.module.css'

export function Sidebar(): React.ReactElement {
  const folder = useUiStore((s) => s.sidebarFolder)
  const setSidebarFolder = useUiStore((s) => s.setSidebarFolder)

  async function handleOpenFolder(): Promise<void> {
    const path = await window.octanis.file.openFolder()
    if (path) setSidebarFolder(path)
  }

  async function handleImportAudio(): Promise<void> {
    const files = await window.octanis.file.importAudio()
    if (!files || files.length === 0) return
    for (const sourcePath of files) {
      try {
        const audioFile = await window.octanis.ffmpeg.inspectAudio(sourcePath)
        useProjectStore.getState().addAudioFile(audioFile)
      } catch (err) {
        console.error('[Octanis] Failed to import audio file', sourcePath, err)
      }
    }
    // Navigate sidebar to the folder containing the imported files
    const folder = files[0].substring(0, files[0].lastIndexOf('/'))
    setSidebarFolder(folder)
  }

  return (
    <div className={`${styles.sidebar} panel`}>
      <div className={styles.header}>
        <span className={styles.title}>FILES</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn--icon" onClick={handleImportAudio} title="Import audio files">
            +
          </button>
          <button className="btn btn--icon" onClick={handleOpenFolder} title="Open folder">
            ⊞
          </button>
        </div>
      </div>

      {folder ? (
        <FileBrowser rootPath={folder} />
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>♪</div>
          <div className={styles.emptyText}>Open a folder to browse audio files</div>
        </div>
      )}
    </div>
  )
}
