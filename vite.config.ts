import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  build: {
    // Read by scripts/check-bundle-size.mjs to work out exactly which JS chunks load on first
    // paint (the entry chunk + everything it imports statically, not the lazy route chunks).
    manifest: true,
  },
})
