import { useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'
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
    return () => {
      cleanupUndo()
      cleanupRedo()
      cleanupHistory()
    }
  }, [])
}
