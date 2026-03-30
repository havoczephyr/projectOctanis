import type { SfuConnectionState } from '../../../ipcTypes'
import type { SfuProvider } from './types'

interface DirectRtpConfig {
  janusHost: string
  janusPort: number
  sampleRate?: number
  channels?: number
  frameDurationMs?: number
  bitrate?: number
  projectPath: string
  startFromSec?: number
}

type StateCallback = (state: SfuConnectionState) => void
type CountCallback = (count: number) => void

/**
 * Direct RTP streaming provider.
 *
 * The main process handles everything: FFmpeg mix → Opus encode → UDP/RTP.
 * This provider just tells the main process to start/stop.
 */
export class DirectRtpProvider implements SfuProvider {
  readonly name = 'direct-rtp'

  private config: DirectRtpConfig
  private state: SfuConnectionState = 'disconnected'
  private stateCallbacks: StateCallback[] = []
  private countCallbacks: CountCallback[] = []
  private disposed = false
  private stateUnsub: (() => void) | null = null

  constructor(config: DirectRtpConfig) {
    this.config = config
  }

  onStateChange(cb: StateCallback): void {
    this.stateCallbacks.push(cb)
  }

  onParticipantCount(cb: CountCallback): void {
    this.countCallbacks.push(cb)
  }

  async connect(_track: MediaStreamTrack): Promise<void> {
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
        projectPath: this.config.projectPath,
        startFromSec: this.config.startFromSec,
      })

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

  private cleanup(): void {
    if (this.stateUnsub) {
      this.stateUnsub()
      this.stateUnsub = null
    }
  }
}
