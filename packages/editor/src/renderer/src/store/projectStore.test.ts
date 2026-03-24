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

  describe('upsertEnvelopePoint', () => {
    it('inserts a new point sorted by time', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)

      useProjectStore.getState().upsertEnvelopePoint(trackId, clipId, { timeSec: 5, gain: 0.8 })
      useProjectStore.getState().upsertEnvelopePoint(trackId, clipId, { timeSec: 2, gain: 0.3 })

      const envelope = useProjectStore.getState().projectFile.project.tracks[0].clips[0].envelope
      expect(envelope).toHaveLength(2)
      expect(envelope[0].timeSec).toBe(2)
      expect(envelope[1].timeSec).toBe(5)
    })

    it('updates existing point at same time', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)

      useProjectStore.getState().upsertEnvelopePoint(trackId, clipId, { timeSec: 5, gain: 0.8 })
      useProjectStore.getState().upsertEnvelopePoint(trackId, clipId, { timeSec: 5, gain: 1.5 })

      const envelope = useProjectStore.getState().projectFile.project.tracks[0].clips[0].envelope
      expect(envelope).toHaveLength(1)
      expect(envelope[0].gain).toBe(1.5)
    })
  })

  describe('removeEnvelopePoint', () => {
    it('removes point by timeSec proximity', () => {
      const trackId = useProjectStore.getState().addTrack()
      const clipId = useProjectStore.getState().addClip(trackId, 'audio-1', 0)

      useProjectStore.getState().upsertEnvelopePoint(trackId, clipId, { timeSec: 5, gain: 0.8 })
      useProjectStore.getState().removeEnvelopePoint(trackId, clipId, 5.0005)

      const envelope = useProjectStore.getState().projectFile.project.tracks[0].clips[0].envelope
      expect(envelope).toHaveLength(0)
    })
  })
})
