import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test.use({ actionTimeout: 10_000 })
const fixturePrefix = 'hbar-session-context-menu-'

async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(fixturePrefix))
    throw new Error('Unowned session context-menu fixture')
  await rm(target, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session row context actions keep navigation and target intact: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), fixturePrefix))
    const context = await browser.newContext({
      locale,
      viewport: { width: locale === 'en-US' ? 1440 : 390, height: 900 },
    })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const other = await sessions.execute(
        'session.create',
        {
          workspaceId: host.ready.workspaceId,
          title: 'Other session — 行内操作目标',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const reveal = async () => {
        const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
        if (await show.isVisible()) await show.click()
      }
      await reveal()
      const row = page.locator(`[data-session-id="${host.ready.sessionId}"]`)
      const otherRow = page.locator(`[data-session-id="${other.id}"]`)
      await row.locator('.hbar-app-react-session-target').click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true, includeHidden: true })
      await prompt.fill('Keep the current conversation draft')
      await reveal()
      const otherTarget = otherRow.locator('.hbar-app-react-session-target')
      await otherTarget.click({ button: 'right' })
      const menu = otherRow.getByRole('menu', { name: copy.shell.sessionActions(other.title), exact: true })
      await expect(menu).toBeVisible()
      await expect(menu).toHaveAttribute('popover', 'auto')
      await expect(menu).toHaveCSS('position', 'fixed')
      const menuBounds = await menu.boundingBox()
      const viewport = page.viewportSize()
      expect(menuBounds).not.toBeNull()
      expect(viewport).not.toBeNull()
      expect(menuBounds!.x).toBeGreaterThanOrEqual(0)
      expect(menuBounds!.y).toBeGreaterThanOrEqual(0)
      expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(viewport!.width)
      expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(viewport!.height)
      await expect(menu.getByRole('menuitem', { name: copy.shell.renameSession, exact: true })).toBeFocused()
      await expect(page.locator('.hbar-app-react-shell-header-active-title')).toHaveText(host.ready.sessionTitle)
      await expectComposerText(prompt, 'Keep the current conversation draft')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/session-context-menu/${locale}-open.png` })
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await otherTarget.focus()
      await page.keyboard.press('Shift+F10')
      await expect(menu).toBeVisible()
      await menu.getByRole('menuitem', { name: copy.shell.renameSession, exact: true }).click()
      const input = otherRow.getByRole('textbox', { name: copy.shell.renameEditor.title, exact: true })
      await expect(input).toBeFocused()
      await input.fill('Renamed through row actions')
      await input.press('Enter')
      await expect(input).toHaveCount(0)
      await expect(otherRow).toContainText('Renamed through row actions')
      await expect(page.locator('.hbar-app-react-shell-header-active-title')).toHaveText(host.ready.sessionTitle)
      await expectComposerText(prompt, 'Keep the current conversation draft')
      const renamedMenu = otherRow.getByRole('menu', {
        name: copy.shell.sessionActions('Renamed through row actions'),
        exact: true,
      })
      await otherTarget.click({ button: 'right' })
      await expect(renamedMenu).toBeVisible()
      await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).first().click()
      await expect(renamedMenu).toBeHidden()
      expect((await sessions.execute('session.get', { sessionId: other.id }))?.title).toBe(
        'Renamed through row actions',
      )
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
