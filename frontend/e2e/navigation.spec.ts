import { test, expect } from './fixtures'

test.describe('Navigation & Left Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('clarity.v1')
    })
    await page.goto('/')
  })

  test('loads home page with skip link, topbar, and expanded sidebar', async ({ page }) => {
    await expect(page).toHaveTitle(/Today · Clarity Workspace/)

    const skipLink = page.locator('a.skip-link')
    await expect(skipLink).toBeAttached()
    await expect(skipLink).toHaveAttribute('href', '#main')

    const sidebar = page.locator('#primary-sidebar')
    await expect(sidebar).toBeVisible()

    const topbar = page.locator('header.topbar')
    await expect(topbar).toBeVisible()
    await expect(topbar.locator('.topbar-title strong')).toHaveText('Today')
  })

  test('navigates across all primary routes and updates active states', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]')

    // Navigate to Clarify
    await nav.getByRole('link', { name: 'Clarify' }).click()
    await expect(page).toHaveURL(/\/clarify/)
    await expect(page).toHaveTitle(/Clarify · Clarity Workspace/)
    await expect(nav.getByRole('link', { name: 'Clarify' })).toHaveAttribute('aria-current', 'page')

    // Navigate to Meetings
    await nav.getByRole('link', { name: 'Meetings' }).click()
    await expect(page).toHaveURL(/\/meetings/)
    await expect(page).toHaveTitle(/Meetings · Clarity Workspace/)
    await expect(nav.getByRole('link', { name: 'Meetings' })).toHaveAttribute('aria-current', 'page')

    // Navigate to Communication style
    await nav.getByRole('link', { name: 'Communication style' }).click()
    await expect(page).toHaveURL(/\/guide/)
    await expect(page).toHaveTitle(/Communication style · Clarity Workspace/)
    await expect(nav.getByRole('link', { name: 'Communication style' })).toHaveAttribute('aria-current', 'page')

    // Navigate to Settings
    const settings = page.locator('.sidebar-settings').getByRole('link', { name: 'Settings' })
    await settings.click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page).toHaveTitle(/Settings · Clarity Workspace/)
    await expect(settings).toHaveAttribute('aria-current', 'page')

    // Navigate back to Today
    await nav.getByRole('link', { name: 'Today' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  })

  test('Settings is an icon-only footer link in both sidebar sizes', async ({ page }) => {
    const sidebar = page.locator('#primary-sidebar')
    const settings = sidebar.getByRole('link', { name: 'Settings', exact: true })
    await expect(sidebar.locator('.nav').getByRole('link', { name: 'Settings' })).toHaveCount(0)
    await expect(settings).toHaveText('')
    await expect(settings.locator('svg')).toBeVisible()
    const checkBottom = async () => {
      const rail = await sidebar.boundingBox()
      const gear = await settings.boundingBox()
      expect(rail!.y + rail!.height - (gear!.y + gear!.height)).toBeLessThan(40)
    }
    await checkBottom()
    await settings.click()
    await expect(settings).toHaveAttribute('aria-current', 'page')
    await expect(sidebar.locator('.nav-pill')).toHaveCSS('opacity', '0')
    await sidebar.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
    await expect(settings).toBeVisible()
    await checkBottom()
    await settings.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/settings$/)
  })

  test('animates left toolbar open and close via toggle button', async ({ page }) => {
    const app = page.locator('.app')
    const sidebar = page.locator('#primary-sidebar')
    const toggleBtn = sidebar.locator('.sidebar-toggle')
    const todayLink = sidebar.locator('.nav-link').first()

    // 1. Initial State: Expanded
    await expect(app).not.toHaveClass(/sidebar-collapsed/)
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true')
    await expect(toggleBtn).toHaveAttribute('aria-label', 'Collapse sidebar')

    const initialBox = await sidebar.boundingBox()
    expect(initialBox).not.toBeNull()
    expect(initialBox!.width).toBeGreaterThan(200)

    // Check that nav label is visible
    const label = todayLink.locator('.nav-label')
    await expect(label).toBeVisible()

    // 2. Click toggle button to collapse
    await toggleBtn.click()

    // App receives .sidebar-collapsed
    await expect(app).toHaveClass(/sidebar-collapsed/)
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
    await expect(toggleBtn).toHaveAttribute('aria-label', 'Expand sidebar')

    // Wait for transition to complete
    await page.waitForTimeout(600)

    const collapsedBox = await sidebar.boundingBox()
    expect(collapsedBox).not.toBeNull()
    expect(collapsedBox!.width).toBeLessThanOrEqual(80)

    // Nav link has data-nav-label attribute for tooltip in collapsed mode
    await expect(todayLink).toHaveAttribute('data-nav-label', 'Today')

    // 3. Click toggle button to expand again
    await toggleBtn.click()

    await expect(app).not.toHaveClass(/sidebar-collapsed/)
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true')

    await page.waitForTimeout(600)

    const expandedBox = await sidebar.boundingBox()
    expect(expandedBox).not.toBeNull()
    expect(expandedBox!.width).toBeGreaterThan(200)
    await expect(label).toBeVisible()
  })

  test('toggles sidebar via Cmd/Ctrl + B keyboard shortcut', async ({ page }) => {
    const app = page.locator('.app')
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'

    // Initial state: expanded
    await expect(app).not.toHaveClass(/sidebar-collapsed/)

    // Press Cmd/Ctrl + B to collapse
    await page.keyboard.press(`${modifier}+b`)
    await expect(app).toHaveClass(/sidebar-collapsed/)

    // Press Cmd/Ctrl + B to expand
    await page.keyboard.press(`${modifier}+b`)
    await expect(app).not.toHaveClass(/sidebar-collapsed/)
  })

  test('toggles audio mute feedback in the topbar', async ({ page }) => {
    const muteBtn = page.locator('header.topbar button[aria-label*="audio feedback"]')
    await expect(muteBtn).toBeVisible()

    const initialLabel = await muteBtn.getAttribute('aria-label')
    const isInitiallyMuted = initialLabel === 'Unmute audio feedback'

    // Click to toggle
    await muteBtn.click()
    const nextExpected = isInitiallyMuted ? 'Mute audio feedback' : 'Unmute audio feedback'
    await expect(muteBtn).toHaveAttribute('aria-label', nextExpected)
    await expect(page.locator('.toast').last()).toContainText(isInitiallyMuted ? 'Audio feedback: unmuted' : 'Audio feedback: muted')

    // Click to toggle back
    await muteBtn.click()
    await expect(muteBtn).toHaveAttribute('aria-label', initialLabel!)
    await expect(page.locator('.toast').last()).toContainText(isInitiallyMuted ? 'Audio feedback: muted' : 'Audio feedback: unmuted')
  })
})
