import type { Clip } from '@octanis/shared'

interface ClipboardEntry {
  clip: Clip
  audioFileId: string
}

let clipboard: ClipboardEntry | null = null

export function copyToClipboard(entry: ClipboardEntry): void {
  clipboard = structuredClone(entry)
}

export function getClipboard(): ClipboardEntry | null {
  return clipboard
}

export function clearClipboard(): void {
  clipboard = null
}
