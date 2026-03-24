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
    it('clears all selected clips and fade region edit mode', () => {
      useUiStore.getState().selectClip('clip-1', false)
      useUiStore.getState().enterFadeRegionEditMode('clip-1', 'r1')
      useUiStore.getState().deselectAll()
      expect(useUiStore.getState().selectedClipIds).toEqual([])
      expect(useUiStore.getState().editingFadeRegionClipId).toBeNull()
      expect(useUiStore.getState().editingFadeRegionId).toBeNull()
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

  describe('fadeRegionEditMode', () => {
    it('enters edit mode with clipId and optional regionId', () => {
      useUiStore.getState().enterFadeRegionEditMode('clip-1', 'r1')
      expect(useUiStore.getState().editingFadeRegionClipId).toBe('clip-1')
      expect(useUiStore.getState().editingFadeRegionId).toBe('r1')
    })

    it('enters edit mode without regionId', () => {
      useUiStore.getState().enterFadeRegionEditMode('clip-1')
      expect(useUiStore.getState().editingFadeRegionClipId).toBe('clip-1')
      expect(useUiStore.getState().editingFadeRegionId).toBeNull()
    })

    it('exits edit mode', () => {
      useUiStore.getState().enterFadeRegionEditMode('clip-1', 'r1')
      useUiStore.getState().exitFadeRegionEditMode()
      expect(useUiStore.getState().editingFadeRegionClipId).toBeNull()
      expect(useUiStore.getState().editingFadeRegionId).toBeNull()
    })
  })
})
