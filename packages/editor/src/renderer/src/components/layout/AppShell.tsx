import React, { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { TransportBar } from './TransportBar'
import { Timeline } from '../timeline/Timeline'
import { AudioRecorder } from '../recorder/AudioRecorder'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { useTransportStore } from '../../store/transportStore'
import { saveProject } from '../../utils/saveProject'
import { confirmUnsavedChanges } from '../../utils/confirmUnsavedChanges'
import styles from './AppShell.module.css'

export function AppShell(): React.ReactElement {
  const title = useProjectStore((s) => s.projectFile.project.meta.title)
  const isDirty = useProjectStore((s) => s.isDirty)
  const open = useProjectStore((s) => s.setProject)
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const uiIntensity = useUiStore((s) => s.uiIntensity)
  const cycleUiIntensity = useUiStore((s) => s.cycleUiIntensity)
  const audioOptimization = useUiStore((s) => s.audioOptimization)
  const showRecorder = useUiStore((s) => s.showRecorder)
  const toggleAudioOptimization = useUiStore((s) => s.toggleAudioOptimization)

  // Audio optimization: auto-reduce UI intensity during playback
  useEffect(() => {
    let prevTransportState = useTransportStore.getState().state
    const unsub = useTransportStore.subscribe((ts) => {
      if (ts.state === prevTransportState) return
      prevTransportState = ts.state
      const ui = useUiStore.getState()
      if (!ui.audioOptimization) return
      if (ts.state === 'playing') {
        useUiStore.setState({ _prePlaybackIntensity: ui.uiIntensity, uiIntensity: 'low' })
      } else if (ui._prePlaybackIntensity) {
        useUiStore.setState({ uiIntensity: ui._prePlaybackIntensity, _prePlaybackIntensity: null })
      }
    })
    return unsub
  }, [])

  async function handleOpen(): Promise<void> {
    if (!(await confirmUnsavedChanges())) return
    const result = await window.octanis.file.open()
    if (result) open(result.projectFile, result.filePath)
  }

  async function handleSave(): Promise<void> {
    await saveProject()
  }

  return (
    <div className={styles.shell}>
      {/* Title bar / menu area */}
      <div className={styles.titleBar}>
        <div className={styles.titleBarControls}>
          <button className="btn" onClick={handleOpen}>Open</button>
          <button className="btn" onClick={handleSave}>Save{isDirty ? ' *' : ''}</button>
          <button
            className="btn"
            onClick={() => useUiStore.getState().openRecorder()}
            title="Open voice recorder"
            style={{ color: '#ff3366' }}
          >
            {'●'} REC
          </button>
        </div>
        <div className={styles.titleBarCenter}>
          <span className="glow-text">{title}{isDirty ? ' ●' : ''}</span>
        </div>
        <div className={styles.titleBarRight}>
          <button
            className={`btn btn--icon ${audioOptimization ? 'btn--primary' : ''}`}
            onClick={toggleAudioOptimization}
            title={`Audio optimization: ${audioOptimization ? 'ON' : 'OFF'} — reduce UI during playback`}
          >
            {'⚡'}
          </button>
          <button className="btn btn--icon" onClick={cycleUiIntensity} title={`UI intensity: ${uiIntensity}`}>
            {uiIntensity === 'high' ? 'H' : uiIntensity === 'balanced' ? 'B' : 'L'}
          </button>
          <button className="btn btn--icon" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀' : '◐'}
          </button>
        </div>
      </div>

      {/* Transport controls */}
      <TransportBar />

      {/* Main content area */}
      <div className={styles.content}>
        <Sidebar />
        <Timeline />
      </div>

      {/* Voice recorder modal */}
      {showRecorder && <AudioRecorder />}
    </div>
  )
}
