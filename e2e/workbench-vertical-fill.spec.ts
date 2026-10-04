import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const fixturePrefix = 'hbar-vertical-fill-'

async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(fixturePrefix))
    throw new Error('Unowned vertical fill fixture')
  await rm(target, { recursive: true, force: true })
}

async function expectSidebarFill(page: Page): Promise<void> {
  const sidebar = page.locator('.lumen-app-sidebar')
  await expect(sidebar).toBeVisible()
  await expect(async () => {
    const geometry = await sidebar.evaluate((element) => {
      const footer = element.querySelector(':scope > footer')
      const list = element.querySelector('.lumen-app-sidebar-content')
      const pane = element.closest('.flexlayout__tab') ?? element.closest('.lumen-app-sidebar-pane')
      if (!footer || !list) throw new Error('Sidebar regions are missing')
      return {
        bottom: footer.getBoundingClientRect().bottom,
        paneBottom: pane?.getBoundingClientRect().bottom ?? innerHeight,
        listBottom: list.getBoundingClientRect().bottom,
        listHeight: list.getBoundingClientRect().height,
        footerTop: footer.getBoundingClientRect().top,
      }
    })
    expect(Math.abs(geometry.paneBottom - geometry.bottom), JSON.stringify(geometry)).toBeLessThanOrEqual(4)
    expect(geometry.listBottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.footerTop + 1)
    expect(geometry.listHeight, JSON.stringify(geometry)).toBeGreaterThan(24)
  }).toPass({ timeout: 10_000 })
}

async function expectConversationFill(page: Page): Promise<void> {
  const footer = page.locator('.hbar-app-react-session-footer')
  await expect(footer).toBeVisible()
  await expect(async () => {
    const geometry = await footer.evaluate((element) => {
      const workspace = element.closest('.hbar-app-react-session-workspace')
      const messages = workspace?.querySelector('.lumen-conversation-messages')
      if (!workspace || !messages) throw new Error('Conversation regions are missing')
      return {
        bottom: element.getBoundingClientRect().bottom,
        workspaceBottom: workspace.getBoundingClientRect().bottom,
        viewportBottom: innerHeight,
        messagesBottom: messages.getBoundingClientRect().bottom,
        footerTop: element.getBoundingClientRect().top,
      }
    })
    expect(Math.abs(geometry.workspaceBottom - geometry.bottom), JSON.stringify(geometry)).toBeLessThanOrEqual(3)
    expect(Math.abs(geometry.viewportBottom - geometry.bottom), JSON.stringify(geometry)).toBeLessThanOrEqual(5)
    expect(geometry.messagesBottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.footerTop + 1)
  }).toPass({ timeout: 10_000 })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const fixture of [
    { name: 'empty', sessionCount: 1, historyCount: 0 },
    { name: 'short', sessionCount: 3, historyCount: 1 },
    { name: 'overflow', sessionCount: 81, historyCount: 130 },
  ]) {
    test(`workbench bottom regions fill their panes with ${fixture.name} content: ${locale}`, async ({ browser }) => {
      test.setTimeout(90_000)
      const root = await mkdtemp(join(tmpdir(), fixturePrefix))
      const context = await browser.newContext({
        locale,
        colorScheme: locale === 'zh-CN' ? 'dark' : 'light',
        viewport: { width: 2048, height: 1207 },
      })
      let host: WebSessionHost | undefined
      try {
        host = await startWebSessionHost({
          root,
          port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
          sessionCount: fixture.sessionCount,
          historyCount: fixture.historyCount,
          historyText: 'Long localized content — 较长的中文消息与工程标题内容保持自然换行。 '.repeat(8),
        })
        const copy = getShellCopy(locale)
        const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
        expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
          true,
        )
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.goto(base)
        await page.locator(`[data-session-id="${host.ready.sessionId}"] .hbar-app-react-session-target`).click()
        await expectConversationFill(page)
        await expectSidebarFill(page)
        if (fixture.name === 'short') {
          const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
          const draft = Array.from({ length: 6 }, (_, index) => `Line ${index + 1} — 输入区由内容自然增长`).join('\n')
          await prompt.fill(draft)
          await expectConversationFill(page)
          await page.reload()
          await expectComposerText(prompt, draft)
          await expectConversationFill(page)
          await expectSidebarFill(page)
        }
        await page.screenshot({ path: `artifacts/vertical-fill/${locale}-${fixture.name}-2048.png` })

        for (const viewport of [
          { width: 1440, height: 960 },
          { width: 900, height: 600 },
          { width: 900, height: 560 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport)
          const reveal = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
          if (await reveal.isVisible()) await reveal.click()
          await expectSidebarFill(page)
          if (viewport.width === 900)
            await page.screenshot({
              path: `artifacts/vertical-fill/${locale}-${fixture.name}-sidebar-900-${viewport.height}.png`,
            })
          if (viewport.width < 1024)
            await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).first().click()
          await expectConversationFill(page)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await page.screenshot({
            path: `artifacts/vertical-fill/${locale}-${fixture.name}-${viewport.width}-${viewport.height}.png`,
          })
        }

        if (fixture.name === 'overflow') {
          const messages = page.locator('.lumen-conversation-messages')
          const footer = page.locator('.hbar-app-react-session-footer')
          const before = await footer.boundingBox()
          const scroll = await messages.evaluate((element) => {
            element.scrollTop = 0
            return { height: element.clientHeight, contentHeight: element.scrollHeight }
          })
          expect(scroll.contentHeight).toBeGreaterThan(scroll.height)
          await expectConversationFill(page)
          expect(await footer.boundingBox()).toEqual(before)
          await page.setViewportSize({ width: 1440, height: 960 })
          const reveal = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
          if (await reveal.isVisible()) await reveal.click()
          await expectSidebarFill(page)
          const sidebarScroll = await page.locator('.lumen-app-sidebar-content').evaluate((element) => {
            element.scrollTop = element.scrollHeight
            return { height: element.clientHeight, contentHeight: element.scrollHeight, scrollTop: element.scrollTop }
          })
          expect(sidebarScroll.contentHeight).toBeGreaterThan(sidebarScroll.height)
          expect(sidebarScroll.scrollTop).toBeGreaterThan(0)
          await expectSidebarFill(page)
        }
        expect(errors).toEqual([])
      } finally {
        await context.close()
        if (host) await stopWebSessionHost(host)
        await removeOwnedFixture(root)
      }
    })
  }
}
