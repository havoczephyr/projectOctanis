import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore, MIN_ZOOM, MAX_ZOOM, isPointSelected } from './uiStore'

function resetStore(): void {
  useUiStore.setState(useUiStore.getInitialState())
}

describe('uiStore', () => {
  beforeEach(() => resetStore())

  describe('selectClip', () => {
    it('replaces selection on normal click', () => {
      useUiStore.getState().selectClip('clip-1', false)
      expect(useUiStore.getState().selectedClipIds).toEqual(['clip-1'])

      useUiStore.getState().selectClip('clip-2', false)
      expect(useUiStore.getState().selectedClipIds).toEqual(['clip-2'])
    })

    it('adds to selection on shift-click', () => {
      useUiStore.getState().selectClip('clip-1', false)
      useUiStore.getState().selectClip('clip-2', true)
      expect(useUiStore.getState().selectedClipIds).toEqual(['clip-1', 'clip-2'])
    })

    it('toggles off on shift-click if already selected', () => {
      useUiStore.getState().selectClip('clip-1', false)
      useUiStore.getState().selectClip('clip-2', true)
      useUiStore.getState().selectClip('clip-1', true)
      expect(useUiStore.getState().selectedClipIds).toEqual(['clip-2'])
    })
  })

  describe('deselectAll', () => {
    it('clears all selected clips', () => {
      useUiStore.getState().selectClip('clip-1', false)
      useUiStore.getState().selectClip('clip-2', true)
      useUiStore.getState().deselectAll()
      expect(useUiStore.getState().selectedClipIds).toEqual([])
    })
  })

  describe('zoom', () => {
    it('zoomBy clamps to MIN_ZOOM', () => {
      useUiStore.getState().setZoom(MIN_ZOOM)
      useUiStore.getState().zoomBy(-100)
      expect(useUiStore.getState().zoom).toBe(MIN_ZOOM)
    })

    it('zoomBy clamps to MAX_ZOOM', () => {
      useUiStore.getState().setZoom(MAX_ZOOM)
      useUiStore.getState().zoomBy(100)
      expect(useUiStore.getState().zoom).toBe(MAX_ZOOM)
    })

    it('setZoom clamps within range', () => {
      useUiStore.getState().setZoom(5)
      expect(useUiStore.getState().zoom).toBe(MIN_ZOOM)

      useUiStore.getState().setZoom(9999)
      expect(useUiStore.getState().zoom).toBe(MAX_ZOOM)
    })

    it('zoomBy adjusts zoom correctly', () => {
      useUiStore.getState().setZoom(100)
      useUiStore.getState().zoomBy(50)
      expect(useUiStore.getState().zoom).toBe(150)
    })
  })

  describe('selectEnvelopePoint', () => {
    it('replaces selection on normal click', () => {
      useUiStore.getState().selectEnvelopePoint(1.0, false)
      expect(useUiStore.getState().selectedEnvelopePoints).toEqual([1.0])

      useUiStore.getState().selectEnvelopePoint(2.0, false)
      expect(useUiStore.getState().selectedEnvelopePoints).toEqual([2.0])
    })

    it('adds to selection on shift-click', () => {
      useUiStore.getState().selectEnvelopePoint(1.0, false)
      useUiStore.getState().selectEnvelopePoint(2.0, true)
      expect(useUiStore.getState().selectedEnvelopePoints).toEqual([1.0, 2.0])
    })

    it('toggles off on shift-click if already selected', () => {
      useUiStore.getState().selectEnvelopePoint(1.0, false)
      useUiStore.getState().selectEnvelopePoint(2.0, true)
      useUiStore.getState().selectEnvelopePoint(1.0, true)
      expect(useUiStore.getState().selectedEnvelopePoints).toEqual([2.0])
    })
  })

  describe('deselectAllEnvelopePoints', () => {
    it('clears envelope selection', () => {
      useUiStore.getState().selectEnvelopePoint(1.0, false)
      useUiStore.getState().selectEnvelopePoint(2.0, true)
      useUiStore.getState().deselectAllEnvelopePoints()
      expect(useUiStore.getState().selectedEnvelopePoints).toEqual([])
    })
  })

  describe('deselectAll clears envelope points too', () => {
    it('clears both clip and envelope selection', () => {
      useUiStore.getState().selectClip('clip-1', false)
      useUiStore.getState().selectEnvelopePoint(1.0, false)
      useUiStore.getState().deselectAll()
      expect(useUiStore.getState().selectedClipIds).toEqual([])
      expect(useUiStore.getState().selectedEnvelopePoints).toEqual([])
    })
  })

  describe('isPointSelected', () => {
    it('matches exact time', () => {
      expect(isPointSelected([1.0, 2.0], 1.0)).toBe(true)
    })

    it('matches within 0.001s threshold', () => {
      expect(isPointSelected([1.0], 1.0005)).toBe(true)
    })

    it('does not match outside threshold', () => {
      expect(isPointSelected([1.0], 1.002)).toBe(false)
    })

    it('returns false for empty selection', () => {
      expect(isPointSelected([], 1.0)).toBe(false)
    })
  })
})
