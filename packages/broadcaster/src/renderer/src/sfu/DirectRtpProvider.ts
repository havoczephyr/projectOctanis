import type { SfuConnectionState } from '../../../ipcTypes'
import type { SfuProvider } from './types'

interface DirectRtpConfig {
  janusHost: string
  janusPort: number
  sampleRate?: number
  channels?: number
  frameDurationMs?: number
  bitrate?: number
}

type StateCallback = (state: SfuConnectionState) => void
type CountCallback = (count: number) => void

const DEFAULT_SAMPLE_RATE = 48_000
const DEFAULT_CHANNELS = 2
const DEFAULT_FRAME_DURATION_MS = 20
const DEFAULT_BITRATE = 128_000

/**
 * Direct RTP streaming provider.
 *
 * Encodes audio via @discordjs/opus in the main process (same encoder
 * Cosmic uses), then sends the Opus frames to the main process RTP
 * forwarder which wraps each in a 12-byte RTP header and sends UDP
 * directly to a Janus Streaming Plugin.
 */
export class DirectRtpProvider implements SfuProvider {
  readonly name = 'direct-rtp'

  private config: DirectRtpConfig
  private processorReader: ReadableStreamDefaultReader<AudioData> | null = null
  private state: SfuConnectionState = 'disconnected'
  private stateCallbacks: StateCallback[] = []
  private countCallbacks: CountCallback[] = []
  private disposed = false
  private readLoopRunning = false

  // PCM accumulation
  private pcmAccumulator: Int16Array = new Int16Array(0)
  private pcmOffset = 0
  private pcmFrameSamples = 0

  constructor(config: DirectRtpConfig) {
    this.config = config
  }

  onStateChange(cb: StateCallback): void {
    this.stateCallbacks.push(cb)
  }

  onParticipantCount(cb: CountCallback): void {
    this.countCallbacks.push(cb)
  }

  async connect(track: MediaStreamTrack): Promise<void> {
    if (this.disposed) throw new Error('Provider disposed')

    const sampleRate = this.config.sampleRate ?? DEFAULT_SAMPLE_RATE
    const channels = this.config.channels ?? DEFAULT_CHANNELS
    const frameDurationMs = this.config.frameDurationMs ?? DEFAULT_FRAME_DURATION_MS
    const bitrate = this.config.bitrate ?? DEFAULT_BITRATE

    this.pcmFrameSamples = Math.round(sampleRate * (frameDurationMs / 1000)) * channels
    this.pcmAccumulator = new Int16Array(this.pcmFrameSamples * 2)
    this.pcmOffset = 0

    console.log(
      `[DirectRTP] Connecting to ${this.config.janusHost}:${this.config.janusPort}`,
      `(${sampleRate}Hz, ${channels}ch, ${frameDurationMs}ms, ${bitrate}bps)`
    )
    this.setState('connecting')

    try {
      // Initialize native Opus encoder
      await window.octanis.opus.init({ sampleRate, channels, bitrate })

      // Start the UDP forwarder in the main process
      await window.octanis.rtp.start({
        host: this.config.janusHost,
        port: this.config.janusPort,
        sampleRate,
        channels,
        frameDurationMs,
      })

      this.startEncoding(track, channels)
      console.log('[DirectRTP] Connected and streaming')
      this.setState('connected')
    } catch (err) {
      console.error('[DirectRTP] Connection failed:', err)
      this.setState('failed')
      this.cleanup()
      throw err
    }
  }

  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') return
    console.log('[DirectRTP] Disconnecting')
    this.cleanup()
    await window.octanis.rtp.stop()
    this.setState('disconnected')
  }

  dispose(): void {
    this.disposed = true
    this.cleanup()
    window.octanis.rtp.stop().catch(() => {})
    this.stateCallbacks = []
    this.countCallbacks = []
  }

  // ── Private ──────────────────────────────────────────────

  private setState(state: SfuConnectionState): void {
    this.state = state
    for (const cb of this.stateCallbacks) cb(state)
  }

  private startEncoding(track: MediaStreamTrack, channels: number): void {
    console.log('[DirectRTP] Starting native opus encoder')

    const processor = new MediaStreamTrackProcessor({ track })
    this.processorReader = processor.readable.getReader()
    this.readLoopRunning = true
    this.readLoop(channels)
  }

  private async readLoop(channels: number): Promise<void> {
    const reader = this.processorReader
    if (!reader) return

    let chunkCount = 0
    let encodeCount = 0
    try {
      while (this.readLoopRunning && !this.disposed) {
        const { value: audioData, done } = await reader.read()
        if (done || !audioData) break

        if (chunkCount < 3) {
          console.log(
            `[DirectRTP] AudioData #${chunkCount}:`,
            `format=${audioData.format}`,
            `sampleRate=${audioData.sampleRate}`,
            `channels=${audioData.numberOfChannels}`,
            `frames=${audioData.numberOfFrames}`
          )
        }
        chunkCount++

        const numFrames = audioData.numberOfFrames
        const numChannels = audioData.numberOfChannels

        // Extract planar f32 data
        const planes: Float32Array[] = []
        for (let ch = 0; ch < numChannels; ch++) {
          const plane = new Float32Array(numFrames)
          audioData.copyTo(plane, { planeIndex: ch })
          planes.push(plane)
        }
        audioData.close()

        // Interleave and convert to s16le, accumulate
        for (let i = 0; i < numFrames; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, planes[ch][i]))
            this.pcmAccumulator[this.pcmOffset++] = sample < 0
              ? sample * 0x8000
              : sample * 0x7FFF
          }

          if (this.pcmOffset >= this.pcmFrameSamples) {
            const pcmFrame = this.pcmAccumulator.slice(0, this.pcmFrameSamples)
            const opusFrame = await window.octanis.opus.encode(pcmFrame.buffer)
            window.octanis.rtp.sendFrame(opusFrame)
            encodeCount++

            const remainder = this.pcmOffset - this.pcmFrameSamples
            if (remainder > 0) {
              this.pcmAccumulator.copyWithin(0, this.pcmFrameSamples, this.pcmOffset)
            }
            this.pcmOffset = remainder
          }
        }
      }
    } catch (err) {
      if (this.readLoopRunning) {
        console.error('[DirectRTP] Read loop error:', err)
      }
    }
    console.log(`[DirectRTP] Read loop ended: ${chunkCount} chunks, ${encodeCount} Opus frames`)
  }

  private cleanup(): void {
    console.log('[DirectRTP] Cleanup')
    this.readLoopRunning = false

    if (this.processorReader) {
      this.processorReader.cancel().catch(() => {})
      this.processorReader = null
    }

    window.octanis.opus.close().catch(() => {})
  }
}
