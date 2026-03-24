import { ipcRenderer } from 'electron'
import type { OctanisProjectFile, AudioFile } from '@octanis/shared'
import type { PeakOpts, PeaksResult, FileEntry } from '../ipcTypes'

export const octanisApi = {
  file: {
    open: (): Promise<OctanisProjectFile | null> => ipcRenderer.invoke('file:open'),
    save: (project: OctanisProjectFile, filePath?: string): Promise<string | null> =>
      ipcRenderer.invoke('file:save', project, filePath),
    importAudio: (): Promise<string[] | null> => ipcRenderer.invoke('file:importAudio'),
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('file:openFolder'),
  },
  ffmpeg: {
    extractPeaks: (audioPath: string, opts: PeakOpts): Promise<PeaksResult> =>
      ipcRenderer.invoke('ffmpeg:extractPeaks', audioPath, opts),
    inspectAudio: (audioPath: string): Promise<AudioFile> =>
      ipcRenderer.invoke('ffmpeg:inspectAudio', audioPath),
  },
  fs: {
    readdir: (dirPath: string): Promise<FileEntry[]> =>
      ipcRenderer.invoke('fs:readdir', dirPath),
    readAudioFile: (filePath: string): Promise<ArrayBuffer> =>
      ipcRenderer.invoke('fs:readAudioFile', filePath),
  },
}

export type OctanisAPI = typeof octanisApi
