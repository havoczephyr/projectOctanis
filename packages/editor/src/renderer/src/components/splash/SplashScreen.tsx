import React, { useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useRecentProjectsStore, type RecentProject } from '../../store/recentProjectsStore'
import { discoverAudioFiles } from '../../utils/discoverAudioFiles'
import styles from './SplashScreen.module.css'

export function SplashScreen(): React.ReactElement {
  const setProject = useProjectStore((s) => s.setProject)
  const recentProjects = useRecentProjectsStore((s) => s.recentProjects)
  const addRecent = useRecentProjectsStore((s) => s.addRecent)
  const removeRecent = useRecentProjectsStore((s) => s.removeRecent)

  const [showNewForm, setShowNewForm] = useState(false)
  const [projectTitle, setProjectTitle] = useState('Untitled Project')
  const [error, setError] = useState<string | null>(null)

  async function handleNewProject(): Promise<void> {
    setError(null)
    const folderPath = await window.octanis.file.openFolder()
    if (!folderPath) return

    try {
      const { projectFile, filePath } = await window.octanis.file.createProject(
        folderPath,
        projectTitle
      )
      addRecent(projectTitle, filePath)
      setProject(projectFile, filePath)
    } catch (err) {
      setError(`Failed to create project: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleOpenProject(): Promise<void> {
    setError(null)
    const result = await window.octanis.file.open()
    if (!result) return
    addRecent(result.projectFile.project.meta.title, result.filePath)
    setProject(result.projectFile, result.filePath)
    discoverAudioFiles(result.filePath)
  }

  async function handleOpenRecent(recent: RecentProject): Promise<void> {
    setError(null)
    try {
      const projectFile = await window.octanis.file.openByPath(recent.filePath)
      if (!projectFile) {
        setError(`Could not open "${recent.filePath}" — file may have been moved or deleted.`)
        return
      }
      addRecent(projectFile.project.meta.title, recent.filePath)
      setProject(projectFile, recent.filePath)
      discoverAudioFiles(recent.filePath)
    } catch (err) {
      setError(`Failed to open project: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function handleNewFormSubmit(e: React.FormEvent): void {
    e.preventDefault()
    handleNewProject()
  }

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return ''
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Logo / Title */}
        <div className={styles.header}>
          <div className={styles.title}>OCTANIS</div>
          <div className={styles.subtitle}>audio production environment</div>
          <div className={styles.version}>v0.0.11 — Astral Kestrel</div>
        </div>

        {/* New Project Form or Action Buttons */}
        {showNewForm ? (
          <form className={styles.newProjectForm} onSubmit={handleNewFormSubmit}>
            <label className={styles.formLabel}>Project Name</label>
            <input
              className={styles.formInput}
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              autoFocus
              placeholder="Enter project name..."
            />
            <div className={styles.formActions}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowNewForm(false)
                  setError(null)
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn--primary">
                Choose Folder...
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.actions}>
            <button
              className={`btn btn--primary ${styles.actionBtn}`}
              onClick={() => setShowNewForm(true)}
            >
              New Project
            </button>
            <button
              className={`btn ${styles.actionBtn}`}
              onClick={handleOpenProject}
            >
              Open Project
            </button>
          </div>
        )}

        {/* Error */}
        {error && <div className={styles.error}>{error}</div>}

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div className={styles.recentSection}>
            <div className={styles.recentLabel}>Recent Projects</div>
            <div className={styles.recentList}>
              {recentProjects.map((recent) => (
                <div
                  key={recent.filePath}
                  className={styles.recentItem}
                  onClick={() => handleOpenRecent(recent)}
                >
                  <div className={styles.recentItemInfo}>
                    <div className={styles.recentItemTitle}>{recent.title}</div>
                    <div className={styles.recentItemPath}>{recent.filePath}</div>
                  </div>
                  <div className={styles.recentItemDate}>{formatDate(recent.lastOpened)}</div>
                  <button
                    className={styles.recentRemoveBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecent(recent.filePath)
                    }}
                    title="Remove from recent"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentProjects.length === 0 && !showNewForm && (
          <div className={styles.emptyRecent}>
            No recent projects — create or open one to get started
          </div>
        )}
      </div>
    </div>
  )
}
