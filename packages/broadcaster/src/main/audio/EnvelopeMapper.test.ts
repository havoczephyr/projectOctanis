import { describe, it, expect } from 'vitest'
import { EnvelopeMapper } from './EnvelopeMapper'
import type { Clip } from '@octanis/shared'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    audioFileId: 'af-1',
    startSec: 0,
    trimStartSec: 0,
    trimEndSec: 10,
    volume: 1.0,
    fadeRegions: [],
    muteRegions: [],
    loop: null,
    ...overrides,
  }
}

describe('EnvelopeMapper', () => {
  describe('base volume', () => {
    it('returns no filters when volume is 1.0 and no regions', () => {
      const clip = makeClip()
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toEqual([])
    })

    it('returns a volume filter when volume != 1.0', () => {
      const clip = makeClip({ volume: 0.5 })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toHaveLength(1)
      expect(filters[0]).toBe('volume=0.5000')
    })
  })

  describe('linear fade (no control points)', () => {
    it('creates a piecewise linear expression for a simple fade-in', () => {
      const clip = makeClip({
        fadeRegions: [
          {
            id: 'fr-1',
            startSec: 0,
            endSec: 2,
            startGain: 0,
            endGain: 1,
            controlPoints: [],
          },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 5)
      expect(filters).toHaveLength(1)
      const expr = filters[0]

      // Should be a volume expression with eval=frame
      expect(expr).toContain("volume='")
      expect(expr).toContain(":eval=frame")

      // Should reference absolute times (5+0=5 to 5+2=7)
      expect(expr).toContain('5.0000')
      expect(expr).toContain('7.0000')

      // Should contain the between() wrapper
      expect(expr).toContain('between(t,')
    })

    it('creates a fade-out expression', () => {
      const clip = makeClip({
        fadeRegions: [
          {
            id: 'fr-1',
            startSec: 8,
            endSec: 10,
            startGain: 1,
            endGain: 0,
            controlPoints: [],
          },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toHaveLength(1)
      expect(filters[0]).toContain('between(t,8.0000,10.0000)')
    })
  })

  describe('fade with control points', () => {
    it('samples Hermite curve at N points', () => {
      const clip = makeClip({
        fadeRegions: [
          {
            id: 'fr-1',
            startSec: 0,
            endSec: 4,
            startGain: 1,
            endGain: 1,
            controlPoints: [
              { id: 'cp-1', x: 0.5, gain: 0.3 },
            ],
          },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toHaveLength(1)

      const expr = filters[0]
      // Should have multiple if(lt()) segments from sampling
      const ltCount = (expr.match(/lt\(t,/g) || []).length
      expect(ltCount).toBeGreaterThan(2)
    })
  })

  describe('duck points', () => {
    it('skips neighbors and inserts exact duck gains', () => {
      const clip = makeClip({
        fadeRegions: [
          {
            id: 'fr-1',
            startSec: 0,
            endSec: 4,
            startGain: 1,
            endGain: 1,
            controlPoints: [
              { id: 'cp-duck', x: 0.5, gain: 0.1, duck: true },
            ],
          },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toHaveLength(1)

      // The duck gain value should appear in the expression
      expect(filters[0]).toContain('0.1')
    })
  })

  describe('mute regions', () => {
    it('creates volume=0 enable expressions for mute regions', () => {
      const clip = makeClip({
        muteRegions: [
          { id: 'mr-1', startSec: 2, endSec: 4 },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 5)
      expect(filters).toHaveLength(1)
      // Absolute times: 5+2=7, 5+4=9
      expect(filters[0]).toBe("volume=enable='between(t,7.0000,9.0000)':volume=0")
    })

    it('handles multiple mute regions', () => {
      const clip = makeClip({
        muteRegions: [
          { id: 'mr-1', startSec: 1, endSec: 2 },
          { id: 'mr-2', startSec: 5, endSec: 6 },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toHaveLength(2)
      expect(filters[0]).toContain('between(t,1.0000,2.0000)')
      expect(filters[1]).toContain('between(t,5.0000,6.0000)')
    })
  })

  describe('combined filters', () => {
    it('returns volume + fade + mute filters together', () => {
      const clip = makeClip({
        volume: 0.8,
        fadeRegions: [
          {
            id: 'fr-1',
            startSec: 0,
            endSec: 2,
            startGain: 0,
            endGain: 1,
            controlPoints: [],
          },
        ],
        muteRegions: [
          { id: 'mr-1', startSec: 5, endSec: 6 },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toHaveLength(3)
      expect(filters[0]).toBe('volume=0.8000')
      expect(filters[1]).toContain(':eval=frame')
      expect(filters[2]).toContain('volume=0')
    })
  })

  describe('edge cases', () => {
    it('skips zero-duration fade region', () => {
      const clip = makeClip({
        fadeRegions: [
          {
            id: 'fr-1',
            startSec: 5,
            endSec: 5, // zero duration
            startGain: 0,
            endGain: 1,
            controlPoints: [],
          },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toEqual([])
    })

    it('handles a single fade region', () => {
      const clip = makeClip({
        fadeRegions: [
          {
            id: 'fr-1',
            startSec: 0,
            endSec: 10,
            startGain: 1,
            endGain: 0,
            controlPoints: [],
          },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toHaveLength(1)
    })

    it('multiplies multiple fade regions', () => {
      const clip = makeClip({
        fadeRegions: [
          {
            id: 'fr-1',
            startSec: 0,
            endSec: 2,
            startGain: 0,
            endGain: 1,
            controlPoints: [],
          },
          {
            id: 'fr-2',
            startSec: 8,
            endSec: 10,
            startGain: 1,
            endGain: 0,
            controlPoints: [],
          },
        ],
      })
      const filters = EnvelopeMapper.buildFilters(clip, 10, 0)
      expect(filters).toHaveLength(1)
      // Should contain '*' joining two between() expressions
      expect(filters[0]).toContain('*')
    })
  })
})
