import { useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useRecentProjectsStore } from '../store/recentProjectsStore'
import { useUiStore } from '../store/uiStore'
import { saveProject } from '../utils/saveProject'
import { confirmUnsavedChanges } from '../utils/confirmUnsavedChanges'
import { discoverAudioFiles } from '../utils/discoverAudioFiles'

export function useMenuActions(): void {
  useEffect(() => {
    const cleanupUndo = window.octanis.menu.onUndo(() => {
      useProjectStore.temporal.getState().undo()
    })
    const cleanupRedo = window.octanis.menu.onRedo(() => {
      useProjectStore.temporal.getState().redo()
    })
    const cleanupHistory = window.octanis.menu.onUndoHistory(() => {
      useUiStore.getState().setShowUndoHistoryPanel(true)
    })
    const cleanupFileOpen = window.octanis.menu.onFileOpen(async () => {
      if (!(await confirmUnsavedChanges())) return
      const result = await window.octanis.file.open()
      if (result) {
        useRecentProjectsStore.getState().addRecent(
          result.projectFile.project.meta.title,
          result.filePath
        )
        useProjectStore.getState().setProject(result.projectFile, result.filePath)
        discoverAudioFiles(result.filePath)
      }
    })
    const cleanupFileSave = window.octanis.menu.onFileSave(async () => {
      await saveProject()
    })
    const cleanupFileSaveAs = window.octanis.menu.onFileSaveAs(async () => {
      await saveProject(true)
    })
    const cleanupFileClose = window.octanis.menu.onFileClose(async () => {
      if (!(await confirmUnsavedChanges())) return
      useProjectStore.getState().closeProject()
    })
    const cleanupWindowClose = window.octanis.window.onCloseRequested(async () => {
      if (await confirmUnsavedChanges()) {
        window.octanis.window.confirmClose()
      }
    })
    return () => {
      cleanupUndo()
      cleanupRedo()
      cleanupHistory()
      cleanupFileOpen()
      cleanupFileSave()
      cleanupFileSaveAs()
      cleanupFileClose()
      cleanupWindowClose()
    }
  }, [])
}
