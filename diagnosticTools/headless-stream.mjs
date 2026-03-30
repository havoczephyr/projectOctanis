/**
 * Headless Broadcaster — streams an Octanis project to Cosmic or Janus
 * without Electron or any GUI.
 *
 * Loads project → FFmpeg mix → PCM chunks → Opus encode → WebSocket/UDP
 *
 * Usage:
 *   npm run headless:stream -- --project /path/to/project.octanis.json
 *   npm run headless:stream -- --project /path/to/project.octanis.json --mode direct-rtp --host 127.0.0.1 --port 5002
 *   npm run headless:stream -- --project /path/to/project.octanis.json --server ws://localhost:9777 --key test123
 */

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createSocket } from 'node:dgram'
import { performance } from 'node:perf_hooks'
import { OctanisProjectFileSchema } from '@octanis/shared'

const require = createRequire(import.meta.url)
const ffmpeg = require('fluent-ffmpeg')
const ffmpegStatic = require('ffmpeg-static')
const { OpusEncoder } = require('@discordjs/opus')
const WebSocket = require('ws')

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── CLI args ──────────────────────────────────────────────────

const args = process.argv.slice(2)
function arg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
}

const PROJECT_PATH = arg('project')
const MODE = arg('mode') ?? 'cosmic'
const SERVER_URL = arg('server') ?? 'ws://localhost:9777'
const ACCESS_KEY = arg('key') ?? '00000000000000000000000000000000'
const DISPLAY_NAME = arg('name') ?? 'Headless Broadcaster'
const RTP_HOST = arg('host') ?? '127.0.0.1'
const RTP_PORT = Number(arg('port') ?? '5002')

if (!PROJECT_PATH) {
  console.error('Usage: node headless-stream.mjs --project <path> [--mode cosmic|direct-rtp] [--server ws://...] [--key ...] [--host ...] [--port ...]')
  process.exit(1)
}

// ── Audio constants ───────────────────────────────────────────

const SAMPLE_RATE = 48_000
const CHANNELS = 2
const FRAME_DURATION_MS = 20
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000 // 960
const PCM_FRAME_BYTES = SAMPLES_PER_FRAME * CHANNELS * 2           // 3840 (s16le)
const BITRATE = 128_000

// ── RTP constants ─────────────────────────────────────────────

const RTP_VERSION = 2
const OPUS_PAYLOAD_TYPE = 111
const FIXED_SSRC = 0x12345678

// ── Queue / tick constants ────────────────────────────────────

const PREFILL_FRAMES = 5
const MAX_QUEUE_FRAMES = 50

// ── Project loader (inline, no Electron dependency) ───────────

async function loadProject(filePath) {
  const raw = await readFile(filePath, 'utf-8')
  const parsed = JSON.parse(raw)
  const result = OctanisProjectFileSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map(i => `  • ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Project validation failed:\n${issues}`)
  }
  return result.data
}

// ── Mixer (inline — no Electron dependency) ──────────────────

function buildEnvelopeFilters(clip) {
  const filters = []

  if (clip.volume !== 1.0) {
    filters.push(`volume=${clip.volume.toFixed(4)}`)
  }

  // Apply mute regions
  for (const mute of clip.muteRegions ?? []) {
    const start = mute.startSec
    const end = mute.endSec
    filters.push(`volume=enable='between(t,${start.toFixed(4)},${end.toFixed(4)})':volume=0`)
  }

  return filters
}

function getMixPCMStream(projectFile) {
  const { tracks, masterVolume, durationSec } = projectFile.project
  const audioFiles = projectFile.audioFiles

  const inputs = []
  for (const track of tracks) {
    if (track.muted) continue
    for (const clip of track.clips) {
      const audioFile = audioFiles[clip.audioFileId]
      if (!audioFile) continue
      const clipDur = clip.trimEndSec != null
        ? clip.trimEndSec - clip.trimStartSec
        : audioFile.durationSec
      inputs.push({ path: audioFile.absolutePath, clip, trackVolume: track.volume, durationSec: clipDur })
    }
  }

  if (inputs.length === 0) {
    console.log('[Mixer] No clips — generating silence')
    return ffmpeg()
      .setFfmpegPath(ffmpegStatic)
      .input(`anullsrc=r=${SAMPLE_RATE}:cl=stereo`)
      .inputOptions(['-f', 'lavfi'])
      .outputOptions(['-t', String(durationSec), '-ac', String(CHANNELS), '-ar', String(SAMPLE_RATE), '-f', 's16le'])
      .pipe()
  }

  const cmd = ffmpeg().setFfmpegPath(ffmpegStatic)

  for (const { path, clip } of inputs) {
    cmd.input(path)
    if (clip.trimStartSec > 0) cmd.inputOptions(['-ss', String(clip.trimStartSec)])
    if (clip.trimEndSec != null) cmd.inputOptions(['-to', String(clip.trimEndSec)])
  }

  const filterParts = []
  const mixInputs = []

  inputs.forEach(({ clip, trackVolume, durationSec: clipDur }, i) => {
    const envFilters = buildEnvelopeFilters(clip)
    const delayMs = Math.round(clip.startSec * 1000)
    const delayStr = `${delayMs}|${delayMs}`

    const chain = [`[${i}:a]aformat=channel_layouts=stereo`, `adelay=${delayStr}`]
    if (envFilters.length > 0) chain.push(...envFilters)
    if (trackVolume !== 1.0) chain.push(`volume=${trackVolume.toFixed(4)}`)

    const label = `[clip${i}]`
    filterParts.push(`${chain.join(',')},apad${label}`)
    mixInputs.push(label)
  })

  filterParts.push(
    `${mixInputs.join('')}amix=inputs=${inputs.length}:duration=longest:normalize=0,` +
    `volume=${masterVolume.toFixed(4)},` +
    `atrim=duration=${durationSec}` +
    `[master]`
  )

  const filterGraph = filterParts.join(';\n')
  const filterFile = join(tmpdir(), `octanis-headless-filter-${Date.now()}.txt`)
  writeFileSync(filterFile, filterGraph)
  cmd.outputOptions(['-filter_complex_script', filterFile])
  cmd.map('[master]')
  cmd.outputOptions(['-ac', String(CHANNELS), '-ar', String(SAMPLE_RATE), '-f', 's16le'])

  return cmd.pipe()
}

// ── Cosmic WebSocket ──────────────────────────────────────────

function connectCosmic(serverUrl, accessKey, displayName) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(serverUrl)
    const wsProto = parsed.protocol === 'wss:' || parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${wsProto}//${parsed.host}/api/dj/stream?key=${encodeURIComponent(accessKey)}`

    console.log(`[WS] Connecting: ${url.replace(/key=[^&]+/, 'key=REDACTED')}`)
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    const timeout = setTimeout(() => { ws.close(); reject(new Error('Timeout')) }, 10_000)

    ws.on('open', () => {
      clearTimeout(timeout)
      const hello = { type: 'hello', sampleRate: SAMPLE_RATE, channels: CHANNELS, frameDurationMs: FRAME_DURATION_MS }
      if (displayName) hello.displayName = displayName
      console.log(`[WS] Sending hello: ${JSON.stringify(hello)}`)
      ws.send(JSON.stringify(hello))
    })

    ws.on('error', (err) => { clearTimeout(timeout); reject(err) })

    ws.on('message', (data) => {
      const str = typeof data === 'string' ? data : data.toString('utf8')
      try {
        const msg = JSON.parse(str)
        if (msg.type === 'ready') { clearTimeout(timeout); resolve(ws) }
        else if (msg.type === 'error') { clearTimeout(timeout); reject(new Error(msg.message)) }
        else if (msg.type === 'pong') { /* OK */ }
      } catch { /* ignore */ }
    })

    ws.on('close', (code, reason) => {
      console.log(`[WS] Closed: code=${code} reason="${reason}"`)
    })
  })
}

// ── RTP ───────────────────────────────────────────────────────

function createRtpSender() {
  const socket = createSocket('udp4')
  socket.on('error', () => {})

  let seqNum = Math.floor(Math.random() * 65536)
  let timestamp = Math.floor(Math.random() * 0xffffffff)
  const header = Buffer.alloc(12)
  header[0] = RTP_VERSION << 6
  header[1] = OPUS_PAYLOAD_TYPE
  header.writeUInt32BE(FIXED_SSRC, 8)

  return {
    send(opusFrame) {
      header.writeUInt16BE(seqNum & 0xffff, 2)
      header.writeUInt32BE(timestamp >>> 0, 4)
      const packet = Buffer.concat([header, opusFrame])
      socket.send(packet, RTP_PORT, RTP_HOST)
      seqNum = (seqNum + 1) & 0xffff
      timestamp = (timestamp + SAMPLES_PER_FRAME) >>> 0
    },
    close() { try { socket.close() } catch {} }
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`[Headless] Loading project: ${PROJECT_PATH}`)
  const project = await loadProject(PROJECT_PATH)
  const { title, author } = project.project.meta
  const dur = project.project.durationSec
  const trackCount = project.project.tracks.length
  const clipCount = project.project.tracks.reduce((n, t) => n + t.clips.length, 0)

  console.log(`[Headless] "${title}" by ${author} — ${dur.toFixed(1)}s, ${trackCount} tracks, ${clipCount} clips`)
  console.log(`[Headless] Mode: ${MODE} | Target: ${MODE === 'cosmic' ? SERVER_URL : `${RTP_HOST}:${RTP_PORT}`}`)

  // Initialize encoder
  const encoder = new OpusEncoder(SAMPLE_RATE, CHANNELS)
  encoder.setBitrate(BITRATE)
  const silenceFrame = encoder.encode(Buffer.alloc(PCM_FRAME_BYTES))
  console.log(`[Headless] Opus encoder: ${SAMPLE_RATE}Hz, ${CHANNELS}ch, ${BITRATE}bps`)

  // Connect to target
  let ws = null
  let rtp = null

  if (MODE === 'cosmic') {
    ws = await connectCosmic(SERVER_URL, ACCESS_KEY, DISPLAY_NAME)
    console.log('[Headless] Cosmic connected')

    // Ping keepalive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
    }, 15_000)
    ws.on('close', () => clearInterval(pingInterval))
  } else if (MODE === 'direct-rtp') {
    rtp = createRtpSender()
    console.log(`[Headless] RTP sender ready → ${RTP_HOST}:${RTP_PORT}`)
  } else {
    console.error(`Unknown mode: ${MODE}`)
    process.exit(1)
  }

  // Start FFmpeg mix
  console.log('[Headless] Starting FFmpeg mix...')
  const pcmStream = getMixPCMStream(project)

  // Frame queue + drift-corrected tick loop
  const frameQueue = []
  let running = true
  let primed = false
  let tickStartTime = 0
  let frameIndex = 0
  let tickCount = 0
  let encodeCount = 0
  let silenceCount = 0
  let streamDone = false
  let streamPaused = false

  // Backpressure thresholds — pause FFmpeg when queue is full, resume when drained
  const QUEUE_HIGH_WATER = 40  // pause FFmpeg
  const QUEUE_LOW_WATER = 10   // resume FFmpeg

  // Accumulate PCM into exact 20ms frames
  let pcmAccum = Buffer.alloc(0)

  pcmStream.on('data', (chunk) => {
    pcmAccum = Buffer.concat([pcmAccum, chunk])

    while (pcmAccum.length >= PCM_FRAME_BYTES) {
      const frame = pcmAccum.subarray(0, PCM_FRAME_BYTES)
      pcmAccum = pcmAccum.subarray(PCM_FRAME_BYTES)
      frameQueue.push(Buffer.from(frame))
    }

    // Backpressure: pause FFmpeg when queue is deep enough
    if (!streamPaused && frameQueue.length >= QUEUE_HIGH_WATER) {
      pcmStream.pause()
      streamPaused = true
    }
  })

  pcmStream.on('end', () => {
    console.log('[Headless] FFmpeg mix finished')
    streamDone = true
  })

  pcmStream.on('error', (err) => {
    console.error('[Headless] FFmpeg error:', err.message)
    streamDone = true
  })

  function sendOpus(opusFrame) {
    if (MODE === 'cosmic' && ws?.readyState === WebSocket.OPEN) {
      ws.send(opusFrame)
    } else if (MODE === 'direct-rtp' && rtp) {
      rtp.send(opusFrame)
    }
  }

  function tick() {
    if (!running) return

    if (!primed) {
      if (frameQueue.length >= PREFILL_FRAMES) {
        primed = true
        tickStartTime = performance.now()
        frameIndex = 0
        console.log(`[Headless] Primed — ${frameQueue.length} frames queued, starting encode`)
      } else if (streamDone && frameQueue.length === 0) {
        // Stream ended and no frames left
        finish()
        return
      } else {
        setTimeout(tick, 5)
        return
      }
    }

    tickCount++

    if (frameQueue.length > 0) {
      const pcm = frameQueue.shift()
      encodeCount++
      try {
        sendOpus(encoder.encode(pcm))
      } catch (err) {
        console.error('[Headless] Encode error:', err)
      }

      // Resume FFmpeg if queue drained below low-water mark
      if (streamPaused && frameQueue.length <= QUEUE_LOW_WATER) {
        pcmStream.resume()
        streamPaused = false
      }
    } else if (streamDone) {
      // No more frames and stream is done
      finish()
      return
    } else {
      silenceCount++
      sendOpus(silenceFrame)
    }

    if (tickCount % 250 === 0) {
      const elapsedSec = (performance.now() - tickStartTime) / 1000
      const audioSec = (encodeCount + silenceCount) * FRAME_DURATION_MS / 1000
      console.log(
        `[Headless] ticks=${tickCount} encoded=${encodeCount} silence=${silenceCount}` +
        ` queued=${frameQueue.length} audio=${audioSec.toFixed(1)}s wall=${elapsedSec.toFixed(1)}s`
      )
    }

    // Drift-corrected next tick
    frameIndex++
    const nextAt = tickStartTime + frameIndex * FRAME_DURATION_MS
    const delay = Math.max(0, nextAt - performance.now())
    setTimeout(tick, delay)
  }

  function finish() {
    running = false
    const elapsedSec = (performance.now() - tickStartTime) / 1000
    const audioSec = (encodeCount + silenceCount) * FRAME_DURATION_MS / 1000
    console.log(
      `\n[Headless] Done — ${encodeCount} encoded, ${silenceCount} silence, ` +
      `${audioSec.toFixed(1)}s audio in ${elapsedSec.toFixed(1)}s wall`
    )

    if (ws) {
      ws.close(1000)
    }
    if (rtp) {
      rtp.close()
    }

    // Give a moment for final sends to flush
    setTimeout(() => process.exit(0), 500)
  }

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n[Headless] Interrupted')
    running = false
    finish()
  })

  // Start the tick loop
  tick()
}

main().catch((err) => {
  console.error('[Headless] Fatal:', err)
  process.exit(1)
})
