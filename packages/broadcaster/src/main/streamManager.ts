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

export class StreamManager {
  private worker: Worker | null = null
  private webContents: WebContents | null = null
  private pcmStream: Readable | null = null
  private frameQueue: Buffer[] = []
  private streamPaused = false
  private streamDone = false
  private pcmAccum = Buffer.alloc(0)
  private feedTimer: ReturnType<typeof setTimeout> | null = null

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

  /** Feed queued PCM frames to the worker at the rate it consumes them. */
  private startFeeding(): void {
    const feed = (): void => {
      if (!this.worker) return

      // Send up to 5 frames per tick to keep the worker's internal queue fed
      let sent = 0
      while (this.frameQueue.length > 0 && sent < 5) {
        const frame = this.frameQueue.shift()!
        const ab = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as ArrayBuffer
        this.worker.postMessage({ type: 'pcm', buffer: ab }, [ab])
        sent++
      }

      // Resume FFmpeg if queue drained below low-water mark
      if (this.streamPaused && this.frameQueue.length <= QUEUE_LOW_WATER) {
        this.pcmStream?.resume()
        this.streamPaused = false
      }

      // Stop when mix is done and queue is empty
      if (this.streamDone && this.frameQueue.length === 0) {
        console.log('[StreamManager] All frames fed to worker')
        return
      }

      this.feedTimer = setTimeout(feed, 4) // ~250 checks/sec, faster than 50fps consume rate
    }

    feed()
  }

  stop(): void {
    if (this.feedTimer) {
      clearTimeout(this.feedTimer)
      this.feedTimer = null
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
