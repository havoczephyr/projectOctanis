import type { SfuConnectionState } from '../../../ipcTypes'
import type { SfuProvider } from './types'

interface JanusConfig {
  serverUrl: string
  roomId: number
  secret?: string
  displayName?: string
}

type StateCallback = (state: SfuConnectionState) => void
type CountCallback = (count: number) => void

/** Janus transaction ID generator */
function txId(): string {
  return Math.random().toString(36).slice(2, 14)
}

/**
 * Janus AudioBridge provider.
 *
 * Signaling flow:
 *   1. WebSocket → create session
 *   2. Attach to janus.plugin.audiobridge
 *   3. Join room (with optional secret)
 *   4. RTCPeerConnection + addTrack → SDP offer
 *   5. Send configure with SDP offer → receive SDP answer
 *   6. Trickle ICE candidates
 *   7. Audio flows as Opus over WebRTC
 */
export class JanusProvider implements SfuProvider {
  readonly name = 'janus'

  private config: JanusConfig
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private sessionId: number | null = null
  private handleId: number | null = null
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private state: SfuConnectionState = 'disconnected'
  private stateCallbacks: StateCallback[] = []
  private countCallbacks: CountCallback[] = []
  private pendingTx = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>()
  private disposed = false
  private participantCount = 0

  constructor(config: JanusConfig) {
    this.config = config
  }

  onStateChange(cb: StateCallback): void {
    this.stateCallbacks.push(cb)
  }

  onParticipantCount(cb: CountCallback): void {
    this.countCallbacks.push(cb)
  }

  async connect(track: MediaStreamTrack): Promise<void> {
    if (this.disposed) throw new Error('Provider disposed')
    this.setState('connecting')

    try {
      await this.openWebSocket()
      this.sessionId = await this.createSession()
      this.startKeepalive()
      this.handleId = await this.attachPlugin()
      await this.joinRoom()
      await this.publishTrack(track)
      this.setState('connected')
    } catch (err) {
      this.setState('failed')
      this.cleanup()
      throw err
    }
  }

  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') return
    this.cleanup()
    this.setState('disconnected')
  }

  dispose(): void {
    this.disposed = true
    this.cleanup()
    this.stateCallbacks = []
    this.countCallbacks = []
  }

  // ── Private ──────────────────────────────────────────────

  private setState(state: SfuConnectionState): void {
    this.state = state
    for (const cb of this.stateCallbacks) cb(state)
  }

  private setParticipantCount(count: number): void {
    this.participantCount = count
    for (const cb of this.countCallbacks) cb(count)
  }

  private openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.serverUrl, 'janus-protocol')

      ws.onopen = (): void => {
        this.ws = ws
        resolve()
      }

      ws.onerror = (ev): void => {
        reject(new Error(`WebSocket error: ${ev}`))
      }

      ws.onclose = (): void => {
        if (this.state === 'connected') {
          this.setState('reconnecting')
          this.attemptReconnect()
        }
      }

      ws.onmessage = (ev): void => {
        this.handleMessage(ev)
      }
    })
  }

  private handleMessage(ev: MessageEvent): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(ev.data as string) as Record<string, unknown>
    } catch {
      return
    }

    const transaction = msg.transaction as string | undefined

    // Resolve pending transactions
    if (transaction && this.pendingTx.has(transaction)) {
      const { resolve, reject } = this.pendingTx.get(transaction)!
      this.pendingTx.delete(transaction)

      if (msg.janus === 'error') {
        const errInfo = msg.error as { code: number; reason: string } | undefined
        reject(new Error(errInfo?.reason ?? 'Janus error'))
      } else {
        resolve(msg)
      }
      return
    }

    // Handle async events
    if (msg.janus === 'event') {
      this.handlePluginEvent(msg)
    } else if (msg.janus === 'webrtcup') {
      console.log('[Janus] WebRTC media flowing')
    } else if (msg.janus === 'hangup') {
      console.warn('[Janus] Hangup:', msg.reason)
    }
  }

  private handlePluginEvent(msg: Record<string, unknown>): void {
    const pluginData = msg.plugindata as { data?: Record<string, unknown> } | undefined
    const data = pluginData?.data
    if (!data) return

    const event = data.audiobridge as string | undefined

    if (event === 'joined' || event === 'event') {
      const participants = data.participants as unknown[] | undefined
      if (participants) {
        // +1 to include ourselves
        this.setParticipantCount(participants.length + 1)
      }
    }

    if (event === 'event') {
      const leaving = data.leaving as number | undefined
      if (leaving != null) {
        this.setParticipantCount(Math.max(1, this.participantCount - 1))
      }
    }

    // Handle SDP answer returned via event (some Janus versions)
    const jsep = msg.jsep as { type: string; sdp: string } | undefined
    if (jsep?.type === 'answer' && this.pc) {
      this.pc.setRemoteDescription(new RTCSessionDescription(jsep as RTCSessionDescriptionInit))
        .catch((err) => console.error('[Janus] Failed to set remote SDP from event:', err))
    }
  }

  private sendRequest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

      const transaction = txId()
      const msg = { ...body, transaction }

      this.pendingTx.set(transaction, {
        resolve: resolve as (data: unknown) => void,
        reject,
      })

      this.ws.send(JSON.stringify(msg))

      // Timeout pending transactions after 10s
      setTimeout(() => {
        if (this.pendingTx.has(transaction)) {
          this.pendingTx.delete(transaction)
          reject(new Error(`Janus request timed out: ${body.janus}`))
        }
      }, 10_000)
    })
  }

  private async createSession(): Promise<number> {
    const resp = await this.sendRequest({ janus: 'create' })
    const data = resp.data as { id: number }
    return data.id
  }

  private async attachPlugin(): Promise<number> {
    const resp = await this.sendRequest({
      janus: 'attach',
      session_id: this.sessionId,
      plugin: 'janus.plugin.audiobridge',
    })
    const data = resp.data as { id: number }
    return data.id
  }

  private async joinRoom(): Promise<void> {
    const body: Record<string, unknown> = {
      request: 'join',
      room: this.config.roomId,
      codec: 'opus',
    }
    if (this.config.secret) body.secret = this.config.secret
    if (this.config.displayName) body.display = this.config.displayName

    await this.sendRequest({
      janus: 'message',
      session_id: this.sessionId,
      handle_id: this.handleId,
      body,
    })
  }

  private async publishTrack(track: MediaStreamTrack): Promise<void> {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    this.pc = pc

    pc.addTrack(track)

    pc.onicecandidate = (ev): void => {
      if (!ev.candidate) {
        // End of candidates — send completed trickle
        this.sendRequest({
          janus: 'trickle',
          session_id: this.sessionId,
          handle_id: this.handleId,
          candidate: { completed: true },
        }).catch(() => {})
        return
      }
      this.sendRequest({
        janus: 'trickle',
        session_id: this.sessionId,
        handle_id: this.handleId,
        candidate: ev.candidate.toJSON(),
      }).catch(() => {})
    }

    pc.onconnectionstatechange = (): void => {
      if (pc.connectionState === 'failed') {
        console.error('[Janus] PeerConnection failed')
        this.setState('failed')
      } else if (pc.connectionState === 'disconnected' && this.state === 'connected') {
        this.setState('reconnecting')
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    const resp = await this.sendRequest({
      janus: 'message',
      session_id: this.sessionId,
      handle_id: this.handleId,
      body: { request: 'configure' },
      jsep: { type: offer.type, sdp: offer.sdp },
    })

    // Some Janus responses embed the answer directly, others via async event
    const jsep = resp.jsep as { type: string; sdp: string } | undefined
    if (jsep?.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(jsep as RTCSessionDescriptionInit))
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive()
    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN && this.sessionId != null) {
        this.ws.send(JSON.stringify({
          janus: 'keepalive',
          session_id: this.sessionId,
          transaction: txId(),
        }))
      }
    }, 25_000) // Janus default session timeout is 60s, keepalive at 25s
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }

  private attemptReconnect(): void {
    if (this.disposed) return
    // Simple one-shot reconnect after 3s — can be extended with exponential backoff
    setTimeout(async () => {
      if (this.disposed || this.state !== 'reconnecting') return
      try {
        // We cannot easily resume a Janus session, so destroy and signal failure
        // The hook layer will handle user-initiated retry
        this.setState('failed')
      } catch {
        this.setState('failed')
      }
    }, 3_000)
  }

  private cleanup(): void {
    this.stopKeepalive()

    // Destroy Janus session if possible
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionId != null) {
      this.ws.send(JSON.stringify({
        janus: 'destroy',
        session_id: this.sessionId,
        transaction: txId(),
      }))
    }

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    if (this.ws) {
      // Remove onclose handler to prevent reconnect loop during intentional close
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }

    this.sessionId = null
    this.handleId = null
    this.pendingTx.clear()
    this.participantCount = 0
  }
}
