import { expect, test, type Page } from '@playwright/test'
import { mountLumenFixture } from './support/lumen-controls-fixture'
import type { ConversationFixtureOptions } from '../tests/fixtures/conversation-stability-browser'

const viewportSelector = '.lumen-conversation-messages'
const fixtureStyles = `
  html, body, #fixture-root { margin: 0; block-size: 100%; min-block-size: 0; }
  .conversation-stability-fixture { display: flex; block-size: 100%; min-block-size: 0; }
  .fixture-composer { flex: 0 0 auto; box-sizing: border-box; resize: none; inline-size: 100%; }
  .fixture-footer { display: flex; flex-direction: column; flex: 0 0 auto; min-inline-size: 0; }
`

async function configure(page: Page, options: Partial<ConversationFixtureOptions>) {
  await page.evaluate((value) => window.conversationStabilityFixture.configure(value), options)
}

async function measure(page: Page) {
  return page.locator(viewportSelector).evaluate((viewport) => {
    const top = viewport.getBoundingClientRect().top
    const rows = [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')]
    const visible = rows.find((row) => row.getBoundingClientRect().bottom > top)
    const last = rows.at(-1)
    return {
      firstId: visible?.dataset.messageId,
      offset: visible ? visible.getBoundingClientRect().top - top : 0,
      endGap: viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
      lastBottomGap: last ? viewport.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom : 0,
      top: viewport.scrollTop,
    }
  })
}

async function expand(page: Page, id: string) {
  await page.evaluate((value) => window.conversationStabilityFixture.expand(value), id)
  await expect(page.locator(`[data-fixture-body="${id}"]`)).toHaveAttribute('data-expanded', 'true')
}

for (const width of [390, 1440]) {
  test(`bottom anchored chronological conversation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mountLumenFixture(page, 'tests/fixtures/conversation-stability-browser.tsx', {
      locale: width === 390 ? 'zh-CN' : 'en-US',
      styles: fixtureStyles,
    })
    await expect(page.locator('[data-message-id="message-0"]')).toBeVisible()
    await expect.poll(async () => (await measure(page)).lastBottomGap).toBeLessThan(25)
    await configure(page, { count: 20 })
    await expect.poll(async () => (await measure(page)).endGap).toBeLessThan(1)
    // The delayed renderer settles after the old 250ms correction window.
    await page.waitForTimeout(400)
    await expand(page, 'message-0')
    await expect.poll(async () => (await measure(page)).endGap).toBeLessThan(1)
    await configure(page, { count: 30, first: -10 })
    await expect.poll(async () => (await measure(page)).endGap).toBeLessThan(1)
    const ids = await page
      .locator('[data-message-id]')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-message-id')))
    expect(ids[0]).toBe('message--10')
    expect(ids.at(-1)).toBe('message-19')
    const viewport = page.locator(viewportSelector)
    await viewport.hover()
    await page.mouse.wheel(0, -500)
    await expect.poll(async () => (await measure(page)).endGap).toBeGreaterThan(100)
    await page.waitForTimeout(200)
    const reading = await measure(page)
    await expand(page, 'message--10')
    await expect.poll(async () => (await measure(page)).firstId).toBe(reading.firstId)
    await expect.poll(async () => Math.abs((await measure(page)).offset - reading.offset)).toBeLessThan(2)
    await configure(page, { count: 31, first: -10 })
    await expect.poll(async () => (await measure(page)).firstId).toBe(reading.firstId)
    await expect(page.locator('.lumen-conversation-latest')).toBeVisible()
    await page.locator('.lumen-conversation-latest').click()
    await expect.poll(async () => (await measure(page)).endGap).toBeLessThan(1)
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `artifacts/ui-repair/conversation-bottom-${width}.png` })
  })
}

test('late virtual measurements and viewport resize retain the end without stealing old reading', async ({ page }) => {
  await mountLumenFixture(page, 'tests/fixtures/conversation-stability-browser.tsx', { styles: fixtureStyles })
  await configure(page, { count: 100 })
  await expect(page.locator('[data-message-id="message-99"]')).toBeVisible()
  await expect.poll(async () => (await measure(page)).endGap).toBeLessThan(1)
  await page.waitForTimeout(400)
  await expand(page, 'message-98')
  await expect.poll(async () => (await measure(page)).endGap).toBeLessThan(1)
  await page.setViewportSize({ width: 800, height: 620 })
  await expect.poll(async () => (await measure(page)).endGap).toBeLessThan(1)
  await page.locator(viewportSelector).hover()
  await page.mouse.wheel(0, -1200)
  await page.waitForTimeout(300)
  const reading = await measure(page)
  await configure(page, { count: 110, first: -10 })
  await expect.poll(async () => (await measure(page)).firstId).toBe(reading.firstId)
  await expect.poll(async () => Math.abs((await measure(page)).offset - reading.offset)).toBeLessThan(2)
  await configure(page, { followLatest: false })
  await page.waitForTimeout(400)
  const paused = await measure(page)
  await page.setViewportSize({ width: 800, height: 520 })
  await expect.poll(async () => (await measure(page)).firstId).toBe(paused.firstId)
  await expect.poll(async () => Math.abs((await measure(page)).offset - paused.offset)).toBeLessThan(2)
})

for (const width of [390, 1440]) {
  test(`current session status remains outside transcript scroll and aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mountLumenFixture(page, 'tests/fixtures/conversation-stability-browser.tsx', {
      locale: width === 390 ? 'zh-CN' : 'en-US',
      styles: fixtureStyles,
    })
    await configure(page, { count: 30, runStatus: 'running' })
    const status = page.locator('[data-session-live-status]')
    await expect(status).toBeVisible()
    await expect.poll(async () => (await measure(page)).endGap).toBeLessThan(1)
    const beforeScroll = await status.boundingBox()
    await page.locator(viewportSelector).hover()
    await page.mouse.wheel(0, -800)
    await expect.poll(async () => (await measure(page)).endGap).toBeGreaterThan(100)
    const reading = await measure(page)
    expect(await status.boundingBox()).toEqual(beforeScroll)
    await configure(page, { runStatus: 'waiting_approval' })
    await expect(status).toHaveAttribute('data-run-status', 'waiting_approval')
    await expect.poll(async () => (await measure(page)).firstId).toBe(reading.firstId)
    await configure(page, { connected: false, longLabels: true })
    await expect(status).toHaveAttribute('data-run-status', 'unconfirmed')
    expect(await status.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: `artifacts/ui-repair/conversation-live-status-${width}.png` })
    await configure(page, { session: 'session-b' })
    await expect(status).toHaveCount(0)
    await configure(page, { timelineSession: 'session-b', connected: true, owned: false })
    await expect(status).toHaveCount(0)
    await configure(page, { owned: true, runStatus: 'queued' })
    await expect(status).toHaveAttribute('data-run-status', 'queued')
    await configure(page, { runStatus: 'completed' })
    await expect(status).toHaveCount(0)
  })
}
