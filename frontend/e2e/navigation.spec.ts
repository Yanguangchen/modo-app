import { test, expect } from './fixtures'

test.describe('Navigation & Left Toolbar', () => {
  test.beforeEach(async ({ page }) => {
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

    // Navigate to Guide AI
    await nav.getByRole('link', { name: 'Guide AI' }).click()
    await expect(page).toHaveURL(/\/guide/)
    await expect(page).toHaveTitle(/Guide AI · Clarity Workspace/)
    await expect(nav.getByRole('link', { name: 'Guide AI' })).toHaveAttribute('aria-current', 'page')

    // Navigate to Settings
    await nav.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page).toHaveTitle(/Settings · Clarity Workspace/)
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')

    // Navigate back to Today
    await nav.getByRole('link', { name: 'Today' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
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

    // Check initial state (unmuted by default)
    await expect(muteBtn).toHaveAttribute('aria-label', 'Mute audio feedback')

    // Click to mute
    await muteBtn.click()
    await expect(muteBtn).toHaveAttribute('aria-label', 'Unmute audio feedback')
    await expect(page.locator('.toast').last()).toContainText('Audio feedback: muted')

    // Click to unmute
    await muteBtn.click()
    await expect(muteBtn).toHaveAttribute('aria-label', 'Mute audio feedback')
    await expect(page.locator('.toast').last()).toContainText('Audio feedback: unmuted')
  })
})
