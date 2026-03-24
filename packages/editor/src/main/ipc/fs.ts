import { ipcMain } from 'electron'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import log from 'electron-log'
import type { FileEntry } from '../../ipcTypes'

export type { FileEntry }

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.opus', '.wma'])

function isAudioFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return AUDIO_EXTENSIONS.has(ext)
}

export function registerFsHandlers(): void {
  ipcMain.handle('fs:readdir', async (_event, dirPath: string): Promise<FileEntry[]> => {
    try {
      const entries = await readdir(dirPath)
      const result: FileEntry[] = []

      for (const name of entries) {
        if (name.startsWith('.')) continue
        const fullPath = join(dirPath, name)
        try {
          const info = await stat(fullPath)
          result.push({
            name,
            path: fullPath,
            isDirectory: info.isDirectory(),
            isAudioFile: !info.isDirectory() && isAudioFile(name),
          })
        } catch {
          // skip entries we can't stat
        }
      }

      return result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } catch (err) {
      log.error('fs:readdir error', err)
      throw err
    }
  })

  ipcMain.handle('fs:readAudioFile', async (_event, filePath: string): Promise<ArrayBuffer> => {
    try {
      const buffer = await readFile(filePath)
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    } catch (err) {
      log.error('fs:readAudioFile error', filePath, err)
      throw err
    }
  })
}
