import { ipcMain } from 'electron'
import { OpusEncoderService, type OpusEncoderConfig } from '../opusEncoder'

const encoder = new OpusEncoderService()

export function registerOpusHandlers(): void {
  ipcMain.handle('opus:init', (_e, config: OpusEncoderConfig) => {
    encoder.init(config)
  })

  ipcMain.handle('opus:encode', (_e, pcm: ArrayBuffer): ArrayBuffer => {
    const opusFrame = encoder.encode(Buffer.from(pcm))
    return opusFrame.buffer.slice(
      opusFrame.byteOffset,
      opusFrame.byteOffset + opusFrame.byteLength
    )
  })

  ipcMain.handle('opus:close', () => {
    encoder.close()
  })
}
