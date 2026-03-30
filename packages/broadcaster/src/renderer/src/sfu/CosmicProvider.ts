import type { SfuConnectionState } from '../../../ipcTypes'
import type { SfuProvider } from './types'

interface CosmicConfig {
  serverUrl: string
  accessKey: string
  displayName?: string
  projectPath: string
  startFromSec?: number
}

type StateCallback = (state: SfuConnectionState) => void
type CountCallback = (count: number) => void

/**
 * Cosmic DJ streaming provider.
 *
 * The main process handles everything: FFmpeg mix → Opus encode → WebSocket.
 * This provider just tells the main process to start/stop.
 */
export class CosmicProvider implements SfuProvider {
  readonly name = 'cosmic'

  private config: CosmicConfig
  private state: SfuConnectionState = 'disconnected'
  private stateCallbacks: StateCallback[] = []
  private countCallbacks: CountCallback[] = []
  private disposed = false
  private stateUnsub: (() => void) | null = null

  constructor(config: CosmicConfig) {
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

    console.log(`[Cosmic] Connecting to ${this.config.serverUrl}`)
    this.setState('connecting')

    this.stateUnsub = window.octanis.stream.onStateChange((state) => {
      this.setState(state)
    })

    try {
      await window.octanis.stream.start({
        mode: 'cosmic',
        serverUrl: this.config.serverUrl,
        accessKey: this.config.accessKey,
        displayName: this.config.displayName,
        projectPath: this.config.projectPath,
        startFromSec: this.config.startFromSec,
      })

      console.log('[Cosmic] Connected and streaming')
    } catch (err) {
      console.error('[Cosmic] Connection failed:', err)
      this.setState('failed')
      this.cleanup()
      throw err
    }
  }

  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') return
    console.log('[Cosmic] Disconnecting')
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

  // ── Private ──���───────────────────────────────────────────

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
