/**
 * Stream Manager — owns the Worker Thread lifecycle.
 *
 * Spawns a dedicated worker for Opus encoding + network send.
 * PCM frames arrive from the renderer via IPC and are forwarded
 * to the worker using postMessage with Transferable ArrayBuffers
 * (zero-copy hand-off, no SharedArrayBuffer needed).
 */

import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import type { StreamConfig } from '../ipcTypes'

export class StreamManager {
  private worker: Worker | null = null
  private webContents: WebContents | null = null

  start(config: StreamConfig, webContents: WebContents): Promise<void> {
    this.stop()
    this.webContents = webContents

    return new Promise<void>((resolve, reject) => {
      this.worker = new Worker(join(__dirname, 'streamWorker.js'))

      const onMessage = (msg: { type: string; state?: string; message?: string }): void => {
        if (msg.type === 'started') {
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

      this.worker.postMessage({ type: 'start', config })
    })
  }

  /** Forward a complete 20ms PCM frame to the worker (zero-copy transfer). */
  sendPcm(buffer: ArrayBuffer): void {
    if (!this.worker) return
    // Transfer the ArrayBuffer so it moves to the worker without copying
    this.worker.postMessage({ type: 'pcm', buffer }, [buffer])
  }

  stop(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' })
      this.worker.terminate()
      this.worker = null
    }
    this.webContents = null
  }
}
