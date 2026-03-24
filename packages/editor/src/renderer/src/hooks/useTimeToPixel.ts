import { useUiStore } from '../store/uiStore'

export function useTimeToPixel(): {
  timeToPixel: (sec: number) => number
  pixelToTime: (px: number) => number
  zoom: number
} {
  const zoom = useUiStore((s) => s.zoom)
  return {
    timeToPixel: (sec: number) => sec * zoom,
    pixelToTime: (px: number) => px / zoom,
    zoom,
  }
}
