import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-tab-menu-layout-'
async function cleanup(root: string): Promise<void> {
  const exact = resolve(root)
  if (dirname(exact) !== resolve(tmpdir()) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing to remove an unowned menu-layout fixture')
  await rm(exact, { recursive: true, force: true })
}

test('open tab actions stay reachable as the shell narrows and close only their original scope', async ({
  browser,
}, info) => {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, sessionCount: 2, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('zh-CN')
    const labels = workspaceTabsCopy((zh) => zh).tabs
    await page.goto(base)
    await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
    const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await composer.fill('第一个会话的原稿不能因关闭页签被删除。')
    await page.getByRole('treeitem', { name: 'Session 002', exact: true }).click()
    const draft = '在同一个菜单里变窄，仍然操作原来的第二个会话。'
    await composer.fill(draft)
    await page.getByRole('button', { name: labels.menu('Session 002'), exact: true }).click()
    const menu = page.getByRole('menu', { name: labels.menu('Session 002'), exact: true })
    await expect(menu).toBeVisible()
    await page.screenshot({ path: info.outputPath('tab-actions-wide-1440.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(menu).toBeVisible()
    await expect
      .poll(async () =>
        menu.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
        }),
      )
      .toBe(true)
    await page.screenshot({ path: info.outputPath('tab-actions-narrow-390.png') })
    await menu.getByRole('menuitem', { name: labels.action('others'), exact: true }).click()
    await expect(page.getByRole('tab')).toHaveCount(1)
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expectComposerText(composer, draft)
    await expect(page.getByRole('tab', { name: 'Session 002', exact: true })).toBeFocused()
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
    await expectComposerText(composer, '第一个会话的原稿不能因关闭页签被删除。')
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
    expect(errors).toEqual([])
  } finally {
    try {
      await context.close()
    } finally {
      try {
        if (host) await stopWebSessionHost(host)
      } finally {
        await cleanup(root)
      }
    }
  }
})
