import { expect, test } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { openSessionTool } from './support/session-tools-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string) {
  const resolved = await realpath(root)
  if (
    dirname(resolved).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(resolved).startsWith('hbar-session-tools-v13-')
  )
    throw new Error('Refusing cleanup outside the owned tool-navigation fixture')
  await rm(resolved, { recursive: true, force: true })
}

test('primary Activity and labelled secondary tools preserve current-session drafts and return paths', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-tools-v13-'))
  const context = await browser.newContext({ locale: 'zh-CN' })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 49160),
      goalAutoContinue: false,
    })
    const copy = getShellCopy('zh-CN')
    const labels = copy.session.tools
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 49161}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = '当前会话的长草稿：打开工具、返回与切换会话均不能自动发送或清除。'.repeat(4)
    await prompt.fill(draft)
    const header = page.getByRole('group', { name: labels.label, exact: true })
    const more = header.getByRole('button', { name: labels.more, exact: true })
    await expect(header.getByRole('button', { name: labels.activity, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: labels.files, exact: true })).toBeVisible()
    await expect(header.getByRole('button', { name: labels.goals, exact: true })).toHaveCount(0)
    await expect(more).toContainText(labels.more)
    await more.focus()
    await more.press('ArrowDown')
    const menu = page.getByRole('menu', { name: labels.more, exact: true })
    const goals = menu.getByRole('menuitemcheckbox', { name: labels.goals, exact: true })
    await expect(goals).toBeFocused()
    await expect(menu.getByRole('menuitemcheckbox')).toHaveCount(3)
    await expect(menu.getByRole('menuitem', { name: labels.settings, exact: true })).toBeVisible()
    await page.screenshot({ path: 'artifacts/session-tools-menu-v13/zh-tools-wide.png' })
    await goals.press('Escape')
    await expect(menu).toBeHidden()
    await expect(more).toBeFocused()
    await expectComposerText(prompt, draft)

    await header.getByRole('button', { name: labels.activity, exact: true }).click()
    const activity = page.locator('.hbar-session-activity-workspace')
    await expect(activity).toBeVisible()
    await expect(header.getByRole('button', { name: labels.activity, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await openSessionTool(page, labels, 'goals')
    await expect(activity).toHaveCount(0)
    await expect(page.locator('.hbar-app-react-goal-plan-workspace')).toBeVisible()
    await expect(more).toHaveAttribute('data-selected', 'true')
    await more.click()
    await expect(goals).toHaveAttribute('aria-checked', 'true')
    await expect(goals.locator('svg')).toHaveCount(2)
    await goals.click()
    await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
    await expect(more).toHaveAttribute('data-selected', 'false')

    await openSessionTool(page, labels, 'agents')
    const agents = page.locator('.lumen-app-tool-drawer')
    await expect(agents).toBeVisible()
    await agents.getByRole('button', { name: copy.agents.close, exact: true }).click()
    await expect(more).toBeFocused()
    await openSessionTool(page, labels, 'settings')
    await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveValue('session')
    await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
    await expectComposerText(prompt, draft)

    // One narrow continuation checks natural layout and the same menu, not a size/button matrix.
    await page.setViewportSize({ width: 390, height: 900 })
    await more.click()
    await expect(menu).toBeInViewport()
    await menu.getByRole('menuitemcheckbox', { name: labels.monitoring, exact: true }).focus()
    await page.screenshot({ path: 'artifacts/session-tools-menu-v13/zh-tools-narrow.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.keyboard.press('Enter')
    const monitoring = page.locator('.lumen-app-tool-drawer')
    await expect(monitoring).toBeVisible()
    await monitoring.getByRole('button', { name: copy.monitoring.close, exact: true }).click()
    await expect(more).toBeFocused()
    await expectComposerText(prompt, draft)

    await page.setViewportSize({ width: 1440, height: 960 })
    const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await showSidebar.isVisible()) await showSidebar.click()
    const other = await host.client.call('session.create', {
      workspaceId: host.ready.workspaceId,
      title: 'Independent tool-menu session',
    })
    await more.click()
    await page.getByRole('button', { name: copy.shell.openSession(other.title), exact: true }).click()
    await expect(menu).toBeHidden()
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await expect(more).toHaveAttribute('data-selected', 'false')
    await expectComposerText(prompt, '')
    await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
    await expectComposerText(prompt, draft)
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toEqual([])
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupFixture(root)
  }
})
