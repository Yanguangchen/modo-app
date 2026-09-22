import { defineConfig, devices } from '@playwright/test'

// Isolated local-preview server: regression tests never send prompts to live AI.
export default defineConfig({
  testDir: './e2e',
  testMatch: process.env.UX_ALL_TESTS === '1' ? '**/*.spec.ts' : 'ux-improvements.spec.ts',
  timeout: 30_000,
  workers: 2,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5197', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 5197 --strictPort',
    env: { VITE_GUIDE_CHAT_DEMO_MODE: 'true', VITE_CLARIFY_DEMO_MODE: 'true' },
    url: 'http://localhost:5197',
    reuseExistingServer: false,
  },
})
