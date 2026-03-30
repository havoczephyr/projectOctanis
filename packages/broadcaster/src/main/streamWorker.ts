/**
 * Stream Worker — dedicated thread for Opus encoding + network send.
 *
 * Receives complete 20ms PCM frames via parentPort.postMessage from the
 * main thread, encodes with @discordjs/opus, and sends Opus frames over
 * WebSocket (Cosmic) or UDP/RTP (Direct RTP) on a drift-corrected
 * 20ms tick.
 *
 * Architecture modeled on Cosmic's StreamProducer + DjRtpForwarder:
 *   - Simple frame queue (no SharedArrayBuffer / Atomics)
 *   - Drift-corrected tick loop for precise 20ms pacing
 *   - Pre-fill before first encode to absorb initial jitter
 *   - Silence frames when queue starves
 */

import { parentPort } from 'node:worker_threads'
import { createSocket, type Socket } from 'node:dgram'
import { performance } from 'node:perf_hooks'
import WebSocket from 'ws'
import { OpusEncoder } from '@discordjs/opus'

// ── Audio constants (matches Cosmic defaults) ─────────────────
const SAMPLE_RATE = 48_000
const CHANNELS = 2
const FRAME_DURATION_MS = 20
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000 // 960
const PCM_FRAME_BYTES = SAMPLES_PER_FRAME * CHANNELS * 2 // 3840 (s16le)
const BITRATE = 128_000
const PING_INTERVAL_MS = 15_000

// ── RTP constants (matches Cosmic's DjRtpForwarder) ──────────
const RTP_VERSION = 2
const OPUS_PAYLOAD_TYPE = 111
const FIXED_SSRC = 0x12345678

// ── Queue constants ───────────────────────────────────────────
const PREFILL_FRAMES = 5 // 100ms buffer before starting encode
const MAX_QUEUE_FRAMES = 50 // 1 second max — drop oldest if exceeded

// ── State ─────────────────────────────────────────────────────
let encoder: OpusEncoder | null = null
let ws: WebSocket | null = null
let udpSocket: Socket | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null
let tickTimer: ReturnType<typeof setTimeout> | null = null
let running = false
let tickStartTime = 0
let frameIndex = 0
let mode: 'cosmic' | 'direct-rtp' = 'cosmic'
let primed = false

// Pre-allocated silence frame for queue starvation
let silenceFrame: Buffer | null = null

// RTP state (direct-rtp mode)
let rtpSeqNum = 0
let rtpTimestamp = 0
const rtpHeader = Buffer.alloc(12)

let rtpHost = '127.0.0.1'
let rtpPort = 5002

// ── PCM frame queue ───────────────────────────────────────────
const frameQueue: Buffer[] = []

// ── Instrumentation ───────────────────────────────────────────
let tickCount = 0
let encodeCount = 0
let silenceCount = 0

// ── Drift-corrected tick ──────────────────────────────────────

function tick(): void {
  if (!running) return

  // Wait for queue to accumulate before starting encode
  if (!primed) {
    if (frameQueue.length >= PREFILL_FRAMES) {
      primed = true
      tickStartTime = performance.now()
      frameIndex = 0
      console.log(`[StreamWorker] Primed — ${frameQueue.length} frames queued, starting encode`)
    } else {
      tickTimer = setTimeout(tick, 5)
      return
    }
  }

  tickCount++

  let opusFrame: Buffer
  if (frameQueue.length > 0) {
    const pcm = frameQueue.shift()!
    encodeCount++
    try {
      opusFrame = encoder!.encode(pcm)
    } catch (err) {
      console.error('[StreamWorker] Encode error:', err)
      scheduleNext()
      return
    }
  } else {
    // Queue starved — send silence (like Cosmic's tickSilence)
    silenceCount++
    opusFrame = silenceFrame ?? encoder!.encode(Buffer.alloc(PCM_FRAME_BYTES))
  }

  try {
    if (mode === 'cosmic' && ws?.readyState === WebSocket.OPEN) {
      ws.send(opusFrame)
    } else if (mode === 'direct-rtp' && udpSocket) {
      sendRtpPacket(opusFrame)
    }
  } catch (err) {
    console.error('[StreamWorker] Send error:', err)
  }

  if (tickCount % 250 === 0) {
    console.log(
      `[StreamWorker] ticks=${tickCount} encoded=${encodeCount} silence=${silenceCount} queued=${frameQueue.length}`
    )
  }

  scheduleNext()
}

function scheduleNext(): void {
  frameIndex++
  const nextAt = tickStartTime + frameIndex * FRAME_DURATION_MS
  const delay = Math.max(0, nextAt - performance.now())
  tickTimer = setTimeout(tick, delay)
}

function startTick(): void {
  tickStartTime = performance.now()
  frameIndex = 0
  primed = false
  tickCount = 0
  encodeCount = 0
  silenceCount = 0
  frameQueue.length = 0
  running = true
  tick()
}

function stopTick(): void {
  running = false
  if (tickTimer) {
    clearTimeout(tickTimer)
    tickTimer = null
  }
  frameQueue.length = 0
}

// ── RTP (modeled on Cosmic's DjRtpForwarder) ─────────────────

function initRtp(): void {
  rtpSeqNum = Math.floor(Math.random() * 65536)
  rtpTimestamp = Math.floor(Math.random() * 0xffffffff)
  // Pre-fill static header fields
  rtpHeader[0] = RTP_VERSION << 6 // V=2, P=0, X=0, CC=0
  rtpHeader[1] = OPUS_PAYLOAD_TYPE // M=0, PT=111
  rtpHeader.writeUInt32BE(FIXED_SSRC, 8)
}

function sendRtpPacket(opusFrame: Buffer): void {
  if (!udpSocket) return
  rtpHeader.writeUInt16BE(rtpSeqNum & 0xffff, 2)
  rtpHeader.writeUInt32BE(rtpTimestamp >>> 0, 4)
  const packet = Buffer.concat([rtpHeader, opusFrame])
  udpSocket.send(packet, rtpPort, rtpHost)
  rtpSeqNum = (rtpSeqNum + 1) & 0xffff
  rtpTimestamp = (rtpTimestamp + SAMPLES_PER_FRAME) >>> 0
}

// ── Cosmic WebSocket (modeled on Cosmic's DjModeService protocol) ─

function connectCosmic(config: {
  serverUrl: string
  accessKey: string
  displayName?: string
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(config.serverUrl)
    const isSecure = parsed.protocol === 'wss:' || parsed.protocol === 'https:'
    const wsProtocol = isSecure ? 'wss:' : 'ws:'
    const url = `${wsProtocol}//${parsed.host}/api/dj/stream?key=${encodeURIComponent(config.accessKey)}`

    console.log('[StreamWorker] Opening WebSocket:', url.replace(/key=[^&]+/, 'key=REDACTED'))

    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'

    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error('WebSocket connection timed out'))
    }, 10_000)

    socket.on('open', () => {
      clearTimeout(timeout)
      console.log('[StreamWorker] WebSocket opened')
      ws = socket

      // Send hello (Cosmic DJ protocol)
      const hello: Record<string, unknown> = {
        type: 'hello',
        sampleRate: SAMPLE_RATE,
        channels: CHANNELS,
        frameDurationMs: FRAME_DURATION_MS,
      }
      if (config.displayName) hello.displayName = config.displayName
      console.log('[StreamWorker] Sending hello:', JSON.stringify(hello))
      socket.send(JSON.stringify(hello))
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      console.error('[StreamWorker] WebSocket error:', err.message)
      reject(new Error('WebSocket connection failed'))
    })

    socket.on('close', (code, reason) => {
      console.warn(`[StreamWorker] WebSocket closed: code=${code} reason="${reason}"`)
      if (running) {
        stopTick()
        stopPing()
        reportState('failed')
      }
    })

    socket.on('message', (data) => {
      const str = typeof data === 'string' ? data : data.toString('utf8')
      try {
        const msg = JSON.parse(str) as { type: string; message?: string }
        console.log('[StreamWorker] Message:', msg.type, msg.message ?? '')

        if (msg.type === 'ready') {
          clearTimeout(timeout)
          resolve()
        } else if (msg.type === 'error') {
          clearTimeout(timeout)
          console.error('[StreamWorker] Server error:', msg.message)
          reject(new Error(msg.message ?? 'Server rejected hello'))
        }
      } catch {
        /* ignore parse errors */
      }
    })
  })
}

function startPing(): void {
  stopPing()
  pingTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }))
    }
  }, PING_INTERVAL_MS)
}

function stopPing(): void {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

// ── State reporting ───────────────────────────────────────────

function reportState(state: string): void {
  parentPort?.postMessage({ type: 'state', state })
}

// ── Cleanup ───────────────────────────────────────────────────

function cleanup(): void {
  stopTick()
  stopPing()
  encoder = null
  silenceFrame = null

  if (ws) {
    ws.removeAllListeners()
    ws.close(1000)
    ws = null
  }

  if (udpSocket) {
    try {
      udpSocket.close()
    } catch {}
    udpSocket = null
  }
}

// ── Message handler ───────────────────────────────────────────

parentPort?.on(
  'message',
  async (msg: { type: string; config?: Record<string, unknown>; buffer?: ArrayBuffer }) => {
    if (msg.type === 'pcm' && msg.buffer && running) {
      // Receive a complete 20ms PCM frame, push to queue
      const frame = Buffer.from(msg.buffer)
      if (frameQueue.length < MAX_QUEUE_FRAMES) {
        frameQueue.push(frame)
      }
      // else: drop — queue overflow means renderer is ahead of encoder
      return
    }

    if (msg.type === 'start' && msg.config) {
      const config = msg.config
      mode = config.mode as 'cosmic' | 'direct-rtp'

      try {
        const sampleRate = (config.sampleRate as number) ?? SAMPLE_RATE
        const channels = (config.channels as number) ?? CHANNELS
        const bitrate = (config.bitrate as number) ?? BITRATE

        encoder = new OpusEncoder(sampleRate, channels)
        encoder.setBitrate(bitrate)
        console.log(`[StreamWorker] Opus encoder: ${sampleRate}Hz, ${channels}ch, ${bitrate}bps`)

        // Pre-encode a silence frame for queue starvation
        silenceFrame = encoder.encode(Buffer.alloc(PCM_FRAME_BYTES))

        if (mode === 'cosmic') {
          await connectCosmic({
            serverUrl: config.serverUrl as string,
            accessKey: config.accessKey as string,
            displayName: config.displayName as string | undefined,
          })
          startPing()
          startTick()
          reportState('connected')
          parentPort?.postMessage({ type: 'started' })
          console.log('[StreamWorker] Cosmic streaming started')
        } else if (mode === 'direct-rtp') {
          rtpHost = (config.janusHost as string) ?? '127.0.0.1'
          rtpPort = (config.janusPort as number) ?? 5002
          initRtp()
          udpSocket = createSocket('udp4')
          udpSocket.on('error', () => {}) // suppress non-fatal UDP errors
          startTick()
          reportState('connected')
          parentPort?.postMessage({ type: 'started' })
          console.log(`[StreamWorker] Direct RTP streaming to ${rtpHost}:${rtpPort}`)
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('[StreamWorker] Start failed:', errMsg)
        cleanup()
        reportState('failed')
        parentPort?.postMessage({ type: 'error', message: errMsg })
      }
    } else if (msg.type === 'stop') {
      console.log('[StreamWorker] Stopping')
      cleanup()
      reportState('disconnected')
    }
  }
)
