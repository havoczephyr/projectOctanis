import { useState, useEffect, useRef } from 'react'
import { useBroadcasterStore } from '../store/broadcasterStore'
import { useFavoritesStore } from '../store/favoritesStore'
import type { SfuConfig } from '../../../ipcTypes'

interface SfuConfigModalProps {
  open: boolean
  onClose: () => void
}

type Provider = 'cosmic' | 'janus'

export function SfuConfigModal({ open, onClose }: SfuConfigModalProps): JSX.Element | null {
  const sfuConfig = useBroadcasterStore((s) => s.sfuConfig)
  const setSfuConfig = useBroadcasterStore((s) => s.setSfuConfig)
  const favorites = useFavoritesStore((s) => s.favorites)
  const addFavorite = useFavoritesStore((s) => s.addFavorite)
  const removeFavorite = useFavoritesStore((s) => s.removeFavorite)
  const backdropRef = useRef<HTMLDivElement>(null)

  const [provider, setProvider] = useState<Provider>('cosmic')
  const [serverUrl, setServerUrl] = useState('')
  const [displayName, setDisplayName] = useState('')

  // Cosmic fields
  const [accessKey, setAccessKey] = useState('')

  // Janus fields
  const [roomId, setRoomId] = useState('')
  const [secret, setSecret] = useState('')

  // Favorites UI state
  const [savingFavorite, setSavingFavorite] = useState(false)
  const [favoriteLabel, setFavoriteLabel] = useState('')

  const filteredFavorites = favorites.filter((f) => f.provider === provider)

  // Sync form with store when modal opens
  useEffect(() => {
    if (open && sfuConfig) {
      setProvider(sfuConfig.provider)
      setServerUrl(sfuConfig.serverUrl)
      setDisplayName(sfuConfig.displayName ?? '')
      if (sfuConfig.provider === 'cosmic') {
        setAccessKey(sfuConfig.accessKey)
      } else {
        setRoomId(String(sfuConfig.roomId))
        setSecret(sfuConfig.secret ?? '')
      }
    }
  }, [open, sfuConfig])

  // Reset favorite save state when modal closes or provider changes
  useEffect(() => {
    setSavingFavorite(false)
    setFavoriteLabel('')
  }, [open, provider])

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

  const isCosmicValid = serverUrl && /^[0-9a-fA-F]{32}$/.test(accessKey)
  const isJanusValid = serverUrl && roomId && !isNaN(Number(roomId))
  const canSave = provider === 'cosmic' ? isCosmicValid : isJanusValid

  const handleSave = (): void => {
    let config: SfuConfig
    if (provider === 'cosmic') {
      if (!isCosmicValid) return
      config = {
        provider: 'cosmic',
        serverUrl,
        accessKey,
        displayName: displayName || undefined,
      }
    } else {
      if (!isJanusValid) return
      config = {
        provider: 'janus',
        serverUrl,
        roomId: Number(roomId),
        secret: secret || undefined,
        displayName: displayName || undefined,
      }
    }
    setSfuConfig(config)
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

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 26,
    fontSize: 10,
    letterSpacing: '0.08em',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    background: active ? 'var(--accent-cyan)' : 'var(--bg-input)',
    color: active ? 'var(--bg-primary)' : 'var(--text-dim)',
    transition: 'background 0.15s, color 0.15s',
  })

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
          STREAM CONNECTION
        </div>

        {/* Provider toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={toggleStyle(provider === 'cosmic')} onClick={() => setProvider('cosmic')}>
            COSMIC
          </button>
          <button style={toggleStyle(provider === 'janus')} onClick={() => setProvider('janus')}>
            JANUS
          </button>
        </div>

        {/* Favorites list */}
        {filteredFavorites.length > 0 && (
          <div>
            <div style={labelStyle}>FAVORITES</div>
            <div
              style={{
                maxHeight: 120,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {filteredFavorites.map((fav) => (
                <div
                  key={fav.id}
                  onClick={() => {
                    setServerUrl(fav.serverUrl)
                    if (fav.displayName) setDisplayName(fav.displayName)
                    if (fav.provider === 'janus' && fav.roomId != null) {
                      setRoomId(String(fav.roomId))
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-cyan)'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'
                  }}
                >
                  <span style={{ color: 'var(--accent-cyan)', flexShrink: 0 }}>★</span>
                  <span style={{ flexShrink: 0, color: 'var(--text-secondary)' }}>{fav.label}</span>
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--text-dim)',
                      fontSize: 9,
                    }}
                  >
                    {fav.serverUrl}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFavorite(fav.id)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '0 2px',
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                    title="Remove favorite"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Server URL — shared */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={labelStyle}>SERVER URL</div>
            {!savingFavorite && (
              <button
                onClick={() => {
                  try {
                    const hostname = new URL(serverUrl).hostname
                    setFavoriteLabel(hostname)
                  } catch {
                    setFavoriteLabel(serverUrl)
                  }
                  setSavingFavorite(true)
                }}
                disabled={!serverUrl.trim()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: serverUrl.trim() ? 'var(--accent-cyan)' : 'var(--text-dim)',
                  cursor: serverUrl.trim() ? 'pointer' : 'default',
                  fontSize: 11,
                  padding: 0,
                  lineHeight: 1,
                  opacity: serverUrl.trim() ? 1 : 0.4,
                }}
                title="Save to favorites"
              >
                ☆ SAVE
              </button>
            )}
          </div>
          {savingFavorite && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input
                type="text"
                placeholder="Label"
                value={favoriteLabel}
                onChange={(e) => setFavoriteLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && favoriteLabel.trim()) {
                    addFavorite({
                      provider,
                      label: favoriteLabel.trim(),
                      serverUrl: serverUrl.trim(),
                      roomId: provider === 'janus' && roomId ? Number(roomId) : undefined,
                      displayName: displayName || undefined,
                    })
                    setSavingFavorite(false)
                    setFavoriteLabel('')
                  } else if (e.key === 'Escape') {
                    setSavingFavorite(false)
                  }
                }}
                style={{ ...inputStyle, flex: 1 }}
                autoFocus
              />
              <button
                className="btn"
                onClick={() => {
                  if (!favoriteLabel.trim()) return
                  addFavorite({
                    provider,
                    label: favoriteLabel.trim(),
                    serverUrl: serverUrl.trim(),
                    roomId: provider === 'janus' && roomId ? Number(roomId) : undefined,
                    displayName: displayName || undefined,
                  })
                  setSavingFavorite(false)
                  setFavoriteLabel('')
                }}
                disabled={!favoriteLabel.trim()}
                style={{ height: 26, fontSize: 9, padding: '0 8px' }}
              >
                ★ ADD
              </button>
              <button
                className="btn"
                onClick={() => setSavingFavorite(false)}
                style={{ height: 26, fontSize: 9, padding: '0 6px' }}
              >
                ✕
              </button>
            </div>
          )}
          <input
            type="text"
            placeholder={provider === 'cosmic' ? 'wss://cosmic.example.com' : 'wss://server/janus'}
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            style={inputStyle}
            autoFocus={!savingFavorite}
          />
        </div>

        {/* Provider-specific fields */}
        {provider === 'cosmic' ? (
          <div>
            <div style={labelStyle}>ACCESS KEY</div>
            <input
              type="text"
              placeholder="32-character hex key"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}
              maxLength={32}
            />
          </div>
        ) : (
          <>
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
          </>
        )}

        {/* Display name — shared */}
        <div>
          <div style={labelStyle}>DISPLAY NAME</div>
          <input
            type="text"
            placeholder="DJ Name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={!canSave}
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
