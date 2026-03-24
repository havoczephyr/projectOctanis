import { useCallback } from 'react'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'

interface UseFadeRegionActionsOptions {
  trackId: string
  clipId: string
}

export function useFadeRegionActions({ trackId, clipId }: UseFadeRegionActionsOptions) {
  const removeFadeRegion = useProjectStore((s) => s.removeFadeRegion)
  const openFadeGainEditor = useUiStore((s) => s.openFadeGainEditor)

  /** Double-click to delete a region */
  const onRegionDoubleClick = useCallback(
    (e: React.MouseEvent, regionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      removeFadeRegion(trackId, clipId, regionId)
    },
    [trackId, clipId, removeFadeRegion]
  )

  /** Click a bookmark to open the fade gain editor popup */
  const onBookmarkClick = useCallback(
    (e: React.MouseEvent, regionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      openFadeGainEditor(trackId, clipId, regionId)
    },
    [trackId, clipId, openFadeGainEditor]
  )

  return { onRegionDoubleClick, onBookmarkClick }
}
