import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { type Readable, PassThrough } from 'stream'

export interface EncoderOptions {
  format: 'mp3' | 'opus'
  bitrate?: number
  sampleRate?: number
}

/**
 * Encodes a raw PCM (s16le) stream into MP3 or Opus.
 * Returns a readable stream of the encoded output.
 */
export function createEncoderStream(
  pcmInput: Readable,
  options: EncoderOptions
): Readable {
  const { format, bitrate = 192, sampleRate = 44100 } = options
  const output = new PassThrough()

  const cmd = ffmpeg(pcmInput)
    .setFfmpegPath(ffmpegStatic as string)
    .inputOptions(['-f', 's16le', '-ar', String(sampleRate), '-ac', '2'])

  if (format === 'mp3') {
    cmd.audioCodec('libmp3lame').audioBitrate(bitrate).outputFormat('mp3')
  } else {
    cmd.audioCodec('libopus').audioBitrate(bitrate).outputFormat('opus')
  }

  cmd.on('error', (err) => {
    if (!err.message.includes('SIGKILL') && !err.message.includes('Output stream closed')) {
      output.destroy(err)
    }
  })

  cmd.pipe(output, { end: true })

  return output
}
