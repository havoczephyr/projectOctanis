import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import log from 'electron-log'

function getFfmpegPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ffmpeg', 'ffmpeg')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('ffmpeg-static') as string
}

/**
 * Decodes any audio file to raw interleaved f32le PCM using ffmpeg.
 * This supports ALL formats ffmpeg can handle (M4A, AAC, MP3, WAV, FLAC, etc).
 */
export async function decodeAudioFile(
  audioPath: string,
  sampleRate: number,
  channels: number
): Promise<Buffer> {
  const ffmpegPath = getFfmpegPath()

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-v', 'quiet',
      '-i', audioPath,
      '-vn',
      '-ac', String(channels),
      '-ar', String(sampleRate),
      '-f', 'f32le',
      'pipe:1',
    ])

    const chunks: Buffer[] = []
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (data: Buffer) => log.debug('[ffmpeg decode]', data.toString()))

    proc.on('close', (code) => {
      if (code !== 0 && chunks.length === 0) {
        reject(new Error(`ffmpeg decode exited with code ${code} for ${audioPath}`))
        return
      }
      resolve(Buffer.concat(chunks))
    })

    proc.on('error', reject)
  })
}
