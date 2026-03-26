import { useRef, useCallback } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'
import type { SfuConfig, SfuConnectionState } from '../../../ipcTypes'
import type { SfuProvider } from '../sfu/types'
import { JanusProvider } from '../sfu/JanusProvider'

function createProvider(config: SfuConfig): SfuProvider {
  switch (config.provider) {
    case 'janus':
      return new JanusProvider({
        serverUrl: config.serverUrl,
        roomId: config.roomId,
        secret: config.secret,
        displayName: config.displayName,
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
 * Captures the final audio mix from masterGainNode via MediaStreamDestination
 * and publishes it to an SFU server via the configured provider.
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

    // Create MediaStreamDestination to capture the full mix
    const ctx = masterGainNode.context as AudioContext
    const dest = ctx.createMediaStreamDestination()
    masterGainNode.connect(dest)
    destRef.current = dest

    const track = dest.stream.getAudioTracks()[0]
    if (!track) {
      throw new Error('No audio track from MediaStreamDestination')
    }

    // Create and configure the SFU provider
    const provider = createProvider(config)
    providerRef.current = provider

    const roomName = config.provider === 'janus' ? `Room ${config.roomId}` : config.serverUrl

    provider.onStateChange((state) => {
      setStreamStatus({
        connectionState: state,
        serverUrl: config.serverUrl,
        roomName,
        participantCount: useBroadcasterStore.getState().streamStatus.participantCount,
        uptimeSec: useBroadcasterStore.getState().streamStatus.uptimeSec,
      })
    })

    provider.onParticipantCount((count) => {
      const current = useBroadcasterStore.getState().streamStatus
      setStreamStatus({ ...current, participantCount: count })
    })

    // Connect to the SFU
    await provider.connect(track)

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
