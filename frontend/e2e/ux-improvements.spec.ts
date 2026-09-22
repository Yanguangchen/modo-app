import { test, expect } from './fixtures'

test('Today keeps actions beside the task and supports undo', async ({ page }) => {
  await page.goto('/')
  const title = await page.locator('.now-title').textContent()
  await page.getByRole('group', { name: 'Current task actions' }).getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.toast').filter({ hasText: 'Marked complete' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.now-title')).toHaveText(title!)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.now-title')).toHaveText(title!)
  await expect(page.getByRole('toolbar', { name: 'Today tools' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Your day/ }).click()
  await page.getByRole('radio', { name: 'Zoomable timeline' }).click()
  await expect(page.locator('.zt')).toBeVisible()
  await page.reload()
  await expect(page.locator('.zt')).toBeVisible()
})

test('starting a task does not force focus mode', async ({ page }) => {
  await page.goto('/')
  await page.locator('.now-actions').getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('dialog.focus-modal[open]')).toHaveCount(0)
  await page.locator('.now-actions').getByRole('button', { name: 'Focus', exact: true }).click()
  await expect(page.locator('dialog.focus-modal[open]')).toBeVisible()
})

test('capture needs only a name and preserves unfinished drafts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Quick capture/ }).click()
  await expect(page.getByLabel('Rough duration (minutes)')).not.toBeVisible()
  await page.getByLabel('What do you want to remember?').fill('Saved capture draft')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: /^Quick capture/ }).click()
  await expect(page.getByLabel('What do you want to remember?')).toHaveValue('Saved capture draft')
  await page.getByRole('button', { name: 'Save to tray', exact: true }).click()
  await page.getByRole('button', { name: /^Unscheduled/ }).click()
  await expect(page.locator('.tray-item').filter({ hasText: 'Saved capture draft' })).toContainText('15m')
})

test('Guide is chat-first and preserves drafts across views, navigation, and reload', async ({ page }) => {
  await page.goto('/guide')
  const composer = page.locator('.guide-composer textarea')
  await expect(composer).toBeVisible()
  await composer.fill('Keep this unfinished question')
  await page.getByRole('button', { name: 'My preferences', exact: true }).click()
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(composer).toHaveValue('Keep this unfinished question')
  await page.locator('.sidebar').getByRole('link', { name: 'Today', exact: true }).click()
  await page.locator('.sidebar').getByRole('link', { name: 'Communication style', exact: true }).click()
  await expect(composer).toHaveValue('Keep this unfinished question')
  await page.reload()
  await expect(composer).toHaveValue('Keep this unfinished question')
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  await page.getByRole('button', { name: 'History (1)', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Keep this unfinished question/ }).click()
  await expect(composer).toHaveValue('Keep this unfinished question')
})

test('Guide reply survives navigation while generating and can be restored from history', async ({ page }) => {
  await page.goto('/guide')
  await page.locator('.guide-composer textarea').fill('Help me ask for a deadline')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.locator('.sidebar').getByRole('link', { name: 'Today', exact: true }).click()
  await page.locator('.sidebar').getByRole('link', { name: 'Communication style', exact: true }).click()
  await expect(page.locator('.chat-row.is-assistant')).toHaveCount(2)
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  await expect(page.locator('.chat-row.is-user')).toHaveCount(0)
  await page.getByRole('button', { name: 'History (1)', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Help me ask for a deadline/ }).click()
  await expect(page.locator('.chat-row.is-user')).toContainText('Help me ask for a deadline')
  await expect(page.locator('.chat-row.is-assistant')).toHaveCount(2)
})

test('task context requires review before being included in a prompt', async ({ page }) => {
  await page.goto('/')
  const title = await page.locator('.now-title').textContent()
  await page.getByRole('button', { name: 'Ask Guide', exact: true }).click()
  await expect(page.locator('.task-context-preview')).toContainText(title!)
  await expect(page.locator('.guide-composer textarea')).toHaveValue('')
  await expect(page.locator('.chat-row.is-user')).toHaveCount(0)
  await page.getByRole('button', { name: 'Include in draft', exact: true }).click()
  await expect(page.locator('.guide-composer textarea')).toHaveValue(new RegExp(title!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  await expect(page.locator('.chat-row.is-user')).toHaveCount(0)
})

test('Clarify preserves conversations and hides optional formatting until requested', async ({ page }) => {
  await page.goto('/clarify')
  await expect(page.locator('.chat-styles')).not.toBeVisible()
  await page.locator('#chat-text').fill('Review the proposal by Thursday.')
  await page.locator('.chat-send').click()
  const fallbackBtn = page.locator('button:has-text("Use offline rules")')
  if (await fallbackBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fallbackBtn.click()
  }
  await expect(page.locator('.chat-row.is-ai .result-card').first()).toBeVisible()
  await page.getByRole('button', { name: 'New conversation', exact: true }).click()
  await page.getByRole('button', { name: 'History (1)', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Review the proposal by Thursday/ }).click()
  await expect(page.locator('.chat-row.is-user')).toContainText('Review the proposal by Thursday.')
  await page.locator('#chat-text').fill('An unfinished follow-up')
  await page.reload()
  await expect(page.locator('#chat-text')).toHaveValue('An unfinished follow-up')
})

test('quiet appearance is reversible and sound defaults off', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: 'Unmute audio feedback', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Use quiet appearance', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  await expect(page.locator('html')).toHaveAttribute('data-surface', 'solid')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-surface', 'glass')
})

test('mobile screens have no horizontal overflow or runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of ['/', '/guide', '/clarify', '/settings']) {
    await page.goto(route)
    await expect(page.locator('main')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), route).toBe(true)
  }
  expect(errors).toEqual([])
})

test('meeting actions are reviewed before creating tasks and are not duplicated', async ({ page }) => {
  await page.goto('/meetings')
  await page.getByRole('radio', { name: 'After', exact: true }).click()
  const actions = page.locator('.output-col').filter({ has: page.getByRole('heading', { name: 'Actions', exact: true }) })
  await actions.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByLabel('Actions 1', { exact: true }).fill('Send the reviewed meeting outline')
  await page.getByRole('button', { name: 'Add actions to tray', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Review actions for Today' })
  await expect(review).toContainText('Send the reviewed meeting outline')
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Add actions to tray', exact: true }).click()
  await review.getByRole('button', { name: 'Add 1 to Today', exact: true }).click()
  await page.getByRole('button', { name: 'Add actions to tray', exact: true }).click()
  await expect(review).not.toBeVisible()
  await expect(page.locator('.toast').filter({ hasText: 'No new actions' })).toBeVisible()
  await page.getByRole('button', { name: 'View Today', exact: true }).click()
  await page.getByRole('button', { name: /^Unscheduled/ }).click()
  await expect(page.locator('.tray-item').filter({ hasText: 'Send the reviewed meeting outline' })).toHaveCount(1)
})

test('failed draft storage is reported without discarding the in-memory draft', async ({ page }) => {
  await page.addInitScript(() => {
    const save = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'clarity.guide.draft') throw new DOMException('Storage full', 'QuotaExceededError')
      return save.call(this, key, value)
    }
  })
  await page.goto('/guide')
  await page.locator('.guide-composer textarea').fill('Keep this even when storage is full')
  await expect(page.locator('.sync-label')).toHaveText('Device save failed — keep this tab open')
  await expect(page.locator('.guide-composer textarea')).toHaveValue('Keep this even when storage is full')
})
