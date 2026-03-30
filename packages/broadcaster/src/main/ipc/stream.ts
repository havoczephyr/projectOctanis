import { ipcMain } from 'electron'
import { StreamManager } from '../streamManager'
import type { StreamConfig } from '../../ipcTypes'

const manager = new StreamManager()

// Pipeline diagnostic counters
let pcmReceived = 0
let pcmForwarded = 0
let diagTimer: ReturnType<typeof setInterval> | null = null

function startDiag(): void {
  stopDiag()
  pcmReceived = 0
  pcmForwarded = 0
  diagTimer = setInterval(() => {
    if (pcmReceived > 0 || pcmForwarded > 0) {
      console.log(
        `[StreamIPC][DIAG] pcmReceived=${pcmReceived} pcmForwarded=${pcmForwarded}`
      )
    }
  }, 5000)
}

function stopDiag(): void {
  if (diagTimer) {
    clearInterval(diagTimer)
    diagTimer = null
  }
}

export function registerStreamHandlers(): void {
  ipcMain.handle('stream:start', async (event, config: StreamConfig) => {
    startDiag()
    await manager.start(config, event.sender)
  })

  ipcMain.handle('stream:stop', () => {
    stopDiag()
    console.log(
      `[StreamIPC][DIAG] Final: pcmReceived=${pcmReceived} pcmForwarded=${pcmForwarded}`
    )
    manager.stop()
  })

  // Fire-and-forget PCM forwarding — renderer sends complete 20ms frames
  ipcMain.on('stream:pcm', (_event, buffer: ArrayBuffer) => {
    pcmReceived++
    manager.sendPcm(buffer)
    pcmForwarded++
  })
}
