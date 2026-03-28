import type { SfuConnectionState } from '../../../ipcTypes'
import type { SfuProvider } from './types'

interface CosmicConfig {
  serverUrl: string
  accessKey: string
  displayName?: string
}

type StateCallback = (state: SfuConnectionState) => void
type CountCallback = (count: number) => void

const SAMPLE_RATE = 48_000
const CHANNELS = 2
const FRAME_DURATION_MS = 20
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000 // 960
const PING_INTERVAL_MS = 15_000
const BITRATE = 128_000

/**
 * Cosmic DJ streaming provider.
 *
 * Streams pre-encoded Opus frames over WebSocket to a Cosmic instance,
 * which forwards them to Janus internally.
 *
 * Protocol:
 *   1. WebSocket connect to /api/dj/stream?key=<accessKey>
 *   2. Send hello (encoding params) → receive ready
 *   3. Encode audio via WebCodecs AudioEncoder → send binary Opus frames
 *   4. Ping/pong keepalive every 15s
 */
export class CosmicProvider implements SfuProvider {
  readonly name = 'cosmic'

  private config: CosmicConfig
  private ws: WebSocket | null = null
  private encoder: AudioEncoder | null = null
  private processorReader: ReadableStreamDefaultReader<AudioData> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private state: SfuConnectionState = 'disconnected'
  private stateCallbacks: StateCallback[] = []
  private countCallbacks: CountCallback[] = []
  private disposed = false
  private readLoopRunning = false

  constructor(config: CosmicConfig) {
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
    this.setState('connecting')

    try {
      await this.openWebSocket()
      await this.sendHello()
      this.startPing()
      this.startEncoding(track)
      this.setState('connected')
    } catch (err) {
      this.setState('failed')
      this.cleanup()
      throw err
    }
  }

  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') return
    this.cleanup()
    this.setState('disconnected')
  }

  dispose(): void {
    this.disposed = true
    this.cleanup()
    this.stateCallbacks = []
    this.countCallbacks = []
  }

  // ── Private ──────────────────────────────────────────────

  private setState(state: SfuConnectionState): void {
    this.state = state
    for (const cb of this.stateCallbacks) cb(state)
  }

  private openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build endpoint URL
      const base = this.config.serverUrl.replace(/\/$/, '')
      const url = `${base}/api/dj/stream?key=${encodeURIComponent(this.config.accessKey)}`

      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'

      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('WebSocket connection timed out'))
      }, 10_000)

      ws.onopen = (): void => {
        clearTimeout(timeout)
        this.ws = ws
        resolve()
      }

      ws.onerror = (): void => {
        clearTimeout(timeout)
        reject(new Error('WebSocket connection failed'))
      }

      ws.onclose = (ev): void => {
        if (this.state === 'connected') {
          console.warn('[Cosmic] WebSocket closed unexpectedly:', ev.code, ev.reason)
          this.setState('failed')
          this.cleanup()
        }
      }

      ws.onmessage = (ev): void => {
        this.handleMessage(ev)
      }
    })
  }

  private handleMessage(ev: MessageEvent): void {
    if (typeof ev.data !== 'string') return
    let msg: { type: string; message?: string }
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }

    if (msg.type === 'error') {
      console.error('[Cosmic] Server error:', msg.message)
      this.setState('failed')
      this.cleanup()
    }
    // pong and ready are handled inline by sendHello / ping
  }

  private sendHello(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

      // Temporarily override message handler to wait for ready/error
      const originalOnMessage = this.ws.onmessage
      const timeout = setTimeout(() => {
        if (this.ws) this.ws.onmessage = originalOnMessage
        reject(new Error('Hello handshake timed out'))
      }, 10_000)

      this.ws.onmessage = (ev): void => {
        if (typeof ev.data !== 'string') return
        try {
          const msg = JSON.parse(ev.data) as { type: string; message?: string }
          if (msg.type === 'ready') {
            clearTimeout(timeout)
            if (this.ws) this.ws.onmessage = originalOnMessage
            resolve()
          } else if (msg.type === 'error') {
            clearTimeout(timeout)
            if (this.ws) this.ws.onmessage = originalOnMessage
            reject(new Error(msg.message ?? 'Server rejected hello'))
          }
        } catch { /* ignore parse errors */ }
      }

      const hello: Record<string, unknown> = {
        type: 'hello',
        sampleRate: SAMPLE_RATE,
        channels: CHANNELS,
        frameDurationMs: FRAME_DURATION_MS,
      }
      if (this.config.displayName) hello.displayName = this.config.displayName

      this.ws.send(JSON.stringify(hello))
    })
  }

  private startEncoding(track: MediaStreamTrack): void {
    // Set up AudioEncoder (WebCodecs)
    this.encoder = new AudioEncoder({
      output: (chunk) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          const data = new ArrayBuffer(chunk.byteLength)
          chunk.copyTo(new Uint8Array(data))
          this.ws.send(data)
        }
      },
      error: (err) => {
        console.error('[Cosmic] AudioEncoder error:', err)
        this.setState('failed')
        this.cleanup()
      },
    })

    this.encoder.configure({
      codec: 'opus',
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      bitrate: BITRATE,
    })

    // Set up MediaStreamTrackProcessor to read PCM from the track
    const processor = new MediaStreamTrackProcessor({ track })
    this.processorReader = processor.readable.getReader()
    this.readLoopRunning = true
    this.readLoop()
  }

  private async readLoop(): Promise<void> {
    const reader = this.processorReader
    if (!reader) return

    try {
      while (this.readLoopRunning && !this.disposed) {
        const { value: audioData, done } = await reader.read()
        if (done || !audioData) break

        // AudioEncoder handles Opus frame sizing internally —
        // feed all incoming AudioData directly
        if (this.encoder && this.encoder.state !== 'closed') {
          this.encoder.encode(audioData)
        }
        audioData.close()
      }
    } catch (err) {
      if (this.readLoopRunning) {
        console.error('[Cosmic] Read loop error:', err)
      }
    }
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, PING_INTERVAL_MS)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private cleanup(): void {
    this.readLoopRunning = false
    this.stopPing()

    if (this.processorReader) {
      this.processorReader.cancel().catch(() => {})
      this.processorReader = null
    }

    if (this.encoder && this.encoder.state !== 'closed') {
      try { this.encoder.close() } catch { /* ignore */ }
      this.encoder = null
    }

    if (this.ws) {
      this.ws.onclose = null
      this.ws.close(1000)
      this.ws = null
    }

  }
}
