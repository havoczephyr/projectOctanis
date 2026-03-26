import { ipcMain, BrowserWindow } from 'electron'
import log from 'electron-log'
import type { StreamStatus } from '../../ipcTypes'
import type { OctanisProjectFile } from '@octanis/shared'
import { LoopExpander } from '../audio/LoopExpander'
import { Mixer } from '../audio/Mixer'
import { createEncoderStream } from '../audio/Encoder'
import { BroadcastHub } from '../server/HttpServer'

const hub = new BroadcastHub()

/** Currently loaded project — set via project IPC, read here */
let currentProject: OctanisProjectFile | null = null

export function setStreamProject(project: OctanisProjectFile | null): void {
  currentProject = project
}

function getStatus(): StreamStatus {
  return {
    running: hub.running,
    port: 8080,
    format: 'mp3',
    listenerCount: hub.listenerCount,
    uptimeSec: Math.round(hub.uptimeSec),
  }
}

/** Periodically send stream status to renderer while running */
let statusInterval: ReturnType<typeof setInterval> | null = null

function startStatusPolling(): void {
  stopStatusPolling()
  statusInterval = setInterval(() => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('stream:status', getStatus())
    }
  }, 2000)
}

function stopStatusPolling(): void {
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }
}

export function registerStreamHandlers(): void {
  ipcMain.handle('stream:start', async (_e, port: number, format: string) => {
    if (hub.running) {
      return getStatus()
    }
    if (!currentProject) {
      throw new Error('No project loaded')
    }

    const fmt = format === 'opus' ? 'opus' : 'mp3'

    try {
      // Expand loops, then build PCM stream, then encode
      const expanded = LoopExpander.expand(currentProject)
      const pcmStream = Mixer.getPCMStream(expanded)
      const encodedStream = createEncoderStream(pcmStream, { format: fmt })

      await hub.start(port, fmt, encodedStream, expanded)
      startStatusPolling()

      log.info(`[Stream] Started on :${port} (${fmt})`)
      return getStatus()
    } catch (err) {
      log.error('[Stream] Failed to start:', err)
      throw err
    }
  })

  ipcMain.handle('stream:stop', async () => {
    hub.stop()
    stopStatusPolling()
    log.info('[Stream] Stopped')
    return getStatus()
  })

  ipcMain.handle('stream:getStatus', async () => {
    return getStatus()
  })
}
