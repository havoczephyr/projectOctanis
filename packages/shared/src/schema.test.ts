import { describe, it, expect } from 'vitest'
import {
  defaultClip,
  defaultTrack,
  defaultFadeHandle,
  pickTrackColor,
  interpolateEnvelope,
  TRACK_COLORS,
  ClipSchema,
  TrackSchema,
  OctanisProjectFileSchema,
} from './schema'

describe('defaultFadeHandle', () => {
  it('returns zero-duration linear fade', () => {
    const fade = defaultFadeHandle()
    expect(fade.durationSec).toBe(0)
    expect(fade.curve).toBe('linear')
  })
})

describe('defaultClip', () => {
  it('returns a valid Clip with expected defaults', () => {
    const clip = defaultClip('audio-1', 'clip-1')
    expect(clip.id).toBe('clip-1')
    expect(clip.audioFileId).toBe('audio-1')
    expect(clip.startSec).toBe(0)
    expect(clip.trimStartSec).toBe(0)
    expect(clip.trimEndSec).toBeNull()
    expect(clip.volume).toBe(1.0)
    expect(clip.envelope).toEqual([])
    expect(clip.fadeIn.durationSec).toBe(0)
    expect(clip.fadeOut.durationSec).toBe(0)
    expect(clip.loop).toBeNull()
  })

  it('passes Zod schema validation', () => {
    const clip = defaultClip('audio-1', 'clip-1')
    expect(() => ClipSchema.parse(clip)).not.toThrow()
  })
})

describe('defaultTrack', () => {
  it('returns a valid Track with expected defaults', () => {
    const track = defaultTrack('t-1', 'Track 1', '#00FFCC')
    expect(track.id).toBe('t-1')
    expect(track.name).toBe('Track 1')
    expect(track.color).toBe('#00FFCC')
    expect(track.muted).toBe(false)
    expect(track.soloed).toBe(false)
    expect(track.volume).toBe(1.0)
    expect(track.clips).toEqual([])
  })

  it('passes Zod schema validation', () => {
    const track = defaultTrack('t-1', 'Track 1', '#00FFCC')
    expect(() => TrackSchema.parse(track)).not.toThrow()
  })
})

describe('pickTrackColor', () => {
  it('returns from TRACK_COLORS palette', () => {
    expect(pickTrackColor(0)).toBe(TRACK_COLORS[0])
    expect(pickTrackColor(3)).toBe(TRACK_COLORS[3])
  })

  it('wraps around at palette boundary', () => {
    const len = TRACK_COLORS.length
    expect(pickTrackColor(len)).toBe(TRACK_COLORS[0])
    expect(pickTrackColor(len + 2)).toBe(TRACK_COLORS[2])
  })
})

describe('interpolateEnvelope', () => {
  it('returns 1.0 for empty envelope', () => {
    expect(interpolateEnvelope([], 5)).toBe(1.0)
  })

  it('returns first point gain before first point', () => {
    const env = [{ timeSec: 2, gain: 0.5 }, { timeSec: 4, gain: 1.5 }]
    expect(interpolateEnvelope(env, 0)).toBe(0.5)
    expect(interpolateEnvelope(env, 2)).toBe(0.5)
  })

  it('returns last point gain after last point', () => {
    const env = [{ timeSec: 2, gain: 0.5 }, { timeSec: 4, gain: 1.5 }]
    expect(interpolateEnvelope(env, 4)).toBe(1.5)
    expect(interpolateEnvelope(env, 10)).toBe(1.5)
  })

  it('linearly interpolates between points', () => {
    const env = [{ timeSec: 0, gain: 0 }, { timeSec: 10, gain: 2.0 }]
    expect(interpolateEnvelope(env, 5)).toBeCloseTo(1.0)
    expect(interpolateEnvelope(env, 2.5)).toBeCloseTo(0.5)
  })

  it('handles single-point envelope', () => {
    const env = [{ timeSec: 3, gain: 0.8 }]
    expect(interpolateEnvelope(env, 0)).toBe(0.8)
    expect(interpolateEnvelope(env, 3)).toBe(0.8)
    expect(interpolateEnvelope(env, 10)).toBe(0.8)
  })
})

describe('OctanisProjectFileSchema', () => {
  const validProject = {
    project: {
      version: '1.0' as const,
      meta: {
        title: 'Test',
        author: 'Author',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      bpm: 120,
      timeSignature: [4, 4] as [number, number],
      durationSec: 60,
      masterVolume: 1.0,
      tracks: [],
    },
    audioFiles: {},
  }

  it('parses a valid project', () => {
    expect(() => OctanisProjectFileSchema.parse(validProject)).not.toThrow()
  })

  it('rejects missing version', () => {
    const invalid = { ...validProject, project: { ...validProject.project, version: '2.0' } }
    expect(() => OctanisProjectFileSchema.parse(invalid)).toThrow()
  })

  it('rejects negative bpm', () => {
    const invalid = { ...validProject, project: { ...validProject.project, bpm: -1 } }
    expect(() => OctanisProjectFileSchema.parse(invalid)).toThrow()
  })

  it('rejects volume out of range', () => {
    const invalid = { ...validProject, project: { ...validProject.project, masterVolume: 3 } }
    expect(() => OctanisProjectFileSchema.parse(invalid)).toThrow()
  })
})
