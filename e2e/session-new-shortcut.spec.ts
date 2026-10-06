import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const satisfies readonly ShellLocale[]) {
  test(`new-session shortcut uses the same project and draft ownership as the sidebar: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-shortcut-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const commands = createWorkspaceSessionCommandClient(host.client)
      const originalTitle = `Shortcut source ${locale}`
      await commands.execute('session.rename', { sessionId: host.ready.sessionId, title: originalTitle })
      const sessionCount = async () =>
        (await commands.execute('session.list', { workspaceId: host!.ready.workspaceId, limit: 100 })).items.length
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const sidebar = page.getByRole('complementary', { name: copy.shell.projectsAndSessions, exact: true })
      await expect(sidebar.getByRole('treeitem', { name: originalTitle, exact: true })).toBeVisible()

      // Without a selected project, the global shortcut asks for one instead of guessing.
      await page.keyboard.press('Control+n')
      const picker = page.getByRole('dialog', { name: copy.shell.chooseWorkspace, exact: true })
      await expect(picker).toBeVisible()
      await page.keyboard.press('Meta+n')
      await expect(picker).toHaveCount(1)
      expect(await sessionCount()).toBe(1)
      await page.keyboard.press('Escape')
      await expect(picker).toHaveCount(0)

      await sidebar.getByRole('treeitem', { name: originalTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const savedDraft = `Keep this draft in ${originalTitle}`
      await prompt.fill(savedDraft)
      await page.keyboard.press('Control+n')
      await expect.poll(sessionCount).toBe(2)
      await expect(picker).toHaveCount(0)
      await expectComposerText(prompt, '')
      await sidebar.getByRole('treeitem', { name: originalTitle, exact: true }).click()
      await expectComposerText(prompt, savedDraft)

      // The Mac modifier follows the same path; the narrow layout stays usable.
      await page.setViewportSize({ width: 320, height: 720 })
      await page.keyboard.press('Meta+n')
      await expect.poll(sessionCount).toBe(3)
      await expect(picker).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/session-entry/shortcut-${locale}-320.png` })
      expect(context.pages()).toHaveLength(1)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
