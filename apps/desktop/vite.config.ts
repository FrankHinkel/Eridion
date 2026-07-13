import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => ({
  plugins: [vue(), ...(mode === 'test' ? [] : [
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { input: resolve(__dirname, 'electron/preload.ts') },
      renderer: {}
    })
  ])],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  server: { host: '127.0.0.1', port: 51894, strictPort: true },
  test: { environment: 'node' }
}))
