import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import styles from './AudioRecorder.module.css'

type RecorderState = 'idle' | 'countdown' | 'recording' | 'review'
type AudioFormat = 'wav' | 'mp3' | 'flac' | 'm4a'

const FORMAT_EXTENSIONS: Record<AudioFormat, string> = {
  wav: 'wav',
  mp3: 'mp3',
  flac: 'flac',
  m4a: 'm4a',
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`
}

export function AudioRecorder(): React.ReactElement {
  const closeRecorder = useUiStore((s) => s.closeRecorder)
  const addAudioFile = useProjectStore((s) => s.addAudioFile)

  const [state, setState] = useState<RecorderState>('idle')
  const [countdownValue, setCountdownValue] = useState(0)
  const [preFireTimer, setPreFireTimer] = useState(3)
  const [format, setFormat] = useState<AudioFormat>('wav')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [voiceProcessing, setVoiceProcessing] = useState(false)

  // Review playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackPos, setPlaybackPos] = useState(0)
  const [reviewDuration, setReviewDuration] = useState(0)

  // Refs for audio recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Review playback refs
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const reviewBlobUrlRef = useRef<string | null>(null)
  const reviewCanvasDataRef = useRef<Float32Array | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicStream()
      cancelAnimationFrame(rafRef.current)
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
      if (reviewBlobUrlRef.current) URL.revokeObjectURL(reviewBlobUrlRef.current)
      if (reviewAudioRef.current) {
        reviewAudioRef.current.pause()
        reviewAudioRef.current = null
      }
    }
  }, [])

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        if (state === 'recording') {
          handleStop()
        } else if (state === 'countdown') {
          setState('idle')
        } else {
          handleClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state])

  function stopMicStream(): void {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    analyserRef.current = null
  }

  function handleClose(): void {
    stopMicStream()
    cancelAnimationFrame(rafRef.current)
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
    if (reviewAudioRef.current) reviewAudioRef.current.pause()
    closeRecorder()
  }

  // ─── Recording Flow ────────────────────────────────────────────────────────

  async function handleRecord(): Promise<void> {
    setError(null)
    chunksRef.current = []

    if (preFireTimer > 0) {
      setState('countdown')
      for (let i = preFireTimer; i > 0; i--) {
        setCountdownValue(i)
        await new Promise((r) => setTimeout(r, 1000))
      }
      setCountdownValue(0)
    }

    // Request mic access
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: voiceProcessing,
          noiseSuppression: voiceProcessing,
          autoGainControl: voiceProcessing,
        },
      })
    } catch {
      setError('Microphone access denied')
      setState('idle')
      return
    }
    streamRef.current = stream

    // Set up analyser for live waveform
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    analyserRef.current = analyser

    // Start MediaRecorder
    const recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start(100)
    mediaRecorderRef.current = recorder

    setState('recording')
    startTimeRef.current = performance.now()
    setElapsed(0)

    // Elapsed timer
    elapsedIntervalRef.current = setInterval(() => {
      setElapsed((performance.now() - startTimeRef.current) / 1000)
    }, 100)

    // Start live waveform drawing
    drawLiveWaveform()
  }

  function drawLiveWaveform(): void {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    const data = new Uint8Array(analyser.frequencyBinCount)

    function draw(): void {
      if (!analyserRef.current) return
      rafRef.current = requestAnimationFrame(draw)
      analyserRef.current.getByteTimeDomainData(data)

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.clearRect(0, 0, w, h)

      // Center line
      ctx!.strokeStyle = 'rgba(255, 51, 102, 0.15)'
      ctx!.lineWidth = 1
      ctx!.beginPath()
      ctx!.moveTo(0, h / 2)
      ctx!.lineTo(w, h / 2)
      ctx!.stroke()

      // Waveform
      ctx!.strokeStyle = '#ff3366'
      ctx!.lineWidth = 1.5
      ctx!.beginPath()
      const sliceWidth = w / data.length
      let x = 0
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0
        const y = (v * h) / 2
        if (i === 0) ctx!.moveTo(x, y)
        else ctx!.lineTo(x, y)
        x += sliceWidth
      }
      ctx!.stroke()
    }

    draw()
  }

  function handleStop(): void {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current)
      elapsedIntervalRef.current = null
    }
    cancelAnimationFrame(rafRef.current)
    stopMicStream()

    // Wait a tick for the last ondataavailable to fire, then enter review
    setTimeout(() => {
      prepareReview()
    }, 200)
  }

  // ─── Review Flow ───────────────────────────────────────────────────────────

  function prepareReview(): void {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) {
      setError('No audio recorded')
      setState('idle')
      return
    }

    // Revoke previous blob URL
    if (reviewBlobUrlRef.current) URL.revokeObjectURL(reviewBlobUrlRef.current)
    const url = URL.createObjectURL(blob)
    reviewBlobUrlRef.current = url

    // Create audio element for playback
    const audio = new Audio(url)
    reviewAudioRef.current = audio
    audio.addEventListener('loadedmetadata', () => {
      setReviewDuration(audio.duration)
    })
    audio.addEventListener('ended', () => {
      setIsPlaying(false)
      setPlaybackPos(0)
    })

    // Decode for waveform display
    const reader = new FileReader()
    reader.onload = async (): Promise<void> => {
      try {
        const audioCtx = new AudioContext()
        const buffer = await audioCtx.decodeAudioData(reader.result as ArrayBuffer)
        const channelData = buffer.getChannelData(0)
        reviewCanvasDataRef.current = channelData
        audioCtx.close()
        drawReviewWaveform(channelData, 0)
      } catch {
        // Waveform draw failed, still allow playback
      }
    }
    reader.readAsArrayBuffer(blob)

    setState('review')
    setPlaybackPos(0)
    setIsPlaying(false)
  }

  function drawReviewWaveform(channelData: Float32Array, playbackFrac: number): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Draw waveform
    const mid = h / 2
    const samplesPerPixel = Math.max(1, Math.floor(channelData.length / w))

    for (let px = 0; px < w; px++) {
      const start = px * samplesPerPixel
      const end = Math.min(start + samplesPerPixel, channelData.length)
      let min = 0
      let max = 0
      for (let i = start; i < end; i++) {
        if (channelData[i] < min) min = channelData[i]
        if (channelData[i] > max) max = channelData[i]
      }

      const isPast = px / w <= playbackFrac
      ctx.fillStyle = isPast ? 'rgba(0, 255, 204, 0.8)' : 'rgba(0, 255, 204, 0.35)'
      const yTop = mid - max * mid
      const yBot = mid - min * mid
      ctx.fillRect(px, yTop, 1, Math.max(1, yBot - yTop))
    }

    // Center line
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, mid)
    ctx.lineTo(w, mid)
    ctx.stroke()

    // Playhead
    if (playbackFrac > 0) {
      const px = playbackFrac * w
      ctx.strokeStyle = 'rgba(255, 51, 102, 0.9)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
      ctx.stroke()
    }
  }

  // Update review waveform during playback
  useEffect(() => {
    if (state !== 'review' || !isPlaying) return
    let running = true
    function tick(): void {
      if (!running) return
      const audio = reviewAudioRef.current
      if (audio && !audio.paused) {
        const frac = audio.duration > 0 ? audio.currentTime / audio.duration : 0
        setPlaybackPos(audio.currentTime)
        if (reviewCanvasDataRef.current) {
          drawReviewWaveform(reviewCanvasDataRef.current, frac)
        }
      }
      requestAnimationFrame(tick)
    }
    tick()
    return () => { running = false }
  }, [state, isPlaying])

  function togglePlayback(): void {
    const audio = reviewAudioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play()
      setIsPlaying(true)
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>): void {
    const audio = reviewAudioRef.current
    if (!audio) return
    const val = parseFloat(e.target.value)
    audio.currentTime = val
    setPlaybackPos(val)
    if (reviewCanvasDataRef.current && reviewDuration > 0) {
      drawReviewWaveform(reviewCanvasDataRef.current, val / reviewDuration)
    }
  }

  function handleReRecord(): void {
    if (reviewAudioRef.current) {
      reviewAudioRef.current.pause()
      reviewAudioRef.current = null
    }
    if (reviewBlobUrlRef.current) {
      URL.revokeObjectURL(reviewBlobUrlRef.current)
      reviewBlobUrlRef.current = null
    }
    reviewCanvasDataRef.current = null
    setElapsed(0)
    setPlaybackPos(0)
    setReviewDuration(0)
    setState('idle')
  }

  // ─── Save to Project ───────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) return

    const currentFilePath = useProjectStore.getState().currentFilePath
    if (!currentFilePath) {
      setError('Save the project first before recording audio')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const buffer = await blob.arrayBuffer()
      const projectDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
      const ext = FORMAT_EXTENSIONS[format]
      const filename = `recording-${Date.now()}.${ext}`
      const outputPath = `${projectDir}/audio/${filename}`

      const audioFile = await window.octanis.ffmpeg.encodeAudio(buffer, outputPath, format)
      addAudioFile(audioFile)
      handleClose()
    } catch (err) {
      setError(`Encoding failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }, [format, addAudioFile])

  // ─── Render ────────────────────────────────────────────────────────────────

  const isRecording = state === 'recording'
  const isReview = state === 'review'
  const isCountdown = state === 'countdown'
  const isIdle = state === 'idle'

  return (
    <>
      <div className={styles.backdrop} onClick={isRecording ? undefined : handleClose} />
      <div className={`${styles.panel} ${isRecording ? styles['panel--recording'] : ''}`}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={`${styles.recDot} ${isRecording ? styles['recDot--active'] : ''}`} />
            VOICE RECORDER
          </div>
          <button className="btn btn--icon" onClick={handleClose} title="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Waveform / Countdown area */}
          <div className={styles.waveformArea}>
            <canvas ref={canvasRef} className={styles.waveformCanvas} />
            {isCountdown && countdownValue > 0 && (
              <div className={styles.countdown}>
                <div key={countdownValue} className={styles.countdownNumber}>
                  {countdownValue}
                </div>
              </div>
            )}
          </div>

          {/* Side controls */}
          <div className={styles.sideControls}>
            <div className={styles.sideLabel}>PRE-FIRE</div>
            <div className={styles.timerValue}>{preFireTimer}s</div>
            <div className={styles.timerButtons}>
              <button
                className="btn btn--icon"
                onClick={() => setPreFireTimer((v) => Math.min(5, v + 1))}
                disabled={isRecording || isCountdown}
              >
                +
              </button>
              <button
                className="btn btn--icon"
                onClick={() => setPreFireTimer((v) => Math.max(0, v - 1))}
                disabled={isRecording || isCountdown}
              >
                -
              </button>
              <button
                className="btn btn--icon"
                onClick={() => setPreFireTimer(0)}
                disabled={isRecording || isCountdown}
                title="No countdown"
              >
                0
              </button>
            </div>
            <div className={styles.sideLabel} style={{ marginTop: 8 }}>VOICE PROC</div>
            <button
              className={`btn btn--icon ${voiceProcessing ? 'btn--primary' : ''}`}
              onClick={() => setVoiceProcessing((v) => !v)}
              disabled={isRecording || isCountdown}
              title="Echo cancellation, noise suppression, auto gain"
            >
              {voiceProcessing ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {/* Left: elapsed / playback position */}
          <div className={`${styles.elapsed} ${isRecording ? styles['elapsed--recording'] : ''}`}>
            {isReview
              ? `${formatElapsed(playbackPos)} / ${formatElapsed(reviewDuration)}`
              : formatElapsed(elapsed)}
          </div>

          {/* Center: main action button or playback controls */}
          {(isIdle || isCountdown) && (
            <button
              className={styles.recordBtn}
              onClick={handleRecord}
              disabled={isCountdown}
              title="Start recording"
            >
              <div className={styles.recordBtnInner} />
            </button>
          )}

          {isRecording && (
            <button
              className={styles.recordBtn}
              onClick={handleStop}
              title="Stop recording"
            >
              <div className={`${styles.recordBtnInner} ${styles['recordBtnInner--stop']}`} />
            </button>
          )}

          {isReview && (
            <div className={styles.playbackControls}>
              <button className="btn btn--icon" onClick={togglePlayback}>
                {isPlaying ? '||' : '\u25B6'}
              </button>
              <input
                className={styles.scrubBar}
                type="range"
                min={0}
                max={reviewDuration || 1}
                step={0.01}
                value={playbackPos}
                onChange={handleScrub}
              />
            </div>
          )}

          {/* Right: format + actions */}
          <div className={styles.actionRow}>
            {isReview && (
              <button className="btn" onClick={handleReRecord}>
                Re-record
              </button>
            )}
            <select
              className={styles.formatSelect}
              value={format}
              onChange={(e) => setFormat(e.target.value as AudioFormat)}
              disabled={isRecording || isCountdown}
            >
              <option value="wav">WAV</option>
              <option value="mp3">MP3</option>
              <option value="flac">FLAC</option>
              <option value="m4a">M4A</option>
            </select>
            {isReview && (
              <button
                className={`btn ${styles.saveBtn}`}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save to Project'}
              </button>
            )}
          </div>
        </div>

        {/* Status / Error */}
        {error && <div className={`${styles.statusMsg} ${styles['statusMsg--error']}`}>{error}</div>}
      </div>
    </>
  )
}
