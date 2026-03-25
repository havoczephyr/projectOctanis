import { useProjectStore } from '../store/projectStore'
import { saveProject } from './saveProject'

/**
 * Checks for unsaved changes and prompts the user if needed.
 * Returns true if safe to proceed, false if the user cancelled.
 */
export async function confirmUnsavedChanges(): Promise<boolean> {
  const { isDirty, isProjectOpen } = useProjectStore.getState()
  if (!isDirty || !isProjectOpen) return true

  const choice = await window.octanis.dialog.showUnsavedChanges()
  if (choice === 'cancel') return false
  if (choice === 'save') {
    const saved = await saveProject()
    return saved
  }
  return true // discard
}
