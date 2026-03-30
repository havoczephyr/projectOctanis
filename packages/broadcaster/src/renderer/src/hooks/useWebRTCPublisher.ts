import { useRef, useCallback } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'
import type { SfuConfig, SfuConnectionState } from '../../../ipcTypes'
import type { SfuProvider } from '../sfu/types'
import { JanusProvider } from '../sfu/JanusProvider'
import { CosmicProvider } from '../sfu/CosmicProvider'
import { DirectRtpProvider } from '../sfu/DirectRtpProvider'

function createProvider(config: SfuConfig, masterGainNode?: GainNode): SfuProvider {
  switch (config.provider) {
    case 'janus':
      return new JanusProvider({
        serverUrl: config.serverUrl,
        roomId: config.roomId,
        secret: config.secret,
        displayName: config.displayName,
      })
    case 'cosmic':
      return new CosmicProvider({
        serverUrl: config.serverUrl,
        accessKey: config.accessKey,
        displayName: config.displayName,
        masterGainNode: masterGainNode!,
      })
    case 'direct-rtp':
      return new DirectRtpProvider({
        janusHost: config.janusHost,
        janusPort: config.janusPort,
        sampleRate: config.sampleRate,
        channels: config.channels,
        frameDurationMs: config.frameDurationMs,
        bitrate: config.bitrate,
        masterGainNode: masterGainNode!,
      })
    default:
      throw new Error(`Unknown SFU provider: ${(config as { provider: string }).provider}`)
  }
}

export interface WebRTCPublisherResult {
  connect: (config: SfuConfig) => Promise<void>
  disconnect: () => Promise<void>
  connectionState: SfuConnectionState
}

/**
 * Captures the final audio mix from masterGainNode and publishes it
 * to an SFU server via the configured provider.
 *
 * - Janus: MediaStreamDestination → MediaStreamTrack → RTCPeerConnection
 * - Cosmic/DirectRTP: ScriptProcessorNode → PCM capture → IPC → Worker
 */
export function useWebRTCPublisher(
  masterGainNode: GainNode | undefined
): WebRTCPublisherResult {
  const providerRef = useRef<SfuProvider | null>(null)
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const connectionState = useBroadcasterStore((s) => s.streamStatus.connectionState)
  const setStreamStatus = useBroadcasterStore((s) => s.setStreamStatus)

  const connect = useCallback(async (config: SfuConfig) => {
    if (!masterGainNode) {
      throw new Error('AudioContext not initialized — masterGainNode unavailable')
    }

    // Clean up any existing connection
    if (providerRef.current) {
      providerRef.current.dispose()
      providerRef.current = null
    }
    if (destRef.current) {
      destRef.current.disconnect()
      destRef.current = null
    }

    const ctx = masterGainNode.context as AudioContext
    const provider = createProvider(config, masterGainNode)
    providerRef.current = provider

    const roomName =
      config.provider === 'janus'
        ? `Room ${config.roomId}`
        : config.provider === 'direct-rtp'
          ? `${config.janusHost}:${config.janusPort}`
          : config.serverUrl

    const serverUrl = config.provider === 'direct-rtp'
      ? `${config.janusHost}:${config.janusPort}`
      : config.serverUrl

    provider.onStateChange((state) => {
      setStreamStatus({
        connectionState: state,
        serverUrl,
        roomName,
        participantCount: useBroadcasterStore.getState().streamStatus.participantCount,
        uptimeSec: useBroadcasterStore.getState().streamStatus.uptimeSec,
      })
    })

    provider.onParticipantCount((count) => {
      const current = useBroadcasterStore.getState().streamStatus
      setStreamStatus({ ...current, participantCount: count })
    })

    // Janus needs a MediaStreamTrack for WebRTC.
    // Cosmic/DirectRTP use ScriptProcessorNode internally — no track needed.
    if (config.provider === 'janus') {
      const dest = ctx.createMediaStreamDestination()
      masterGainNode.connect(dest)
      destRef.current = dest

      const track = dest.stream.getAudioTracks()[0]
      if (!track) throw new Error('No audio track from MediaStreamDestination')
      await provider.connect(track)
    } else {
      // Cosmic/DirectRTP: pass a dummy track — providers use ScriptProcessorNode
      await provider.connect(null as unknown as MediaStreamTrack)
    }

    // Start uptime counter
    const startTime = Date.now()
    uptimeRef.current = setInterval(() => {
      const current = useBroadcasterStore.getState().streamStatus
      setStreamStatus({
        ...current,
        uptimeSec: Math.round((Date.now() - startTime) / 1000),
      })
    }, 1000)
  }, [masterGainNode, setStreamStatus])

  const disconnect = useCallback(async () => {
    if (uptimeRef.current) {
      clearInterval(uptimeRef.current)
      uptimeRef.current = null
    }

    if (providerRef.current) {
      await providerRef.current.disconnect()
      providerRef.current.dispose()
      providerRef.current = null
    }

    if (destRef.current) {
      destRef.current.disconnect()
      destRef.current = null
    }

    setStreamStatus({
      connectionState: 'disconnected',
      serverUrl: null,
      roomName: null,
      participantCount: 0,
      uptimeSec: 0,
    })
  }, [setStreamStatus])

  return { connect, disconnect, connectionState }
}
