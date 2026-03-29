import { createSocket, type Socket } from 'node:dgram'

const OPUS_PAYLOAD_TYPE = 111
const RTP_VERSION = 2
const FIXED_SSRC = 0x12345678
const DEFAULT_SAMPLES_PER_FRAME = 960 // 48kHz * 20ms

export interface RtpForwarderConfig {
  host: string
  port: number
  sampleRate?: number
  channels?: number
  frameDurationMs?: number
}

export class RtpForwarder {
  private socket: Socket | null = null
  private sequenceNumber = 0
  private timestamp = 0
  private header = Buffer.alloc(12)
  private host = '127.0.0.1'
  private port = 5002
  private samplesPerFrame = DEFAULT_SAMPLES_PER_FRAME

  start(config: RtpForwarderConfig): void {
    this.stop()

    this.host = config.host
    this.port = config.port

    const sampleRate = config.sampleRate ?? 48_000
    const frameDurationMs = config.frameDurationMs ?? 20
    this.samplesPerFrame = Math.round(sampleRate * (frameDurationMs / 1000))

    this.sequenceNumber = Math.floor(Math.random() * 65536)
    this.timestamp = Math.floor(Math.random() * 0xffffffff)

    // Pre-fill static RTP header fields
    this.header[0] = RTP_VERSION << 6 // V=2, P=0, X=0, CC=0
    this.header[1] = OPUS_PAYLOAD_TYPE // M=0, PT=111
    this.header.writeUInt32BE(FIXED_SSRC, 8)

    this.socket = createSocket('udp4')
    this.socket.on('error', () => {
      // Suppress UDP errors — non-fatal for forwarding
    })

    console.log(
      `[RTP] Forwarder started: ${this.host}:${this.port}`,
      `samplesPerFrame=${this.samplesPerFrame}`
    )
  }

  sendFrame(opusFrame: Buffer): void {
    if (!this.socket) return

    this.header.writeUInt16BE(this.sequenceNumber & 0xffff, 2)
    this.header.writeUInt32BE(this.timestamp >>> 0, 4)

    const packet = Buffer.concat([this.header, opusFrame])
    this.socket.send(packet, this.port, this.host)

    this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff
    this.timestamp = (this.timestamp + this.samplesPerFrame) >>> 0
  }

  stop(): void {
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // Ignore errors during close
      }
      this.socket = null
      console.log('[RTP] Forwarder stopped')
    }
  }
}
