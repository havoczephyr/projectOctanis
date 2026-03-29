import { create } from 'zustand'
import { nanoid } from 'nanoid'

const STORAGE_KEY = 'octanis-sfu-favorites'
const MAX_FAVORITES = 20

export interface SfuFavorite {
  id: string
  provider: 'cosmic' | 'janus' | 'direct-rtp'
  label: string
  serverUrl: string
  roomId?: number
  janusHost?: string
  janusPort?: number
  displayName?: string
}

interface FavoritesState {
  favorites: SfuFavorite[]
  addFavorite: (fav: Omit<SfuFavorite, 'id'>) => void
  removeFavorite: (id: string) => void
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function loadFromStorage(): SfuFavorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SfuFavorite[]
  } catch {
    return []
  }
}

function saveToStorage(favorites: SfuFavorite[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites))
}

export const useFavoritesStore = create<FavoritesState>()((set) => ({
  favorites: loadFromStorage(),

  addFavorite: (fav) =>
    set((state) => {
      const normalized = normalizeUrl(fav.serverUrl)
      // Deduplicate by provider + serverUrl + roomId
      const filtered = state.favorites.filter(
        (f) =>
          !(
            f.provider === fav.provider &&
            normalizeUrl(f.serverUrl) === normalized &&
            f.roomId === fav.roomId
          )
      )
      const updated = [
        { ...fav, id: nanoid(), serverUrl: normalized },
        ...filtered,
      ].slice(0, MAX_FAVORITES)
      saveToStorage(updated)
      return { favorites: updated }
    }),

  removeFavorite: (id) =>
    set((state) => {
      const updated = state.favorites.filter((f) => f.id !== id)
      saveToStorage(updated)
      return { favorites: updated }
    }),
}))
