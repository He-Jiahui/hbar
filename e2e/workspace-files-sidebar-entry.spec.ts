import { expect, test } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeRoot(root: string): Promise<void> {
  const target = await realpath(root)
  if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith('hbar-workspace-files-entry-'))
    throw new Error('Refusing cleanup outside the owned workspace-files fixture')
  await rm(target, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`sidebar Project files opens the selected workspace without borrowing a session: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-files-entry-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    const copy = getShellCopy(locale)
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)

      const unavailable = page.getByRole('button', { name: copy.shell.workspaceFilesUnavailable, exact: true })
      await expect(unavailable).toBeDisabled()
      await expect(unavailable).toContainText(copy.shell.workspaceFilesEntry)

      await page.getByRole('button', { name: copy.shell.openWorkspace, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: copy.shell.openWorkspace, exact: true })
      await dialog.getByRole('textbox', { name: copy.shell.workspacePath, exact: true }).fill(root)
      await dialog.getByRole('button', { name: copy.shell.addWorkspace, exact: true }).click()
      await expect(dialog).toHaveCount(0)
      const entry = page.getByRole('button', {
        name: copy.shell.openWorkspaceFiles(host.ready.workspaceName),
        exact: true,
      })
      await expect(entry).toBeEnabled()

      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
        if (await show.isVisible()) await show.click()
        await entry.focus()
        await page.keyboard.press('Enter')
        const files = page.getByRole('region', { name: copy.files.title, exact: true })
        await expect(files).toBeVisible()
        await expect
          .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.lumen-app-tool-drawer'))))
          .toBe(true)
        await expect(files.getByTitle(host.ready.workspaceName, { exact: true })).toBeVisible()
        await expect(files.getByText('browser-e2e.md', { exact: true })).toBeVisible()
        if (width < 1024)
          await expect(page.locator('[data-lumen-shell="app"]')).toHaveAttribute('data-sidebar-open', 'false')
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`project-files-${locale}-${width}.png`) })
        await files.getByRole('button', { name: copy.files.close, exact: true }).click()
        await expect(files).toHaveCount(0)
        expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
      }

      await page.setViewportSize({ width: 1440, height: 960 })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await show.isVisible()) await show.click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await expect(entry).toBeEnabled()
      await entry.click()
      const files = page.getByRole('region', { name: copy.files.title, exact: true })
      await expect(files.getByTitle(host.ready.workspaceName, { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: copy.session.tools.files, exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) {
        await stopWebSessionHost(host)
        const captured = host
        await expect.poll(() => captured.child.exitCode !== null || captured.child.signalCode !== null).toBe(true)
        await removeRoot(root)
      }
    }
  })
}
