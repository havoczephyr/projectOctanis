import { ipcRenderer } from 'electron'
import type { OctanisProjectFile } from '@octanis/shared'
import type { PeakOpts, PeaksResult, DecodeAudioResult, StreamStatus } from '../ipcTypes'

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
  stream: {
    start: (port: number, format: string): Promise<StreamStatus> =>
      ipcRenderer.invoke('stream:start', port, format),
    stop: (): Promise<StreamStatus> =>
      ipcRenderer.invoke('stream:stop'),
    getStatus: (): Promise<StreamStatus> =>
      ipcRenderer.invoke('stream:getStatus'),
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
  onStreamStatus: (cb: (status: StreamStatus) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, status: StreamStatus): void => cb(status)
    ipcRenderer.on('stream:status', handler)
    return () => { ipcRenderer.removeListener('stream:status', handler) }
  },
}

export type BroadcasterAPI = typeof broadcasterApi
