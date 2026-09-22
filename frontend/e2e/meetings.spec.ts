import { test, expect } from './fixtures'

test.describe('Meetings Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/meetings')
  })

  test('displays list of meetings and plan details', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Meetings')

    const meetingList = page.locator('ul.meeting-list')
    await expect(meetingList).toBeVisible()

    const meetingButtons = meetingList.locator('button.meeting-btn')
    await expect(meetingButtons).toHaveCount(3)

    // First meeting details are shown in header
    const planHeading = page.locator('#plan-h')
    await expect(planHeading).toBeVisible()

    // Selecting another meeting updates the active view
    const firstMeeting = meetingButtons.first()
    await firstMeeting.click()

    const firstMeetingTitle = await firstMeeting.locator('strong').textContent()
    await expect(planHeading).toHaveText(firstMeetingTitle || '')
  })

  test('schedules preparation time for a meeting', async ({ page }) => {
    const addPrepBtn = page.locator('button:has-text("Add preparation time")')
    await expect(addPrepBtn).toBeVisible()
    await addPrepBtn.click()

    const toast = page.locator('.toast').last()
    await expect(toast).toContainText('Preparation added to your tray')
  })

  test('switches meeting phases between Before, During, and After', async ({ page }) => {
    const phaseControl = page.locator('[aria-label="Meeting phase"]')
    await expect(phaseControl).toBeVisible()

    // Switch to "During" phase
    await phaseControl.getByRole('radio', { name: 'During' }).click()
    await expect(page.locator('.focus-stage')).toBeVisible()
    await expect(page.locator('button:has-text("Start timer")')).toBeVisible()

    // Switch to "After" phase
    await phaseControl.getByRole('radio', { name: 'After' }).click()
    await expect(page.locator('h3:has-text("Review before sharing")')).toBeVisible()
    await expect(page.locator('button:has-text("Copy summary to share")')).toBeVisible()

    // Switch back to "Before"
    await phaseControl.getByRole('radio', { name: 'Before' }).click()
    await expect(page.locator('#plan-h')).toBeVisible()
  })

  test('edits meeting plan fields and persists changes', async ({ page }) => {
    const prepInput = page.locator('#pf-prep')
    await expect(prepInput).toBeVisible()

    const customPrepNote = 'Review key metrics before joining the call.'
    await prepInput.fill(customPrepNote)
    await page.waitForTimeout(300)

    // Reload page to verify local storage persistence
    await page.reload()

    await expect(page.locator('#pf-prep')).toHaveValue(customPrepNote)
  })
})
