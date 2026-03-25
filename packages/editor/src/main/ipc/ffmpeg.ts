import { ipcMain } from 'electron'
import { extractPeaks, type PeakOpts, type PeaksResult } from '../ffmpeg/peaks'
import { inspectAudio } from '../ffmpeg/inspect'
import { decodeAudioFile } from '../ffmpeg/decode'
import type { AudioFile } from '@octanis/shared'
import type { DecodeAudioResult } from '../../ipcTypes'
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

  ipcMain.handle(
    'ffmpeg:decodeAudioFile',
    async (
      _event,
      audioPath: string,
      sampleRate?: number,
      channels?: number
    ): Promise<DecodeAudioResult> => {
      try {
        // If sampleRate/channels not provided, inspect the file first
        let sr = sampleRate
        let ch = channels
        if (!sr || !ch) {
          const info = await inspectAudio(audioPath)
          sr = info.sampleRate
          ch = info.channels
        }
        const pcmBuffer = await decodeAudioFile(audioPath, sr, ch)
        return {
          pcmData: pcmBuffer.buffer.slice(
            pcmBuffer.byteOffset,
            pcmBuffer.byteOffset + pcmBuffer.byteLength
          ),
          sampleRate: sr,
          channels: ch,
        }
      } catch (err) {
        log.error('ffmpeg:decodeAudioFile error', err)
        throw err
      }
    }
  )
}
