import { useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useRecentProjectsStore } from '../store/recentProjectsStore'
import { useUiStore } from '../store/uiStore'

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
      const result = await window.octanis.file.open()
      if (result) {
        useRecentProjectsStore.getState().addRecent(
          result.projectFile.project.meta.title,
          result.filePath
        )
        useProjectStore.getState().setProject(result.projectFile, result.filePath)
      }
    })
    const cleanupFileClose = window.octanis.menu.onFileClose(() => {
      useProjectStore.getState().closeProject()
    })
    return () => {
      cleanupUndo()
      cleanupRedo()
      cleanupHistory()
      cleanupFileOpen()
      cleanupFileClose()
    }
  }, [])
}
