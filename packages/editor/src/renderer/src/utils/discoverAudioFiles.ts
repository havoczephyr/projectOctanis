import { useProjectStore } from '../store/projectStore'

/**
 * Discovers audio files in the project's audio/ folder that aren't already
 * registered in the project file, and adds them to the store.
 */
export async function discoverAudioFiles(filePath: string): Promise<void> {
  const { projectFile } = useProjectStore.getState()
  const existingPaths = Object.values(projectFile.audioFiles).map((af) => af.absolutePath)

  const discovered = await window.octanis.file.discoverAudioFiles(filePath, existingPaths)
  if (discovered.length === 0) return

  const store = useProjectStore.getState()
  for (const af of discovered) {
    store.addAudioFile(af)
  }
  // Don't mark dirty — these files were already in the folder
  useProjectStore.getState().markClean()
}
