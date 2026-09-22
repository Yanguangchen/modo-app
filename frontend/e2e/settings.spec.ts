import { test, expect } from './fixtures'

test.describe('Settings Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
  })

  test('displays settings cards and toggles accordion expansion', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Settings & Preferences')

    // Find the Sensory & Display card toggle button
    const sensoryBtn = page.locator('button[aria-controls="card-body-sensory"]')
    await expect(sensoryBtn).toBeVisible()
    await expect(sensoryBtn).toHaveAttribute('aria-expanded', 'false')

    // Click to open
    await sensoryBtn.click()
    await expect(sensoryBtn).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#card-body-sensory')).toBeVisible()

    // Click to close
    await sensoryBtn.click()
    await expect(sensoryBtn).toHaveAttribute('aria-expanded', 'false')
  })

  test('toggles theme, motion, and typography preferences updating root DOM attributes', async ({ page }) => {
    // Open Sensory & Display card
    await page.locator('button[aria-controls="card-body-sensory"]').click()

    // 1. Theme toggle
    const themeControl = page.locator('[aria-label="Theme"]')
    await expect(themeControl).toBeVisible()

    // Select Dark theme
    await themeControl.getByRole('radio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // Select Light theme
    await themeControl.getByRole('radio', { name: 'Light' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    // 2. Motion toggle
    const motionControl = page.locator('[aria-label="Motion"]')
    await expect(motionControl).toBeVisible()

    // Select Reduced motion
    await motionControl.getByRole('radio', { name: 'Reduced motion' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')

    // Select Full motion
    await motionControl.getByRole('radio', { name: 'Full motion' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full')

    // 3. Audio feedback
    const audioControl = page.locator('[aria-label="Audio feedback"]')
    await audioControl.getByRole('radio', { name: 'Muted' }).click()
    const muteStatus = await page.evaluate(() => {
      const stored = localStorage.getItem('clarity.v1')
      return stored ? JSON.parse(stored).prefs?.soundEnabled : null
    })
    expect(muteStatus).toBe(false)
  })

  test('adjusts schedule boundaries and quiet hours', async ({ page }) => {
    // Open Schedule & Boundaries card
    await page.locator('button[aria-controls="card-body-schedule"]').click()

    const bufferInput = page.locator('#pref-buffer')
    await expect(bufferInput).toBeVisible()
    await bufferInput.fill('15')

    const quietStartInput = page.locator('#pref-quiet-start')
    await quietStartInput.fill('21:00')

    const quietEndInput = page.locator('#pref-quiet-end')
    await quietEndInput.fill('08:30')

    // Verify stored preferences reflect changes
    await page.waitForTimeout(200)
    const prefs = await page.evaluate(() => {
      const stored = localStorage.getItem('clarity.v1')
      return stored ? JSON.parse(stored).prefs : null
    })
    expect(prefs?.bufferMinutes).toBe(15)
    expect(prefs?.quietStart).toBe('21:00')
    expect(prefs?.quietEnd).toBe('08:30')
  })

  test('handles privacy actions and data reset with confirmation', async ({ page }) => {
    // Open Privacy & Data Ownership card
    await page.locator('button[aria-controls="card-body-privacy"]').click()

    const exportBtn = page.locator('button:has-text("Export my data (JSON)")')
    await expect(exportBtn).toBeVisible()

    const resetBtn = page.locator('button:has-text("Reset all local data")')
    await expect(resetBtn).toBeVisible()

    // Listen for the confirmation dialog
    page.once('dialog', dialog => dialog.accept())
    await resetBtn.click()

    // Confirmation toast should be displayed
    const toast = page.locator('.toast').last()
    await expect(toast).toContainText('All local data and preferences have been reset')
  })
})
