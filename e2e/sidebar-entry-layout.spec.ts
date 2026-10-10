import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  createBudgetCommandClient,
  createNotificationCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { globalFeatureCopy } from '../apps/web/src/global-feature-copy'
import { notificationCopy } from '../apps/web/src/notification-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function reveal(page: Page, locale: ShellLocale): Promise<void> {
  const button = page.getByRole('button', { name: getShellCopy(locale).shell.showSidebar, exact: true })
  if (await button.isVisible()) await button.click()
  await expect(page.locator('.hbar-app-react-sidebar-surface')).toBeVisible()
}

async function expectStackedFooterActions(footer: Locator, locale: ShellLocale): Promise<void> {
  const copy = getShellCopy(locale).shell
  const bounds = []
  for (const label of [copy.status, copy.schedules, copy.extensionsAndSkills, copy.commands, copy.settings]) {
    const button = footer.getByRole('button', { name: label, exact: true })
    await expect(button).toBeVisible()
    const box = await button.boundingBox()
    if (!box) throw new Error(`Footer action must remain measurable: ${label}`)
    bounds.push(box)
  }
  const first = bounds[0]
  if (!first) throw new Error('Footer actions must not be empty')
  let bottom = first.y
  for (const box of bounds) {
    expect(box.x).toBeCloseTo(first.x, 1)
    expect(box.width).toBeCloseTo(first.width, 1)
    expect(box.height).toBeCloseTo(first.height, 1)
    expect(box.y).toBeGreaterThanOrEqual(bottom)
    bottom = box.y + box.height
  }
  expect(await footer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
}

async function removeFixture(root: string): Promise<void> {
  const target = await realpath(root)
  if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith('hbar-sidebar-entry-layout-'))
    throw new Error('Unowned sidebar fixture cleanup')
  await rm(target, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`sidebar places notifications and global actions in their owning regions: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-sidebar-entry-layout-'))
    const context = await browser.newContext({ locale, colorScheme: locale === 'zh-CN' ? 'dark' : 'light' })
    let host: WebSessionHost | undefined
    const copy = getShellCopy(locale)
    const global = globalFeatureCopy(locale)
    const notifications = notificationCopy(locale)
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const directory = createWorkspaceSessionCommandClient(host.client)
      const firstTitle = 'Current project run proof — 保留当前会话'
      const secondPath = join(root, 'Second-workspace-独立工程')
      await mkdir(secondPath)
      const second = await directory.execute('workspace.create', { path: secondPath })
      const secondSession = await directory.execute(
        'session.create',
        { workspaceId: second.id, title: 'Second project run proof' },
        { idempotencyKey: crypto.randomUUID() },
      )
      const budgets = createBudgetCommandClient(host.client)
      const runs = createRunCommandClient(host.client)
      for (const sessionId of [host.ready.sessionId, secondSession.id]) {
        await budgets.execute(
          'session.setBudget',
          { sessionId, tokens: 1_000_000 },
          { idempotencyKey: crypto.randomUUID() },
        )
        const run = await runs.execute(
          'run.submit',
          { sessionId, modelId: 'local-fixture', input: { text: 'Create one local fixture notification', images: [] } },
          { idempotencyKey: crypto.randomUUID() },
        )
        await expect
          .poll(async () => (await runs.execute('operation.get', { operationId: run.operationId })).status)
          .toBe('completed')
      }
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      await directory.execute('session.rename', { sessionId: host.ready.sessionId, title: firstTitle })
      const stats = await createNotificationCommandClient(host.client).page({ limit: 1 })
      expect(stats.unreadCount).toBeGreaterThan(0)
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(origin)
      await page.getByRole('treeitem', { name: firstTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Keep this conversation — 保留未发送的草稿'
      await prompt.fill(draft)
      const sidebar = page.locator('.hbar-app-react-sidebar-surface')
      const footer = sidebar.locator('.lumen-app-sidebar > footer')
      const bell = sidebar.locator('.hbar-app-react-sidebar-brand-actions .hbar-web-notification-page-button')
      await expect(bell).toHaveAccessibleName(notifications.bell(stats.unreadCount))

      for (const width of [1440, 960, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        if (width < 1024)
          await expect(page.getByRole('button', { name: copy.shell.showSidebar, exact: true })).toBeVisible()
        await reveal(page, locale)
        await expect(
          sidebar.locator('header').getByRole('button', { name: copy.shell.extensionsAndSkills, exact: true }),
        ).toHaveCount(0)
        await expect(
          sidebar.locator('header').getByRole('button', { name: copy.shell.commands, exact: true }),
        ).toHaveCount(0)
        await expect(footer.getByRole('button', { name: copy.shell.extensionsAndSkills, exact: true })).toBeVisible()
        await expect(footer.getByRole('button', { name: copy.shell.commands, exact: true })).toBeVisible()
        await expect(footer.locator('.hbar-web-notification-page-button')).toHaveCount(0)
        await expect(sidebar.getByRole('button', { name: global.titles.onboarding, exact: true })).toHaveCount(0)
        await expect(sidebar.getByRole('button', { name: global.titles['prompt-templates'], exact: true })).toHaveCount(
          0,
        )
        await expect(sidebar.getByRole('button', { name: global.titles['run-board'], exact: true })).toHaveCount(0)
        const settings = footer.getByRole('button', { name: copy.shell.settings, exact: true })
        const schedules = footer.getByRole('button', { name: copy.shell.schedules, exact: true })
        expect(await schedules.getAttribute('class')).toBe(await settings.getAttribute('class'))
        await footer.screenshot({ path: info.outputPath(`footer-${locale}-${width}.png`) })
        await expectStackedFooterActions(footer, locale)
        const statusBox = await footer.locator('.lumen-app-host-status').boundingBox()
        const settingsBox = await settings.boundingBox()
        const schedulesBox = await schedules.boundingBox()
        if (!statusBox || !settingsBox || !schedulesBox) throw new Error('Footer regions must remain measurable')
        expect(statusBox.y).toBeGreaterThanOrEqual(
          Math.max(settingsBox.y + settingsBox.height, schedulesBox.y + schedulesBox.height),
        )
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: info.outputPath(`sidebar-${locale}-${width}.png`) })
        await schedules.focus()
        await page.keyboard.press('Enter')
        const schedulePage = page.locator('[data-global-page="schedules"]')
        await expect(schedulePage).toBeVisible()
        await schedulePage.getByRole('button', { name: global.back, exact: true }).click()
        await expectComposerText(prompt, draft)
      }

      await page.setViewportSize({ width: 1440, height: 900 })
      await reveal(page, locale)
      await sidebar.getByTitle(copy.shell.workspaceActions(second.name), { exact: true }).click()
      const menu = page.getByRole('menu', { name: copy.shell.workspaceActions(second.name), exact: true })
      await menu.getByRole('menuitem', { name: copy.shell.workspaceRunBoard, exact: true }).click()
      const board = page.locator('[data-global-page="run-board"]')
      await expect(board.getByText(secondSession.title, { exact: true })).toBeVisible()
      await expect(board.getByText(firstTitle, { exact: true })).toHaveCount(0)
      await board.getByRole('button', { name: global.back, exact: true }).click()
      await expectComposerText(prompt, draft)
      await bell.click()
      const center = page.locator('[data-global-page="notifications"]')
      await expect(center).toBeVisible()
      await center.getByRole('button', { name: notifications.markAll, exact: true }).click()
      await expect(bell).toHaveAccessibleName(notifications.bell(0))
      await center.getByRole('button', { name: global.back, exact: true }).click()
      await sidebar.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).click()
      const rail = page.locator('.hbar-app-react-sidebar-rail')
      await expect(rail.locator('header .hbar-web-notification-page-button')).toBeVisible()
      await expect(rail.locator('footer').getByRole('button', { name: copy.shell.commands, exact: true })).toBeVisible()
      await expectStackedFooterActions(rail.locator('footer'), locale)
      await page.screenshot({ path: info.outputPath(`rail-${locale}.png`) })
      await reveal(page, locale)
      await stopWebSessionHost(host)
      host = undefined
      await expect(footer.getByText(copy.shell.disconnected, { exact: true })).toBeVisible()
      await expect(footer.getByRole('button', { name: copy.shell.reconnect, exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`disconnected-${locale}.png`) })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeFixture(root)
    }
  })
}
