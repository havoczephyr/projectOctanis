import { ipcRenderer } from 'electron'
import type { OctanisProjectFile } from '@octanis/shared'
import type { PeakOpts, PeaksResult, DecodeAudioResult } from '../ipcTypes'

export const broadcasterApi = {
  project: {
    open: (): Promise<{ projectFile: OctanisProjectFile; filePath: string } | null> =>
      ipcRenderer.invoke('project:open'),
    openByPath: (filePath: string): Promise<OctanisProjectFile | null> =>
      ipcRenderer.invoke('project:openByPath', filePath),
  },
  ffmpeg: {
    extractPeaks: (audioPath: string, opts: PeakOpts): Promise<PeaksResult> =>
      ipcRenderer.invoke('ffmpeg:extractPeaks', audioPath, opts),
    decodeAudioFile: (
      audioPath: string,
      sampleRate?: number,
      channels?: number
    ): Promise<DecodeAudioResult> =>
      ipcRenderer.invoke('ffmpeg:decodeAudioFile', audioPath, sampleRate, channels),
  },
  rtp: {
    start: (config: {
      host: string
      port: number
      sampleRate?: number
      channels?: number
      frameDurationMs?: number
    }): Promise<void> => ipcRenderer.invoke('rtp:start', config),
    sendFrame: (frame: ArrayBuffer): void => {
      ipcRenderer.send('rtp:send-frame', frame)
    },
    stop: (): Promise<void> => ipcRenderer.invoke('rtp:stop'),
  },
  menu: {
    onFileOpen: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:file-open', handler)
      return () => { ipcRenderer.removeListener('menu:file-open', handler) }
    },
    onToggleLeftCabinet: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:toggle-left-cabinet', handler)
      return () => { ipcRenderer.removeListener('menu:toggle-left-cabinet', handler) }
    },
    onToggleRightCabinet: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:toggle-right-cabinet', handler)
      return () => { ipcRenderer.removeListener('menu:toggle-right-cabinet', handler) }
    },
  },
}

export type BroadcasterAPI = typeof broadcasterApi
