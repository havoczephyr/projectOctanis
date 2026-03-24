/// <reference types="vite/client" />

import type { OctanisAPI } from '../../preload/api'

declare global {
  interface Window {
    octanis: OctanisAPI
  }
}
