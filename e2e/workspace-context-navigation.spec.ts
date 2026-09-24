import { expect, test, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function revealSidebar(page: Page, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`project actions keep their own targets and navigation has one current page: ${locale}`, async ({ browser }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-context-navigation-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    const copy = getShellCopy(locale)
    try {
      const secondPath = join(root, 'Second-project-with-a-long-name-独立工程')
      await mkdir(secondPath)
      await writeFile(join(secondPath, 'second-project.md'), '# A file owned by the second project\n')
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const directory = createWorkspaceSessionCommandClient(host.client)
      const second = await directory.execute('workspace.create', { path: secondPath })
      const secondSession = await directory.execute(
        'session.create',
        {
          workspaceId: second.id,
          title: 'Secondary session — 独立工程目标',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page
        .getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true })
        .waitFor({ state: 'attached' })
      const firstToggle = page.getByRole('button', { name: copy.shell.expandWorkspace(host.ready.workspaceName) })
      if (await firstToggle.isVisible()) await firstToggle.click()
      const firstRow = page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true })
      await firstRow.click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('Keep the first project draft')

      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport)
        await revealSidebar(page, locale)
        const actions = page.getByTitle(copy.shell.workspaceActions(second.name), { exact: true })
        await actions.focus()
        await page.keyboard.press('Enter')
        const menu = page.getByRole('menu', { name: copy.shell.workspaceActions(second.name) })
        await expect(menu).toBeVisible()
        await page.screenshot({ path: `artifacts/desktop-experience/workspace-menu-${locale}-${viewport.width}.png` })
        await menu.getByRole('menuitem', { name: locale === 'zh-CN' ? '文件' : 'Files', exact: true }).click()
        const files = page.getByRole('region', { name: copy.files.title, exact: true })
        await expect(files.getByTitle(second.name, { exact: true })).toBeVisible()
        await expect(files.getByText('second-project.md', { exact: true })).toBeVisible()
        // A project-scoped tool must not replace the main session or its draft.
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(host.ready.sessionTitle)
        await expect(prompt).toHaveValue('Keep the first project draft')
        if (viewport.width > 1024) {
          const ownFiles = page.getByRole('button', { name: copy.session.tools.files, exact: true })
          await expect(ownFiles).toHaveAttribute('aria-pressed', 'false')
          await ownFiles.click()
          await expect(files.getByTitle(host.ready.workspaceName, { exact: true })).toBeVisible()
          await expect(files.getByText('browser-e2e.md', { exact: true })).toBeVisible()
        }
        await files.getByRole('button', { name: copy.files.close, exact: true }).click()
        await revealSidebar(page, locale)
        await actions.click()
        await menu
          .getByRole('menuitem', { name: locale === 'zh-CN' ? '工作区设置' : 'Workspace settings', exact: true })
          .click()
        await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveValue('workspace')
        await expect(
          page.getByRole('combobox', { name: copy.settings.scopes }).getByRole('option', { selected: true }),
        ).toHaveText(copy.settings.scopeOption('workspace', second.name))
        await expect(page.getByRole('heading', { name: copy.settings.pageTitle, exact: true })).toBeVisible()
        const scopes = page.getByRole('combobox', { name: copy.settings.scopes })
        await expect(
          scopes.getByRole('option', { name: copy.settings.scopeOption('session', null), exact: true }),
        ).toBeDisabled()
        await scopes.selectOption('global')
        await expect(scopes).toHaveValue('global')
        await scopes.selectOption('workspace')
        await expect(scopes.getByRole('option', { selected: true })).toHaveText(
          copy.settings.scopeOption('workspace', second.name),
        )
        await revealSidebar(page, locale)
        await expect(firstRow).not.toHaveAttribute('aria-current', 'page')
        await expect(page.getByRole('button', { name: copy.shell.settings, exact: true })).toHaveAttribute(
          'aria-current',
          'page',
        )
        if (viewport.width < 1024)
          await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).first().click()
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
        await expect(prompt).toHaveValue('Keep the first project draft')

        await revealSidebar(page, locale)
        const expandSecond = page.getByRole('button', { name: copy.shell.expandWorkspace(second.name), exact: true })
        if (await expandSecond.isVisible()) await expandSecond.click()
        const secondRow = page.getByRole('button', { name: copy.shell.openSession(secondSession.title), exact: true })
        await secondRow.click()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(secondSession.title)
        await revealSidebar(page, locale)
        await firstRow.click()
        await expect(prompt).toHaveValue('Keep the first project draft')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
