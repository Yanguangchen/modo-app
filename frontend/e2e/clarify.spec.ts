import { test, expect } from './fixtures'

test.describe('Clarify Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/clarify')
  })

  test('displays empty state with quick suggestions and style picker', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Clarify')

    const emptyState = page.locator('.chat-empty')
    await expect(emptyState).toBeVisible()
    await expect(emptyState.locator('h2')).toHaveText('What would you like to make clearer?')

    const suggestions = emptyState.locator('.chat-suggestion')
    await expect(suggestions).toHaveCount(3)

    // Check style picker in composer
    const styles = page.locator('.chat-styles .chat-style')
    await expect(styles).toHaveCount(6)

    const textarea = page.locator('#chat-text')
    await expect(textarea).toBeVisible()

    const sendBtn = page.locator('button.chat-send')
    await expect(sendBtn).toBeDisabled()
  })

  test('submits a prompt and receives a structured clarification result', async ({ page }) => {
    const textarea = page.locator('#chat-text')
    const promptText = 'Need feedback on the proposal by tomorrow afternoon ASAP.'
    await textarea.fill(promptText)

    const sendBtn = page.locator('button.chat-send')
    await expect(sendBtn).toBeEnabled()
    await sendBtn.click()

    // User message bubble appears
    const userRow = page.locator('.chat-row.is-user')
    await expect(userRow).toBeVisible()
    await expect(userRow).toContainText(promptText)

    // AI/rules reply arrives
    const aiRow = page.locator('.chat-row.is-ai')
    await expect(aiRow).toBeVisible()

    // When running without auth, the error card offers "Use offline rules" fallback
    const offlineRulesBtn = aiRow.locator('button:has-text("Use offline rules")')
    if (await offlineRulesBtn.isVisible()) {
      await offlineRulesBtn.click()
    }

    // Structured result cards are rendered
    await expect(aiRow.locator('.badge-ai').first()).toBeVisible()
    await expect(aiRow.locator('.result-card').first()).toBeVisible()

    // New conversation button becomes available in the header
    const newConvBtn = page.locator('header, .page-head').locator('button:has-text("New conversation")')
    await expect(newConvBtn).toBeVisible()
    await newConvBtn.click()

    // Thread resets to empty state
    await expect(page.locator('.chat-empty')).toBeVisible()
    await expect(page.locator('.chat-row')).toHaveCount(0)
  })

  test('runs quick suggestion from empty state', async ({ page }) => {
    const firstSuggestion = page.locator('.chat-suggestion').first()
    await expect(firstSuggestion).toBeVisible()
    await firstSuggestion.click()

    // Generates message and response
    await expect(page.locator('.chat-row.is-user')).toBeVisible()
    await expect(page.locator('.chat-row.is-ai')).toBeVisible()
  })
})
