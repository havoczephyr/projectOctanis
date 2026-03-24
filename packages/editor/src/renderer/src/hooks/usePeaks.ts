import { useEffect } from 'react'
import { usePeaksCache } from '../store/peaksCache'
import { useProjectStore } from '../store/projectStore'
import type { PeaksResult } from '../../../ipcTypes'

export function usePeaks(audioFileId: string): {
  peaks: PeaksResult | undefined
  state: 'idle' | 'loading' | 'ready' | 'error'
} {
  const getPeaks = usePeaksCache((s) => s.getPeaks)
  const getLoadState = usePeaksCache((s) => s.getLoadState)
  const setPeaks = usePeaksCache((s) => s.setPeaks)
  const setLoadState = usePeaksCache((s) => s.setLoadState)
  const audioFiles = useProjectStore((s) => s.projectFile.audioFiles)
  const zoom = 100 // peaks at ~100px/s resolution, always reuse regardless of ui zoom

  useEffect(() => {
    const currentState = getLoadState(audioFileId)
    if (currentState !== 'idle') return

    const audioFile = audioFiles[audioFileId]
    if (!audioFile) return

    setLoadState(audioFileId, 'loading')

    window.octanis.ffmpeg
      .extractPeaks(audioFile.absolutePath, { peaksPerSecond: zoom })
      .then((result) => setPeaks(audioFileId, result))
      .catch((err) => {
        console.error('[usePeaks] failed to extract peaks:', err)
        setLoadState(audioFileId, 'error')
      })
  }, [audioFileId, audioFiles, getLoadState, setPeaks, setLoadState, zoom])

  return {
    peaks: getPeaks(audioFileId),
    state: getLoadState(audioFileId),
  }
}
