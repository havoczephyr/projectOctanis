import { ipcMain } from 'electron'
import { extractPeaks, type PeakOpts, type PeaksResult } from '../ffmpeg/peaks'
import { inspectAudio } from '../ffmpeg/inspect'
import type { AudioFile } from '@octanis/shared'
import log from 'electron-log'

export function registerFfmpegHandlers(): void {
  ipcMain.handle(
    'ffmpeg:extractPeaks',
    async (_event, audioPath: string, opts: PeakOpts): Promise<PeaksResult> => {
      try {
        return await extractPeaks(audioPath, opts)
      } catch (err) {
        log.error('ffmpeg:extractPeaks error', err)
        throw err
      }
    }
  )

  ipcMain.handle(
    'ffmpeg:inspectAudio',
    async (_event, audioPath: string): Promise<AudioFile> => {
      try {
        return await inspectAudio(audioPath)
      } catch (err) {
        log.error('ffmpeg:inspectAudio error', err)
        throw err
      }
    }
  )
}
