import { create } from 'zustand'

const STORAGE_KEY = 'octanis-recent-projects'
const MAX_RECENT = 10

export interface RecentProject {
  title: string
  filePath: string
  lastOpened: string
}

interface RecentProjectsState {
  recentProjects: RecentProject[]
  addRecent: (title: string, filePath: string) => void
  removeRecent: (filePath: string) => void
}

function loadFromStorage(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RecentProject[]
  } catch {
    return []
  }
}

function saveToStorage(projects: RecentProject[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export const useRecentProjectsStore = create<RecentProjectsState>()((set) => ({
  recentProjects: loadFromStorage(),

  addRecent: (title, filePath) =>
    set((state) => {
      const filtered = state.recentProjects.filter((p) => p.filePath !== filePath)
      const updated = [
        { title, filePath, lastOpened: new Date().toISOString() },
        ...filtered,
      ].slice(0, MAX_RECENT)
      saveToStorage(updated)
      return { recentProjects: updated }
    }),

  removeRecent: (filePath) =>
    set((state) => {
      const updated = state.recentProjects.filter((p) => p.filePath !== filePath)
      saveToStorage(updated)
      return { recentProjects: updated }
    }),
}))
