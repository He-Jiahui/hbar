import { expect, test, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeRoot(root: string): Promise<void> {
  const target = await realpath(root)
  if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith('hbar-session-files-toolbar-'))
    throw new Error('Refusing cleanup outside the owned session Files fixture')
  await rm(target, { recursive: true, force: true })
}

async function selectSession(page: Page, workspaceId: string, title: string): Promise<void> {
  const workspace = page.locator(`[data-workspace-id="${workspaceId}"]`)
  await expect(workspace).toBeVisible()
  if ((await workspace.getAttribute('aria-expanded')) === 'false') await workspace.click()
  await workspace.getByRole('treeitem', { name: title, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Project files belongs to the session toolbar and follows its project: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-files-toolbar-'))
    const context = await browser.newContext({
      locale,
      colorScheme: locale === 'zh-CN' ? 'dark' : 'light',
      viewport: { width: 1440, height: 960 },
    })
    let host: WebSessionHost | undefined
    const copy = getShellCopy(locale)
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const directory = createWorkspaceSessionCommandClient(host.client)
      const secondPath = join(root, 'Second-project-独立工程')
      await mkdir(secondPath)
      await writeFile(join(secondPath, 'second-project-proof.md'), '# A second project file\n')
      const second = await directory.execute('workspace.create', { path: secondPath })
      const secondSession = await directory.execute(
        'session.create',
        { workspaceId: second.id, title: 'Second conversation — 独立会话' },
        { idempotencyKey: crypto.randomUUID() },
      )
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)

      const header = page.getByRole('group', { name: copy.session.tools.label, exact: true })
      const entry = header.getByRole('button', { name: copy.session.tools.files, exact: true })
      await expect(
        page.locator('.hbar-app-react-sidebar-surface').getByRole('button', {
          name: copy.session.tools.files,
          exact: true,
        }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: copy.session.tools.files, exact: true }).and(page.locator('button:enabled')),
      ).toHaveCount(0)
      await selectSession(page, host.ready.workspaceId, host.ready.sessionTitle)
      await expect(entry).toBeEnabled()
      await expect(
        page.locator('.hbar-workspace-tabs-region').getByRole('button', {
          name: copy.session.tools.files,
          exact: true,
        }),
      ).toHaveCount(0)

      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Keep this conversation draft — 保留当前会话草稿'
      await prompt.fill(draft)
      const files = page.getByRole('region', { name: copy.files.title, exact: true })
      for (const width of [1440, 1100, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        let action = entry
        if (width < 1024) {
          await expect(page.locator('.hbar-app-react-session-workspace > .lumen-page-header')).toBeHidden()
          const trigger = page.locator('.hbar-mobile-header-menu-trigger')
          await expect(trigger).toBeVisible()
          await trigger.click()
          const menu = page.locator('.hbar-mobile-header-menu-content')
          action = menu.getByRole('button', { name: copy.session.tools.files, exact: true })
          await expect(action).toHaveCount(1)
          await page.screenshot({ path: testInfo.outputPath(`project-files-menu-${locale}-${width}.png`) })
        } else {
          await expect(header.getByRole('button')).toHaveCount(4)
          await expect(entry).toHaveAttribute('title', copy.session.tools.files)
          expect(
            await header
              .getByRole('button')
              .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
          ).toEqual([
            copy.session.find.entry,
            copy.session.tools.files,
            copy.session.tools.activity,
            copy.session.tools.more,
          ])
        }
        await expect(action).toBeVisible()
        await expect(action).toHaveAttribute('aria-pressed', 'false')
        await action.focus()
        await page.keyboard.press('Enter')
        await expect(files).toBeVisible()
        await expect(files.getByTitle(host.ready.workspaceName, { exact: true })).toBeVisible()
        await expect(files.getByText('browser-e2e.md', { exact: true })).toBeVisible()
        if (width >= 1024) await expect(entry).toHaveAttribute('aria-pressed', 'true')
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`project-files-${locale}-${width}.png`) })
        await files.getByRole('button', { name: copy.files.close, exact: true }).click()
        await expect(files).toHaveCount(0)
        await expectComposerText(prompt, draft)
      }

      await page.setViewportSize({ width: 1440, height: 960 })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await show.isVisible()) await show.click()
      await selectSession(page, second.id, secondSession.title)
      await entry.click()
      await expect(files.getByTitle(second.name, { exact: true })).toBeVisible()
      await expect(files.getByText('second-project-proof.md', { exact: true })).toBeVisible()
      await expect(files.getByText('browser-e2e.md', { exact: true })).toHaveCount(0)
      await files.getByRole('button', { name: copy.files.close, exact: true }).click()
      await selectSession(page, host.ready.workspaceId, host.ready.sessionTitle)
      await expectComposerText(prompt, draft)
      await page.reload()
      await expect(entry).toBeEnabled()
      await expectComposerText(prompt, draft)
      await entry.click()
      await expect(files.getByTitle(host.ready.workspaceName, { exact: true })).toBeVisible()
      await expect(files.getByText('browser-e2e.md', { exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeRoot(root)
    }
  })
}
