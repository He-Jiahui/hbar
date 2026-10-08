import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { removeOwnedTempDirectory } from './support/owned-temp-directory'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const captureDirectory = 'artifacts/file-selection-context'
const sourcePath = 'workspace-context-reference-with-a-readable-long-name.ts'
const changedPath = 'changed.ts'
const source =
  'export function normalize(path: string) {\n  const normalizedPath = path.trim()\n  return normalizedPath\n}\n'
const oldCode = 'export function value() {\n  const oldValue = "old"\n  return oldValue\n}\n'
const newCode = 'export function value() {\n  const newValue = "new"\n  return newValue\n}\n'

test.use({ actionTimeout: 10_000 })

function git(root: string, ...args: string[]) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore', windowsHide: true })
}

async function removeOwnedTemporaryDirectory(path: string): Promise<void> {
  await removeOwnedTempDirectory(path, 'hbar-file-context-')
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`selected source and diff comments join only their source draft and accepted Run: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-file-context-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      await mkdir(join(process.cwd(), captureDirectory), { recursive: true })
      await writeFile(join(root, sourcePath), source)
      await writeFile(join(root, changedPath), oldCode)
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317), sessionCount: 2 })
      git(root, 'add', sourcePath, changedPath)
      git(root, 'commit', '-m', 'source context fixture')
      await writeFile(join(root, changedPath), newCode)
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base())
      await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('Review this code')
      await page.getByRole('button', { name: copy.session.addMenu.open, exact: true }).click()
      await page
        .getByRole('group', { name: copy.session.addMenu.menu, exact: true })
        .getByRole('button', { name: copy.session.addMenu.files, exact: true })
        .click()
      await page.locator('.hbar-composer-attachment-target input[type="file"]').setInputFiles({
        name: 'review-notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Preserve this material'),
      })
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'review-notes.txt' })).toBeVisible()
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      const files = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
      await files.getByRole('button', { name: sourcePath, exact: true }).click()
      await files.getByRole('button', { name: copy.files.addToChat, exact: true }).click()
      const preview = files.getByLabel(copy.files.textPreview(sourcePath), { exact: true })
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 844 : 900 })
        await preview.evaluate((element) => {
          const start = element.querySelector('[data-source-code="1"]')!.firstChild!
          const end = element.querySelector('[data-source-code="2"]')!.firstChild!
          const range = document.createRange()
          range.setStart(start, 2)
          range.setEnd(end, end.textContent!.length)
          const selection = document.getSelection()!
          selection.removeAllRanges()
          selection.addRange(range)
        })
        await preview.dispatchEvent('mouseup', { button: 0 })
        await expect(page.locator('.hbar-file-selection-menu')).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `${captureDirectory}/source-selection-${locale}-${width}.png` })
      }
      await page
        .locator('.hbar-file-selection-menu')
        .getByRole('button', { name: copy.files.context.addSelection, exact: true })
        .click()
      await expect(page.locator('.hbar-file-selection-menu')).toHaveCount(0)
      await files.getByRole('button', { name: copy.files.context.commentLine(sourcePath, 3), exact: true }).click()
      const comment = files.locator('.hbar-file-comment-editor')
      await comment
        .getByRole('textbox', { name: copy.files.context.note, exact: true })
        .fill('Keep normalization at the boundary.')
      await files
        .getByRole('button', { name: copy.files.context.commentLine(sourcePath, 2), exact: true })
        .click({ modifiers: ['Shift'] })
      await expect(comment.getByRole('textbox', { name: copy.files.context.note, exact: true })).toHaveValue(
        'Keep normalization at the boundary.',
      )
      await page.screenshot({ path: `${captureDirectory}/source-comment-${locale}-320.png` })
      await comment.getByRole('button', { name: copy.files.context.addComment, exact: true }).click()
      await expect(comment).toHaveCount(0)
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await selectLumenOption(files.getByRole('combobox', { name: copy.files.changes.mode, exact: true }), 'changed')
      await files.getByRole('button', { name: copy.files.changes.open(changedPath), exact: true }).click()
      await files
        .getByRole('button', { name: copy.files.context.commentLine(changedPath, 2, 'new'), exact: true })
        .click()
      await comment
        .getByRole('textbox', { name: copy.files.context.note, exact: true })
        .fill('Use the new value consistently.')
      await files
        .getByRole('button', { name: copy.files.context.commentLine(changedPath, 3, 'new'), exact: true })
        .click({ modifiers: ['Shift'] })
      await expect(comment.getByRole('textbox', { name: copy.files.context.note, exact: true })).toHaveValue(
        'Use the new value consistently.',
      )
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 844 : 900 })
        await expect(comment).toBeVisible()
        const fits = await comment.evaluate((element) => element.getBoundingClientRect().right <= innerWidth + 1)
        expect(fits).toBe(true)
        await page.screenshot({ path: `${captureDirectory}/diff-comment-${locale}-${width}.png` })
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      await comment.getByRole('button', { name: copy.files.context.addComment, exact: true }).click()
      await expect(comment).toHaveCount(0)
      await expect(prompt).toBeFocused()
      await expect(files).toBeVisible()
      await page.screenshot({ path: info.outputPath('diff-comment-to-composer-1440.png') })
      // A narrow reader has no visible composer: repeat the same reference to keep reading, without duplication.
      await page.setViewportSize({ width: 320, height: 844 })
      const firstDiffLine = files.getByRole('button', {
        name: copy.files.context.commentLine(changedPath, 2, 'new'),
        exact: true,
      })
      await firstDiffLine.click()
      await comment
        .getByRole('textbox', { name: copy.files.context.note, exact: true })
        .fill('Use the new value consistently.')
      await files
        .getByRole('button', {
          name: copy.files.context.commentLine(changedPath, 3, 'new'),
          exact: true,
        })
        .click({ modifiers: ['Shift'] })
      await comment.getByRole('button', { name: copy.files.context.addComment, exact: true }).click()
      await expect(comment).toHaveCount(0)
      await expect(firstDiffLine).toBeFocused()
      await expect(prompt).not.toBeFocused()
      await page.screenshot({ path: info.outputPath('diff-comment-retains-narrow-reader.png') })
      await files.getByRole('button', { name: copy.files.close, exact: true }).click()
      await expectComposerText(prompt, `Review this code @${sourcePath}`)
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText(`@${sourcePath}`)
      const cards = page.locator('.hbar-composer-workspace-context-card')
      await expect(cards).toHaveCount(3)
      await expect(cards.filter({ hasText: 'Use the new value consistently.' })).toBeVisible()
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'review-notes.txt' })).toBeVisible()
      const disclosure = page.locator(
        '.hbar-composer-workspace-context-card[data-kind="source-selection"] .hbar-composer-workspace-context-quote',
      )
      const quote = disclosure.getByRole('blockquote')
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 844 : 900 })
        await expect(quote).toBeHidden()
        await disclosure.locator('summary').focus()
        await page.keyboard.press('Enter')
        await expect(quote).toBeVisible()
        await expect(quote).toContainText('normalizedPath')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `${captureDirectory}/composer-contexts-${locale}-${width}.png` })
        await page.keyboard.press('Enter')
        await expect(quote).toBeHidden()
      }
      // Removing a single source note preserves the selected code, diff note and original materials.
      await cards.filter({ hasText: 'Keep normalization at the boundary.' }).getByRole('button').click()
      await expect(cards).toHaveCount(2)
      await expect(
        page.locator(
          '.hbar-composer-workspace-context-card[data-kind="source-selection"] .hbar-composer-workspace-context-range',
        ),
      ).toHaveText('L2–L3')
      await page.screenshot({ path: `${captureDirectory}/ready-contexts-${locale}-320.png` })
      await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
      await expect(page.locator('.hbar-composer-workspace-context-card')).toHaveCount(0)
      await expectComposerText(page.getByRole('textbox', { name: copy.session.prompt.input, exact: true }), '')
      await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(cards).toHaveCount(2)
      await prompt.click()
      await prompt.press('Enter')
      await expect
        .poll(
          async () =>
            (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 60 })).runs.filter(
              (run) => run.input.source === 'user',
            ).length,
        )
        .toBe(1)
      const snapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 60 })
      const run = snapshot.runs.find((item) => item.input.source === 'user')!
      expect(run.input.text).toContain(`Review this code @"${sourcePath}"`)
      expect(run.input.text).toContain(`@"${sourcePath}:L2-L3"`)
      expect(run.input.text).toContain('const normalizedPath = path.trim()\n  return normalizedPath')
      expect(run.input.text).toContain('@"changed.ts:new:L2-L3"')
      expect(run.input.text).toContain('Comment: Use the new value consistently.')
      expect(run.input.text).toContain('const newValue = "new"\n  return newValue')
      expect(run.input.text).not.toContain('Keep normalization at the boundary.')
      expect(run.input.files?.map((file) => file.name)).toEqual(['review-notes.txt'])
      await expectComposerText(prompt, '')
      await expect(cards).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      if (host) await stopWebSessionHost(host)
      await context.close()
      await removeOwnedTemporaryDirectory(root)
    }
  })
}
