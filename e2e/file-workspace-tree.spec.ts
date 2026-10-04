import { expect, test } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44729}`
const folder = 'docs'
const nested = 'docs/里面的路径'
const filename = '很长的文件名-breadcrumb-and-tree-navigation-preserves-my-draft.md'
const path = `${nested}/${filename}`
const alternative = `other/${filename}`

async function removeOwnedFixture(root: string) {
  const ownedRoot = resolve(root)
  if (dirname(ownedRoot) !== resolve(tmpdir()) || !basename(ownedRoot).startsWith('hbar-file-tree-'))
    throw new Error('Refusing to remove a non-owned file-tree fixture')
  await rm(ownedRoot, { recursive: true, force: true })
}

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

for (const locale of ['zh-CN'] as const) {
  test(`real Host All files keyboard focus, unopened paths, preview query and tree drafts: ${locale}`, async ({
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
      host = await startWebSessionHost({
        root,
        home: join(root, '.host'),
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44717),
      })
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
      const alternativeResult = files.getByRole('button', { name: alternative, exact: true })
      await expect(searchResult).toBeVisible()
      await expect(files.getByRole('list', { name: copy.files.tree.searchResults, exact: true })).toContainText(nested)
      await search.hover()
      await search.press('ArrowDown')
      const phase = process.env.HBAR_E2E_FOCUS_PHASE === 'red' ? 'red' : 'verified'
      await page.screenshot({ path: `artifacts/file-search-keyboard-v16/hbar-first-result-${phase}.png` })
      await writeFile(
        `artifacts/file-search-keyboard-v16/hbar-first-result-${phase}.json`,
        JSON.stringify(
          await files.evaluate((element) => ({
            activeLabel: element.ownerDocument.activeElement?.getAttribute('aria-label'),
            currentResults: [...element.querySelectorAll('.hbar-file-search-row[aria-current]')].map((row) =>
              row.getAttribute('aria-label'),
            ),
          })),
          null,
          2,
        ),
      )
      await expect(searchResult).toBeFocused()
      await alternativeResult.hover()
      await expect(searchResult).toBeFocused()
      await searchResult.dispatchEvent('keydown', { key: 'ArrowDown', isComposing: true })
      await expect(searchResult).toBeFocused()
      await searchResult.press('ArrowDown')
      await expect(alternativeResult).toBeFocused()
      await alternativeResult.press('ArrowUp')
      await expect(searchResult).toBeFocused()
      await searchResult.press('End')
      await expect(alternativeResult).toBeFocused()
      await alternativeResult.press('Home')
      await expect(searchResult).toBeFocused()
      await page.setViewportSize({ width: 320, height: 844 })
      await expect(searchResult).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: 'artifacts/file-search-keyboard-v16/hbar-first-result-narrow.png' })
      await page.setViewportSize({ width: 1440, height: 960 })
      // Refresh without moving focus first: the focused result is removed while
      // Host search runs. Recover into the search field, not document.body.
      const refresh = files.getByRole('button', { name: copy.files.tree.refreshSearch, exact: true })
      await searchResult.focus()
      await expect(searchResult).toBeFocused()
      await refresh.evaluate((button: HTMLButtonElement) => button.click())
      await expect(search).toBeFocused()
      await expect(searchResult).toBeVisible()
      // A later result refresh must not steal focus from the conversation.
      const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await composer.focus()
      await refresh.evaluate((button: HTMLButtonElement) => button.click())
      await expect(searchResult).toBeVisible()
      await expect(composer).toBeFocused()
      await search.press('ArrowDown')
      await expect(searchResult).toBeFocused()
      await searchResult.press('Escape')
      await expect(search).toBeFocused()
      await expect(search).toHaveValue('')
      await search.fill('other/')
      await expect(alternativeResult).toBeVisible()
      await search.dispatchEvent('keydown', { key: 'ArrowDown', isComposing: true })
      await expect(search).toBeFocused()
      await search.press('ArrowDown')
      await expect(alternativeResult).toBeFocused()
      await alternativeResult.press('Enter')
      await expect(files.getByLabel(copy.files.textPreview(alternative), { exact: true })).toContainText(
        '# Other source',
      )
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await expect(search).toHaveValue('other/')
      await files.getByRole('button', { name: copy.files.tree.clearSearch, exact: true }).click()
      await expect(search).toHaveValue('')
      await expect(search).toBeFocused()
      await search.fill('breadcrumb')
      await expect(searchResult).toBeVisible()
      await search.press('ArrowDown')
      await expect(searchResult).toBeFocused()
      await searchResult.press('Enter')
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
      await files.getByRole('button', { name: filename, exact: true }).click()
      await expect(files.getByLabel(copy.files.textPreview(path), { exact: true })).toContainText('# Source')
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      const editor = files.getByRole('textbox', { name: path, exact: true })
      await editor.fill('# An unsaved tree draft')
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await expect(files.getByRole('button', { name: copy.files.tree.collapse(folder), exact: true })).toBeVisible()
      await expect(files.getByRole('button', { name: filename, exact: true })).toBeVisible()
      await files.getByRole('button', { name: filename, exact: true }).click()
      await expect(editor).toHaveValue('# An unsaved tree draft')
      await expect(files.getByRole('button', { name: copy.files.edit, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await files.getByRole('combobox', { name: copy.files.changes.mode, exact: true }).selectOption('changed')
      await files.getByRole('button', { name: copy.files.changes.openFolder(folder), exact: true }).click()
      // Opening a changed folder retains the selected mode. All files owns breadcrumbs.
      await files.getByRole('combobox', { name: copy.files.changes.mode, exact: true }).selectOption('all')
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
      await expect(editor).toHaveValue('# An unsaved tree draft')
      await expect(files.getByRole('button', { name: copy.files.edit, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(await readFile(join(root, path), 'utf8')).toBe('# Source\n')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
