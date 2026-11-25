import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// HTTPS: той самий dev-сертифікат ASP.NET Core, експортований у ../.certs (див. start.bat).
// Якщо сертифіката немає — Vite працює по HTTP.
const certDir = fileURLToPath(new URL('../.certs', import.meta.url))
const certFile = path.join(certDir, 'localhost.pem')
const keyFile = path.join(certDir, 'localhost.key')
const https = fs.existsSync(certFile) && fs.existsSync(keyFile)
  ? { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }
  : undefined

// Бекенд: профіль https (https://localhost:7080). secure: false — бо сертифікат локальний.
const backend = process.env.API_URL ?? 'https://localhost:7080'

// Політика безпеки вмісту (CSP) для зібраної версії (npm run build / preview).
// У dev-режимі не додається: Vite вбудовує скрипти гарячого перезавантаження.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Ant Design генерує стилі під час роботи (CSS-in-JS)
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "connect-src 'self' wss: ws:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const cspPlugin: Plugin = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
}

const proxy = {
  '/api': { target: backend, changeOrigin: true, secure: false },
  '/hubs': { target: backend, changeOrigin: true, secure: false, ws: true },
  '/swagger': { target: backend, changeOrigin: true, secure: false },
}

export default defineConfig({
  plugins: [react(), cspPlugin],
  server: { port: 5173, strictPort: true, https, proxy },
  preview: { port: 5173, strictPort: true, https, proxy },
  build: { chunkSizeWarningLimit: 2500 },
})
