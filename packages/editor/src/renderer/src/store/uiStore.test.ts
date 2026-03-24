import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore, MIN_ZOOM, MAX_ZOOM } from './uiStore'

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
    it('clears all selected clips and fade gain editor', () => {
      useUiStore.getState().selectClip('clip-1', false)
      useUiStore.getState().openFadeGainEditor('t1', 'clip-1', 'r1')
      useUiStore.getState().deselectAll()
      expect(useUiStore.getState().selectedClipIds).toEqual([])
      expect(useUiStore.getState().fadeGainEditor).toBeNull()
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

  describe('rangeSelection', () => {
    it('sets and clears range selection', () => {
      const sel = { clipId: 'c1', trackId: 't1', startSec: 1, endSec: 3 }
      useUiStore.getState().setRangeSelection(sel)
      expect(useUiStore.getState().rangeSelection).toEqual(sel)

      useUiStore.getState().clearRangeSelection()
      expect(useUiStore.getState().rangeSelection).toBeNull()
    })

    it('is cleared by deselectAll', () => {
      useUiStore.getState().setRangeSelection({ clipId: 'c1', trackId: 't1', startSec: 0, endSec: 2 })
      useUiStore.getState().deselectAll()
      expect(useUiStore.getState().rangeSelection).toBeNull()
    })
  })

  describe('contextMenu', () => {
    it('opens and closes context menu', () => {
      useUiStore.getState().openContextMenu(100, 200, 'c1', 't1')
      expect(useUiStore.getState().contextMenu).toEqual({ x: 100, y: 200, clipId: 'c1', trackId: 't1' })

      useUiStore.getState().closeContextMenu()
      expect(useUiStore.getState().contextMenu).toBeNull()
    })

    it('is cleared by deselectAll', () => {
      useUiStore.getState().openContextMenu(50, 50, 'c1', 't1')
      useUiStore.getState().deselectAll()
      expect(useUiStore.getState().contextMenu).toBeNull()
    })
  })

  describe('fadeGainEditor', () => {
    it('opens with track, clip, and region context', () => {
      useUiStore.getState().openFadeGainEditor('t1', 'clip-1', 'r1')
      expect(useUiStore.getState().fadeGainEditor).toEqual({ trackId: 't1', clipId: 'clip-1', regionId: 'r1' })
    })

    it('closes the editor', () => {
      useUiStore.getState().openFadeGainEditor('t1', 'clip-1', 'r1')
      useUiStore.getState().closeFadeGainEditor()
      expect(useUiStore.getState().fadeGainEditor).toBeNull()
    })

    it('is cleared by deselectAll', () => {
      useUiStore.getState().openFadeGainEditor('t1', 'clip-1', 'r1')
      useUiStore.getState().deselectAll()
      expect(useUiStore.getState().fadeGainEditor).toBeNull()
    })
  })

  describe('uiIntensity', () => {
    it('defaults to balanced', () => {
      expect(useUiStore.getState().uiIntensity).toBe('balanced')
    })

    it('setUiIntensity sets directly', () => {
      useUiStore.getState().setUiIntensity('low')
      expect(useUiStore.getState().uiIntensity).toBe('low')

      useUiStore.getState().setUiIntensity('high')
      expect(useUiStore.getState().uiIntensity).toBe('high')
    })

    it('cycleUiIntensity cycles high → balanced → low → high', () => {
      useUiStore.getState().setUiIntensity('high')
      useUiStore.getState().cycleUiIntensity()
      expect(useUiStore.getState().uiIntensity).toBe('balanced')

      useUiStore.getState().cycleUiIntensity()
      expect(useUiStore.getState().uiIntensity).toBe('low')

      useUiStore.getState().cycleUiIntensity()
      expect(useUiStore.getState().uiIntensity).toBe('high')
    })
  })
})
