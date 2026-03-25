import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { OctanisProjectFileSchema, type OctanisProjectFile } from '@octanis/shared'
import log from 'electron-log'

export function registerFileHandlers(): void {
  ipcMain.handle(
    'file:open',
    async (): Promise<{ projectFile: OctanisProjectFile; filePath: string } | null> => {
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
        const projectFile = OctanisProjectFileSchema.parse(parsed)
        return { projectFile, filePath }
      } catch (err) {
        log.error('file:open parse error', err)
        dialog.showErrorBox(
          'Invalid Project File',
          `Could not load the project file.\n\n${err instanceof Error ? err.message : String(err)}`
        )
        return null
      }
    }
  )

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
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    'file:createProject',
    async (
      _event,
      folderPath: string,
      title: string
    ): Promise<{ projectFile: OctanisProjectFile; filePath: string }> => {
      const now = new Date().toISOString()
      const projectFile: OctanisProjectFile = {
        project: {
          version: '1.0',
          meta: { title, author: '', createdAt: now, updatedAt: now },
          bpm: 120,
          timeSignature: [4, 4],
          durationSec: 120,
          masterVolume: 1.0,
          tracks: [],
        },
        audioFiles: {},
      }
      const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'untitled'
      const filePath = join(folderPath, `${safeName}.octanis.json`)
      await writeFile(filePath, JSON.stringify(projectFile, null, 2), 'utf-8')
      return { projectFile, filePath }
    }
  )

  ipcMain.handle(
    'dialog:showUnsavedChanges',
    async (): Promise<'save' | 'discard' | 'cancel'> => {
      const win = BrowserWindow.getFocusedWindow()
      const result = await dialog.showMessageBox(win!, {
        type: 'warning',
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
      })
      return (['save', 'discard', 'cancel'] as const)[result.response]
    }
  )

  ipcMain.handle(
    'file:openByPath',
    async (_event, filePath: string): Promise<OctanisProjectFile | null> => {
      try {
        const raw = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        return OctanisProjectFileSchema.parse(parsed)
      } catch (err) {
        log.error('file:openByPath error', err)
        return null
      }
    }
  )
}
