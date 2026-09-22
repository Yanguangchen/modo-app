import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Shared repo-root .env files (see .env.example). Only VITE_ names reach the browser.
  envDir: '..',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
