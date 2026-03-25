import { create } from 'zustand'
import { temporal } from 'zundo'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import {
  type OctanisProjectFile,
  type OctanisProject,
  type Track,
  type Clip,
  type FadeRegion,
  type GainControlPoint,
  type LoopRegion,
  type AudioFile,
  type MuteRegion,
  defaultClip,
  defaultTrack,
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
  isProjectOpen: boolean

  // Project-level
  setProject: (projectFile: OctanisProjectFile, filePath?: string) => void
  closeProject: () => void
  setFilePath: (path: string) => void
  markClean: () => void
  updateProjectMeta: (meta: Partial<OctanisProject['meta']>) => void
  setMasterVolume: (vol: number) => void
  setBpm: (bpm: number) => void
  setDuration: (sec: number) => void

  // Audio file registry
  addAudioFile: (file: AudioFile) => void
  removeAudioFile: (audioFileId: string) => void
  updateAudioFilePath: (audioFileId: string, newPath: string) => void

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

  // Fade regions
  addFadeRegion: (trackId: string, clipId: string, region: FadeRegion) => void
  updateFadeRegion: (trackId: string, clipId: string, regionId: string, patch: Partial<Omit<FadeRegion, 'id'>>) => void
  removeFadeRegion: (trackId: string, clipId: string, regionId: string) => void

  // Control points within fade regions
  addControlPoint: (trackId: string, clipId: string, regionId: string, point: GainControlPoint) => void
  updateControlPoint: (trackId: string, clipId: string, regionId: string, pointId: string, patch: Partial<Omit<GainControlPoint, 'id'>>) => void
  removeControlPoint: (trackId: string, clipId: string, regionId: string, pointId: string) => void

  // Mute regions
  addMuteRegion: (trackId: string, clipId: string, region: MuteRegion) => void
  removeMuteRegion: (trackId: string, clipId: string, regionId: string) => void

  // Loop
  setLoop: (trackId: string, clipId: string, loop: LoopRegion | null) => void
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    subscribeWithSelector(
      immer((set) => ({
      projectFile: newProject(),
      currentFilePath: null,
      isDirty: false,
      isProjectOpen: false,

      setProject: (projectFile, filePath) =>
        set((state) => {
          state.projectFile = projectFile
          state.currentFilePath = filePath ?? null
          state.isDirty = false
          state.isProjectOpen = true
        }),

      closeProject: () =>
        set((state) => {
          state.projectFile = newProject()
          state.currentFilePath = null
          state.isDirty = false
          state.isProjectOpen = false
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

      removeAudioFile: (audioFileId) =>
        set((state) => {
          delete state.projectFile.audioFiles[audioFileId]
          for (const track of state.projectFile.project.tracks) {
            track.clips = track.clips.filter((c) => c.audioFileId !== audioFileId)
          }
          state.isDirty = true
        }),

      updateAudioFilePath: (audioFileId, newPath) =>
        set((state) => {
          const af = state.projectFile.audioFiles[audioFileId]
          if (af) af.absolutePath = newPath
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

      addFadeRegion: (trackId, clipId, region) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return

          // Snap to existing regions instead of rejecting overlaps
          let { startSec, endSec } = region
          for (const r of clip.fadeRegions) {
            if (startSec < r.endSec && startSec >= r.startSec) {
              startSec = r.endSec
            }
            if (endSec > r.startSec && endSec <= r.endSec) {
              endSec = r.startSec
            }
            // New region fully engulfs existing — reject (too ambiguous)
            if (startSec <= r.startSec && endSec >= r.endSec) return
          }
          if (endSec - startSec < 0.01) return

          clip.fadeRegions.push({ ...region, startSec, endSec })
          clip.fadeRegions.sort((a, b) => a.startSec - b.startSec)
          state.isDirty = true
        }),

      updateFadeRegion: (trackId, clipId, regionId, patch) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return
          const region = clip.fadeRegions.find((r) => r.id === regionId)
          if (region) {
            Object.assign(region, patch)
            clip.fadeRegions.sort((a, b) => a.startSec - b.startSec)
            state.isDirty = true
          }
        }),

      removeFadeRegion: (trackId, clipId, regionId) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return
          const idx = clip.fadeRegions.findIndex((r) => r.id === regionId)
          if (idx !== -1) clip.fadeRegions.splice(idx, 1)
          state.isDirty = true
        }),

      addControlPoint: (trackId, clipId, regionId, point) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return
          const region = clip.fadeRegions.find((r) => r.id === regionId)
          if (!region) return
          region.controlPoints.push(point)
          region.controlPoints.sort((a, b) => a.x - b.x)
          state.isDirty = true
        }),

      updateControlPoint: (trackId, clipId, regionId, pointId, patch) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return
          const region = clip.fadeRegions.find((r) => r.id === regionId)
          if (!region) return
          const point = region.controlPoints.find((p) => p.id === pointId)
          if (point) {
            Object.assign(point, patch)
            region.controlPoints.sort((a, b) => a.x - b.x)
            state.isDirty = true
          }
        }),

      removeControlPoint: (trackId, clipId, regionId, pointId) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return
          const region = clip.fadeRegions.find((r) => r.id === regionId)
          if (!region) return
          const idx = region.controlPoints.findIndex((p) => p.id === pointId)
          if (idx !== -1) region.controlPoints.splice(idx, 1)
          state.isDirty = true
        }),

      addMuteRegion: (trackId, clipId, region) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return

          // Snap to existing regions instead of rejecting overlaps
          let { startSec, endSec } = region
          for (const r of clip.muteRegions) {
            if (startSec < r.endSec && startSec >= r.startSec) {
              startSec = r.endSec
            }
            if (endSec > r.startSec && endSec <= r.endSec) {
              endSec = r.startSec
            }
            // New region fully engulfs existing — reject (too ambiguous)
            if (startSec <= r.startSec && endSec >= r.endSec) return
          }
          if (endSec - startSec < 0.01) return

          clip.muteRegions.push({ ...region, startSec, endSec })
          clip.muteRegions.sort((a, b) => a.startSec - b.startSec)
          state.isDirty = true
        }),

      removeMuteRegion: (trackId, clipId, regionId) =>
        set((state) => {
          const track = state.projectFile.project.tracks.find((t) => t.id === trackId)
          const clip = track?.clips.find((c) => c.id === clipId)
          if (!clip) return
          const idx = clip.muteRegions.findIndex((r) => r.id === regionId)
          if (idx !== -1) clip.muteRegions.splice(idx, 1)
          state.isDirty = true
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
    ),
    {
      partialize: (state) => ({
        projectFile: state.projectFile,
      }),
      equality: (pastState, currentState) =>
        JSON.stringify(pastState) === JSON.stringify(currentState),
      limit: 100,
    }
  )
)
