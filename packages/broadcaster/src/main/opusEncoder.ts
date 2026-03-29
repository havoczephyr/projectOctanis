import { OpusEncoder } from '@discordjs/opus'

export interface OpusEncoderConfig {
  sampleRate: number
  channels: number
  bitrate: number
}

export class OpusEncoderService {
  private encoder: OpusEncoder | null = null

  init(config: OpusEncoderConfig): void {
    this.close()
    this.encoder = new OpusEncoder(config.sampleRate, config.channels)
    this.encoder.setBitrate(config.bitrate)
    console.log(
      `[OpusEncoder] Initialized: ${config.sampleRate}Hz, ${config.channels}ch, ${config.bitrate}bps`
    )
  }

  encode(pcm: Buffer): Buffer {
    if (!this.encoder) throw new Error('Opus encoder not initialized')
    return this.encoder.encode(pcm)
  }

  close(): void {
    if (this.encoder) {
      this.encoder = null
      console.log('[OpusEncoder] Closed')
    }
  }
}
