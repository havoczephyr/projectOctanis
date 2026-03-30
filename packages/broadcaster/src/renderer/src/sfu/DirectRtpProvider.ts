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

const SAMPLE_RATE = 48_000
const CHANNELS = 2
const FRAME_DURATION_MS = 20
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000 // 960
const PCM_FRAME_SAMPLES = SAMPLES_PER_FRAME * CHANNELS // 1920 interleaved samples

/**
 * Direct RTP streaming provider.
 *
 * Reads audio from a MediaStreamTrack, converts f32-planar to s16le
 * interleaved 20ms frames, and fire-and-forgets each frame to the main
 * process via IPC. A dedicated Worker Thread handles Opus encoding and
 * UDP/RTP transport on a drift-corrected 20ms tick.
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
  private stateUnsub: (() => void) | null = null

  // PCM accumulation — send complete 20ms frames over IPC
  private pcmAccumulator = new Int16Array(PCM_FRAME_SAMPLES * 2)
  private pcmOffset = 0

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

    console.log(`[DirectRTP] Connecting to ${this.config.janusHost}:${this.config.janusPort}`)
    this.setState('connecting')

    this.stateUnsub = window.octanis.stream.onStateChange((state) => {
      this.setState(state)
    })

    try {
      await window.octanis.stream.start({
        mode: 'direct-rtp',
        janusHost: this.config.janusHost,
        janusPort: this.config.janusPort,
        sampleRate: this.config.sampleRate,
        channels: this.config.channels,
        frameDurationMs: this.config.frameDurationMs,
        bitrate: this.config.bitrate,
      })

      this.startReading(track)
      console.log('[DirectRTP] Connected and streaming')
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
    await window.octanis.stream.stop()
    this.setState('disconnected')
  }

  dispose(): void {
    this.disposed = true
    this.cleanup()
    window.octanis.stream.stop().catch(() => {})
    this.stateCallbacks = []
    this.countCallbacks = []
  }

  // ── Private ──────────────────────────────────────────────

  private setState(state: SfuConnectionState): void {
    this.state = state
    for (const cb of this.stateCallbacks) cb(state)
  }

  private startReading(track: MediaStreamTrack): void {
    const processor = new MediaStreamTrackProcessor({ track, maxBufferSize: 10 })
    this.processorReader = processor.readable.getReader()
    this.readLoopRunning = true
    this.readLoop()
  }

  private async readLoop(): Promise<void> {
    const reader = this.processorReader
    if (!reader) return

    let chunkCount = 0
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

        // Extract planar f32 data per channel
        const planes: Float32Array[] = []
        for (let ch = 0; ch < numChannels; ch++) {
          const plane = new Float32Array(numFrames)
          audioData.copyTo(plane, { planeIndex: ch })
          planes.push(plane)
        }
        audioData.close()

        // Interleave f32-planar → s16le, accumulate, send complete 20ms frames
        for (let i = 0; i < numFrames; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, planes[ch][i]))
            this.pcmAccumulator[this.pcmOffset++] =
              sample < 0 ? sample * 0x8000 : sample * 0x7fff
          }

          if (this.pcmOffset >= PCM_FRAME_SAMPLES) {
            const frame = this.pcmAccumulator.slice(0, PCM_FRAME_SAMPLES)
            window.octanis.stream.sendPcm(frame.buffer)

            const remainder = this.pcmOffset - PCM_FRAME_SAMPLES
            if (remainder > 0) {
              this.pcmAccumulator.copyWithin(0, PCM_FRAME_SAMPLES, this.pcmOffset)
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
    console.log(`[DirectRTP] Read loop ended: ${chunkCount} AudioData chunks`)
  }

  private cleanup(): void {
    console.log('[DirectRTP] Cleanup')
    this.readLoopRunning = false
    this.pcmOffset = 0

    if (this.stateUnsub) {
      this.stateUnsub()
      this.stateUnsub = null
    }

    if (this.processorReader) {
      this.processorReader.cancel().catch(() => {})
      this.processorReader = null
    }
  }
}
