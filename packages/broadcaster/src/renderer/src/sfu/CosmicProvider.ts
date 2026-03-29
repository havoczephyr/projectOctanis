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
const PCM_FRAME_SAMPLES = SAMPLES_PER_FRAME * CHANNELS // 1920 interleaved samples
const PCM_FRAME_BYTES = PCM_FRAME_SAMPLES * 2 // 3840 bytes (s16le)
const PING_INTERVAL_MS = 15_000
const BITRATE = 128_000

/**
 * Cosmic DJ streaming provider.
 *
 * Streams Opus frames over WebSocket to a Cosmic instance, which
 * forwards them to Janus internally.
 *
 * Encoding is done via @discordjs/opus in the Electron main process
 * (same library Cosmic uses), invoked over IPC. The renderer reads
 * PCM from a MediaStreamTrackProcessor, converts f32-planar to s16le
 * interleaved, accumulates 20ms frames (3840 bytes), encodes via IPC,
 * and sends the resulting Opus frames over WebSocket.
 */
export class CosmicProvider implements SfuProvider {
  readonly name = 'cosmic'

  private config: CosmicConfig
  private ws: WebSocket | null = null
  private processorReader: ReadableStreamDefaultReader<AudioData> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private paceTimer: ReturnType<typeof setInterval> | null = null
  private frameQueue: ArrayBuffer[] = []
  private state: SfuConnectionState = 'disconnected'
  private stateCallbacks: StateCallback[] = []
  private countCallbacks: CountCallback[] = []
  private disposed = false
  private readLoopRunning = false

  // PCM accumulation buffer for assembling 20ms frames
  private pcmAccumulator = new Int16Array(PCM_FRAME_SAMPLES * 2) // double-buffer headroom
  private pcmOffset = 0

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
      // Initialize the native Opus encoder in the main process
      await window.octanis.opus.init({
        sampleRate: SAMPLE_RATE,
        channels: CHANNELS,
        bitrate: BITRATE,
      })

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
  }

  private sendHello(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

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
      '[Cosmic] Starting native opus encoder:',
      SAMPLE_RATE, 'Hz,',
      CHANNELS, 'ch,',
      BITRATE, 'bps,',
      FRAME_DURATION_MS, 'ms frames'
    )

    // Pacing timer — drain one frame per tick at the declared cadence.
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
    this.pcmOffset = 0
    this.readLoop()
  }

  private async readLoop(): Promise<void> {
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
            `[Cosmic] AudioData #${chunkCount}:`,
            `format=${audioData.format}`,
            `sampleRate=${audioData.sampleRate}`,
            `channels=${audioData.numberOfChannels}`,
            `frames=${audioData.numberOfFrames}`
          )
        }
        chunkCount++

        // Convert f32-planar AudioData to s16le interleaved and accumulate
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

        // Interleave and convert to s16le
        for (let i = 0; i < numFrames; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, planes[ch][i]))
            this.pcmAccumulator[this.pcmOffset++] = sample < 0
              ? sample * 0x8000
              : sample * 0x7FFF
          }

          // When we have a full 20ms frame, encode it
          if (this.pcmOffset >= PCM_FRAME_SAMPLES) {
            const pcmFrame = this.pcmAccumulator.slice(0, PCM_FRAME_SAMPLES)
            // Send s16le PCM to main process for native Opus encoding
            const opusFrame = await window.octanis.opus.encode(pcmFrame.buffer)
            this.frameQueue.push(opusFrame)
            encodeCount++

            // Shift any remainder to the front
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
        console.error('[Cosmic] Read loop error:', err)
      }
    }
    console.log(`[Cosmic] Read loop ended: ${chunkCount} AudioData chunks, ${encodeCount} Opus frames encoded`)
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

    window.octanis.opus.close().catch(() => {})

    if (this.ws) {
      this.ws.onclose = null
      this.ws.close(1000)
      this.ws = null
    }
  }
}
