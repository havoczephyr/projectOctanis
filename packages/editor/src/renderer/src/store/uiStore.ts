import { create } from 'zustand'

type Theme = 'dark' | 'light'
type UiIntensity = 'high' | 'balanced' | 'low'

interface RangeSelection {
  clipId: string
  trackId: string
  startSec: number
  endSec: number
}

interface ContextMenu {
  x: number
  y: number
  clipId: string
  trackId: string
}

interface FadeGainEditorContext {
  trackId: string
  clipId: string
  regionId: string
}

interface UiStore {
  theme: Theme
  toggleTheme: () => void

  /** Pixels per second on the timeline */
  zoom: number
  setZoom: (zoom: number) => void
  zoomBy: (delta: number) => void
  zoomToFit: (viewportWidth: number, durationSec: number) => void

  /** Timeline viewport width for zoom-to-fit calculations */
  timelineViewportWidth: number
  setTimelineViewportWidth: (px: number) => void

  /** Horizontal scroll offset in pixels */
  scrollLeft: number
  setScrollLeft: (px: number) => void

  /** IDs of currently selected clips */
  selectedClipIds: string[]
  selectClip: (clipId: string, additive: boolean) => void
  deselectAll: () => void

  /** ID of the track the user is hovering over */
  hoveredTrackId: string | null
  setHoveredTrack: (trackId: string | null) => void

  /** UI intensity level for performance tuning */
  uiIntensity: UiIntensity
  setUiIntensity: (level: UiIntensity) => void
  cycleUiIntensity: () => void

  /** Whether beat/bar snapping is enabled */
  snapping: boolean
  toggleSnapping: () => void

  /** Path to the folder currently open in the sidebar */
  sidebarFolder: string | null
  setSidebarFolder: (path: string | null) => void

  /** Fade gain editor popup */
  fadeGainEditor: FadeGainEditorContext | null
  openFadeGainEditor: (trackId: string, clipId: string, regionId: string) => void
  closeFadeGainEditor: () => void

  /** Undo history panel visibility */
  showUndoHistoryPanel: boolean
  setShowUndoHistoryPanel: (show: boolean) => void

  /** Range selection on a clip (for fade region creation, etc.) */
  rangeSelection: RangeSelection | null
  setRangeSelection: (sel: RangeSelection | null) => void
  clearRangeSelection: () => void

  /** Context menu state */
  contextMenu: ContextMenu | null
  openContextMenu: (x: number, y: number, clipId: string, trackId: string) => void
  closeContextMenu: () => void

  /** Audio optimization: auto-reduce UI intensity during playback */
  audioOptimization: boolean
  toggleAudioOptimization: () => void
  _prePlaybackIntensity: UiIntensity | null
}

export const MIN_ZOOM = 20   // px per second
export const MAX_ZOOM = 600  // px per second
export const PLAYHEAD_SNAP_PX = 12  // snap threshold for drop-to-playhead/ghost

export const useUiStore = create<UiStore>((set) => ({
  theme: 'dark',
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  zoom: 100,
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  zoomBy: (delta) =>
    set((s) => ({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom + delta)) })),
  zoomToFit: (viewportWidth, durationSec) => {
    if (durationSec <= 0 || viewportWidth <= 0) return
    const fitZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewportWidth / durationSec))
    set({ zoom: fitZoom, scrollLeft: 0 })
  },

  timelineViewportWidth: 0,
  setTimelineViewportWidth: (px) => set({ timelineViewportWidth: px }),

  scrollLeft: 0,
  setScrollLeft: (px) => set({ scrollLeft: Math.max(0, px) }),

  selectedClipIds: [],
  selectClip: (clipId, additive) =>
    set((s) => {
      if (additive) {
        const idx = s.selectedClipIds.indexOf(clipId)
        if (idx !== -1) {
          return { selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId) }
        }
        return { selectedClipIds: [...s.selectedClipIds, clipId] }
      }
      return { selectedClipIds: [clipId] }
    }),
  deselectAll: () => set({
    selectedClipIds: [],
    fadeGainEditor: null,
    rangeSelection: null,
    contextMenu: null,
  }),

  hoveredTrackId: null,
  setHoveredTrack: (trackId) => set({ hoveredTrackId: trackId }),

  uiIntensity: 'balanced',
  setUiIntensity: (level) => set({ uiIntensity: level }),
  cycleUiIntensity: () =>
    set((s) => ({
      uiIntensity: s.uiIntensity === 'high' ? 'balanced'
        : s.uiIntensity === 'balanced' ? 'low' : 'high',
    })),

  snapping: true,
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),

  sidebarFolder: null,
  setSidebarFolder: (path) => set({ sidebarFolder: path }),

  fadeGainEditor: null,
  openFadeGainEditor: (trackId, clipId, regionId) =>
    set({ fadeGainEditor: { trackId, clipId, regionId } }),
  closeFadeGainEditor: () =>
    set({ fadeGainEditor: null }),

  showUndoHistoryPanel: false,
  setShowUndoHistoryPanel: (show) => set({ showUndoHistoryPanel: show }),

  rangeSelection: null,
  setRangeSelection: (sel) => set({ rangeSelection: sel }),
  clearRangeSelection: () => set({ rangeSelection: null }),

  contextMenu: null,
  openContextMenu: (x, y, clipId, trackId) => set({ contextMenu: { x, y, clipId, trackId } }),
  closeContextMenu: () => set({ contextMenu: null }),

  audioOptimization: false,
  toggleAudioOptimization: () => set((s) => ({ audioOptimization: !s.audioOptimization })),
  _prePlaybackIntensity: null,
}))
