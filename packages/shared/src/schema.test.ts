import { describe, it, expect } from 'vitest'
import {
  defaultClip,
  defaultTrack,
  pickTrackColor,
  interpolateFadeRegions,
  quadBezier,
  TRACK_COLORS,
  ClipSchema,
  TrackSchema,
  OctanisProjectFileSchema,
} from './schema'

describe('defaultClip', () => {
  it('returns a valid Clip with expected defaults', () => {
    const clip = defaultClip('audio-1', 'clip-1')
    expect(clip.id).toBe('clip-1')
    expect(clip.audioFileId).toBe('audio-1')
    expect(clip.startSec).toBe(0)
    expect(clip.trimStartSec).toBe(0)
    expect(clip.trimEndSec).toBeNull()
    expect(clip.volume).toBe(1.0)
    expect(clip.fadeRegions).toEqual([])
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

describe('quadBezier', () => {
  it('returns p0 at t=0', () => {
    expect(quadBezier(1, 2, 1, 0)).toBe(1)
  })

  it('returns p2 at t=1', () => {
    expect(quadBezier(1, 2, 1, 1)).toBe(1)
  })

  it('returns control-weighted value at t=0.5', () => {
    // At t=0.5: 0.25*1 + 2*0.25*2 + 0.25*1 = 0.25 + 1 + 0.25 = 1.5
    expect(quadBezier(1, 2, 1, 0.5)).toBeCloseTo(1.5)
  })
})

describe('interpolateFadeRegions', () => {
  it('returns clipVolume when no regions exist', () => {
    expect(interpolateFadeRegions([], 5, 1.0)).toBe(1.0)
  })

  it('returns clipVolume when time is outside all regions', () => {
    const regions = [{ id: 'r1', startSec: 2, endSec: 4, peakGain: 0.5, controlPointX: 0.5 }]
    expect(interpolateFadeRegions(regions, 0, 1.0)).toBe(1.0)
    expect(interpolateFadeRegions(regions, 5, 1.0)).toBe(1.0)
  })

  it('returns bezier value inside a region', () => {
    const regions = [{ id: 'r1', startSec: 0, endSec: 10, peakGain: 2.0, controlPointX: 0.5 }]
    const mid = interpolateFadeRegions(regions, 5, 1.0)
    // At t=0.5: quadBezier(1.0, 2.0, 1.0, 0.5) = 1.5
    expect(mid).toBeCloseTo(1.5)
  })

  it('returns clipVolume at region edges', () => {
    const regions = [{ id: 'r1', startSec: 2, endSec: 4, peakGain: 0, controlPointX: 0.5 }]
    // At t=0 (start): quadBezier(1.0, 0, 1.0, 0) = 1.0
    expect(interpolateFadeRegions(regions, 2, 1.0)).toBeCloseTo(1.0)
    // At t=1 (end): quadBezier(1.0, 0, 1.0, 1) = 1.0
    expect(interpolateFadeRegions(regions, 4, 1.0)).toBeCloseTo(1.0)
  })

  it('handles zero-duration region gracefully', () => {
    const regions = [{ id: 'r1', startSec: 3, endSec: 3, peakGain: 0.5, controlPointX: 0.5 }]
    expect(interpolateFadeRegions(regions, 3, 1.0)).toBe(1.0)
  })

  it('respects clipVolume parameter', () => {
    const regions = [{ id: 'r1', startSec: 0, endSec: 10, peakGain: 1.0, controlPointX: 0.5 }]
    // clipVolume=0.8, peakGain=1.0, at t=0.5: quadBezier(0.8, 1.0, 0.8, 0.5) = 0.9
    expect(interpolateFadeRegions(regions, 5, 0.8)).toBeCloseTo(0.9)
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
