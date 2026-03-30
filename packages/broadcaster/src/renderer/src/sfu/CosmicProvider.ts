import type { SfuConnectionState } from '../../../ipcTypes'
import type { SfuProvider } from './types'

interface CosmicConfig {
  serverUrl: string
  accessKey: string
  displayName?: string
  masterGainNode: GainNode
}

type StateCallback = (state: SfuConnectionState) => void
type CountCallback = (count: number) => void

const SAMPLE_RATE = 48_000
const CHANNELS = 2
const FRAME_DURATION_MS = 20
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000 // 960
const PCM_FRAME_SAMPLES = SAMPLES_PER_FRAME * CHANNELS // 1920 interleaved samples

/**
 * Cosmic DJ streaming provider.
 *
 * Uses a ScriptProcessorNode to capture PCM directly from the audio
 * rendering thread. This bypasses MediaStreamTrackProcessor, which
 * throttles frame delivery to ~5/s when no audio sources are active
 * (a Chromium optimization that starves the Opus pipeline).
 *
 * ScriptProcessorNode.onaudioprocess fires every rendering quantum
 * regardless of signal content — exactly the reliability we need.
 */
export class CosmicProvider implements SfuProvider {
  readonly name = 'cosmic'

  private config: CosmicConfig
  private scriptNode: ScriptProcessorNode | null = null
  private state: SfuConnectionState = 'disconnected'
  private stateCallbacks: StateCallback[] = []
  private countCallbacks: CountCallback[] = []
  private disposed = false
  private stateUnsub: (() => void) | null = null

  // PCM accumulation — send complete 20ms frames over IPC
  private pcmAccumulator = new Int16Array(PCM_FRAME_SAMPLES * 2)
  private pcmOffset = 0

  // Diagnostics
  private callbackCount = 0
  private pcmFramesSent = 0
  private totalSamples = 0
  private diagStartTime = 0
  private lastDiagTime = 0

  constructor(config: CosmicConfig) {
    this.config = config
  }

  onStateChange(cb: StateCallback): void {
    this.stateCallbacks.push(cb)
  }

  onParticipantCount(cb: CountCallback): void {
    this.countCallbacks.push(cb)
  }

  async connect(_track: MediaStreamTrack): Promise<void> {
    if (this.disposed) throw new Error('Provider disposed')

    console.log(`[Cosmic] Connecting to ${this.config.serverUrl}`)
    this.setState('connecting')

    this.stateUnsub = window.octanis.stream.onStateChange((state) => {
      this.setState(state)
    })

    try {
      await window.octanis.stream.start({
        mode: 'cosmic',
        serverUrl: this.config.serverUrl,
        accessKey: this.config.accessKey,
        displayName: this.config.displayName,
      })

      this.startCapture()
      console.log('[Cosmic] Connected and streaming')
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
    await window.octanis.stream.stop()
    this.setState('disconnected')
  }

  dispose(): void {
    this.disposed = true
    this.cleanup()
    window.octanis.stream.stop().catch(() => {})
    this.stateCallbacks = []
    this.countCallbacks = []
  }

  // ── Private ──────────────────────────────────────────────

  private setState(state: SfuConnectionState): void {
    this.state = state
    for (const cb of this.stateCallbacks) cb(state)
  }

  private startCapture(): void {
    const ctx = this.config.masterGainNode.context as AudioContext

    // ScriptProcessorNode with 256-sample buffer (5.33ms) for fine-grained
    // capture. The callback fires on every audio rendering quantum regardless
    // of signal content — no throttling like MediaStreamTrackProcessor.
    this.scriptNode = ctx.createScriptProcessor(256, CHANNELS, CHANNELS)

    this.diagStartTime = performance.now()
    this.lastDiagTime = this.diagStartTime

    this.scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
      this.callbackCount++
      const inputBuffer = event.inputBuffer
      const numFrames = inputBuffer.length
      this.totalSamples += numFrames

      const left = inputBuffer.getChannelData(0)
      const right = inputBuffer.getChannelData(1)

      // Interleave stereo f32 → s16le, accumulate 20ms frames
      for (let i = 0; i < numFrames; i++) {
        const l = Math.max(-1, Math.min(1, left[i]))
        const r = Math.max(-1, Math.min(1, right[i]))
        this.pcmAccumulator[this.pcmOffset++] = l < 0 ? l * 0x8000 : l * 0x7fff
        this.pcmAccumulator[this.pcmOffset++] = r < 0 ? r * 0x8000 : r * 0x7fff

        if (this.pcmOffset >= PCM_FRAME_SAMPLES) {
          const frame = this.pcmAccumulator.slice(0, PCM_FRAME_SAMPLES)
          window.octanis.stream.sendPcm(frame.buffer)
          this.pcmFramesSent++

          const remainder = this.pcmOffset - PCM_FRAME_SAMPLES
          if (remainder > 0) {
            this.pcmAccumulator.copyWithin(0, PCM_FRAME_SAMPLES, this.pcmOffset)
          }
          this.pcmOffset = remainder
        }
      }

      // Diagnostic log every 5 seconds
      const now = performance.now()
      if (now - this.lastDiagTime >= 5000) {
        const elapsedSec = (now - this.diagStartTime) / 1000
        const audioSec = this.totalSamples / SAMPLE_RATE
        const cbRate = this.callbackCount / elapsedSec
        console.log(
          `[Cosmic][DIAG] callbacks=${this.callbackCount} pcmSent=${this.pcmFramesSent}` +
          ` totalAudioSec=${audioSec.toFixed(1)} cbRate=${cbRate.toFixed(0)}/s` +
          ` ratio=${(audioSec / elapsedSec).toFixed(2)}`
        )
        this.lastDiagTime = now
      }
    }

    // Connect: masterGainNode → scriptNode → destination
    // The scriptNode passes input through to output, but at negligible level
    // since we don't modify the output buffer. It must connect to destination
    // for onaudioprocess to fire.
    this.config.masterGainNode.connect(this.scriptNode)
    this.scriptNode.connect(ctx.destination)

    console.log('[Cosmic] ScriptProcessorNode capture started (256-sample buffer)')
  }

  private cleanup(): void {
    const elapsedSec = (performance.now() - this.diagStartTime) / 1000
    const audioSec = this.totalSamples / SAMPLE_RATE
    console.log(
      `[Cosmic] Cleanup — ${this.callbackCount} callbacks, ${this.pcmFramesSent} frames,` +
      ` ${audioSec.toFixed(1)}s audio in ${elapsedSec.toFixed(1)}s wall` +
      ` (ratio=${elapsedSec > 0 ? (audioSec / elapsedSec).toFixed(2) : '0'})`
    )

    if (this.scriptNode) {
      this.scriptNode.onaudioprocess = null
      this.scriptNode.disconnect()
      this.scriptNode = null
    }

    this.pcmOffset = 0
    this.callbackCount = 0
    this.pcmFramesSent = 0
    this.totalSamples = 0

    if (this.stateUnsub) {
      this.stateUnsub()
      this.stateUnsub = null
    }
  }
}
