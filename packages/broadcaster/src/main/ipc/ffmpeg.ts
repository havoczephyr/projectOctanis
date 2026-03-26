import { ipcMain } from 'electron'
import { decodeAudioFile } from '../ffmpeg/decode'
import { extractPeaks } from '../ffmpeg/peaks'
import type { PeakOpts } from '../../ipcTypes'

export function registerFfmpegHandlers(): void {
  ipcMain.handle(
    'ffmpeg:decodeAudioFile',
    async (_e, audioPath: string, sampleRate?: number, channels?: number) => {
      const sr = sampleRate ?? 44100
      const ch = channels ?? 2
      const pcmData = await decodeAudioFile(audioPath, sr, ch)
      return { pcmData: pcmData.buffer, sampleRate: sr, channels: ch }
    }
  )

  ipcMain.handle('ffmpeg:extractPeaks', async (_e, audioPath: string, opts: PeakOpts) => {
    return extractPeaks(audioPath, opts)
  })
}
