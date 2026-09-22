import { test, expect } from './fixtures'

test.describe('Quick Capture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('opens quick capture modal from topbar button and cancels cleanly', async ({ page }) => {
    const quickCaptureBtn = page.locator('header.topbar button:has-text("Quick capture")')
    await expect(quickCaptureBtn).toBeVisible()
    await quickCaptureBtn.click()

    const modal = page.locator('dialog.modal[open]')
    await expect(modal).toBeVisible()
    await expect(modal.locator('h2')).toHaveText('Quick capture')

    const textarea = modal.locator('#qc-text')
    await expect(textarea).toBeVisible()

    // Save button should be disabled when empty
    const saveBtn = modal.locator('button[type="submit"]:has-text("Save to tray")')
    await expect(saveBtn).toBeDisabled()

    // Cancel closes dialog
    await modal.locator('button:has-text("Cancel")').click()
    await expect(page.locator('dialog.modal[open]')).toHaveCount(0)
  })

  test('opens quick capture via shortcut and adds a task to tray', async ({ page }) => {
    // Focus the document body before triggering keyboard shortcut
    await page.locator('body').click()
    const isMac = process.platform === 'darwin'
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k')

    const modal = page.locator('dialog.modal[open]')
    await expect(modal).toBeVisible()

    const textarea = modal.locator('#qc-text')
    const durationInput = modal.locator('#qc-min')
    const saveBtn = modal.locator('button[type="submit"]:has-text("Save to tray")')

    const taskTitle = 'Test automated quick capture task'
    await textarea.fill(taskTitle)
    const durationSummary = modal.locator('summary:has-text("Add a duration")')
    if (await durationSummary.isVisible()) {
      await durationSummary.click()
    }
    await durationInput.fill('25')

    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    // Modal closes
    await expect(page.locator('dialog.modal[open]')).toHaveCount(0)

    // Toast notification appears
    const toast = page.locator('.toast').last()
    await expect(toast).toContainText('Saved to your unscheduled tray')

    // Open unscheduled tray tab on Today page to verify task presence if not already open
    const unscheduledTab = page.locator('button.today-overview-tab:has-text("Unscheduled")')
    if (await unscheduledTab.getAttribute('aria-expanded') !== 'true') {
      await unscheduledTab.click()
    }

    const trayBody = page.locator('#tray-body')
    await expect(trayBody).toBeVisible()
    await expect(trayBody).toContainText(taskTitle)
    await expect(trayBody).toContainText('25m')
  })

  test('submits quick capture using shortcut in textarea', async ({ page }) => {
    // Open using topbar button or shortcut
    const quickCaptureBtn = page.locator('header.topbar button:has-text("Quick capture")')
    await quickCaptureBtn.click()

    const modal = page.locator('dialog.modal[open]')
    await expect(modal).toBeVisible()

    const taskTitle = 'Shortcut submission task'
    const textarea = modal.locator('#qc-text')
    await textarea.fill(taskTitle)
    const isMac = process.platform === 'darwin'
    await textarea.press(isMac ? 'Meta+Enter' : 'Control+Enter')

    await expect(page.locator('dialog.modal[open]')).toHaveCount(0)
    await expect(page.locator('.toast').last()).toContainText('Saved to your unscheduled tray')
  })
})
