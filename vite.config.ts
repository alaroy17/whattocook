import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// На GitHub Pages сайт живёт по адресу https://<user>.github.io/<repo>/,
// поэтому base должен совпадать с именем репозитория. Workflow подставляет его сам.
const base = process.env.VITE_BASE || '/WhatToCook/'

/** Генерирует service worker со списком собранных файлов для офлайн-режима. */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'what-to-cook-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((file) => /\.(js|css|woff2?)$/.test(file))
        .map((file) => base + file)
      const precache = [base, base + 'manifest.webmanifest', ...assets]
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8')
      const source = template
        .replace('"__PRECACHE__"', JSON.stringify(precache))
        .replace(/__VERSION__/g, String(Date.now()))
        .replace(/__BASE__/g, base)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), serviceWorkerPlugin()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 5180,
    host: true,
  },
})
