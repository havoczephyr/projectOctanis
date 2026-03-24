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

  /** ID of the currently selected clip */
  selectedClipId: string | null
  selectClip: (clipId: string | null) => void

  /** ID of the track the user is hovering over */
  hoveredTrackId: string | null
  setHoveredTrack: (trackId: string | null) => void

  /** Whether beat/bar snapping is enabled */
  snapping: boolean
  toggleSnapping: () => void

  /** Path to the folder currently open in the sidebar */
  sidebarFolder: string | null
  setSidebarFolder: (path: string | null) => void
}

const MIN_ZOOM = 20   // px per second
const MAX_ZOOM = 600  // px per second

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

  selectedClipId: null,
  selectClip: (clipId) => set({ selectedClipId: clipId }),

  hoveredTrackId: null,
  setHoveredTrack: (trackId) => set({ hoveredTrackId: trackId }),

  snapping: true,
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),

  sidebarFolder: null,
  setSidebarFolder: (path) => set({ sidebarFolder: path }),
}))
