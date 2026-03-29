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
const FRAME_DURATION_MS = 60
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000 // 2880
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
  private paceTimer: ReturnType<typeof setInterval> | null = null
  private frameQueue: ArrayBuffer[] = []
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
    const redactedKey = this.config.accessKey.slice(0, 8) + '...'
    console.log(`[Cosmic] Connecting to ${this.config.serverUrl} (key: ${redactedKey})`)
    this.setState('connecting')

    try {
      await this.openWebSocket()
      await this.sendHello()
      this.startPing()
      this.startEncoding(track)
      console.log('[Cosmic] Connected and streaming')
      this.setState('connected')
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
      // Build endpoint URL — extract origin only so a full URL pasted as
      // serverUrl (e.g. wss://host/api/dj/stream?key=...) doesn't duplicate the path.
      const parsed = new URL(this.config.serverUrl)
      const origin = `${parsed.protocol}//${parsed.host}`
      const url = `${origin}/api/dj/stream?key=${encodeURIComponent(this.config.accessKey)}`

      console.log('[Cosmic] Opening WebSocket:', url.replace(/key=[^&]+/, 'key=REDACTED'))

      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'

      const timeout = setTimeout(() => {
        console.warn('[Cosmic] WebSocket connection timed out after 10s')
        ws.close()
        reject(new Error('WebSocket connection timed out'))
      }, 10_000)

      ws.onopen = (): void => {
        clearTimeout(timeout)
        console.log('[Cosmic] WebSocket opened')
        this.ws = ws
        resolve()
      }

      ws.onerror = (): void => {
        clearTimeout(timeout)
        console.error('[Cosmic] WebSocket error event')
        reject(new Error('WebSocket connection failed'))
      }

      ws.onclose = (ev): void => {
        console.warn(`[Cosmic] WebSocket closed: code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean}`)
        if (this.state === 'connected') {
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

    console.log('[Cosmic] Message received:', msg.type, msg.message ?? '')

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

      console.log('[Cosmic] Sending hello:', JSON.stringify(hello))
      this.ws.send(JSON.stringify(hello))
    })
  }

  private startEncoding(track: MediaStreamTrack): void {
    console.log(
      '[Cosmic] Starting audio encoder: opus',
      SAMPLE_RATE, 'Hz,',
      CHANNELS, 'ch,',
      BITRATE, 'bps,',
      FRAME_DURATION_MS, 'ms frames'
    )

    // Set up AudioEncoder (WebCodecs) — queue frames for paced sending
    this.encoder = new AudioEncoder({
      output: (chunk) => {
        const data = new ArrayBuffer(chunk.byteLength)
        chunk.copyTo(new Uint8Array(data))
        this.frameQueue.push(data)
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

    // Pacing timer — drain one frame per tick at the declared cadence.
    // Cosmic forwards frames immediately with no jitter buffer, so we must
    // send exactly one frame per FRAME_DURATION_MS to avoid bursts.
    this.paceTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return
      const frame = this.frameQueue.shift()
      if (frame) {
        this.ws.send(frame)
      }
    }, FRAME_DURATION_MS)

    // Set up MediaStreamTrackProcessor to read PCM from the track
    const processor = new MediaStreamTrackProcessor({ track })
    this.processorReader = processor.readable.getReader()
    this.readLoopRunning = true
    this.readLoop()
  }

  private async readLoop(): Promise<void> {
    const reader = this.processorReader
    if (!reader) return

    let frameCount = 0
    // Monotonic timestamp for the encoder — the MediaStreamTrackProcessor
    // timestamps are based on AudioContext.currentTime which may have been
    // running for a long time before streaming starts, causing the encoder
    // to see huge gaps and produce garbled output.
    let encoderTimestamp = 0
    try {
      while (this.readLoopRunning && !this.disposed) {
        const { value: audioData, done } = await reader.read()
        if (done || !audioData) break

        if (frameCount < 3) {
          console.log(
            `[Cosmic] AudioData #${frameCount}:`,
            `format=${audioData.format}`,
            `sampleRate=${audioData.sampleRate}`,
            `channels=${audioData.numberOfChannels}`,
            `frames=${audioData.numberOfFrames}`,
            `origTimestamp=${audioData.timestamp}`,
            `assignedTimestamp=${encoderTimestamp}`
          )
        }
        frameCount++

        // Re-wrap AudioData with a monotonic timestamp so the encoder
        // sees a continuous stream starting from 0
        const buf = new ArrayBuffer(audioData.allocationSize({ planeIndex: 0 }) * audioData.numberOfChannels)
        const bytesPerPlane = audioData.allocationSize({ planeIndex: 0 })
        for (let ch = 0; ch < audioData.numberOfChannels; ch++) {
          audioData.copyTo(new Uint8Array(buf, ch * bytesPerPlane, bytesPerPlane), { planeIndex: ch })
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
        console.error('[Cosmic] Read loop error:', err)
      }
    }
    console.log(`[Cosmic] Read loop ended, processed ${frameCount} AudioData chunks`)
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
    console.log('[Cosmic] Cleanup')
    this.readLoopRunning = false
    this.stopPing()

    if (this.paceTimer) {
      clearInterval(this.paceTimer)
      this.paceTimer = null
    }
    this.frameQueue.length = 0

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
