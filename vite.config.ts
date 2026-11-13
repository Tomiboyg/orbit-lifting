import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))

// GitHub Pages serves the app under /<repo-name>/ unless a custom domain is used.
// CI sets BASE_PATH; locally the app runs at "/".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default defineConfig(({ mode }: any) => {
  const base = process.env.BASE_PATH || '/'
  return {
    base,
    plugins: [
      react(),
      {
        // SPA fallback for GitHub Pages: copy index.html to 404.html after build.
        name: 'spa-fallback-404',
        closeBundle() {
          if (mode !== 'production') return
          try {
            const outDir = resolve(root, 'dist')
            cpSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
          } catch {
            // build output missing; nothing to do
          }
        },
      },
    ],
    build: {
      target: 'es2020',
      sourcemap: false,
    },
  }
})
