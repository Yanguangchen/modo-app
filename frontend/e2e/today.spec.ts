import { test, expect } from './fixtures'

test.describe('Today Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('displays NowCard and overview tabs', async ({ page }) => {
    const nowCard = page.locator('.now-card')
    await expect(nowCard).toBeVisible()

    const overviewTabs = page.locator('.today-overview-tabs')
    await expect(overviewTabs).toBeVisible()

    const upNextTab = overviewTabs.locator('button.today-overview-tab:has-text("Up next")')
    const trayTab = overviewTabs.locator('button.today-overview-tab:has-text("Unscheduled")')
    const dayTab = overviewTabs.locator('button.today-overview-tab:has-text("Your day")')

    await expect(upNextTab).toBeVisible()
    await expect(trayTab).toBeVisible()
    await expect(dayTab).toBeVisible()

    // Toggling "Up next" panel
    await expect(page.locator('#next-body')).not.toBeVisible()
    await upNextTab.click()
    await expect(page.locator('#next-body')).toBeVisible()

    // Toggling "Unscheduled" panel
    await trayTab.click()
    await expect(page.locator('#tray-body')).toBeVisible()
    await expect(page.locator('#next-body')).not.toBeVisible()

    // Toggling "Your day" panel
    await dayTab.click()
    await expect(page.locator('#day-body')).toBeVisible()
    await expect(page.locator('#tray-body')).not.toBeVisible()

    // Clicking again collapses all
    await dayTab.click()
    await expect(page.locator('#day-body')).not.toBeVisible()
  })

  test('places an unscheduled task onto the plan', async ({ page }) => {
    const trayTab = page.locator('button.today-overview-tab:has-text("Unscheduled")')
    await trayTab.click()

    const trayBody = page.locator('#tray-body')
    await expect(trayBody).toBeVisible()

    const placeBtn = trayBody.locator('button[aria-label*="Place on plan"]').first()
    await expect(placeBtn).toBeVisible()
    await placeBtn.click()

    const toast = page.locator('.toast').last()
    await expect(toast).toContainText('Placed at')
  })

  test('switches views via Floating Toolbar (Kanban, Timeline, Gantt)', async ({ page }) => {
    const toolbar = page.locator('div[role="toolbar"]')
    await expect(toolbar).toBeVisible()

    // Open "Your day" panel from tab or toolbar
    const dayTab = page.locator('button.today-overview-tab:has-text("Your day")')
    await dayTab.click()

    // Kanban is default
    await expect(page.locator('.kanban')).toBeVisible()

    // Switch to Zoomable timeline
    const timelineBtn = toolbar.locator('button[role="radio"][data-tip="Zoomable timeline"]')
    await timelineBtn.click()
    await expect(page.locator('.zt')).toBeVisible()
    await expect(page.locator('.kanban')).toHaveCount(0)

    // Switch to Gantt view
    const ganttBtn = toolbar.locator('button[role="radio"][data-tip="Gantt by category"]')
    await ganttBtn.click()
    await expect(page.locator('.gantt')).toBeVisible()
    await expect(page.locator('.zt')).toHaveCount(0)

    // Switch back to Kanban
    const kanbanBtn = toolbar.locator('button[role="radio"][data-tip="Kanban board"]')
    await kanbanBtn.click()
    await expect(page.locator('.kanban')).toBeVisible()
  })

  test('moves a task between Kanban columns', async ({ page }) => {
    // Open Your day to reveal Kanban
    const dayTab = page.locator('button.today-overview-tab:has-text("Your day")')
    await dayTab.click()

    const kanban = page.locator('.kanban')
    await expect(kanban).toBeVisible()

    const todoCol = kanban.locator('.kanban-col', { hasText: 'To do' })
    const doingCol = kanban.locator('.kanban-col', { hasText: 'Doing' })

    const firstCard = todoCol.locator('.kanban-card').first()
    await expect(firstCard).toBeVisible()
    const cardTitle = await firstCard.locator('.kanban-title').textContent()

    // Move to "Doing" using the card's move button
    const moveToRight = firstCard.locator('button[aria-label*="Move “"]').first()
    await moveToRight.click()

    // Toast indicates task is now Doing
    const toast = page.locator('.toast').last()
    await expect(toast).toContainText(`Doing: ${cardTitle}`)
    await expect(doingCol).toContainText(cardTitle || '')
  })

  test('launches and exits Focus Mode from toolbar start button', async ({ page }) => {
    const toolbar = page.locator('div[role="toolbar"]')
    const startBtn = toolbar.locator('button:has-text("Start")')
    await expect(startBtn).toBeVisible()
    await startBtn.click()

    const focusDialog = page.locator('dialog.focus-modal[open]')
    await expect(focusDialog).toBeVisible()
    await expect(focusDialog.locator('.pomo')).toBeVisible()

    // Press Escape to exit focus mode
    await page.keyboard.press('Escape')

    await expect(page.locator('dialog.focus-modal[open]')).toHaveCount(0)
  })
})
