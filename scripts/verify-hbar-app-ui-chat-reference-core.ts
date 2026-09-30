import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/chat-reference-core-review'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1086, height: 760 } })
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

async function open(variant: number, localized = false): Promise<void> {
  const params = new URLSearchParams({ variant: `hbar-app-ui-chat-${variant}`, mode: 'isolated' })
  if (localized) params.set('chatFixture', 'localized')
  await page.goto(`${baseUrl}/?${params}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator(`[data-hbar-app-ui-component="hbar-app-ui-chat-${variant}"]`)).toBeVisible()
}

async function capture(name: string): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
}

try {
  await mkdir(output, { recursive: true })

  // Different semantic layouts get one default observation; shared send behavior is not replayed here.
  await open(2)
  await expect(page.getByRole('heading', { name: 'Sofia Alvarez', exact: true })).toBeVisible()
  await expect(page.getByRole('log').locator('article')).toHaveCount(5)
  const search = page.locator('[data-hbar-app-ui-field="conversation-search"]')
  await search.fill('Marcus')
  await expect(page.locator('[data-hbar-app-ui-region="direct-contact-list"] > li')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Sofia Alvarez', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Marcus Bell/ }).click()
  await expect(page.getByRole('heading', { name: 'Marcus Bell', exact: true })).toBeVisible()
  await search.fill('')
  await capture('direct-search-target')

  await open(3)
  await expect(page.locator('.lumen-chat-social-nested-reply')).toHaveCount(1)
  const like = page.locator('[data-hbar-app-ui-action="social:toggle-like"][aria-pressed="true"]').first()
  await expect(like).toContainText('42')
  await like.click()
  await expect(page.locator('[data-hbar-app-ui-action="social:toggle-like"]').filter({ hasText: '41' })).toHaveCount(1)
  const sort = page.locator('[data-hbar-app-ui-action="social:sort"]')
  await sort.click()
  await expect(sort).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.lumen-chat-social-reply').first()).toContainText('Sofia Alvarez')
  await capture('social-nested-sorted')

  await open(4)
  await expect(page.locator('[data-hbar-app-ui-region="support-messages"] > article')).toHaveCount(4)
  await expect(page.getByText('decline-log-INV-20418.pdf', { exact: true })).toBeVisible()
  const helpful = page.locator('[data-hbar-app-ui-action="rate-helpful"]')
  await helpful.click()
  await expect(helpful).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-hbar-app-ui-action="minimize-support"]').click()
  await expect(page.locator('[data-hbar-app-ui-region="support-messages"]')).toHaveCount(0)
  await page.locator('[data-hbar-app-ui-action="restore-support"]').click()
  await expect(helpful).toHaveAttribute('aria-pressed', 'true')
  await capture('support-restored-history')

  await open(5)
  await expect(page.locator('[data-hbar-app-ui-field="draft"]')).toHaveCount(0)
  await expect(page.locator('[data-hbar-app-ui-region="group-messages"] > article')).toHaveCount(4)
  await expect(page.locator('[data-hbar-app-ui-action="download-attachment"]')).toHaveCount(2)
  await expect(page.getByText('PNG · 1.8 MB · 2400×1350', { exact: true })).toBeVisible()
  const reaction = page.locator('[data-hbar-app-ui-action="toggle-reaction"][aria-pressed="true"]').first()
  const reactionLabel = await reaction.getAttribute('aria-label')
  await reaction.click()
  await expect(page.getByRole('button', { name: reactionLabel ?? '', exact: true })).toHaveCount(0)
  await capture('group-attachments-reaction')

  await open(6)
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.locator('[data-hbar-app-ui-region="live-messages"] > *')).toHaveCount(8)
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await capture('live-following')

  // Only the split pane and growing thread need a fresh narrow/long-copy check.
  await page.setViewportSize({ width: 320, height: 520 })
  await open(2, true)
  const draft = page.locator('[data-hbar-app-ui-field="draft"]')
  await draft.scrollIntoViewIfNeeded()
  await expect(draft).toBeInViewport()
  expect((await page.getByRole('log').boundingBox())?.height ?? 0).toBeGreaterThan(0)
  await capture('direct-localized-narrow')
  await open(3, true)
  await page.locator('[data-hbar-app-ui-action="social:show-more"]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-hbar-app-ui-action="social:show-more"]')).toBeInViewport()
  const lastReply = await page.locator('[data-hbar-app-ui-region="reply-list"] > li').last().boundingBox()
  const moreReplies = await page.locator('[data-hbar-app-ui-action="social:show-more"]').boundingBox()
  expect(lastReply && moreReplies && moreReplies.y >= lastReply.y + lastReply.height - 1).toBeTruthy()
  await capture('social-localized-narrow')
  expect(errors).toEqual([])
  console.log(
    'Chat2–6 practical reference core passed: search keeps the selected conversation; nested replies/like/sort, full support history/minimize/helpful, message-only attachments/reaction, eight live rows/follow, and representative narrow reachability. External calls, sharing and downloads are request-only; no full visual matrix claimed.',
  )
} finally {
  await browser.close()
}
