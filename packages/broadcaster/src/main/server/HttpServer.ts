import http from 'http'
import { type Readable } from 'stream'
import type { OctanisProjectFile } from '@octanis/shared'
import log from 'electron-log'

const MAX_BUFFER_BYTES = 2 * 1024 * 1024 // 2MB — drop slow clients beyond this

interface Listener {
  res: http.ServerResponse
  buffered: number
}

/**
 * HTTP server that broadcasts an encoded audio stream to all connected listeners.
 * GET /stream → audio stream (chunked transfer)
 * GET /       → JSON status
 */
export class BroadcastHub {
  private server: http.Server | null = null
  private listeners: Set<Listener> = new Set()
  private audioStream: Readable | null = null
  private startTime = 0
  private format: 'mp3' | 'opus' = 'mp3'
  private projectFile: OctanisProjectFile | null = null

  get listenerCount(): number {
    return this.listeners.size
  }

  get running(): boolean {
    return this.server !== null && this.server.listening
  }

  get uptimeSec(): number {
    return this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0
  }

  /**
   * Start the HTTP server and begin broadcasting the audio stream.
   */
  start(
    port: number,
    format: 'mp3' | 'opus',
    encodedStream: Readable,
    projectFile: OctanisProjectFile
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        reject(new Error('Server already running'))
        return
      }

      this.format = format
      this.audioStream = encodedStream
      this.projectFile = projectFile

      this.server = http.createServer((req, res) => {
        if (req.url === '/stream' || req.url === '/stream/') {
          this.handleStream(res)
        } else {
          this.handleStatus(res)
        }
      })

      this.server.on('error', (err) => {
        log.error('[HttpServer] Server error:', err)
        reject(err)
      })

      this.server.listen(port, () => {
        this.startTime = Date.now()
        log.info(`[HttpServer] Broadcasting on :${port} (${format})`)
        this.pumpAudio()
        resolve()
      })
    })
  }

  /**
   * Stop the server and disconnect all listeners.
   */
  stop(): void {
    if (this.audioStream) {
      this.audioStream.destroy()
      this.audioStream = null
    }

    for (const listener of this.listeners) {
      listener.res.end()
    }
    this.listeners.clear()

    if (this.server) {
      this.server.close()
      this.server = null
    }

    this.startTime = 0
    log.info('[HttpServer] Stopped')
  }

  private handleStream(res: http.ServerResponse): void {
    const contentType = this.format === 'mp3' ? 'audio/mpeg' : 'audio/ogg'
    res.writeHead(200, {
      'Content-Type': contentType,
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    const listener: Listener = { res, buffered: 0 }
    this.listeners.add(listener)
    log.info(`[HttpServer] Listener connected (${this.listeners.size} total)`)

    res.on('close', () => {
      this.listeners.delete(listener)
      log.info(`[HttpServer] Listener disconnected (${this.listeners.size} total)`)
    })
  }

  private handleStatus(res: http.ServerResponse): void {
    const status = {
      project: this.projectFile?.master?.title ?? null,
      tracks: this.projectFile?.tracks?.length ?? 0,
      listeners: this.listenerCount,
      uptime: Math.round(this.uptimeSec),
      format: this.format,
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(JSON.stringify(status))
  }

  /**
   * Pump audio chunks to all connected listeners.
   * Drops slow clients that exceed the buffer limit.
   */
  private pumpAudio(): void {
    if (!this.audioStream) return

    this.audioStream.on('data', (chunk: Buffer) => {
      for (const listener of this.listeners) {
        const ok = listener.res.write(chunk)
        if (!ok) {
          listener.buffered += chunk.length
          if (listener.buffered > MAX_BUFFER_BYTES) {
            log.warn('[HttpServer] Dropping slow listener')
            listener.res.end()
            this.listeners.delete(listener)
          }
        } else {
          listener.buffered = 0
        }
      }
    })

    this.audioStream.on('end', () => {
      log.info('[HttpServer] Audio stream ended')
      for (const listener of this.listeners) {
        listener.res.end()
      }
      this.listeners.clear()
    })

    this.audioStream.on('error', (err) => {
      log.error('[HttpServer] Audio stream error:', err)
    })
  }
}
