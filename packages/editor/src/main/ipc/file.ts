import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { OctanisProjectFileSchema, type OctanisProjectFile } from '@octanis/shared'
import log from 'electron-log'

export function registerFileHandlers(): void {
  ipcMain.handle('file:open', async (): Promise<OctanisProjectFile | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Open Octanis Project',
      filters: [
        { name: 'Octanis Project', extensions: ['octanis.json', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      const validated = OctanisProjectFileSchema.parse(parsed)
      return validated
    } catch (err) {
      log.error('file:open parse error', err)
      dialog.showErrorBox(
        'Invalid Project File',
        `Could not load the project file.\n\n${err instanceof Error ? err.message : String(err)}`
      )
      return null
    }
  })

  ipcMain.handle(
    'file:save',
    async (_event, projectFile: OctanisProjectFile, filePath?: string): Promise<string | null> => {
      const win = BrowserWindow.getFocusedWindow()

      if (!filePath) {
        const result = await dialog.showSaveDialog(win!, {
          title: 'Save Octanis Project',
          defaultPath: `${projectFile.project.meta.title || 'untitled'}.octanis.json`,
          filters: [{ name: 'Octanis Project', extensions: ['octanis.json', 'json'] }],
        })
        if (result.canceled || !result.filePath) return null
        filePath = result.filePath
      }

      try {
        const now = new Date().toISOString()
        projectFile.project.meta.updatedAt = now
        await writeFile(filePath, JSON.stringify(projectFile, null, 2), 'utf-8')
        return filePath
      } catch (err) {
        log.error('file:save error', err)
        dialog.showErrorBox(
          'Save Failed',
          `Could not save the project.\n\n${err instanceof Error ? err.message : String(err)}`
        )
        return null
      }
    }
  )

  ipcMain.handle('file:importAudio', async (): Promise<string[] | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import Audio Files',
      filters: [
        {
          name: 'Audio Files',
          extensions: ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'opus'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    })

    if (result.canceled) return null
    return result.filePaths
  })

  ipcMain.handle('file:openFolder', async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Open Music Folder',
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
