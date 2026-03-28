import { useState, useEffect, useCallback } from 'react'
import { useUiStore } from './store/uiStore'
import { useBroadcasterStore } from './store/broadcasterStore'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useWebRTCPublisher } from './hooks/useWebRTCPublisher'
import { Spectrograph } from './components/Spectrograph'
import { ControlPanel } from './components/ControlPanel'
import { SfuConfigModal } from './components/SfuConfigModal'
import { WaveformPanel } from './components/WaveformPanel'
import { useMicrophone } from './hooks/useMicrophone'
import { VolumeOverlay } from './components/VolumeOverlay'

export default function App(): JSX.Element {
  const theme = useUiStore((s) => s.theme)
  const uiIntensity = useUiStore((s) => s.uiIntensity)
  const leftOpen = useUiStore((s) => s.leftCabinetOpen)
  const rightOpen = useUiStore((s) => s.rightCabinetOpen)
  const toggleLeft = useUiStore((s) => s.toggleLeftCabinet)
  const toggleRight = useUiStore((s) => s.toggleRightCabinet)
  const transportState = useBroadcasterStore((s) => s.transportState)
  const projectFile = useBroadcasterStore((s) => s.projectFile)
  const setProject = useBroadcasterStore((s) => s.setProject)
  const streamStatus = useBroadcasterStore((s) => s.streamStatus)
  const playheadSec = useBroadcasterStore((s) => s.playheadSec)
  const play = useBroadcasterStore((s) => s.play)
  const pause = useBroadcasterStore((s) => s.pause)
  const stop = useBroadcasterStore((s) => s.stop)

  const [configOpen, setConfigOpen] = useState(false)

  const { analyser, musicGainNode, masterGainNode } = useAudioEngine()
  useMicrophone(musicGainNode, masterGainNode)
  const { connect: sfuConnect, disconnect: sfuDisconnect } = useWebRTCPublisher(masterGainNode)

  // Connect using stored config
  const handleConnect = useCallback(async () => {
    const config = useBroadcasterStore.getState().sfuConfig
    if (!config) return
    await sfuConnect(config)
  }, [sfuConnect])

  // Sync theme + intensity to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  useEffect(() => {
    document.documentElement.setAttribute('data-ui-intensity', uiIntensity)
  }, [uiIntensity])

  // Menu event listeners
  const handleFileOpen = useCallback(async () => {
    const result = await window.octanis.project.open()
    if (result) setProject(result.projectFile, result.filePath)
  }, [setProject])

  useEffect(() => {
    const unsubs = [
      window.octanis.menu.onFileOpen(handleFileOpen),
      window.octanis.menu.onToggleLeftCabinet(toggleLeft),
      window.octanis.menu.onToggleRightCabinet(toggleRight),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [handleFileOpen, toggleLeft, toggleRight])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !e.metaKey && !e.ctrlKey && !configOpen) {
        e.preventDefault()
        if (transportState === 'playing') pause()
        else if (projectFile) play()
      }
      if (e.code === 'Escape') {
        stop()
      }
      if (e.code === 'ArrowUp') {
        e.preventDefault()
        const cur = useBroadcasterStore.getState().masterVolume
        useBroadcasterStore.getState().setMasterVolume(cur + 1 / 16)
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault()
        const cur = useBroadcasterStore.getState().masterVolume
        useBroadcasterStore.getState().setMasterVolume(cur - 1 / 16)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [transportState, projectFile, play, pause, stop, configOpen])

  const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const totalDuration = projectFile?.project?.durationSec ?? 0

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ─── Title Bar (drag region) ─── */}
      <div
        style={{
          height: 38,
          WebkitAppRegion: 'drag' as unknown as string,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          paddingLeft: 80,
          paddingRight: 12,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-deep)',
        }}
      >
        <span className="glow-text" style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Octanis Broadcaster
        </span>
      </div>

      {/* ─── Main Content ─── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          overflow: 'hidden',
          padding: '12px 8px',
        }}
      >
        {/* Left Cabinet */}
        <div className="cabinet cabinet--left" style={{ width: leftOpen ? 200 : 0, flexShrink: 0, transition: 'width 0.4s ease' }}>
          <div className="cabinet-content">
            <div className="glow-text" style={{ fontSize: 10, marginBottom: 8, letterSpacing: '0.1em' }}>
              CONTROLS
            </div>
            <ControlPanel
              onConnect={handleConnect}
              onDisconnect={sfuDisconnect}
              onOpenConfig={() => setConfigOpen(true)}
            />
          </div>
        </div>

        {/* Left cabinet handle */}
        <div
          className="cabinet-handle cabinet-handle--left"
          onClick={toggleLeft}
          style={{ alignSelf: 'center', position: 'relative', zIndex: 10 }}
          title="Toggle Controls (Cmd+[)"
        >
          ◀
        </div>

        {/* Left Speaker */}
        <div className="speaker speaker--left" style={{ width: 80, flexShrink: 0 }}>
          <div className="speaker-cone" style={{ position: 'relative' }}>
            <div className="speaker-cap" />
            <div className="speaker-grille" />
          </div>
          <div className="speaker-cone" style={{ width: '50%', position: 'relative' }}>
            <div className="speaker-cap" />
          </div>
          <SpeakerScrews />
        </div>

        {/* CRT Monitor */}
        <div className="crt-monitor" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div className="crt-grain" />
          {/* Spectrograph */}
          <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
            <Spectrograph analyser={analyser} transportState={transportState} />
            {!projectFile && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2,
              }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                  No project loaded — Cmd+O to open
                </div>
              </div>
            )}
            {projectFile && (
              <div style={{
                position: 'absolute', top: 12, left: 0, right: 0,
                textAlign: 'center', zIndex: 2, pointerEvents: 'none',
              }}>
                <div className="glow-text--green" style={{ fontSize: 13, letterSpacing: '0.1em' }}>
                  {projectFile.project.meta.title || 'Untitled'}
                </div>
              </div>
            )}
          </div>
          {/* Volume OSD */}
          <VolumeOverlay />
          {/* Power LED */}
          <div className={`crt-led crt-led--${transportState}`} />
        </div>

        {/* Right Speaker */}
        <div className="speaker speaker--right" style={{ width: 80, flexShrink: 0 }}>
          <div className="speaker-cone" style={{ position: 'relative' }}>
            <div className="speaker-cap" />
            <div className="speaker-grille" />
          </div>
          <div className="speaker-cone" style={{ width: '50%', position: 'relative' }}>
            <div className="speaker-cap" />
          </div>
          <SpeakerScrews />
        </div>

        {/* Right cabinet handle */}
        <div
          className="cabinet-handle cabinet-handle--right"
          onClick={toggleRight}
          style={{ alignSelf: 'center', position: 'relative', zIndex: 10 }}
          title="Toggle Waveforms (Cmd+])"
        >
          ▶
        </div>

        {/* Right Cabinet */}
        <div className="cabinet cabinet--right" style={{ width: rightOpen ? 220 : 0, flexShrink: 0, transition: 'width 0.4s ease' }}>
          <div className="cabinet-content">
            <div className="glow-text" style={{ fontSize: 10, marginBottom: 8, letterSpacing: '0.1em' }}>
              WAVEFORMS
            </div>
            <WaveformPanel />
          </div>
        </div>
      </div>

      {/* ─── Status Bar ─── */}
      <div
        style={{
          height: 36,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '0 16px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-deep)',
          fontSize: 11,
        }}
      >
        {/* Transport */}
        <div style={{ display: 'flex', gap: 4, WebkitAppRegion: 'no-drag' as unknown as string }}>
          <button
            className={`btn btn--icon${transportState === 'playing' ? ' btn--primary' : ''}`}
            title="Play (Space)"
            onClick={() => projectFile && play()}
          >
            ▶
          </button>
          <button
            className={`btn btn--icon${transportState === 'paused' ? ' btn--primary' : ''}`}
            title="Pause (Space)"
            onClick={pause}
          >
            ⏸
          </button>
          <button className="btn btn--icon" title="Stop (Esc)" onClick={stop}>
            ⏹
          </button>
        </div>

        {/* Time */}
        <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(playheadSec)} / {formatTime(totalDuration)}
        </span>

        <div style={{ flex: 1 }} />

        {/* SFU status */}
        {streamStatus.connectionState === 'connected' ? (
          <span className="glow-text--green" style={{ fontSize: 10 }}>
            ● CONNECTED &nbsp; {streamStatus.roomName} &nbsp; {streamStatus.participantCount} participant{streamStatus.participantCount !== 1 ? 's' : ''}
          </span>
        ) : streamStatus.connectionState === 'connecting' || streamStatus.connectionState === 'reconnecting' ? (
          <span style={{ color: 'var(--accent-cyan)', fontSize: 10 }}>
            ◌ {streamStatus.connectionState === 'connecting' ? 'CONNECTING...' : 'RECONNECTING...'}
          </span>
        ) : streamStatus.connectionState === 'failed' ? (
          <span style={{ color: 'var(--accent-pink)', fontSize: 10 }}>
            ✕ FAILED
          </span>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>
            ○ OFFLINE
          </span>
        )}
      </div>

      {/* ─── SFU Config Modal ─── */}
      <SfuConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}

/** Corner screws for speaker panel */
function SpeakerScrews(): JSX.Element {
  const positions = [
    { top: 6, left: 6 },
    { top: 6, right: 6 },
    { bottom: 6, left: 6 },
    { bottom: 6, right: 6 },
  ]
  return (
    <>
      {positions.map((pos, i) => (
        <div key={i} className="speaker-screw" style={pos as React.CSSProperties} />
      ))}
    </>
  )
}
