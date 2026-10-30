import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre 6 locates its worker via import.meta.url, which pre-bundling breaks
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
