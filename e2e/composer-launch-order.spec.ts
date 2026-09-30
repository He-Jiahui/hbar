import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-composer-launch-order-'

async function removeOwnedFixture(root: string) {
  const absoluteRoot = resolve(root)
  if (dirname(absoluteRoot) !== resolve(tmpdir()) || !basename(absoluteRoot).startsWith(prefix))
    throw new Error('Refusing to remove an unowned launch-order fixture')
  await rm(absoluteRoot, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`first-send controls preserve reference reading and keyboard order: ${locale}`, async ({ browser }) => {
    test.setTimeout(60_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 48717) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 48729}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const directory = createWorkspaceSessionCommandClient(host.client)
      const count = async () =>
        (await directory.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
      const shell = getShellCopy(locale)
      const labels = preSessionCopy(locale)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${base}/apps/web/`)
      const landing = page.locator('.hbar-pre-session-landing')
      await expect(landing).toBeVisible()
      const editor = landing.getByRole('textbox', { name: shell.preSession.prompt.input })
      await editor.fill(locale === 'en-US' ? 'Keep this launch draft.' : '保留这条启动草稿。')
      const originalText = await editor.inputValue()
      const add = landing.getByRole('button', { name: shell.session.addMenu.open, exact: true })
      const permission = landing.locator('.hbar-pre-session-approval-picker .hbar-composer-permission-trigger')
      const workspace = landing.getByRole('button', { name: labels.workspace.trigger(null), exact: true })
      const model = landing.getByRole('button', { name: labels.model.trigger(null), exact: true })
      await expect(permission).toBeEnabled()
      await expect(workspace).toBeEnabled()
      await expect(model).toBeEnabled()
      const initialCount = await count()

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 900, height: 760 },
        { width: 390, height: 844 },
        { width: 320, height: 560 },
      ]) {
        await page.setViewportSize(viewport)
        expect(
          await landing
            .locator('.hbar-web-pre-session-controls')
            .evaluate((element) =>
              Array.from(element.children).map((child) =>
                [
                  'hbar-web-pre-session-goal-controls',
                  'hbar-pre-session-approval-picker',
                  'hbar-pre-session-choice-picker',
                ].find((name) => child.classList.contains(name)),
              ),
            ),
        ).toEqual([
          'hbar-web-pre-session-goal-controls',
          'hbar-pre-session-approval-picker',
          'hbar-pre-session-choice-picker',
        ])
        await add.focus()
        await page.keyboard.press('Tab')
        await expect(permission).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(workspace).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(model).toBeFocused()
        for (const control of [add, permission, workspace, model]) await expect(control).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/composer-launch-order/${locale}-${viewport.width}.png` })
      }

      await permission.click()
      const permissions = page.locator('.hbar-pre-session-approval-popover')
      await expect(permissions).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(permissions).toBeHidden()
      await expect(permission).toBeFocused()
      await workspace.click()
      const projects = page.getByRole('dialog', { name: labels.workspace.title })
      await expect(projects).toBeVisible()
      await projects.getByRole('button', { name: labels.workspace.close, exact: true }).click()
      await expect(projects).toHaveCount(0)
      await expect(workspace).toBeFocused()
      await workspace.click()
      await expect(projects).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(projects).toHaveCount(0)
      await expect(workspace).toBeFocused()
      await workspace.click()
      await projects.getByRole('button', { name: new RegExp(host.ready.workspaceName) }).click()
      await expect(projects).toHaveCount(0)
      await expect(
        landing.locator('.hbar-web-pre-session-controls > .hbar-pre-session-choice-picker > button'),
      ).toBeFocused()
      await expect(editor).toHaveValue(originalText)
      expect(await count()).toBe(initialCount)
      await expect(page.getByRole('tab')).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
