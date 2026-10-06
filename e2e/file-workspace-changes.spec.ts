import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44729}`
const workingPath = 'src/long-folder-name/working-tree-change-with-a-long-name.ts'
const stagedPath = 'staged-change.md'
const untrackedPath = '未跟踪-preview.txt'

function git(root: string, ...arguments_: string[]) {
  execFileSync('git', arguments_, { cwd: root, stdio: 'ignore', windowsHide: true })
}

async function enterFiles(page: Page, locale: ShellLocale, host: WebSessionHost) {
  const copy = getShellCopy(locale)
  await page.goto(base())
  await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).waitFor()
  const expand = page.getByRole('button', { name: copy.shell.expandWorkspace(host.ready.workspaceName), exact: true })
  if (await expand.isVisible()) await expand.click()
  await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
  await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
  return page.locator('.hbar-app-react-file-workspace')
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`real Host Changed files and diff remain usable at four widths: ${locale}`, async ({ browser }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-file-changes-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      await mkdir(join(root, 'src', 'long-folder-name'), { recursive: true })
      await writeFile(join(root, workingPath), 'export const value = "before"\n')
      await writeFile(join(root, stagedPath), '# before\n')
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44717) })
      git(root, 'add', workingPath, stagedPath)
      git(root, 'commit', '-m', 'files fixture')
      await writeFile(join(root, workingPath), 'export const value = "after"\n')
      await writeFile(join(root, stagedPath), '# staged after\n')
      git(root, 'add', stagedPath)
      await writeFile(join(root, untrackedPath), '普通文本预览，不是虚构的 Git diff。\n')

      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const files = await enterFiles(page, locale, host)
      await selectLumenOption(files.getByRole('combobox', { name: copy.files.changes.mode, exact: true }), 'changed')
      await expect(files.getByRole('button', { name: copy.files.changes.open(workingPath), exact: true })).toBeVisible()
      await expect(files.getByText(copy.files.changes.status(' ', 'M'), { exact: true })).toBeVisible()
      await expect(files.getByText(copy.files.changes.status('M', ' '), { exact: true })).toBeVisible()
      for (const width of [1440, 1024, 390, 320]) {
        await page.setViewportSize({ width, height: width > 1000 ? 960 : 844 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/file-changes/hbar-changed-${locale}-${width}.png` })
      }

      await files.getByRole('button', { name: copy.files.changes.open(workingPath), exact: true }).click()
      const diff = files.getByRole('region').filter({ has: files.getByText(workingPath, { exact: true }) })
      await expect(files.getByLabel(copy.files.changes.diffContent(workingPath), { exact: true })).toContainText(
        '-export const value = "before"',
      )
      await expect(files.getByLabel(copy.files.changes.diffContent(workingPath), { exact: true })).toContainText(
        '+export const value = "after"',
      )
      await expect(files.getByText(copy.files.changes.readOnlyDiff, { exact: true })).toBeVisible()
      await page.screenshot({ path: `artifacts/file-changes/hbar-diff-${locale}-320.png` })
      await files.getByRole('button', { name: copy.files.changes.openFile, exact: true }).click()
      await expect(files.getByLabel(copy.files.textPreview(workingPath), { exact: true })).toContainText('after')
      await expect(files.getByRole('textbox', { name: workingPath, exact: true })).toHaveCount(0)
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await expect(files.getByRole('textbox', { name: workingPath, exact: true })).toHaveValue(
        'export const value = "after"\n',
      )
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await files.getByRole('button', { name: copy.files.changes.open(stagedPath), exact: true }).click()
      await expect(files.getByRole('button', { name: copy.files.changes.staged, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(files.getByLabel(copy.files.changes.diffContent(stagedPath), { exact: true })).toContainText(
        '+# staged after',
      )
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await files.getByRole('button', { name: copy.files.changes.open(untrackedPath), exact: true }).click()
      await expect(files.getByLabel(copy.files.textPreview(untrackedPath), { exact: true })).toContainText(
        '普通文本预览',
      )
      expect(await readFile(join(root, untrackedPath), 'utf8')).toContain('不是虚构的 Git diff')
      const nested = await createWorkspaceSessionCommandClient(host.client).execute('workspace.create', {
        path: join(root, 'src'),
      })
      const nestedPath = workingPath.slice('src/'.length)
      await page.setViewportSize({ width: 1440, height: 960 })
      // An external client created this workspace; reload the application directory projection.
      await page.reload()
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByTitle(copy.shell.workspaceActions(nested.name), { exact: true }).click()
      await page
        .getByRole('menu', { name: copy.shell.workspaceActions(nested.name), exact: true })
        .getByRole('menuitem', { name: locale === 'zh-CN' ? '文件' : 'Files', exact: true })
        .click()
      await selectLumenOption(files.getByRole('combobox', { name: copy.files.changes.mode, exact: true }), 'changed')
      await files.getByRole('button', { name: copy.files.changes.open(nestedPath), exact: true }).click()
      await expect(files.getByLabel(copy.files.changes.diffContent(nestedPath), { exact: true })).toContainText(
        '+export const value = "after"',
      )
      await files.getByRole('button', { name: copy.files.changes.openFile, exact: true }).click()
      await expect(files.getByLabel(copy.files.textPreview(nestedPath), { exact: true })).toContainText('after')
      expect(await readFile(join(root, workingPath), 'utf8')).toBe('export const value = "after"\n')
      expect(errors).toEqual([])
      void diff
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
