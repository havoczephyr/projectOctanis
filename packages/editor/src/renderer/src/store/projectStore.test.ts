import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from './projectStore'

function resetStore(): void {
  useProjectStore.setState(useProjectStore.getInitialState())
}

describe('projectStore', () => {
  beforeEach(() => resetStore())

  describe('addTrack', () => {
    it('creates a track with name and color', () => {
      const id = useProjectStore.getState().addTrack('My Track')
      const tracks = useProjectStore.getState().projectFile.project.tracks
      expect(tracks).toHaveLength(1)
      expect(tracks[0].id).toBe(id)
      expect(tracks[0].name).toBe('My Track')
    })

    it('auto-names tracks when no name provided', () => {
      useProjectStore.getState().addTrack()
      const tracks = useProjectStore.getState().projectFile.project.tracks
      expect(tracks[0].name).toBe('Track 1')
    })

    it('marks project as dirty', () => {
      useProjectStore.getState().addTrack()
      expect(useProjectStore.getState().isDirty).toBe(true)
    })
  })

  describe('addClip', () => {
    it('creates clip on the correct track at the given start time', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 5.0)
      const track = useProjectStore.getState().projectFile.project.tracks[0]
      expect(track.clips).toHaveLength(1)
      expect(track.clips[0].id).toBe(clipId)
      expect(track.clips[0].audioFileId).toBe('audio-1')
      expect(track.clips[0].startSec).toBe(5.0)
    })

    it('does nothing for nonexistent track', () => {
      useProjectStore.getState().addClip('nonexistent', 'audio-1', 0)
      const tracks = useProjectStore.getState().projectFile.project.tracks
      expect(tracks).toHaveLength(0)
    })
  })

  describe('addAudioFile', () => {
    it('registers file in audioFiles map', () => {
      const file = { id: 'af-1', absolutePath: '/test.wav', durationSec: 10, sampleRate: 44100, channels: 2 }
      useProjectStore.getState().addAudioFile(file)
      expect(useProjectStore.getState().projectFile.audioFiles['af-1']).toEqual(file)
    })
  })

  describe('moveClip', () => {
    it('updates clip startSec', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)
      useProjectStore.getState().moveClip(trackId, clipId, 3.5)
      const clip = useProjectStore.getState().projectFile.project.tracks[0].clips[0]
      expect(clip.startSec).toBe(3.5)
    })

    it('clamps to >= 0', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 5)
      useProjectStore.getState().moveClip(trackId, clipId, -10)
      const clip = useProjectStore.getState().projectFile.project.tracks[0].clips[0]
      expect(clip.startSec).toBe(0)
    })
  })

  describe('moveClipToTrack', () => {
    it('transfers clip between tracks', () => {
      const t1 = useProjectStore.getState().addTrack()
      const t2 = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(t1, 'audio-1', 0)

      useProjectStore.getState().moveClipToTrack(t1, clipId, t2, 7)

      const tracks = useProjectStore.getState().projectFile.project.tracks
      expect(tracks[0].clips).toHaveLength(0)
      expect(tracks[1].clips).toHaveLength(1)
      expect(tracks[1].clips[0].startSec).toBe(7)
    })
  })

  describe('removeClip', () => {
    it('removes the clip from the track', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)
      useProjectStore.getState().removeClip(trackId, clipId)
      expect(useProjectStore.getState().projectFile.project.tracks[0].clips).toHaveLength(0)
    })
  })

  describe('removeTrack', () => {
    it('removes the track', () => {
      const trackId = useProjectStore.getState().addTrack()
      useProjectStore.getState().removeTrack(trackId)
      expect(useProjectStore.getState().projectFile.project.tracks).toHaveLength(0)
    })
  })

  describe('addFadeRegion', () => {
    it('adds a fade region to a clip sorted by startSec', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)

      useProjectStore.getState().addFadeRegion(trackId, clipId, {
        id: 'r2', startSec: 5, endSec: 8, startGain: 1.0, endGain: 1.0, controlPoints: [],
      })
      useProjectStore.getState().addFadeRegion(trackId, clipId, {
        id: 'r1', startSec: 1, endSec: 3, startGain: 1.0, endGain: 1.0, controlPoints: [],
      })

      const regions = useProjectStore.getState().projectFile.project.tracks[0].clips[0].fadeRegions
      expect(regions).toHaveLength(2)
      expect(regions[0].id).toBe('r1')
      expect(regions[1].id).toBe('r2')
    })

    it('rejects overlapping regions', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)

      useProjectStore.getState().addFadeRegion(trackId, clipId, {
        id: 'r1', startSec: 2, endSec: 6, startGain: 1.0, endGain: 1.0, controlPoints: [],
      })
      useProjectStore.getState().addFadeRegion(trackId, clipId, {
        id: 'r2', startSec: 4, endSec: 8, startGain: 1.0, endGain: 1.0, controlPoints: [],
      })

      const regions = useProjectStore.getState().projectFile.project.tracks[0].clips[0].fadeRegions
      expect(regions).toHaveLength(1)
      expect(regions[0].id).toBe('r1')
    })
  })

  describe('updateFadeRegion', () => {
    it('updates anchor gains of a fade region', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)
      useProjectStore.getState().addFadeRegion(trackId, clipId, {
        id: 'r1', startSec: 1, endSec: 5, startGain: 1.0, endGain: 1.0, controlPoints: [],
      })

      useProjectStore.getState().updateFadeRegion(trackId, clipId, 'r1', { startGain: 0.5, endGain: 1.8 })

      const region = useProjectStore.getState().projectFile.project.tracks[0].clips[0].fadeRegions[0]
      expect(region.startGain).toBe(0.5)
      expect(region.endGain).toBe(1.8)
    })
  })

  describe('removeFadeRegion', () => {
    it('removes a fade region by id', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)
      useProjectStore.getState().addFadeRegion(trackId, clipId, {
        id: 'r1', startSec: 1, endSec: 5, startGain: 1.0, endGain: 1.0, controlPoints: [],
      })

      useProjectStore.getState().removeFadeRegion(trackId, clipId, 'r1')

      const regions = useProjectStore.getState().projectFile.project.tracks[0].clips[0].fadeRegions
      expect(regions).toHaveLength(0)
    })
  })

  describe('addControlPoint', () => {
    it('adds a control point sorted by x', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)
      useProjectStore.getState().addFadeRegion(trackId, clipId, {
        id: 'r1', startSec: 0, endSec: 10, startGain: 1.0, endGain: 1.0, controlPoints: [],
      })

      useProjectStore.getState().addControlPoint(trackId, clipId, 'r1', { id: 'p2', x: 0.7, gain: 1.5 })
      useProjectStore.getState().addControlPoint(trackId, clipId, 'r1', { id: 'p1', x: 0.3, gain: 0.5 })

      const points = useProjectStore.getState().projectFile.project.tracks[0].clips[0].fadeRegions[0].controlPoints
      expect(points).toHaveLength(2)
      expect(points[0].id).toBe('p1')
      expect(points[1].id).toBe('p2')
    })
  })

  describe('updateControlPoint', () => {
    it('updates a control point and re-sorts', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)
      useProjectStore.getState().addFadeRegion(trackId, clipId, {
        id: 'r1', startSec: 0, endSec: 10, startGain: 1.0, endGain: 1.0,
        controlPoints: [{ id: 'p1', x: 0.3, gain: 0.5 }, { id: 'p2', x: 0.7, gain: 1.5 }],
      })

      useProjectStore.getState().updateControlPoint(trackId, clipId, 'r1', 'p1', { x: 0.9, gain: 0.8 })

      const points = useProjectStore.getState().projectFile.project.tracks[0].clips[0].fadeRegions[0].controlPoints
      expect(points[0].id).toBe('p2') // p2 at 0.7 is now first
      expect(points[1].id).toBe('p1') // p1 moved to 0.9
      expect(points[1].gain).toBe(0.8)
    })
  })

  describe('removeControlPoint', () => {
    it('removes a control point by id', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)
      useProjectStore.getState().addFadeRegion(trackId, clipId, {
        id: 'r1', startSec: 0, endSec: 10, startGain: 1.0, endGain: 1.0,
        controlPoints: [{ id: 'p1', x: 0.5, gain: 1.5 }],
      })

      useProjectStore.getState().removeControlPoint(trackId, clipId, 'r1', 'p1')

      const points = useProjectStore.getState().projectFile.project.tracks[0].clips[0].fadeRegions[0].controlPoints
      expect(points).toHaveLength(0)
    })
  })

  describe('isProjectOpen', () => {
    it('defaults to false', () => {
      expect(useProjectStore.getState().isProjectOpen).toBe(false)
    })

    it('is set to true by setProject', () => {
      const now = new Date().toISOString()
      useProjectStore.getState().setProject({
        project: {
          version: '1.0',
          meta: { title: 'Test', author: '', createdAt: now, updatedAt: now },
          bpm: 120,
          timeSignature: [4, 4],
          durationSec: 120,
          masterVolume: 1.0,
          tracks: [],
        },
        audioFiles: {},
      }, '/test/path.octanis.json')
      expect(useProjectStore.getState().isProjectOpen).toBe(true)
      expect(useProjectStore.getState().currentFilePath).toBe('/test/path.octanis.json')
    })
  })

  describe('closeProject', () => {
    it('resets to initial state with isProjectOpen false', () => {
      const now = new Date().toISOString()
      useProjectStore.getState().setProject({
        project: {
          version: '1.0',
          meta: { title: 'Test', author: '', createdAt: now, updatedAt: now },
          bpm: 120,
          timeSignature: [4, 4],
          durationSec: 120,
          masterVolume: 1.0,
          tracks: [],
        },
        audioFiles: {},
      }, '/test/path.octanis.json')
      expect(useProjectStore.getState().isProjectOpen).toBe(true)

      useProjectStore.getState().closeProject()
      expect(useProjectStore.getState().isProjectOpen).toBe(false)
      expect(useProjectStore.getState().currentFilePath).toBeNull()
      expect(useProjectStore.getState().isDirty).toBe(false)
      expect(useProjectStore.getState().projectFile.project.meta.title).toBe('Untitled Project')
    })
  })
})
