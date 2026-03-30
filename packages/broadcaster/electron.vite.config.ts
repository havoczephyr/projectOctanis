import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@octanis/shared'] })],
    resolve: {
      alias: {
        '@octanis/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          streamWorker: resolve(__dirname, 'src/main/streamWorker.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@octanis/shared'] })],
    resolve: {
      alias: {
        '@octanis/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@octanis/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    plugins: [react()],
  },
})
