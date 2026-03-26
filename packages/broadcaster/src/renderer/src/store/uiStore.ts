import { create } from 'zustand'

interface UiStore {
  theme: 'dark' | 'light'
  uiIntensity: 'high' | 'balanced' | 'low'
  leftCabinetOpen: boolean
  rightCabinetOpen: boolean
  settingsOpen: boolean
  toggleTheme: () => void
  setUiIntensity: (level: 'high' | 'balanced' | 'low') => void
  toggleLeftCabinet: () => void
  toggleRightCabinet: () => void
  toggleSettings: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  theme: 'dark',
  uiIntensity: 'high',
  leftCabinetOpen: false,
  rightCabinetOpen: false,
  settingsOpen: false,
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setUiIntensity: (level) => set({ uiIntensity: level }),
  toggleLeftCabinet: () => set((s) => ({ leftCabinetOpen: !s.leftCabinetOpen })),
  toggleRightCabinet: () => set((s) => ({ rightCabinetOpen: !s.rightCabinetOpen })),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
}))
