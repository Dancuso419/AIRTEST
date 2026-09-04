import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// No `base`: Render serves the site from the root of its own domain, so the
// default '/' is correct. A subpath prefix here would 404 every asset.
export default defineConfig({
  plugins: [react()],
})
