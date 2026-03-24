import { type Readable } from 'stream'
import type { PCMStreamOptions } from './Mixer.js'

export const LocalPlayer = {
  async play(pcmStream: Readable, options: Required<Pick<PCMStreamOptions, 'sampleRate' | 'channels' | 'bitDepth'>> & { bitDepth: number }): Promise<void> {
    // Dynamically import speaker to avoid issues if not installed
    const { default: Speaker } = await import('speaker')

    return new Promise((resolve, reject) => {
      const speaker = new Speaker({
        channels: options.channels,
        bitDepth: options.bitDepth,
        sampleRate: options.sampleRate,
      })

      speaker.on('close', resolve)
      speaker.on('error', reject)
      pcmStream.on('error', reject)

      pcmStream.pipe(speaker)
    })
  },
}
