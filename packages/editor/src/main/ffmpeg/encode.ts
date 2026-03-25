import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { tmpdir } from 'os'
import log from 'electron-log'

function getFfmpegPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ffmpeg', 'ffmpeg')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('ffmpeg-static') as string
}

type AudioFormat = 'wav' | 'mp3' | 'flac' | 'm4a'

function getFormatArgs(format: AudioFormat): string[] {
  switch (format) {
    case 'wav':
      return ['-acodec', 'pcm_s16le', '-f', 'wav']
    case 'mp3':
      return ['-acodec', 'libmp3lame', '-b:a', '192k', '-f', 'mp3']
    case 'flac':
      return ['-acodec', 'flac', '-f', 'flac']
    case 'm4a':
      return ['-acodec', 'aac', '-b:a', '192k', '-f', 'ipod']
  }
}

/**
 * Encodes a WebM audio buffer to the specified format using ffmpeg.
 * Writes the input to a temp file, converts, then cleans up.
 */
export async function encodeAudio(
  webmBuffer: Buffer,
  outputPath: string,
  format: AudioFormat
): Promise<void> {
  const ffmpegPath = getFfmpegPath()
  const tempPath = join(tmpdir(), `octanis-rec-${Date.now()}.webm`)

  // Write WebM to temp file
  await writeFile(tempPath, webmBuffer)

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true })

  return new Promise((resolve, reject) => {
    const formatArgs = getFormatArgs(format)
    const proc = spawn(ffmpegPath, [
      '-v', 'quiet',
      '-i', tempPath,
      '-vn',
      ...formatArgs,
      '-y', // overwrite if exists
      outputPath,
    ])

    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
      log.debug('[ffmpeg encode]', data.toString())
    })

    proc.on('close', async (code) => {
      // Clean up temp file
      try { await unlink(tempPath) } catch { /* ignore */ }

      if (code !== 0) {
        reject(new Error(`ffmpeg encode exited with code ${code}: ${stderr}`))
        return
      }
      resolve()
    })

    proc.on('error', async (err) => {
      try { await unlink(tempPath) } catch { /* ignore */ }
      reject(err)
    })
  })
}
