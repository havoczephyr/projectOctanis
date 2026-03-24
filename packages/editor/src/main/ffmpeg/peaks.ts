import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import type { PeakOpts, PeaksResult } from '../../ipcTypes'

export type { PeakOpts, PeaksResult }

function getFfmpegPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ffmpeg', 'ffmpeg')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('ffmpeg-static') as string
}

export async function extractPeaks(audioPath: string, opts: PeakOpts): Promise<PeaksResult> {
  const ffmpegPath = getFfmpegPath()
  const sampleRate = 44100
  const { peaksPerSecond, startSec = 0, endSec } = opts

  const args: string[] = ['-v', 'quiet']

  if (startSec > 0) {
    args.push('-ss', String(startSec))
  }
  if (endSec !== undefined) {
    args.push('-to', String(endSec))
  }

  args.push(
    '-i', audioPath,
    '-vn',
    '-ac', '1',           // force mono
    '-ar', String(sampleRate),
    '-f', 'f32le',        // 32-bit float PCM, little-endian
    'pipe:1'
  )

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args)
    const chunks: Buffer[] = []

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (data: Buffer) => log.debug('[ffmpeg peaks]', data.toString()))

    proc.on('close', (code) => {
      if (code !== 0 && chunks.length === 0) {
        reject(new Error(`ffmpeg exited with code ${code}`))
        return
      }

      const raw = Buffer.concat(chunks)
      const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)

      const totalSamples = samples.length
      const durationSec = totalSamples / sampleRate
      const samplesPerBucket = Math.max(1, Math.floor(sampleRate / peaksPerSecond))
      const bucketCount = Math.ceil(totalSamples / samplesPerBucket)

      const minPeaks = new Array<number>(bucketCount).fill(0)
      const maxPeaks = new Array<number>(bucketCount).fill(0)

      for (let i = 0; i < bucketCount; i++) {
        const start = i * samplesPerBucket
        const end = Math.min(start + samplesPerBucket, totalSamples)
        let min = 0
        let max = 0
        for (let j = start; j < end; j++) {
          const s = samples[j]
          if (s < min) min = s
          if (s > max) max = s
        }
        minPeaks[i] = Math.max(-1, min)
        maxPeaks[i] = Math.min(1, max)
      }

      resolve({ count: bucketCount, min: minPeaks, max: maxPeaks, durationSec })
    })

    proc.on('error', reject)
  })
}
