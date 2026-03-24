/**
 * Copies an audio file into the project's `audio/` subdirectory.
 * Returns the path of the copied file (handles filename collisions via the IPC handler).
 */
export async function copyAudioToProject(
  sourcePath: string,
  projectFilePath: string
): Promise<string> {
  const lastSlash = projectFilePath.lastIndexOf('/')
  const projectFolder = projectFilePath.substring(0, lastSlash)
  const audioDir = `${projectFolder}/audio`
  const fileName = sourcePath.substring(sourcePath.lastIndexOf('/') + 1)
  const destPath = `${audioDir}/${fileName}`
  return window.octanis.fs.copyFile(sourcePath, destPath)
}
