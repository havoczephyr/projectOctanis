/// <reference types="vite/client" />

import type { BroadcasterAPI } from '../../preload/api'

declare global {
  interface Window {
    octanis: BroadcasterAPI
  }
}
