import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface UiStore {
  theme: Theme
  toggleTheme: () => void

  /** Pixels per second on the timeline */
  zoom: number
  setZoom: (zoom: number) => void
  zoomBy: (delta: number) => void

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

  /** Whether beat/bar snapping is enabled */
  snapping: boolean
  toggleSnapping: () => void

  /** Path to the folder currently open in the sidebar */
  sidebarFolder: string | null
  setSidebarFolder: (path: string | null) => void

  /** timeSec values of selected envelope points */
  selectedEnvelopePoints: number[]
  selectEnvelopePoint: (timeSec: number, additive: boolean) => void
  deselectAllEnvelopePoints: () => void
}

export function isPointSelected(selected: number[], timeSec: number): boolean {
  return selected.some((t) => Math.abs(t - timeSec) < 0.001)
}

export const MIN_ZOOM = 20   // px per second
export const MAX_ZOOM = 600  // px per second

export const useUiStore = create<UiStore>((set) => ({
  theme: 'dark',
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  zoom: 100,
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  zoomBy: (delta) =>
    set((s) => ({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom + delta)) })),

  scrollLeft: 0,
  setScrollLeft: (px) => set({ scrollLeft: Math.max(0, px) }),

  selectedClipIds: [],
  selectClip: (clipId, additive) =>
    set((s) => {
      if (additive) {
        // Shift-click: toggle in/out of selection
        const idx = s.selectedClipIds.indexOf(clipId)
        if (idx !== -1) {
          return { selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId) }
        }
        return { selectedClipIds: [...s.selectedClipIds, clipId] }
      }
      // Normal click: replace selection
      return { selectedClipIds: [clipId] }
    }),
  deselectAll: () => set({ selectedClipIds: [], selectedEnvelopePoints: [] }),

  hoveredTrackId: null,
  setHoveredTrack: (trackId) => set({ hoveredTrackId: trackId }),

  snapping: true,
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),

  sidebarFolder: null,
  setSidebarFolder: (path) => set({ sidebarFolder: path }),

  selectedEnvelopePoints: [],
  selectEnvelopePoint: (timeSec, additive) =>
    set((s) => {
      if (additive) {
        const idx = s.selectedEnvelopePoints.findIndex(
          (t) => Math.abs(t - timeSec) < 0.001
        )
        if (idx !== -1) {
          return {
            selectedEnvelopePoints: s.selectedEnvelopePoints.filter((_, i) => i !== idx),
          }
        }
        return { selectedEnvelopePoints: [...s.selectedEnvelopePoints, timeSec] }
      }
      return { selectedEnvelopePoints: [timeSec] }
    }),
  deselectAllEnvelopePoints: () => set({ selectedEnvelopePoints: [] }),
}))
