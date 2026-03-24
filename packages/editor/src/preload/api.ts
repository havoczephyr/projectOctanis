import { ipcRenderer } from 'electron'
import type { OctanisProjectFile, AudioFile } from '@octanis/shared'
import type { PeakOpts, PeaksResult, FileEntry } from '../ipcTypes'

export const octanisApi = {
  file: {
    open: (): Promise<{ projectFile: OctanisProjectFile; filePath: string } | null> =>
      ipcRenderer.invoke('file:open'),
    save: (project: OctanisProjectFile, filePath?: string): Promise<string | null> =>
      ipcRenderer.invoke('file:save', project, filePath),
    importAudio: (): Promise<string[] | null> => ipcRenderer.invoke('file:importAudio'),
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('file:openFolder'),
    createProject: (
      folderPath: string,
      title: string
    ): Promise<{ projectFile: OctanisProjectFile; filePath: string }> =>
      ipcRenderer.invoke('file:createProject', folderPath, title),
    openByPath: (filePath: string): Promise<OctanisProjectFile | null> =>
      ipcRenderer.invoke('file:openByPath', filePath),
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
    copyFile: (source: string, dest: string): Promise<string> =>
      ipcRenderer.invoke('fs:copyFile', source, dest),
  },
  menu: {
    onUndo: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:undo', handler)
      return () => { ipcRenderer.removeListener('menu:undo', handler) }
    },
    onRedo: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:redo', handler)
      return () => { ipcRenderer.removeListener('menu:redo', handler) }
    },
    onUndoHistory: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:undo-history', handler)
      return () => { ipcRenderer.removeListener('menu:undo-history', handler) }
    },
    onFileOpen: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:file-open', handler)
      return () => { ipcRenderer.removeListener('menu:file-open', handler) }
    },
    onFileSave: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:file-save', handler)
      return () => { ipcRenderer.removeListener('menu:file-save', handler) }
    },
    onFileSaveAs: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:file-save-as', handler)
      return () => { ipcRenderer.removeListener('menu:file-save-as', handler) }
    },
    onFileClose: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('menu:file-close', handler)
      return () => { ipcRenderer.removeListener('menu:file-close', handler) }
    },
  },
}

export type OctanisAPI = typeof octanisApi
