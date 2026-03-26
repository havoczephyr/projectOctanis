import { useBroadcasterStore } from '../store/broadcasterStore'

export function ControlPanel(): JSX.Element {
  const micActive = useBroadcasterStore((s) => s.micActive)
  const setMicActive = useBroadcasterStore((s) => s.setMicActive)
  const micDuckAmount = useBroadcasterStore((s) => s.micDuckAmount)
  const setMicDuckAmount = useBroadcasterStore((s) => s.setMicDuckAmount)
  const streamStatus = useBroadcasterStore((s) => s.streamStatus)

  const handleStreamToggle = async (): Promise<void> => {
    if (streamStatus.running) {
      await window.octanis.stream.stop()
    } else {
      await window.octanis.stream.start(8080, 'mp3')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

      {/* Section: Stream */}
      <div>
        <div className="glow-text" style={{ fontSize: 9, marginBottom: 6, letterSpacing: '0.12em' }}>
          HTTP STREAM
        </div>
        <button
          className={`btn${streamStatus.running ? '' : ' btn--primary'}`}
          onClick={handleStreamToggle}
          style={{ width: '100%', height: 32, fontSize: 11 }}
        >
          {streamStatus.running ? '⏹ STOP STREAM' : '▶ START STREAM'}
        </button>
        <div style={{ marginTop: 6, fontSize: 9, color: 'var(--text-dim)' }}>
          <div>Port: {streamStatus.port}</div>
          <div>Format: {streamStatus.format.toUpperCase()}</div>
          {streamStatus.running && (
            <div style={{ color: 'var(--accent-green)', marginTop: 2 }}>
              {streamStatus.listenerCount} listener{streamStatus.listenerCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
