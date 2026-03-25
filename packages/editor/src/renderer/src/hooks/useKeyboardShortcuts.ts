import { useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey

      if (mod && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        useProjectStore.temporal.getState().undo()
      }
      if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        useProjectStore.temporal.getState().redo()
      }

      // Zoom in: Cmd/Ctrl + =
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        useUiStore.getState().zoomBy(30)
      }
      // Zoom out: Cmd/Ctrl + -
      if (mod && e.key === '-') {
        e.preventDefault()
        useUiStore.getState().zoomBy(-30)
      }
      // Zoom to fit: Cmd/Ctrl + 0
      if (mod && e.key === '0') {
        e.preventDefault()
        const { timelineViewportWidth } = useUiStore.getState()
        const { durationSec } = useProjectStore.getState().projectFile.project
        useUiStore.getState().zoomToFit(timelineViewportWidth, durationSec)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
