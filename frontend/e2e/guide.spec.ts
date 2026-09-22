import { test, expect } from './fixtures'

test.describe('Guide AI & Preferences Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guide')
  })

  test('displays preferences deck and allows customizing communication style', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Communication style')

    // Switch to My preferences view
    const prefsBtn = page.getByRole('button', { name: 'My preferences' })
    await expect(prefsBtn).toBeVisible()
    await prefsBtn.click()

    const deck = page.locator('.wg-deck')
    await expect(deck).toBeVisible()

    // First card: Format preferences
    const formatCard = deck.locator('.wg-card').first()
    await expect(formatCard.locator('.wg-title')).toHaveText('Format')

    // Toggle a quick-pick option (e.g., "Bullet points")
    const bulletPick = formatCard.locator('button.wg-pick:has-text("Bullet points")')
    await expect(bulletPick).toBeVisible()
    const initiallyPressed = await bulletPick.getAttribute('aria-pressed') === 'true'
    await bulletPick.click()
    await expect(bulletPick).toHaveAttribute('aria-pressed', (!initiallyPressed).toString())

    // Switch preview role to "As my team"
    const teamRoleBtn = page.locator('.wg-role[aria-label="As my team"]')
    await expect(teamRoleBtn).toBeVisible()
    await teamRoleBtn.click()

    // Preview view should now be displayed
    await expect(page.locator('.wg-preview')).toBeVisible()

    // Switch back to "Edit" role
    const editRoleBtn = page.locator('.wg-role[aria-label="Edit"]')
    await editRoleBtn.click()
    await expect(deck).toBeVisible()
  })

  test('interacts with Guide AI conversation in Ask tab', async ({ page }) => {
    // Switch to Ask tab
    await page.getByRole('button', { name: 'Ask', exact: true }).click()

    const chatSection = page.locator('.guide-chat')
    await expect(chatSection).toBeVisible()
    await expect(chatSection.locator('header strong')).toHaveText('Communication coach')

    // Initial starter message should be present
    const firstAssistantMsg = page.locator('.chat-row.is-assistant .chat-bubble').first()
    await expect(firstAssistantMsg).toBeVisible()

    // Click a quick prompt button
    const firstPromptBtn = page.locator('.quick-prompts button').first()
    const promptText = await firstPromptBtn.textContent()
    expect(promptText).toBeTruthy()
    await firstPromptBtn.click()

    // User message bubble appears
    await expect(page.locator('.chat-row.is-user .chat-bubble').first()).toContainText(promptText || '')

    // Assistant response arrives (within ~4 seconds)
    const assistantMessages = page.locator('.chat-row.is-assistant .chat-bubble')
    await expect(assistantMessages).toHaveCount(2, { timeout: 4000 })

    // Clear conversation
    const clearBtn = page.locator('button.chat-clear')
    await expect(clearBtn).toBeEnabled()
    await clearBtn.click()

    // Back to 1 assistant message
    await expect(assistantMessages).toHaveCount(1)
  })

  test('searches and filters Knowledge Sources', async ({ page }) => {
    // Switch to Sources tab
    await page.getByRole('button', { name: 'Sources' }).click()

    const searchInput = page.locator('input[aria-label="Search sources"]')
    await expect(searchInput).toBeVisible()

    // Check articles are present
    const articles = page.locator('article.article')
    const count = await articles.count()
    expect(count).toBeGreaterThan(0)

    // Filter by searching
    await searchInput.fill('feedback')
    await page.waitForTimeout(200)

    // Expanding first filtered article
    const firstArticle = page.locator('article.article').first()
    const expandBtn = firstArticle.locator('button[aria-label="Expand"]')
    await expect(expandBtn).toBeVisible()
    await expandBtn.click()

    // Article body should now be open
    await expect(firstArticle.locator('.disclose.open')).toBeVisible()

    // Clearing search restores list
    await searchInput.fill('')
    await expect(page.locator('article.article')).toHaveCount(count)
  })
})
