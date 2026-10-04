import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44881}`
const first = 'first-document-with-a-long-name.md'
const second = 'second-document-with-a-long-name.md'
const git = (root: string, ...args: string[]) =>
  execFileSync('git', args, { cwd: root, stdio: 'ignore', windowsHide: true })

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`real Host reading navigator retains preview, draft and selection at four widths: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-reading-navigator-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      await writeFile(join(root, first), '# original first\n')
      await writeFile(join(root, second), '# original second\n')
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44879) })
      git(root, 'add', first, second)
      git(root, 'commit', '-m', 'navigator fixture')
      await writeFile(join(root, second), '# changed second\n')
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      await page.goto(base())
      await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).waitFor()
      const expand = page.getByRole('button', {
        name: copy.shell.expandWorkspace(host.ready.workspaceName),
        exact: true,
      })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      let files = page.locator('.hbar-app-react-file-workspace')
      await files.getByRole('button', { name: first, exact: true }).click()
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await files.getByRole('textbox', { name: first, exact: true }).fill('# retained unsaved draft')
      await files.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      files = page.locator('.hbar-app-react-file-workbench')
      const navigator = files.getByRole('region', { name: copy.files.navigator, exact: true })
      await expect(navigator).toBeVisible()
      await expect(navigator.getByRole('button', { name: first, exact: true })).toHaveAttribute('aria-current', 'page')
      expect(
        await navigator
          .getByRole('button', { name: first, exact: true })
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      ).not.toBe('rgba(0, 0, 0, 0)')
      await expect(files.getByRole('textbox', { name: first, exact: true })).toHaveValue('# retained unsaved draft')
      await files.getByRole('button', { name: copy.files.hideNavigator, exact: true }).click()
      await expect(navigator).toBeHidden()
      await files.getByRole('button', { name: copy.files.showNavigator, exact: true }).click()
      await expect(navigator.getByRole('textbox', { name: copy.files.tree.filter, exact: true })).toBeFocused()
      await navigator.getByRole('button', { name: second, exact: true }).click()
      await expect(files.getByLabel(copy.files.textPreview(second), { exact: true })).toContainText('changed second')
      await expect(navigator).toBeVisible()
      await expect(navigator.getByRole('button', { name: second, exact: true })).toHaveAttribute('aria-current', 'page')
      await navigator.getByRole('combobox', { name: copy.files.changes.mode, exact: true }).selectOption('changed')
      await expect(files.getByLabel(copy.files.textPreview(second), { exact: true })).toBeVisible()
      await navigator.getByRole('button', { name: copy.files.changes.open(second), exact: true }).click()
      await expect(files.getByLabel(copy.files.changes.diffContent(second), { exact: true })).toContainText(
        '+# changed second',
      )
      await expect(
        navigator.getByRole('button', { name: copy.files.changes.open(second), exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      await navigator.getByRole('button', { name: copy.files.changes.refresh, exact: true }).click()
      await expect(files.getByLabel(copy.files.changes.diffContent(second), { exact: true })).toBeVisible()
      await navigator.getByRole('combobox', { name: copy.files.changes.mode, exact: true }).selectOption('all')
      await expect(files.getByLabel(copy.files.changes.diffContent(second), { exact: true })).toBeVisible()
      await navigator.getByRole('button', { name: first, exact: true }).click()
      // The existing preview keeps its own editing mode when selected again.
      await expect(files.getByRole('button', { name: copy.files.edit, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(files.getByRole('textbox', { name: first, exact: true })).toHaveValue('# retained unsaved draft')
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width > 900 ? 960 : 844 })
        // Explicitly return to the reader before resizing from a manually open narrow navigator.
        const hide = files.getByRole('button', { name: copy.files.hideNavigator, exact: true })
        const layout = files.locator('.hbar-app-react-file-layout')
        if (width <= 900 && (await hide.isVisible())) await hide.click()
        await expect(files.getByRole('textbox', { name: first, exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/file-navigator/reader-${locale}-${width}.png` })
        if (await files.getByRole('button', { name: copy.files.showNavigator, exact: true }).isVisible())
          await files.getByRole('button', { name: copy.files.showNavigator, exact: true }).click()
        await expect(navigator).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/file-navigator/navigator-${locale}-${width}.png` })
        await navigator.getByRole('button', { name: second, exact: true }).click()
        await expect(files.getByLabel(copy.files.textPreview(second), { exact: true })).toBeVisible()
        if ((await layout.getAttribute('data-two-pane')) === 'false') await expect(navigator).toBeHidden()
        if (await files.getByRole('button', { name: copy.files.showNavigator, exact: true }).isVisible())
          await files.getByRole('button', { name: copy.files.showNavigator, exact: true }).click()
        await navigator.getByRole('button', { name: first, exact: true }).click()
        await expect(files.getByRole('textbox', { name: first, exact: true })).toHaveValue('# retained unsaved draft')
        await expect(files.getByRole('button', { name: copy.files.edit, exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        )
      }
      expect(await readFile(join(root, first), 'utf8')).toBe('# original first\n')
      expect(await readFile(join(root, second), 'utf8')).toBe('# changed second\n')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
