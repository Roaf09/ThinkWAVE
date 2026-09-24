import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Lets the client import the pure server scorer modules directly
    // (no client mirror to drift). Only pure files with no node deps.
    fs: { allow: [".."] },
  },
})
