import { useState } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'
import { VolumeKnob } from './VolumeKnob'
import type { SfuConnectionState } from '../../../ipcTypes'

const STATE_COLORS: Record<SfuConnectionState, string> = {
  disconnected: 'var(--text-dim)',
  connecting: 'var(--accent-cyan)',
  connected: 'var(--accent-green)',
  reconnecting: 'var(--accent-cyan)',
  failed: 'var(--accent-pink)',
}

const STATE_LABELS: Record<SfuConnectionState, string> = {
  disconnected: 'DISCONNECTED',
  connecting: 'CONNECTING...',
  connected: 'CONNECTED',
  reconnecting: 'RECONNECTING...',
  failed: 'FAILED',
}

interface ControlPanelProps {
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
  onOpenConfig: () => void
}

export function ControlPanel({ onConnect, onDisconnect, onOpenConfig }: ControlPanelProps): JSX.Element {
  const micActive = useBroadcasterStore((s) => s.micActive)
  const setMicActive = useBroadcasterStore((s) => s.setMicActive)
  const micDuckAmount = useBroadcasterStore((s) => s.micDuckAmount)
  const setMicDuckAmount = useBroadcasterStore((s) => s.setMicDuckAmount)
  const streamStatus = useBroadcasterStore((s) => s.streamStatus)
  const sfuConfig = useBroadcasterStore((s) => s.sfuConfig)

  const [busy, setBusy] = useState(false)

  const isConnected = streamStatus.connectionState === 'connected'
  const isActive = streamStatus.connectionState !== 'disconnected' && streamStatus.connectionState !== 'failed'

  const handleToggle = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      if (isActive) {
        await onDisconnect()
      } else {
        await onConnect()
      }
    } catch (err) {
      console.error('[SFU]', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Section: Master Volume */}
      <div>
        <div className="glow-text" style={{ fontSize: 9, marginBottom: 6, letterSpacing: '0.12em' }}>
          MASTER VOLUME
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <VolumeKnob />
        </div>
      </div>

      {/* Separator */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

      {/* Section: Microphone */}
      <div>
        <div className="glow-text" style={{ fontSize: 9, marginBottom: 6, letterSpacing: '0.12em' }}>
          MICROPHONE
        </div>
        <button
          className={`btn${micActive ? ' btn--primary' : ''}`}
          onClick={() => setMicActive(!micActive)}
          style={{
            width: '100%',
            height: 32,
            fontSize: 11,
            position: 'relative',
          }}
        >
          {micActive ? '● MIC ON' : '○ MIC OFF'}
        </button>
        {micActive && (
          <div
            style={{
              marginTop: 4,
              height: 4,
              borderRadius: 2,
              background: 'var(--accent-pink)',
              boxShadow: '0 0 8px var(--accent-pink)',
              animation: 'border-pulse 1.5s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Section: Duck */}
      <div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>
          DUCK AMOUNT
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="range"
            min={0}
            max={99}
            value={Math.round(micDuckAmount * 100)}
            onChange={(e) => setMicDuckAmount(Number(e.target.value) / 100)}
            style={{ flex: 1, accentColor: 'var(--accent-cyan)' }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 10, minWidth: 28, textAlign: 'right' }}>
            {Math.round(micDuckAmount * 100)}%
          </span>
        </div>
      </div>

      {/* Separator */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

      {/* Section: SFU Broadcast */}
      <div>
        <div className="glow-text" style={{ fontSize: 9, marginBottom: 6, letterSpacing: '0.12em' }}>
          BROADCAST
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            className="btn"
            onClick={onOpenConfig}
            disabled={isActive}
            style={{ width: '100%', height: 28, fontSize: 10 }}
          >
            ⚙ CONFIG
          </button>

          <button
            className={`btn${isActive ? '' : ' btn--primary'}`}
            onClick={handleToggle}
            disabled={busy || (!isActive && !sfuConfig)}
            style={{ width: '100%', height: 32, fontSize: 11 }}
          >
            {busy ? '...' : isActive ? '⏹ DISCONNECT' : '▶ CONNECT'}
          </button>
        </div>

        {/* Status */}
        <div style={{ marginTop: 6, fontSize: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: STATE_COLORS[streamStatus.connectionState] }}>●</span>
            <span style={{ color: STATE_COLORS[streamStatus.connectionState] }}>
              {STATE_LABELS[streamStatus.connectionState]}
            </span>
          </div>
          {isConnected && (
            <div style={{ color: 'var(--accent-green)', marginTop: 2 }}>
              {streamStatus.participantCount} participant{streamStatus.participantCount !== 1 ? 's' : ''}
            </div>
          )}
          {sfuConfig && !isActive && (
            <div style={{ color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Room {sfuConfig.roomId}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
