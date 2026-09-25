import { expect, test } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44729}`
const folder = 'docs'
const nested = 'docs/里面的路径'
const filename = '很长的文件名-breadcrumb-and-tree-navigation-preserves-my-draft.md'
const path = `${nested}/${filename}`
const alternative = `other/${filename}`

async function enterFiles(page: import('@playwright/test').Page, locale: ShellLocale, host: WebSessionHost) {
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
  test(`real Host All files searches unopened paths, preserves preview query and tree drafts: ${locale}`, async ({
    browser,
  }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-file-tree-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      await mkdir(join(root, nested), { recursive: true })
      await mkdir(join(root, 'other'), { recursive: true })
      await writeFile(join(root, path), '# Source\n')
      await writeFile(join(root, alternative), '# Other source\n')
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44717) })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const files = await enterFiles(page, locale, host)
      const search = files.getByRole('textbox', { name: copy.files.tree.filter, exact: true })
      await search.fill('breadcrumb')
      const searchResult = files.getByRole('button', { name: path, exact: true })
      await expect(searchResult).toBeVisible()
      await expect(files.getByRole('list', { name: copy.files.tree.searchResults, exact: true })).toContainText(nested)
      await page.screenshot({ path: `artifacts/file-search/search-${locale}-1440.png` })
      await page.setViewportSize({ width: 320, height: 844 })
      await expect(searchResult).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/file-search/search-${locale}-320.png` })
      await page.setViewportSize({ width: 1440, height: 960 })
      await search.press('End')
      await search.press('Enter')
      await expect(files.getByLabel(copy.files.textPreview(alternative), { exact: true })).toContainText(
        '# Other source',
      )
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await expect(search).toHaveValue('breadcrumb')
      await searchResult.click()
      await expect(files.getByLabel(copy.files.textPreview(path), { exact: true })).toContainText('# Source')
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await expect(search).toHaveValue('breadcrumb')
      await expect(searchResult).toBeVisible()
      await search.press('Escape')
      await expect(search).toHaveValue('')
      await files.getByRole('button', { name: copy.files.tree.expand(folder), exact: true }).click()
      await files.getByRole('button', { name: copy.files.tree.expand(nested), exact: true }).click()
      await expect(files.getByRole('button', { name: filename, exact: true })).toBeVisible()
      await expect(files.getByText(copy.files.tree.filterScope, { exact: true })).toBeVisible()
      for (const width of [1440, 1024, 390, 320]) {
        await page.setViewportSize({ width, height: width > 1000 ? 960 : 844 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/file-changes/hbar-tree-${locale}-${width}.png` })
      }
      await files.getByRole('button', { name: filename, exact: true }).click()
      await expect(files.getByLabel(copy.files.textPreview(path), { exact: true })).toContainText('# Source')
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      const editor = files.getByRole('textbox', { name: path, exact: true })
      await editor.fill('# An unsaved tree draft')
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await expect(files.getByRole('button', { name: copy.files.tree.collapse(folder), exact: true })).toBeVisible()
      await expect(files.getByRole('button', { name: filename, exact: true })).toBeVisible()
      await files.getByRole('button', { name: filename, exact: true }).click()
      await expect(files.getByLabel(copy.files.textPreview(path), { exact: true })).toContainText(
        '# An unsaved tree draft',
      )
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await files.getByRole('combobox', { name: copy.files.changes.mode, exact: true }).selectOption('changed')
      await files.getByRole('button', { name: copy.files.changes.openFolder(folder), exact: true }).click()
      await expect(files.getByRole('navigation', { name: copy.files.tree.navigation, exact: true })).toContainText(
        copy.files.tree.root,
      )
      await expect(files.getByRole('navigation', { name: copy.files.tree.navigation, exact: true })).toContainText(
        folder,
      )
      await files
        .getByRole('navigation', { name: copy.files.tree.navigation, exact: true })
        .getByRole('button', { name: copy.files.tree.root, exact: true })
        .click()
      await files.getByRole('button', { name: copy.files.tree.expand(folder), exact: true }).click()
      await files.getByRole('button', { name: copy.files.tree.expand(nested), exact: true }).click()
      await files.getByRole('button', { name: filename, exact: true }).click()
      await expect(files.getByLabel(copy.files.textPreview(path), { exact: true })).toContainText(
        '# An unsaved tree draft',
      )
      expect(await readFile(join(root, path), 'utf8')).toBe('# Source\n')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
