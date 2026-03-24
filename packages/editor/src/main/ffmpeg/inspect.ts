import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { nanoid } from 'nanoid'
import type { AudioFile } from '@octanis/shared'

function getFfprobePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ffmpeg', 'ffprobe')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installer = require('@ffprobe-installer/ffprobe') as { path: string }
  return installer.path
}

interface FfprobeOutput {
  streams?: Array<{
    codec_type?: string
    sample_rate?: string
    channels?: number
  }>
  format?: {
    duration?: string
  }
}

export async function inspectAudio(audioPath: string): Promise<AudioFile> {
  const ffprobePath = getFfprobePath()

  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      audioPath,
    ])

    const chunks: Buffer[] = []
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code} for ${audioPath}`))
        return
      }

      try {
        const raw = Buffer.concat(chunks).toString('utf-8')
        const info: FfprobeOutput = JSON.parse(raw)
        const audioStream = info.streams?.find((s) => s.codec_type === 'audio')

        resolve({
          id: nanoid(),
          absolutePath: audioPath,
          durationSec: parseFloat(info.format?.duration ?? '0'),
          sampleRate: parseInt(audioStream?.sample_rate ?? '44100', 10),
          channels: audioStream?.channels ?? 2,
        })
      } catch (err) {
        reject(new Error(`Failed to parse ffprobe output: ${err}`))
      }
    })

    proc.on('error', reject)
  })
}
