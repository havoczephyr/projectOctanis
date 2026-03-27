import type { Clip } from '@octanis/shared'

export type ClipboardEntry =
  | { type: 'clip'; clip: Clip; audioFileId: string }
  | { type: 'file'; audioPath: string }

let clipboard: ClipboardEntry | null = null

export function copyToClipboard(entry: ClipboardEntry): void {
  clipboard = entry.type === 'clip' ? { ...entry, clip: structuredClone(entry.clip) } : { ...entry }
}

export function getClipboard(): ClipboardEntry | null {
  return clipboard
}

export function clearClipboard(): void {
  clipboard = null
}
