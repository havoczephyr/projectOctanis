/**
 * Cosmic DJ Streaming Diagnostic Server
 *
 * A local fake Cosmic server that speaks the exact DJ WebSocket protocol
 * AND listens for raw RTP/UDP Opus frames (Direct RTP provider).
 * Captures Opus frames, decodes them to WAV via FFmpeg, and prints
 * ingest diagnostics matched to Cosmic's DjModeService.recordFrame().
 *
 * Usage:
 *   npm run diag:cosmic                          # WebSocket on 9777, RTP on 5002
 *   npm run diag:cosmic -- --port 9777 --rtp-port 5002
 */

import { WebSocketServer } from 'ws'
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import http from 'node:http'
import dgram from 'node:dgram'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const FFMPEG_PATH = require('ffmpeg-static')

// ── CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const PORT = portIdx !== -1 && args[portIdx + 1] ? Number(args[portIdx + 1]) : 9777
const rtpPortIdx = args.indexOf('--rtp-port')
const RTP_PORT = rtpPortIdx !== -1 && args[rtpPortIdx + 1] ? Number(args[rtpPortIdx + 1]) : 5002
const OUTPUT_DIR = join(__dirname, 'output')
const DUMMY_KEY = '00000000000000000000000000000000'

mkdirSync(OUTPUT_DIR, { recursive: true })

// ── Ogg CRC-32 ─────────────────────────────────────────────
const OGG_CRC_TABLE = new Uint32Array(256)
;(function buildCrcTable() {
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) {
      r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1)
    }
    OGG_CRC_TABLE[i] = r >>> 0
  }
})()

function oggCrc(data) {
  let crc = 0
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0
  }
  return crc
}

// ── Ogg page writer ────────────────────────────────────────
function makeOggPage(headerType, granulePos, serial, seqNo, payload) {
  // Segment table: split payload into 255-byte segments
  const segments = []
  let remaining = payload.length
  while (remaining >= 255) {
    segments.push(255)
    remaining -= 255
  }
  segments.push(remaining) // final segment (0-254)

  const headerSize = 27 + segments.length
  const page = Buffer.alloc(headerSize + payload.length)

  // Capture pattern
  page.write('OggS', 0)
  // Version
  page[4] = 0
  // Header type
  page[5] = headerType
  // Granule position (64-bit little-endian)
  page.writeUInt32LE(granulePos & 0xffffffff, 6)
  page.writeUInt32LE(Math.floor(granulePos / 0x100000000) & 0xffffffff, 10)
  // Serial number
  page.writeUInt32LE(serial, 14)
  // Page sequence number
  page.writeUInt32LE(seqNo, 18)
  // CRC placeholder (filled below)
  page.writeUInt32LE(0, 22)
  // Number of segments
  page[26] = segments.length
  // Segment table
  for (let i = 0; i < segments.length; i++) {
    page[27 + i] = segments[i]
  }
  // Payload
  payload.copy(page, headerSize)

  // Compute and write CRC
  const crc = oggCrc(page)
  page.writeUInt32LE(crc, 22)

  return page
}

// ── Opus headers ────────────────────────────────────────────
function makeOpusHead(sampleRate, channels) {
  const buf = Buffer.alloc(19)
  buf.write('OpusHead', 0)
  buf[8] = 1             // version
  buf[9] = channels
  buf.writeUInt16LE(3840, 10) // pre-skip (80ms at 48kHz)
  buf.writeUInt32LE(sampleRate, 12)
  buf.writeUInt16LE(0, 16)    // output gain
  buf[18] = 0                 // channel mapping family
  return buf
}

function makeOpusTags() {
  const vendor = Buffer.from('cosmic-diag', 'utf8')
  const buf = Buffer.alloc(8 + 4 + vendor.length + 4)
  buf.write('OpusTags', 0)
  buf.writeUInt32LE(vendor.length, 8)
  vendor.copy(buf, 12)
  buf.writeUInt32LE(0, 12 + vendor.length) // zero user comments
  return buf
}

// ── WAV header ──────────────────────────────────────────────
function makeWavHeader(dataLength, sampleRate, channels) {
  const bitsPerSample = 16
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const buf = Buffer.alloc(44)

  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLength, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)              // fmt chunk size
  buf.writeUInt16LE(1, 20)               // PCM format
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(blockAlign, 32)
  buf.writeUInt16LE(bitsPerSample, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataLength, 40)

  return buf
}

// ── Session ─────────────────────────────────────────────────
class Session {
  constructor() {
    this.frames = []
    this.timestamps = []  // performance.now() per frame
    this.sampleRate = 48000
    this.channels = 2
    this.frameDurationMs = 20
    this.displayName = null
    this.readyTime = null
    this.helloReceived = false

    // Cosmic-matched ingest stats
    this.ingestFrameCount = 0
    this.ingestByteCount = 0
    this.ingestStartedAt = null
    this.ingestLastFrameAt = null
    this.ingestJitterSum = 0
    this.ingestJitterCount = 0
    this.ingestMinFrameSize = Infinity
    this.ingestMaxFrameSize = 0

    // Extra diagnostics
    this.gapCount = 0    // IFI > 100ms
    this.burstCount = 0  // IFI < 10ms
  }

  get samplesPerFrame() {
    return this.sampleRate * (this.frameDurationMs / 1000)
  }

  recordFrame(frame) {
    const now = performance.now()
    this.frames.push(Buffer.from(frame))
    this.timestamps.push(now)

    this.ingestFrameCount++
    this.ingestByteCount += frame.byteLength

    if (this.ingestMinFrameSize > frame.byteLength) this.ingestMinFrameSize = frame.byteLength
    if (this.ingestMaxFrameSize < frame.byteLength) this.ingestMaxFrameSize = frame.byteLength

    if (!this.ingestStartedAt) this.ingestStartedAt = now

    if (this.ingestLastFrameAt !== null) {
      const interval = now - this.ingestLastFrameAt
      const deviation = Math.abs(interval - this.frameDurationMs)
      this.ingestJitterSum += deviation
      this.ingestJitterCount++

      if (interval > 100) this.gapCount++
      if (interval < 10) this.burstCount++
    }
    this.ingestLastFrameAt = now

    // Log every 100th frame
    if (this.ingestFrameCount % 100 === 0) {
      const ifi = this.ingestJitterCount > 0
        ? (this.timestamps[this.timestamps.length - 1] - this.timestamps[this.timestamps.length - 2]).toFixed(0)
        : '-'
      log(`Frame #${this.ingestFrameCount}: ${frame.byteLength} bytes, IFI=${ifi}ms`)
    }
  }

  getSummary() {
    const elapsedSec = this.ingestStartedAt
      ? (this.ingestLastFrameAt - this.ingestStartedAt) / 1000
      : 0
    const expectedFrames = elapsedSec > 0
      ? Math.round(elapsedSec / (this.frameDurationMs / 1000))
      : 0
    const avgFrameRate = elapsedSec > 0
      ? (this.ingestFrameCount / elapsedSec).toFixed(1)
      : 0
    const avgBitrateKbps = elapsedSec > 0
      ? Math.round(this.ingestByteCount * 8 / elapsedSec / 1000)
      : 0
    const avgJitterMs = this.ingestJitterCount > 0
      ? (this.ingestJitterSum / this.ingestJitterCount).toFixed(1)
      : 0
    const avgFrameSize = this.ingestFrameCount > 0
      ? Math.round(this.ingestByteCount / this.ingestFrameCount)
      : 0
    const firstFrameLatency = this.readyTime && this.timestamps.length > 0
      ? (this.timestamps[0] - this.readyTime).toFixed(0)
      : '-'

    // IFI stddev
    let ifiStddev = 0
    if (this.timestamps.length > 1) {
      const ifis = []
      for (let i = 1; i < this.timestamps.length; i++) {
        ifis.push(this.timestamps[i] - this.timestamps[i - 1])
      }
      const mean = ifis.reduce((a, b) => a + b, 0) / ifis.length
      const variance = ifis.reduce((a, b) => a + (b - mean) ** 2, 0) / ifis.length
      ifiStddev = Math.sqrt(variance).toFixed(1)
    }

    const missing = Math.max(0, expectedFrames - this.ingestFrameCount)

    return {
      elapsedSec: elapsedSec.toFixed(1),
      totalFrames: this.ingestFrameCount,
      expectedFrames,
      missing,
      avgFrameSize,
      minFrameSize: this.ingestMinFrameSize === Infinity ? 0 : this.ingestMinFrameSize,
      maxFrameSize: this.ingestMaxFrameSize,
      avgBitrateKbps,
      avgFrameRate,
      avgJitterMs,
      ifiStddev,
      gapCount: this.gapCount,
      burstCount: this.burstCount,
      firstFrameLatency,
    }
  }

  writeOgg(filePath) {
    if (this.frames.length === 0) return

    const serial = 0x4f435441 // "OCTA"
    let seqNo = 0
    const pages = []

    // ID header page (BOS)
    const opusHead = makeOpusHead(this.sampleRate, this.channels)
    pages.push(makeOggPage(0x02, 0, serial, seqNo++, opusHead))

    // Comment header page
    const opusTags = makeOpusTags()
    pages.push(makeOggPage(0x00, 0, serial, seqNo++, opusTags))

    // Audio pages — one packet per page
    let granulePos = 0
    for (let i = 0; i < this.frames.length; i++) {
      granulePos += this.samplesPerFrame
      const headerType = i === this.frames.length - 1 ? 0x04 : 0x00 // EOS on last
      pages.push(makeOggPage(headerType, granulePos, serial, seqNo++, this.frames[i]))
    }

    writeFileSync(filePath, Buffer.concat(pages))
    log(`Wrote Ogg: ${filePath}`)
  }

  decodeToWav(oggPath, wavPath) {
    return new Promise((resolve, reject) => {
      const proc = spawn(FFMPEG_PATH, [
        '-v', 'quiet',
        '-i', oggPath,
        '-ac', String(this.channels),
        '-ar', String(this.sampleRate),
        '-f', 's16le',
        'pipe:1',
      ])

      const chunks = []
      proc.stdout.on('data', (chunk) => chunks.push(chunk))
      proc.stderr.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg) log(`[ffmpeg] ${msg}`)
      })

      proc.on('close', (code) => {
        if (code !== 0 && chunks.length === 0) {
          reject(new Error(`ffmpeg exited with code ${code}`))
          return
        }
        const pcm = Buffer.concat(chunks)
        const wavHeader = makeWavHeader(pcm.length, this.sampleRate, this.channels)
        writeFileSync(wavPath, Buffer.concat([wavHeader, pcm]))
        log(`Wrote WAV: ${wavPath} (${(pcm.length / 1024 / 1024).toFixed(1)} MB PCM)`)
        resolve()
      })

      proc.on('error', reject)
    })
  }
}

// ── Logging ─────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[${ts}] ${msg}`)
}

// ── HTTP + WebSocket server ─────────────────────────────────
let activeSession = null
let activeWs = null
let rtpSession = null
let rtpIdleTimer = null
const RTP_IDLE_TIMEOUT_MS = 3000 // finalize RTP session after 3s of silence

const httpServer = http.createServer((req, res) => {
  // Reject non-upgrade HTTP requests to the stream endpoint
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname === '/api/dj/stream') {
    const key = url.searchParams.get('key')
    if (!key || !/^[0-9a-fA-F]{32}$/.test(key)) {
      res.writeHead(401)
      res.end('Unauthorized')
      return
    }
    if (activeWs) {
      res.writeHead(409)
      res.end('DJ already connected')
      return
    }
  }
  res.writeHead(404)
  res.end('Not found')
})

const wss = new WebSocketServer({ server: httpServer, path: '/api/dj/stream' })

wss.on('connection', (ws, req) => {
  // Validate key from upgrade request
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const key = url.searchParams.get('key')
  if (!key || !/^[0-9a-fA-F]{32}$/.test(key)) {
    ws.close(4001, 'Unauthorized')
    return
  }
  if (activeWs) {
    ws.close(4009, 'DJ already connected')
    return
  }

  activeWs = ws
  activeSession = new Session()
  log('Client connected, awaiting hello')

  ws.on('message', (data, isBinary) => {
    const session = activeSession
    if (!session) return

    // Binary = Opus frame
    if (isBinary) {
      if (!session.helloReceived) {
        ws.send(JSON.stringify({ type: 'error', message: 'Send hello message before streaming' }))
        return
      }
      session.recordFrame(data)
      return
    }

    // Text = JSON protocol
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
      return
    }

    switch (msg.type) {
      case 'hello': {
        session.sampleRate = msg.sampleRate || 48000
        session.channels = msg.channels || 2
        session.frameDurationMs = msg.frameDurationMs || 20
        session.displayName = msg.displayName || null
        session.helloReceived = true

        ws.send(JSON.stringify({ type: 'ready' }))
        session.readyTime = performance.now()

        log(`← hello: ${session.sampleRate} Hz, ${session.channels} ch, ${session.frameDurationMs}ms frames` +
            (session.displayName ? `, name="${session.displayName}"` : ''))
        log('→ ready')
        break
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }))
        break
      }

      case 'metadata': {
        log(`← metadata: "${msg.title || ''}" — "${msg.artist || ''}"`)
        break
      }

      default: {
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }))
        break
      }
    }
  })

  ws.on('close', (code, reason) => {
    log(`Client disconnected (code=${code}${reason.length ? ` reason="${reason}"` : ''})`)
    finalize()
  })

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`)
  })
})

// ── RTP/UDP listener ───────────────────────────────────────
const RTP_HEADER_SIZE = 12

const udpSocket = dgram.createSocket('udp4')

udpSocket.on('message', (packet, rinfo) => {
  if (packet.length < RTP_HEADER_SIZE) return // too small for RTP

  // Parse RTP header
  const version = (packet[0] >> 6) & 0x03
  if (version !== 2) return // not RTP v2

  const payloadType = packet[1] & 0x7f
  const seqNum = packet.readUInt16BE(2)
  const opusFrame = packet.subarray(RTP_HEADER_SIZE)

  if (opusFrame.length === 0) return

  // Start a new session on first RTP packet
  if (!rtpSession) {
    rtpSession = new Session()
    rtpSession.sampleRate = 48000
    rtpSession.channels = 2
    rtpSession.frameDurationMs = 20 // will be refined from timestamps
    rtpSession.helloReceived = true
    rtpSession.readyTime = performance.now()
    log(`RTP stream started from ${rinfo.address}:${rinfo.port} (PT=${payloadType})`)
  }

  rtpSession.recordFrame(opusFrame)

  // Log first few packets for debug
  if (rtpSession.ingestFrameCount <= 3) {
    log(`RTP #${seqNum}: ${opusFrame.length} bytes, PT=${payloadType}`)
  }

  // Reset idle timer — finalize after silence
  if (rtpIdleTimer) clearTimeout(rtpIdleTimer)
  rtpIdleTimer = setTimeout(() => {
    log('RTP stream idle for 3s — finalizing session')
    finalizeRtp()
  }, RTP_IDLE_TIMEOUT_MS)
})

udpSocket.on('error', (err) => {
  log(`UDP error: ${err.message}`)
})

async function finalizeRtp() {
  const session = rtpSession
  rtpSession = null
  if (rtpIdleTimer) {
    clearTimeout(rtpIdleTimer)
    rtpIdleTimer = null
  }
  if (!session || session.frames.length === 0) {
    log('RTP: No frames captured')
    return
  }
  await finalizeSession(session, 'rtp')
  console.log('Waiting for next connection...')
}

// ── Finalization ────────────────────────────────────────────
async function finalizeSession(session, source = 'ws') {
  if (!session || session.frames.length === 0) {
    log('No frames captured — nothing to write')
    return
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const prefix = source === 'rtp' ? 'rtp' : 'session'
  const oggPath = join(OUTPUT_DIR, `${prefix}-${ts}.ogg`)
  const wavPath = join(OUTPUT_DIR, `${prefix}-${ts}.wav`)

  // Write Ogg
  session.writeOgg(oggPath)

  // Decode to WAV
  try {
    await session.decodeToWav(oggPath, wavPath)
  } catch (err) {
    log(`WAV decode failed: ${err.message}`)
  }

  // Print summary
  const s = session.getSummary()
  console.log('')
  console.log('══════════════════════════════════════════════')
  console.log(`  Session Summary (${source.toUpperCase()})`)
  console.log('══════════════════════════════════════════════')
  console.log(`  Duration:          ${s.elapsedSec}s`)
  console.log(`  Total frames:      ${s.totalFrames}`)
  console.log(`  Expected frames:   ${s.expectedFrames} (${s.missing} missing)`)
  console.log(`  Frame sizes:       avg=${s.avgFrameSize}  min=${s.minFrameSize}  max=${s.maxFrameSize} bytes`)
  console.log(`  Avg bitrate:       ${s.avgBitrateKbps} kbps`)
  console.log(`  Avg frame rate:    ${s.avgFrameRate} fps`)
  console.log(`  Avg jitter (MAD):  ${s.avgJitterMs}ms`)
  console.log(`  IFI stddev:        ${s.ifiStddev}ms`)
  console.log(`  Gaps (>100ms):     ${s.gapCount}`)
  console.log(`  Bursts (<10ms):    ${s.burstCount}`)
  console.log(`  First-frame delay: ${s.firstFrameLatency}ms`)
  console.log(`  Output:`)
  console.log(`    ${oggPath}`)
  console.log(`    ${wavPath}`)
  console.log('══════════════════════════════════════════════')
  console.log('')
}

async function finalize() {
  const session = activeSession
  activeWs = null
  activeSession = null
  await finalizeSession(session, 'ws')
  console.log('Waiting for next connection...')
}

// ── Startup ─────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  udpSocket.bind(RTP_PORT, () => {
    console.log('')
    console.log('══════════════════════════════════════════════')
    console.log('  Cosmic Diagnostic Server')
    console.log('══════════════════════════════════════════════')
    console.log('  WebSocket (Cosmic provider):')
    console.log(`    Server URL:  ws://localhost:${PORT}`)
    console.log(`    Access Key:  ${DUMMY_KEY}`)
    console.log('  Direct RTP (UDP):')
    console.log(`    Janus Host:  127.0.0.1`)
    console.log(`    Janus Port:  ${RTP_PORT}`)
    console.log('══════════════════════════════════════════════')
    console.log('')
    console.log('Waiting for connection...')
  })
})

// ── Graceful shutdown ───────────────────────────────────────
process.on('SIGINT', async () => {
  log('SIGINT received — shutting down')
  if (activeWs) {
    try { activeWs.close(1000, 'Server shutting down') } catch {}
    await finalize()
  }
  if (rtpSession) {
    await finalizeRtp()
  }
  wss.close()
  httpServer.close()
  udpSocket.close()
  process.exit(0)
})
