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
 * Encodes audio via WebCodecs AudioEncoder (Opus), then sends the raw
 * Opus frames to the Electron main process via IPC. The main process
 * wraps each frame in a 12-byte RTP header and sends it over UDP
 * directly to a Janus Streaming Plugin — identical to what Cosmic's
 * DjRtpForwarder does, but without the WebSocket relay middleman.
 */
export class DirectRtpProvider implements SfuProvider {
  readonly name = 'direct-rtp'

  private config: DirectRtpConfig
  private encoder: AudioEncoder | null = null
  private processorReader: ReadableStreamDefaultReader<AudioData> | null = null
  private state: SfuConnectionState = 'disconnected'
  private stateCallbacks: StateCallback[] = []
  private countCallbacks: CountCallback[] = []
  private disposed = false
  private readLoopRunning = false

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

    console.log(
      `[DirectRTP] Connecting to ${this.config.janusHost}:${this.config.janusPort}`,
      `(${sampleRate}Hz, ${channels}ch, ${frameDurationMs}ms, ${bitrate}bps)`
    )
    this.setState('connecting')

    try {
      // Start the UDP forwarder in the main process
      await window.octanis.rtp.start({
        host: this.config.janusHost,
        port: this.config.janusPort,
        sampleRate,
        channels,
        frameDurationMs,
      })

      this.startEncoding(track, sampleRate, channels, bitrate)
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

  private startEncoding(
    track: MediaStreamTrack,
    sampleRate: number,
    channels: number,
    bitrate: number
  ): void {
    console.log('[DirectRTP] Starting audio encoder')

    this.encoder = new AudioEncoder({
      output: (chunk) => {
        const data = new ArrayBuffer(chunk.byteLength)
        chunk.copyTo(new Uint8Array(data))
        window.octanis.rtp.sendFrame(data)
      },
      error: (err) => {
        console.error('[DirectRTP] AudioEncoder error:', err)
        this.setState('failed')
        this.cleanup()
      },
    })

    this.encoder.configure({
      codec: 'opus',
      sampleRate,
      numberOfChannels: channels,
      bitrate,
    })

    const processor = new MediaStreamTrackProcessor({ track })
    this.processorReader = processor.readable.getReader()
    this.readLoopRunning = true
    this.readLoop()
  }

  private async readLoop(): Promise<void> {
    const reader = this.processorReader
    if (!reader) return

    let frameCount = 0
    let encoderTimestamp = 0
    try {
      while (this.readLoopRunning && !this.disposed) {
        const { value: audioData, done } = await reader.read()
        if (done || !audioData) break

        if (frameCount < 3) {
          console.log(
            `[DirectRTP] AudioData #${frameCount}:`,
            `format=${audioData.format}`,
            `sampleRate=${audioData.sampleRate}`,
            `channels=${audioData.numberOfChannels}`,
            `frames=${audioData.numberOfFrames}`,
            `origTimestamp=${audioData.timestamp}`,
            `assignedTimestamp=${encoderTimestamp}`
          )
        }
        frameCount++

        // Re-wrap AudioData with monotonic timestamp starting from 0
        const buf = new ArrayBuffer(
          audioData.allocationSize({ planeIndex: 0 }) * audioData.numberOfChannels
        )
        const bytesPerPlane = audioData.allocationSize({ planeIndex: 0 })
        for (let ch = 0; ch < audioData.numberOfChannels; ch++) {
          audioData.copyTo(new Uint8Array(buf, ch * bytesPerPlane, bytesPerPlane), {
            planeIndex: ch,
          })
        }

        const corrected = new AudioData({
          format: audioData.format as AudioSampleFormat,
          sampleRate: audioData.sampleRate,
          numberOfFrames: audioData.numberOfFrames,
          numberOfChannels: audioData.numberOfChannels,
          timestamp: encoderTimestamp,
          data: buf,
        })
        encoderTimestamp += audioData.duration
        audioData.close()

        if (this.encoder && this.encoder.state !== 'closed') {
          this.encoder.encode(corrected)
        }
        corrected.close()
      }
    } catch (err) {
      if (this.readLoopRunning) {
        console.error('[DirectRTP] Read loop error:', err)
      }
    }
    console.log(`[DirectRTP] Read loop ended, processed ${frameCount} AudioData chunks`)
  }

  private cleanup(): void {
    console.log('[DirectRTP] Cleanup')
    this.readLoopRunning = false

    if (this.processorReader) {
      this.processorReader.cancel().catch(() => {})
      this.processorReader = null
    }

    if (this.encoder && this.encoder.state !== 'closed') {
      try {
        this.encoder.close()
      } catch {
        /* ignore */
      }
      this.encoder = null
    }
  }
}
