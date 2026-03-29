import { ipcMain } from 'electron'
import { RtpForwarder, type RtpForwarderConfig } from '../rtpForwarder'

const forwarder = new RtpForwarder()

export function registerRtpHandlers(): void {
  ipcMain.handle('rtp:start', (_e, config: RtpForwarderConfig) => {
    forwarder.start(config)
  })

  // Fire-and-forget — no response needed for hot-path frame delivery
  ipcMain.on('rtp:send-frame', (_e, frame: ArrayBuffer) => {
    forwarder.sendFrame(Buffer.from(frame))
  })

  ipcMain.handle('rtp:stop', () => {
    forwarder.stop()
  })
}
