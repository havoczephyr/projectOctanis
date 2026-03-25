import { useProjectStore } from '../store/projectStore'
import { copyAudioToProject } from './copyAudioToProject'

/**
 * Saves the current project. Copies external audio files into the project's
 * audio/ folder on save (not at import/drop time).
 * Returns true if saved successfully, false if cancelled.
 */
export async function saveProject(saveAs = false): Promise<boolean> {
  const { projectFile, currentFilePath, setFilePath, markClean } = useProjectStore.getState()

  const filePath = saveAs ? undefined : (currentFilePath ?? undefined)
  const savedPath = await window.octanis.file.save(projectFile, filePath)
  if (!savedPath) return false

  // Copy external audio files into the project's audio/ folder
  let pathsUpdated = false
  for (const af of Object.values(projectFile.audioFiles)) {
    const projectFolder = savedPath.substring(0, savedPath.lastIndexOf('/'))
    const audioDir = `${projectFolder}/audio`
    if (!af.absolutePath.startsWith(audioDir + '/')) {
      try {
        const localPath = await copyAudioToProject(af.absolutePath, savedPath)
        if (localPath !== af.absolutePath) {
          useProjectStore.getState().updateAudioFilePath(af.id, localPath)
          pathsUpdated = true
        }
      } catch (err) {
        console.error('[Octanis:Save] failed to copy audio file', af.absolutePath, err)
      }
    }
  }

  // If paths changed, re-save with updated paths
  if (pathsUpdated) {
    const updated = useProjectStore.getState().projectFile
    await window.octanis.file.save(updated, savedPath)
  }

  setFilePath(savedPath)
  markClean()
  return true
}
