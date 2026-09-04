import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// GitHub Pages serves a project site from /<repo>/, so a built page has to
// carry that prefix on every asset URL or the page loads and the bundle 404s.
// The dev server keeps the root, so `npm run dev` is still localhost:5173.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/AIRTEST/' : '/',
}))
