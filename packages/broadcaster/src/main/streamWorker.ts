/**
 * Stream Worker — dedicated thread for Opus encoding + network send.
 *
 * Receives one 20ms PCM frame at a time from StreamManager (which owns
 * the drift-corrected real-time tick), encodes with @discordjs/opus,
 * and sends the Opus frame immediately over WebSocket (Cosmic) or
 * UDP/RTP (Direct RTP).
 *
 * The worker is intentionally stateless with respect to timing — it
 * encodes and sends as soon as it receives a frame.  All pacing is
 * handled by the StreamManager's tick loop.
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

// ── State ─────────────────────────────────────────────────────
let encoder: OpusEncoder | null = null
let ws: WebSocket | null = null
let udpSocket: Socket | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null
let running = false
let mode: 'cosmic' | 'direct-rtp' = 'cosmic'

// RTP state (direct-rtp mode)
let rtpSeqNum = 0
let rtpTimestamp = 0
const rtpHeader = Buffer.alloc(12)

let rtpHost = '127.0.0.1'
let rtpPort = 5002

// ── Instrumentation ───────────────────────────────────────────
let encodeCount = 0
let startTime = 0

// ── Encode + Send (called immediately on receipt) ─────────────

function encodeAndSend(pcm: Buffer): void {
  if (!encoder) return

  encodeCount++

  let opusFrame: Buffer
  try {
    opusFrame = encoder.encode(pcm)
  } catch (err) {
    console.error('[StreamWorker] Encode error:', err)
    return
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

  // ── Real-time monitoring (every 250 encodes ≈ 5s) ──
  if (encodeCount % 250 === 0) {
    const wallSec = (performance.now() - startTime) / 1000
    const audioSec = (encodeCount * FRAME_DURATION_MS) / 1000
    console.log(
      `[StreamWorker] encoded=${encodeCount} audio=${audioSec.toFixed(1)}s wall=${wallSec.toFixed(1)}s`
    )
  }
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
        running = false
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
  running = false
  stopPing()
  encoder = null

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
    // ── PCM frame: encode and send immediately ──
    if (msg.type === 'pcm' && msg.buffer && running) {
      const frame = Buffer.from(msg.buffer)
      encodeAndSend(frame)
      return
    }

    // ── EOF: stream complete, graceful shutdown ──
    if (msg.type === 'eof') {
      const audioSec = (encodeCount * FRAME_DURATION_MS) / 1000
      const wallSec = (performance.now() - startTime) / 1000
      console.log(
        `[StreamWorker] EOF — ${encodeCount} frames encoded, ` +
          `audio=${audioSec.toFixed(1)}s wall=${wallSec.toFixed(1)}s`
      )
      // Brief delay to let the last frame flush over the network
      setTimeout(() => {
        cleanup()
        reportState('disconnected')
      }, 200)
      return
    }

    // ── Start: initialize encoder + connect ──
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

        encodeCount = 0
        startTime = performance.now()

        if (mode === 'cosmic') {
          await connectCosmic({
            serverUrl: config.serverUrl as string,
            accessKey: config.accessKey as string,
            displayName: config.displayName as string | undefined,
          })
          startPing()
          running = true
          reportState('connected')
          parentPort?.postMessage({ type: 'started' })
          console.log('[StreamWorker] Cosmic streaming started — awaiting frames')
        } else if (mode === 'direct-rtp') {
          rtpHost = (config.janusHost as string) ?? '127.0.0.1'
          rtpPort = (config.janusPort as number) ?? 5002
          initRtp()
          udpSocket = createSocket('udp4')
          udpSocket.on('error', () => {}) // suppress non-fatal UDP errors
          running = true
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
