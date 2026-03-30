import { ipcMain } from 'electron'
import { StreamManager } from '../streamManager'
import type { StreamConfig } from '../../ipcTypes'

const manager = new StreamManager()

export function registerStreamHandlers(): void {
  ipcMain.handle('stream:start', async (event, config: StreamConfig) => {
    await manager.start(config, event.sender)
  })

  ipcMain.handle('stream:stop', () => {
    manager.stop()
  })
}
