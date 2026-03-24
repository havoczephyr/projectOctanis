import React from 'react'
import { FileBrowser } from '../fileBrowser/FileBrowser'
import { useUiStore } from '../../store/uiStore'
import styles from './Sidebar.module.css'

export function Sidebar(): React.ReactElement {
  const folder = useUiStore((s) => s.sidebarFolder)
  const setSidebarFolder = useUiStore((s) => s.setSidebarFolder)

  async function handleOpenFolder(): Promise<void> {
    const path = await window.octanis.file.openFolder()
    if (path) setSidebarFolder(path)
  }

  return (
    <div className={`${styles.sidebar} panel`}>
      <div className={styles.header}>
        <span className={styles.title}>FILES</span>
        <button className="btn btn--icon" onClick={handleOpenFolder} title="Open folder">
          ⊞
        </button>
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
