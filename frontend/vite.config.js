import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // index.html is the game; prototype.html is the standalone 3D dealer prototype
      input: { main: 'index.html', prototype: 'prototype.html' },
    },
  },
})
