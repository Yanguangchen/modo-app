import { test as base, expect } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    // Ensure clean state before each test run, but allow page.reload() within a test to preserve persisted storage
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__e2e_seeded')) {
        localStorage.clear()
        sessionStorage.setItem('__e2e_seeded', 'true')
      }
    })
    await use(page)
  },
})

export { expect }
