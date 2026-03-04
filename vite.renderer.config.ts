import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  build: {
    // Must emit to project-root `/.vite/...` so packaged main can load:
    // app.asar/.vite/renderer/main_window/index.html
    outDir: path.resolve(__dirname, '.vite/renderer/main_window')
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, './src/renderer/src')
    }
  }
})
