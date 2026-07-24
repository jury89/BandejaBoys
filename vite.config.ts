import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

function buildVersionPlugin(buildId: string): Plugin {
  const payload = JSON.stringify({ buildId })
  return {
    name: 'bandeja-build-version',
    configureServer(server) {
      server.middlewares.use('/version.json', (_request, response) => {
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Type', 'application/json')
        response.end(payload)
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      })
    },
  }
}

export default defineConfig(() => {
  const buildId = new Date().toISOString()
  return {
    define: {
      __BANDEJA_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [react(), buildVersionPlugin(buildId)],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      css: true,
      testTimeout: 10_000,
    },
  }
})
