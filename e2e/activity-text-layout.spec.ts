import { expect, test, type Locator, type Page } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'
import type { ActivityPanelFixtureInput } from '../tests/fixtures/activity-panel-browser'
import { getShellCopy } from '../apps/web/src/shell-copy'

const root = join(process.cwd(), 'artifacts/activity-text-layout')
const origin = 'http://127.0.0.1:45627'
let server: PreviewServer | undefined

async function render(page: Page, input: ActivityPanelFixtureInput) {
  await page.evaluate((value) => window.activityPanelFixture.render(value), input)
}

async function textMetrics(text: Locator) {
  return text.evaluate((node) => {
    const styles = getComputedStyle(node)
    const bounds = node.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(node)
    return {
      height: bounds.height,
      lineHeight: Number.parseFloat(styles.lineHeight),
      fontSize: Number.parseFloat(styles.fontSize),
      themeFontSize:
        Number.parseFloat(styles.getPropertyValue('--lumen-font-size')) *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      fitsHorizontally: [...range.getClientRects()].every(
        (rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
      ),
      lastLineFits: ([...range.getClientRects()].at(-1)?.bottom ?? 0) <= bounds.bottom + 1,
      horizontalOverflow: node.scrollWidth > node.clientWidth + 1,
    }
  })
}

async function noHorizontalScroll(pane: Locator) {
  const overflows = await pane.evaluate((node) =>
    [
      node,
      ...node.querySelectorAll<HTMLElement>(
        'header, main, section, ol, li, .hbar-activity-text, .hbar-activity-agent-row',
      ),
    ]
      .filter((item) => item.getClientRects().length > 0 && item.scrollWidth > item.clientWidth + 1)
      .map((item) => `${item.tagName}.${item.className}`),
  )
  expect(overflows).toEqual([])
}

test.beforeAll(async () => {
  test.setTimeout(90_000)
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="../../tests/fixtures/activity-panel-browser.tsx"></script></body></html>',
  )
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: { outDir: join(root, 'web'), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  })
  server = await preview({
    configFile: false,
    root,
    build: { outDir: join(root, 'web') },
    preview: { host: '127.0.0.1', port: 45627, strictPort: true },
  })
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve()
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  })
})

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const theme of ['dark', 'light'] as const)
    test(`Activity wraps and folds text in a dense pane: ${locale} ${theme}`, async ({ page }, info) => {
      test.setTimeout(60_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(origin)
      const input: ActivityPanelFixtureInput = { locale, theme, count: 20, taskCount: 5, long: true }
      await render(page, input)
      const pane = page.locator('.hbar-session-activity-workspace')
      const labels = getShellCopy(locale).activity.text
      for (const width of [478, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await noHorizontalScroll(pane)
        for (const selector of [
          '.hbar-activity-task-row',
          '[data-operation-id]',
          '.hbar-activity-workflow-group-heading',
          '[data-activity-delegation-id]',
          '[data-activity-agent-id="agent-0"]',
        ]) {
          const row = pane.locator(selector).first()
          const text = row.locator('.hbar-activity-text-content').first()
          const toggle = row.getByRole('button', { name: labels.expand, exact: true }).first()
          await expect(toggle).toHaveAttribute('aria-expanded', 'false')
          await expect(text).toHaveAttribute('data-collapsed', 'true')
          const folded = await textMetrics(text)
          expect(folded.height).toBeLessThanOrEqual(folded.lineHeight * 3 + 1)
          expect(folded.fontSize).toBeCloseTo(folded.themeFontSize, 0)
          expect(folded.horizontalOverflow).toBe(false)
          expect(folded.fitsHorizontally).toBe(true)
          const before = await page.evaluate(() => window.activityPanelFixture.actions())
          await toggle.focus()
          await toggle.press('Enter')
          const collapse = row.getByRole('button', { name: labels.collapse, exact: true }).first()
          await expect(collapse).toHaveAttribute('aria-expanded', 'true')
          const full = await textMetrics(text)
          expect(full.height).toBeGreaterThan(full.lineHeight * 3)
          expect(full.horizontalOverflow).toBe(false)
          expect(full.fitsHorizontally).toBe(true)
          expect(full.lastLineFits).toBe(true)
          expect(await page.evaluate(() => window.activityPanelFixture.actions())).toEqual(before)
          await collapse.press('Space')
          await expect(toggle).toHaveAttribute('aria-expanded', 'false')
        }
        await pane.locator('.hbar-session-activity-body').evaluate((node) => {
          node.scrollTop = 0
        })
        await page.screenshot({ path: info.outputPath(`activity-${locale}-${theme}-${width}.png`) })
      }
      expect(errors).toEqual([])
    })

test('Activity disclosures follow original rows through revisions, reorder, locale changes and session changes', async ({
  page,
}) => {
  await page.goto(origin)
  await page.setViewportSize({ width: 390, height: 800 })
  const input: ActivityPanelFixtureInput = { locale: 'zh-CN', theme: 'dark', count: 5, long: true }
  await render(page, input)
  const pane = page.locator('.hbar-session-activity-workspace')
  const agent = pane.locator('[data-activity-agent-id="agent-0"]')
  const task = pane.locator('.hbar-activity-task-row').first()
  const expand = getShellCopy('zh-CN').activity.text.expand
  await agent.getByRole('button', { name: expand, exact: true }).click()
  await task.getByRole('button', { name: expand, exact: true }).click()
  await render(page, { ...input, reverse: true, revision: 2, completed: true })
  await expect(agent.locator('.hbar-activity-text-content')).toHaveAttribute('data-collapsed', 'false')
  await expect(task.locator('.hbar-activity-text-content')).toHaveAttribute('data-collapsed', 'false')
  await agent.locator('.hbar-activity-agent-row').press('Enter')
  expect(await page.evaluate(() => window.activityPanelFixture.actions())).toEqual(['open:agent-0'])
  await render(page, { ...input, locale: 'en-US' })
  await expect(
    agent.getByRole('button', { name: getShellCopy('en-US').activity.text.expand, exact: true }),
  ).toBeVisible()
  await render(page, { ...input, sessionId: 'other-session' })
  await expect(agent.locator('.hbar-activity-text-content')).toHaveAttribute('data-collapsed', 'true')
  await render(page, { ...input, connected: false })
  await expect(agent.locator('.hbar-activity-agent-row')).toBeDisabled()
  await agent.getByRole('button', { name: expand, exact: true }).click()
  await expect(agent.locator('.hbar-activity-text-content')).toHaveAttribute('data-collapsed', 'false')
  expect(await page.evaluate(() => window.activityPanelFixture.actions())).toEqual(['open:agent-0'])
})

test('Activity keeps empty, one-row, paged Agent and 100-task capacity boundaries readable', async ({ page }, info) => {
  await page.goto(origin)
  await page.setViewportSize({ width: 320, height: 800 })
  const pane = page.locator('.hbar-session-activity-workspace')
  for (const count of [0, 1, 5, 50, 51]) {
    await render(page, {
      locale: 'zh-CN',
      theme: 'dark',
      count,
      taskCount: count === 51 ? 100 : count,
      longLabels: count === 1,
    })
    await expect(pane.locator('[data-activity-agent-id]')).toHaveCount(Math.min(count, 50))
    await expect(pane.locator('.hbar-activity-task-row')).toHaveCount(count === 51 ? 100 : count)
    await noHorizontalScroll(pane)
    if (count === 0) {
      await expect(pane.getByText(getShellCopy('zh-CN').activity.empty, { exact: true })).toBeVisible()
    }
    if (count === 51) {
      const body = pane.locator('.hbar-session-activity-body')
      expect(await body.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true)
      const more = pane.getByRole('button', { name: getShellCopy('zh-CN').activity.agents.loadMore, exact: true })
      await more.scrollIntoViewIfNeeded()
      await more.click()
      expect(await page.evaluate(() => window.activityPanelFixture.actions())).toEqual(['agents:more'])
      await expect(pane.locator('[data-activity-agent-id="agent-49"]')).toBeInViewport()
      await page.screenshot({ path: info.outputPath('activity-capacity-zh-320.png') })
    }
  }
})
