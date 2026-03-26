import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './uiStore'

describe('uiStore', () => {
  beforeEach(() => {
    useUiStore.setState({
      theme: 'dark',
      uiIntensity: 'high',
      leftCabinetOpen: false,
      rightCabinetOpen: false,
      settingsOpen: false,
    })
  })

  describe('theme', () => {
    it('starts with dark theme', () => {
      expect(useUiStore.getState().theme).toBe('dark')
    })

    it('toggles dark → light', () => {
      useUiStore.getState().toggleTheme()
      expect(useUiStore.getState().theme).toBe('light')
    })

    it('toggles light → dark', () => {
      useUiStore.getState().toggleTheme()
      useUiStore.getState().toggleTheme()
      expect(useUiStore.getState().theme).toBe('dark')
    })
  })

  describe('uiIntensity', () => {
    it('starts at high', () => {
      expect(useUiStore.getState().uiIntensity).toBe('high')
    })

    it('sets to balanced', () => {
      useUiStore.getState().setUiIntensity('balanced')
      expect(useUiStore.getState().uiIntensity).toBe('balanced')
    })

    it('sets to low', () => {
      useUiStore.getState().setUiIntensity('low')
      expect(useUiStore.getState().uiIntensity).toBe('low')
    })

    it('cycles through values', () => {
      useUiStore.getState().setUiIntensity('balanced')
      expect(useUiStore.getState().uiIntensity).toBe('balanced')

      useUiStore.getState().setUiIntensity('low')
      expect(useUiStore.getState().uiIntensity).toBe('low')

      useUiStore.getState().setUiIntensity('high')
      expect(useUiStore.getState().uiIntensity).toBe('high')
    })
  })

  describe('cabinets', () => {
    it('left cabinet starts closed', () => {
      expect(useUiStore.getState().leftCabinetOpen).toBe(false)
    })

    it('right cabinet starts closed', () => {
      expect(useUiStore.getState().rightCabinetOpen).toBe(false)
    })

    it('toggles left cabinet open and closed', () => {
      useUiStore.getState().toggleLeftCabinet()
      expect(useUiStore.getState().leftCabinetOpen).toBe(true)

      useUiStore.getState().toggleLeftCabinet()
      expect(useUiStore.getState().leftCabinetOpen).toBe(false)
    })

    it('toggles right cabinet open and closed', () => {
      useUiStore.getState().toggleRightCabinet()
      expect(useUiStore.getState().rightCabinetOpen).toBe(true)

      useUiStore.getState().toggleRightCabinet()
      expect(useUiStore.getState().rightCabinetOpen).toBe(false)
    })

    it('left and right cabinets toggle independently', () => {
      useUiStore.getState().toggleLeftCabinet()
      expect(useUiStore.getState().leftCabinetOpen).toBe(true)
      expect(useUiStore.getState().rightCabinetOpen).toBe(false)

      useUiStore.getState().toggleRightCabinet()
      expect(useUiStore.getState().leftCabinetOpen).toBe(true)
      expect(useUiStore.getState().rightCabinetOpen).toBe(true)
    })
  })

  describe('settings', () => {
    it('starts closed', () => {
      expect(useUiStore.getState().settingsOpen).toBe(false)
    })

    it('toggles settings panel', () => {
      useUiStore.getState().toggleSettings()
      expect(useUiStore.getState().settingsOpen).toBe(true)

      useUiStore.getState().toggleSettings()
      expect(useUiStore.getState().settingsOpen).toBe(false)
    })
  })
})
