/**
 * Stream Manager — owns the Worker Thread lifecycle and feeds it
 * PCM from the FFmpeg Mixer.
 *
 * Instead of receiving PCM from the renderer via IPC, the manager
 * renders the project mix server-side with FFmpeg, chunks it into
 * 20ms frames, and feeds those to the worker with backpressure.
 */

import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { Readable } from 'node:stream'
import type { WebContents } from 'electron'
import type { StreamConfig } from '../ipcTypes'
import { ProjectLoader } from './audio/ProjectLoader'
import { Mixer } from './audio/Mixer'

const SAMPLE_RATE = 48_000
const CHANNELS = 2
const FRAME_DURATION_MS = 20
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000
const PCM_FRAME_BYTES = SAMPLES_PER_FRAME * CHANNELS * 2 // 3840

const QUEUE_HIGH_WATER = 40
const QUEUE_LOW_WATER = 10
const PREFILL_FRAMES = 5 // 100ms buffer before starting real-time tick

export class StreamManager {
  private worker: Worker | null = null
  private webContents: WebContents | null = null
  private pcmStream: Readable | null = null
  private frameQueue: Buffer[] = []
  private streamPaused = false
  private streamDone = false
  private pcmAccum = Buffer.alloc(0)
  private tickTimer: ReturnType<typeof setTimeout> | null = null
  private tickStartTime = 0
  private frameIndex = 0
  private primed = false
  private tickCount = 0
  private silenceCount = 0

  async start(config: StreamConfig, webContents: WebContents): Promise<void> {
    this.stop()
    this.webContents = webContents

    // Load project and start FFmpeg mix
    const project = await ProjectLoader.load(config.projectPath)
    const startFrom = config.startFromSec ?? 0
    console.log(
      `[StreamManager] Mixing "${project.project.meta.title}" from ${startFrom.toFixed(1)}s`
    )

    this.pcmStream = Mixer.getPCMStream(project, {
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      format: 's16le',
    })

    // If starting from a non-zero position, skip ahead in the PCM stream
    if (startFrom > 0) {
      const bytesToSkip = Math.floor(startFrom * SAMPLE_RATE) * CHANNELS * 2
      let skipped = 0
      await new Promise<void>((resolve) => {
        const onData = (chunk: Buffer): void => {
          skipped += chunk.length
          if (skipped >= bytesToSkip) {
            this.pcmStream!.removeListener('data', onData)
            // Keep the remainder that overshot
            const overshoot = skipped - bytesToSkip
            if (overshoot > 0) {
              const leftover = chunk.subarray(chunk.length - overshoot)
              this.pcmAccum = Buffer.from(leftover)
            }
            resolve()
          }
        }
        this.pcmStream!.on('data', onData)
        this.pcmStream!.on('end', () => resolve())
      })
    }

    // Reset state
    this.frameQueue = []
    this.streamPaused = false
    this.streamDone = false

    // Start chunking PCM into 20ms frames
    this.pcmStream.on('data', (chunk: Buffer) => {
      this.pcmAccum = Buffer.concat([this.pcmAccum, chunk])

      while (this.pcmAccum.length >= PCM_FRAME_BYTES) {
        const frame = this.pcmAccum.subarray(0, PCM_FRAME_BYTES)
        this.pcmAccum = this.pcmAccum.subarray(PCM_FRAME_BYTES)
        this.frameQueue.push(Buffer.from(frame))
      }

      if (!this.streamPaused && this.frameQueue.length >= QUEUE_HIGH_WATER) {
        this.pcmStream!.pause()
        this.streamPaused = true
      }
    })

    this.pcmStream.on('end', () => {
      console.log('[StreamManager] FFmpeg mix finished')
      this.streamDone = true
    })

    this.pcmStream.on('error', (err) => {
      console.error('[StreamManager] FFmpeg error:', err.message)
      this.streamDone = true
    })

    // Spawn worker and start streaming
    return new Promise<void>((resolve, reject) => {
      this.worker = new Worker(join(__dirname, 'streamWorker.js'))

      const onMessage = (msg: { type: string; state?: string; message?: string }): void => {
        if (msg.type === 'started') {
          // Worker is ready — start feeding frames
          this.startFeeding()
          resolve()
        } else if (msg.type === 'error') {
          reject(new Error(msg.message ?? 'Worker failed to start'))
        } else if (msg.type === 'state' && msg.state) {
          this.webContents?.send('stream:state', msg.state)
        }
      }

      this.worker.on('message', onMessage)

      this.worker.on('error', (err) => {
        console.error('[StreamManager] Worker error:', err)
        this.webContents?.send('stream:state', 'failed')
        reject(err)
      })

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          console.warn(`[StreamManager] Worker exited with code ${code}`)
        }
        this.worker = null
      })

      // Strip projectPath/startFromSec before sending to worker (it doesn't need them)
      const { projectPath: _p, startFromSec: _s, ...workerConfig } = config
      this.worker.postMessage({ type: 'start', config: workerConfig })
    })
  }

  /**
   * Feed PCM frames to the worker on a drift-corrected 20ms tick —
   * one frame per tick, matching real-time playback pace.
   * Mirrors the headless broadcaster's proven single-process pattern.
   */
  private startFeeding(): void {
    this.primed = false
    this.frameIndex = 0
    this.tickCount = 0
    this.silenceCount = 0

    const tick = (): void => {
      if (!this.worker) return

      // Wait for enough frames to absorb startup jitter
      if (!this.primed) {
        if (this.frameQueue.length >= PREFILL_FRAMES) {
          this.primed = true
          this.tickStartTime = performance.now()
          this.frameIndex = 0
          console.log(
            `[StreamManager] Primed — ${this.frameQueue.length} frames queued, starting real-time feed`
          )
        } else if (this.streamDone && this.frameQueue.length === 0) {
          this.worker.postMessage({ type: 'eof' })
          console.log('[StreamManager] Stream ended before priming — sent eof')
          return
        } else {
          this.tickTimer = setTimeout(tick, 5)
          return
        }
      }

      this.tickCount++

      // Dequeue one frame and send to worker for immediate encode+send
      if (this.frameQueue.length > 0) {
        const frame = this.frameQueue.shift()!
        const ab = frame.buffer.slice(
          frame.byteOffset,
          frame.byteOffset + frame.byteLength
        ) as ArrayBuffer
        this.worker.postMessage({ type: 'pcm', buffer: ab }, [ab])
      } else if (this.streamDone) {
        // Mix finished and queue drained — signal worker to close
        this.worker.postMessage({ type: 'eof' })
        const audioSec = (this.tickCount * FRAME_DURATION_MS) / 1000
        const wallSec = (performance.now() - this.tickStartTime) / 1000
        console.log(
          `[StreamManager] All frames sent — ${this.tickCount} ticks, ` +
            `${this.silenceCount} silence, audio=${audioSec.toFixed(1)}s wall=${wallSec.toFixed(1)}s`
        )
        return
      } else {
        // Queue starved but stream not done — worker will receive nothing this tick
        // (worker handles the gap; no silence injection needed here)
        this.silenceCount++
      }

      // Resume FFmpeg if queue drained below low-water mark
      if (this.streamPaused && this.frameQueue.length <= QUEUE_LOW_WATER) {
        this.pcmStream?.resume()
        this.streamPaused = false
      }

      // ── Real-time monitoring (every 250 ticks ≈ 5s) ──
      if (this.tickCount % 250 === 0) {
        const wallSec = (performance.now() - this.tickStartTime) / 1000
        const audioSec = (this.tickCount * FRAME_DURATION_MS) / 1000
        const drift = audioSec - wallSec
        console.log(
          `[StreamManager] tick=${this.tickCount} queued=${this.frameQueue.length} ` +
            `silence=${this.silenceCount} audio=${audioSec.toFixed(1)}s ` +
            `wall=${wallSec.toFixed(1)}s drift=${(drift * 1000).toFixed(1)}ms`
        )
      }

      // Drift-corrected next tick
      this.frameIndex++
      const nextAt = this.tickStartTime + this.frameIndex * FRAME_DURATION_MS
      const delay = Math.max(0, nextAt - performance.now())
      this.tickTimer = setTimeout(tick, delay)
    }

    tick()
  }

  stop(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer)
      this.tickTimer = null
    }

    if (this.pcmStream) {
      this.pcmStream.removeAllListeners()
      this.pcmStream.destroy()
      this.pcmStream = null
    }

    if (this.worker) {
      this.worker.postMessage({ type: 'stop' })
      this.worker.terminate()
      this.worker = null
    }

    this.frameQueue = []
    this.pcmAccum = Buffer.alloc(0)
    this.streamDone = false
    this.streamPaused = false
    this.webContents = null
  }
}
