import { useRef, useCallback } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'
import type { SfuConfig, SfuConnectionState } from '../../../ipcTypes'
import type { SfuProvider } from '../sfu/types'
import { JanusProvider } from '../sfu/JanusProvider'
import { CosmicProvider } from '../sfu/CosmicProvider'
import { DirectRtpProvider } from '../sfu/DirectRtpProvider'

function createProvider(config: SfuConfig, projectPath: string, startFromSec: number): SfuProvider {
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
        projectPath,
        startFromSec,
      })
    case 'direct-rtp':
      return new DirectRtpProvider({
        janusHost: config.janusHost,
        janusPort: config.janusPort,
        sampleRate: config.sampleRate,
        channels: config.channels,
        frameDurationMs: config.frameDurationMs,
        bitrate: config.bitrate,
        projectPath,
        startFromSec,
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
 * Publishes the project audio mix to an SFU server.
 *
 * - Janus: MediaStreamDestination → MediaStreamTrack → RTCPeerConnection
 * - Cosmic/DirectRTP: Main process renders FFmpeg mix → Opus → Network
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

    // Get project path and playhead position from store
    const { currentFilePath, playheadSec } = useBroadcasterStore.getState()
    if (!currentFilePath) {
      throw new Error('No project loaded — open a project before streaming')
    }

    const ctx = masterGainNode.context as AudioContext
    const provider = createProvider(config, currentFilePath, playheadSec)
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
    // Cosmic/DirectRTP use FFmpeg mix in main process — no track needed.
    if (config.provider === 'janus') {
      const dest = ctx.createMediaStreamDestination()
      masterGainNode.connect(dest)
      destRef.current = dest

      const track = dest.stream.getAudioTracks()[0]
      if (!track) throw new Error('No audio track from MediaStreamDestination')
      await provider.connect(track)
    } else {
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
