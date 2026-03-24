import { useEffect } from 'react'
import { useProjectStore } from '../store/projectStore'

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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
