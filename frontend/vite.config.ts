import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Запити /api та /hubs (SignalR) проксуються на бекенд ASP.NET Core
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5080',
      '/hubs': { target: 'http://localhost:5080', ws: true },
    },
  },
})
