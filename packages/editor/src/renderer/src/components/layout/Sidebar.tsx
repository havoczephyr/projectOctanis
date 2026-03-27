import React from 'react'
import { FileBrowser } from '../fileBrowser/FileBrowser'
import { ImportedFilesList } from '../fileBrowser/ImportedFilesList'
import { useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import styles from './Sidebar.module.css'

export function Sidebar(): React.ReactElement {
  const folder = useUiStore((s) => s.sidebarFolder)
  const setSidebarFolder = useUiStore((s) => s.setSidebarFolder)
  const audioFiles = useProjectStore((s) => s.projectFile.audioFiles)
  const hasImportedFiles = Object.keys(audioFiles).length > 0

  const selectedPath = useUiStore((s) => s.selectedSidebarPath)
  const setSelectedSidebarPath = useUiStore((s) => s.setSelectedSidebarPath)

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
  }

  function handleSelect(path: string): void {
    setSelectedSidebarPath(selectedPath === path ? null : path)
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

      {/* Imported audio files — persistent across folder changes */}
      {hasImportedFiles && (
        <>
          <div className={styles.sectionHeader}>IMPORTED</div>
          <div className={folder ? styles.importedConstrained : styles.importedExpanded}>
            <ImportedFilesList selectedPath={selectedPath} onSelect={handleSelect} />
          </div>
        </>
      )}

      {/* Filesystem browser */}
      {folder ? (
        <>
          {hasImportedFiles && <div className={styles.sectionHeader}>BROWSE</div>}
          <FileBrowser rootPath={folder} selectedPath={selectedPath} onSelect={handleSelect} />
        </>
      ) : !hasImportedFiles ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>♪</div>
          <div className={styles.emptyText}>Open a folder to browse audio files</div>
        </div>
      ) : null}
    </div>
  )
}
