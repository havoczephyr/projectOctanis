import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import {
  type OctanisProjectFile,
  type OctanisProject,
  type Track,
  type Clip,
  type EnvelopePoint,
  type FadeHandle,
  type LoopRegion,
  type AudioFile,
  defaultClip,
  defaultTrack,
  defaultFadeHandle,
  pickTrackColor,
} from '@octanis/shared'

function newProject(): OctanisProjectFile {
  const now = new Date().toISOString()
  return {
    project: {
      version: '1.0',
      meta: { title: 'Untitled Project', author: '', createdAt: now, updatedAt: now },
      bpm: 120,
      timeSignature: [4, 4],
      durationSec: 120,
      masterVolume: 1.0,
      tracks: [],
    },
    audioFiles: {},
  }
}

interface ProjectState {
  projectFile: OctanisProjectFile
  currentFilePath: string | null
  isDirty: boolean

  // Project-level
  setProject: (projectFile: OctanisProjectFile, filePath?: string) => void
  setFilePath: (path: string) => void
  markClean: () => void
  updateProjectMeta: (meta: Partial<OctanisProject['meta']>) => void
  setMasterVolume: (vol: number) => void
  setBpm: (bpm: number) => void
  setDuration: (sec: number) => void

  // Audio file registry
  addAudioFile: (file: AudioFile) => void

  // Track operations
  addTrack: (name?: string) => string
  removeTrack: (trackId: string) => void
  updateTrack: (trackId: string, patch: Partial<Omit<Track, 'id' | 'clips'>>) => void
  reorderTracks: (fromIndex: number, toIndex: number) => void

  // Clip operations
  addClip: (trackId: string, audioFileId: string, startSec: number) => string
  removeClip: (trackId: string, clipId: string) => void
  updateClip: (trackId: string, clipId: string, patch: Partial<Omit<Clip, 'id'>>) => void
  moveClip: (trackId: string, clipId: string, newStartSec: number) => void
  moveClipToTrack: (fromTrackId: string, clipId: string, toTrackId: string, newStartSec: number) => void

  // Envelope
  upsertEnvelopePoint: (trackId: string, clipId: string, point: EnvelopePoint) => void
  removeEnvelopePoint: (trackId: string, clipId: string, timeSec: number) => void

  // Fades
  setFadeIn: (trackId: string, clipId: string, fade: Partial<FadeHandle>) => void
  setFadeOut: (trackId: string, clipId: string, fade: Partial<FadeHandle>) => void

  // Loop
  setLoop: (trackId: string, clipId: string, loop: LoopRegion | null) => void
}

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector(
    immer((set) => ({
      projectFile: newProject(),
      currentFilePath: null,
      isDirty: false,

      setProject: (projectFile, filePath) =>
        set((state) => {
          state.projectFile = projectFile
          state.currentFilePath = filePath ?? null
          state.isDirty = false
        }),

      setFilePath: (path) =>
        set((state) => {
          state.currentFilePath = path
        }),

      markClean: () =>
        set((state) => {
          state.isDirty = false
        }),

      updateProjectMeta: (meta) =>
        set((state) => {
          Object.assign(state.projectFile.project.meta, meta)
          state.isDirty = true
        }),

      setMasterVolume: (vol) =>
        set((state) => {
          state.projectFile.project.masterVolume = vol
          state.isDirty = true
        }),

      setBpm: (bpm) =>
        set((state) => {
          state.projectFile.project.bpm = bpm
          state.isDirty = true
        }),

      setDuration: (sec) =>
        set((state) => {
          state.projectFile.project.durationSec = sec
          state.isDirty = true
        }),

      addAudioFile: (file) =>
        set((state) => {
          console.debug('[Octanis:DnD] addAudioFile', { id: file.id, path: file.absolutePath, durationSec: file.durationSec })
          state.projectFile.audioFiles[file.id] = file
          state.isDirty = true
        }),

      addTrack: (name) => {
        const id = nanoid()
        set((state) => {
          const idx = state.projectFile.project.tracks.length
          const trackName = name ?? `Track ${idx + 1}`
          console.debug('[Octanis:DnD] addTrack', { id, name: trackName, index: idx })
          state.projectFile.project.tracks.push(
            defaultTrack(id, trackName, pickTrackColor(idx))
          )
          state.isDirty = true
        })
        return id
      },

      removeTrack: (trackId) =>
        set((state) => {
          const tracks = state.projectFile.project.tracks
          const idx = tracks.findIndex((t) => t.id === trackId)
          if (idx !== -1) tracks.splice(idx, 1)
          state.isDirty = true
        }),

      updateTrack: (trackId, patch) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          if (track) {
            Object.assign(track, patch)
            state.isDirty = true
          }
        }),

      reorderTracks: (fromIndex, toIndex) =>
        set((state) => {
          const tracks = state.projectFile.project.tracks
          const [moved] = tracks.splice(fromIndex, 1)
          tracks.splice(toIndex, 0, moved)
          state.isDirty = true
        }),

      addClip: (trackId, audioFileId, startSec) => {
        const id = nanoid()
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          console.debug('[Octanis:DnD] addClip', { clipId: id, trackId, audioFileId, startSec, trackFound: !!track })
          if (track) {
            const clip = defaultClip(audioFileId, id)
            clip.startSec = startSec
            track.clips.push(clip)
            state.isDirty = true
          }
        })
        return id
      },

      removeClip: (trackId, clipId) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          if (track) {
            const idx = track.clips.findIndex((c) => c.id === clipId)
            if (idx !== -1) track.clips.splice(idx, 1)
            state.isDirty = true
          }
        }),

      updateClip: (trackId, clipId, patch) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (clip) {
            Object.assign(clip, patch)
            state.isDirty = true
          }
        }),

      moveClip: (trackId, clipId, newStartSec) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (clip) {
            clip.startSec = Math.max(0, newStartSec)
            state.isDirty = true
          }
        }),

      moveClipToTrack: (fromTrackId, clipId, toTrackId, newStartSec) =>
        set((state) => {
          const tracks = state.projectFile.project.tracks
          const fromTrack = tracks.find((t) => t.id === fromTrackId)
          const toTrack = tracks.find((t) => t.id === toTrackId)
          if (!fromTrack || !toTrack) return
          const idx = fromTrack.clips.findIndex((c) => c.id === clipId)
          if (idx === -1) return
          const [clip] = fromTrack.clips.splice(idx, 1)
          clip.startSec = Math.max(0, newStartSec)
          toTrack.clips.push(clip)
          state.isDirty = true
        }),

      upsertEnvelopePoint: (trackId, clipId, point) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return
          const existing = clip.envelope.findIndex(
            (p) => Math.abs(p.timeSec - point.timeSec) < 0.001
          )
          if (existing !== -1) {
            clip.envelope[existing] = point
          } else {
            clip.envelope.push(point)
            clip.envelope.sort((a, b) => a.timeSec - b.timeSec)
          }
          state.isDirty = true
        }),

      removeEnvelopePoint: (trackId, clipId, timeSec) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return
          const idx = clip.envelope.findIndex((p) => Math.abs(p.timeSec - timeSec) < 0.001)
          if (idx !== -1) clip.envelope.splice(idx, 1)
          state.isDirty = true
        }),

      setFadeIn: (trackId, clipId, fade) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (clip) {
            Object.assign(clip.fadeIn, fade)
            state.isDirty = true
          }
        }),

      setFadeOut: (trackId, clipId, fade) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (clip) {
            Object.assign(clip.fadeOut, fade)
            state.isDirty = true
          }
        }),

      setLoop: (trackId, clipId, loop) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (clip) {
            clip.loop = loop
            state.isDirty = true
          }
        }),
    }))
  )
)
