import { createReadStream, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

/**
 * Serves `/api/*` during development and preview.
 *
 * Production data is published to gh-pages by the Nano pipeline, so it is never
 * bundled. Point DPR_DATA_DIR at a local public directory (the one that contains
 * `api/`) to work offline; otherwise requests are proxied to the live site.
 */
function reportData(): Plugin {
  const dataDir = process.env.DPR_DATA_DIR ? resolve(process.env.DPR_DATA_DIR) : null
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!dataDir || !req.url?.startsWith('/api/')) return next()
    const pathname = decodeURIComponent(req.url.split('?')[0] ?? '')
    const file = resolve(dataDir, `.${pathname}`)
    if (!file.startsWith(dataDir + sep)) {
      res.statusCode = 403
      return res.end()
    }
    try {
      if (!statSync(file).isFile()) throw new Error('not a file')
    } catch {
      res.statusCode = 404
      return res.end()
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    createReadStream(file).pipe(res)
  }
  return {
    name: 'report-data',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}

const liveProxy = process.env.DPR_DATA_DIR
  ? undefined
  : { '/api': { target: 'https://paper.dennysora.me', changeOrigin: true } }

export default defineConfig({
  plugins: [react(), tailwindcss(), reportData()],
  build: { target: 'es2022', sourcemap: false },
  server: { proxy: liveProxy },
  preview: { proxy: liveProxy },
})
