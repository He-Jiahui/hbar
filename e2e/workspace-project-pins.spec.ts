import { expect, test, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function showSidebar(page: Page, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  const sidebar = page.getByRole('complementary', { name: copy.shell.projectsAndSessions, exact: true })
  if (!(await sidebar.isVisible()))
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
  await expect(sidebar).toBeVisible()
  return sidebar
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`project pin is a persisted, ID-owned sidebar action on real Host: ${locale}`, async ({ browser }) => {
    test.setTimeout(100_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-project-pin-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const path = join(root, 'zz-project-with-a-long-name-that-must-not-overflow-项目')
      await mkdir(path)
      const other = await createWorkspaceSessionCommandClient(host.client).execute('workspace.create', { path })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      let sidebar = await showSidebar(page, locale)
      const row = () => sidebar.locator(`[data-workspace-id="${other.id}"]`)
      await expect(row()).toBeVisible()
      const menu = () => row().getByTitle(copy.shell.workspaceActions(other.name), { exact: true })
      await menu().focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('menuitem', { name: copy.shell.pinWorkspace, exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(menu()).toBeFocused()
      await menu().click()
      await page.getByRole('menuitem', { name: copy.shell.pinWorkspace, exact: true }).click()
      await expect(row()).toContainText(copy.shell.pinSaved)
      await expect(sidebar.locator('.hbar-app-react-project-tree > section').first()).toHaveAttribute(
        'data-workspace-id',
        other.id,
      )
      await expect(
        row().getByRole('button', { name: new RegExp(copy.shell.pinnedWorkspace(other.name)) }),
      ).toBeVisible()

      await page.reload()
      sidebar = await showSidebar(page, locale)
      await expect(sidebar.locator('.hbar-app-react-project-tree > section').first()).toHaveAttribute(
        'data-workspace-id',
        other.id,
      )
      await expect(row().getByTitle(copy.shell.pinnedWorkspace(other.name), { exact: true })).toBeVisible()
      const originalProject = sidebar.locator(`[data-workspace-id="${host.ready.workspaceId}"]`)
      const expandOriginal = originalProject.getByRole('button', {
        name: copy.shell.expandWorkspace(host.ready.workspaceName),
        exact: true,
      })
      if (await expandOriginal.count()) await expandOriginal.click()
      await expect(
        sidebar.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }),
      ).toBeVisible()
      await page.screenshot({ path: `artifacts/reference-ux-v2/project-pin-${locale}-1440-pinned.png` })

      await page.setViewportSize({ width: 320, height: 720 })
      await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute('data-hbar-sidebar-expanded', 'false')
      sidebar = await showSidebar(page, locale)
      await expect(row()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/reference-ux-v2/project-pin-${locale}-320.png` })
      await menu().click()
      await page.getByRole('menuitem', { name: copy.shell.unpinWorkspace, exact: true }).click()
      await expect(row()).toContainText(copy.shell.pinRemoved)
      await expect(row().getByTitle(copy.shell.pinnedWorkspace(other.name), { exact: true })).toHaveCount(0)
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.reload()
      sidebar = await showSidebar(page, locale)
      await expect(row().getByTitle(copy.shell.pinnedWorkspace(other.name), { exact: true })).toHaveCount(0)
      await page.screenshot({ path: `artifacts/reference-ux-v2/project-pin-${locale}-1440-unpinned.png` })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
