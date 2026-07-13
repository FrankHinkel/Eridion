/// <reference types="vite/client" />

import type { EridionDesktopApi } from '../electron/types'

declare global {
  interface Window {
    eridion: EridionDesktopApi
  }
}

export {}

