import { ipcMain, dialog } from 'electron'
import { ProjectLoader } from '../audio/ProjectLoader'

export function registerProjectHandlers(): void {
  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Octanis Project',
      filters: [{ name: 'Octanis Project', extensions: ['octanis.json'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const projectFile = await ProjectLoader.load(filePath)
    return { projectFile, filePath }
  })

  ipcMain.handle('project:openByPath', async (_e, filePath: string) => {
    try {
      const projectFile = await ProjectLoader.load(filePath)
      return projectFile
    } catch {
      return null
    }
  })
}
