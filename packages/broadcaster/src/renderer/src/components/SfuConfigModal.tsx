import { useState, useEffect, useRef } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'

interface SfuConfigModalProps {
  open: boolean
  onClose: () => void
}

export function SfuConfigModal({ open, onClose }: SfuConfigModalProps): JSX.Element | null {
  const sfuConfig = useBroadcasterStore((s) => s.sfuConfig)
  const setSfuConfig = useBroadcasterStore((s) => s.setSfuConfig)
  const backdropRef = useRef<HTMLDivElement>(null)

  const [serverUrl, setServerUrl] = useState('')
  const [roomId, setRoomId] = useState('')
  const [secret, setSecret] = useState('')
  const [displayName, setDisplayName] = useState('')

  // Sync form with store when modal opens
  useEffect(() => {
    if (open && sfuConfig) {
      setServerUrl(sfuConfig.serverUrl)
      setRoomId(String(sfuConfig.roomId))
      setSecret(sfuConfig.secret ?? '')
      setDisplayName(sfuConfig.displayName ?? '')
    }
  }, [open, sfuConfig])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [open, onClose])

  if (!open) return null

  const handleSave = (): void => {
    const parsed = Number(roomId)
    if (!serverUrl || !roomId || isNaN(parsed)) return
    setSfuConfig({
      provider: 'janus',
      serverUrl,
      roomId: parsed,
      secret: secret || undefined,
      displayName: displayName || undefined,
    })
    onClose()
  }

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === backdropRef.current) onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: 11,
    padding: '6px 8px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: 'var(--text-dim)',
    letterSpacing: '0.08em',
    marginBottom: 2,
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        className="panel"
        style={{
          width: 320,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div className="glow-text" style={{ fontSize: 10, letterSpacing: '0.12em', marginBottom: 2 }}>
          SFU CONNECTION
        </div>

        <div>
          <div style={labelStyle}>SERVER URL</div>
          <input
            type="text"
            placeholder="wss://server/janus"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        </div>

        <div>
          <div style={labelStyle}>ROOM ID</div>
          <input
            type="number"
            placeholder="1234"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>SECRET</div>
          <input
            type="password"
            placeholder="Pre-shared secret (optional)"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>DISPLAY NAME</div>
          <input
            type="text"
            placeholder="Broadcaster (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={!serverUrl || !roomId || isNaN(Number(roomId))}
            style={{ flex: 1, height: 30, fontSize: 11 }}
          >
            SAVE
          </button>
          <button
            className="btn"
            onClick={onClose}
            style={{ flex: 1, height: 30, fontSize: 11 }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  )
}
