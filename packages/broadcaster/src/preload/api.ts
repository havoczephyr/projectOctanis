import { ipcRenderer } from 'electron'
import type { OctanisProjectFile } from '@octanis/shared'
import type { PeakOpts, PeaksResult, DecodeAudioResult, StreamConfig, SfuConnectionState } from '../ipcTypes'

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
    start: (config: StreamConfig): Promise<void> =>
      ipcRenderer.invoke('stream:start', config),
    /** Fire-and-forget: send a complete 20ms PCM frame to the worker. */
    sendPcm: (pcm: ArrayBuffer): void => {
      ipcRenderer.send('stream:pcm', pcm)
    },
    stop: (): Promise<void> =>
      ipcRenderer.invoke('stream:stop'),
    onStateChange: (cb: (state: SfuConnectionState) => void): (() => void) => {
      const handler = (_: unknown, state: SfuConnectionState): void => cb(state)
      ipcRenderer.on('stream:state', handler)
      return () => { ipcRenderer.removeListener('stream:state', handler) }
    },
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
