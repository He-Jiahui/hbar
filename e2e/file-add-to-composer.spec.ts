import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { expectComposerText } from './support/composer-text'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const filename = 'a-very-long-source-document-name-with-multiple-sections-and-资料-for-review.md'
const changedFile = 'changed-view.md'

function git(root: string, ...arguments_: string[]) {
  execFileSync('git', arguments_, { cwd: root, stdio: 'ignore', windowsHide: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Files adds a structured reference to its original composer, preserving another Session: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-files-chat-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    const tabs = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
    let host: WebSessionHost | undefined
    try {
      await writeFile(join(root, filename), '# on disk\n')
      await writeFile(join(root, changedFile), '# before\n')
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317), sessionCount: 2 })
      git(root, 'add', filename, changedFile)
      git(root, 'commit', '-m', 'source files fixture')
      await writeFile(join(root, changedFile), '# after\n')
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base())
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await page.getByRole('textbox', { name: copy.session.prompt.input }).fill('Review this')
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      const dock = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
      await dock.getByRole('button', { name: filename, exact: true }).click()
      await dock.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      const workbenchTab = page.getByRole('tab', { name: tabs.workbenchTitle, exact: true })
      await expect(workbenchTab).toHaveAttribute('aria-selected', 'true')
      await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
      const otherPrompt = page.getByRole('textbox', { name: copy.session.prompt.input })
      await otherPrompt.fill('Other draft')
      await workbenchTab.click()
      const files = page.locator('.hbar-app-react-file-workbench')
      const add = files.getByRole('button', { name: copy.files.addToChat, exact: true })
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await files.getByRole('textbox', { name: filename, exact: true }).fill('# uncommitted edit')
      await expect(add).toBeDisabled()
      await expect(files.getByRole('status').filter({ hasText: copy.files.addFileDraftPending })).toBeVisible()
      await files.getByRole('button', { name: copy.files.reload, exact: true }).click()
      await page
        .getByRole('dialog', { name: copy.files.reloadTitle(filename) })
        .getByRole('button', { name: copy.files.discardAndReload, exact: true })
        .click()
      await expect(add).toBeEnabled()
      await add.click()
      await expect(
        files.getByRole('status').filter({ hasText: copy.files.addedToChat(host.ready.sessionTitle) }),
      ).toBeVisible()
      await expect(workbenchTab).toHaveAttribute('aria-selected', 'true')
      await add.click()
      await expect(
        files.getByRole('status').filter({ hasText: copy.files.alreadyInChat(host.ready.sessionTitle) }),
      ).toBeVisible()
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
        await expect(add).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-ux-v2/files-add-chat-${locale}-${width}.png` })
      }
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await files.getByRole('textbox', { name: filename, exact: true }).fill('# still unsaved in A')
      await expect(add).toBeDisabled()
      await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
      await selectLumenOption(files.getByRole('combobox', { name: copy.files.changes.mode }), 'changed')
      await files.getByRole('button', { name: copy.files.changes.open(changedFile), exact: true }).click()
      await expect(files.getByLabel(copy.files.changes.diffContent(changedFile), { exact: true })).toContainText(
        '+# after',
      )
      const addDiff = files.getByRole('button', { name: copy.files.addToChat, exact: true })
      await expect(addDiff).toBeEnabled()
      await addDiff.click()
      await expect(
        files.getByRole('status').filter({ hasText: copy.files.addedToChat(host.ready.sessionTitle) }),
      ).toBeVisible()
      await page.screenshot({ path: `artifacts/reference-ux-v2/files-add-chat-diff-${locale}-320.png` })
      await page.getByRole('tab', { name: 'Session 001', exact: true }).click()
      await expectComposerText(page.getByRole('textbox', { name: copy.session.prompt.input }), 'Other draft')
      await workbenchTab.click()
      await files.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input })
      await expectComposerText(prompt, `Review this @${filename} @${changedFile}`)
      await expect(page.locator('.hbar-composer-mention-pill')).toHaveText([`@${filename}`, `@${changedFile}`])
      // Preview interaction in Workbench restores the source Files dock on Back.
      // At 320px it owns the full tool page; explicitly return to the composer before sending.
      await expect(dock).toBeVisible()
      expect(await prompt.evaluate((element) => element.closest('[inert]') !== null)).toBe(true)
      await dock.getByRole('button', { name: copy.files.close, exact: true }).click()
      await expect(dock).toHaveCount(0)
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
      expect(snapshot.runs.find((run) => run.input.source === 'user')?.input.text).toBe(
        `Review this @"${filename}" @"${changedFile}"`,
      )
      expect(errors).toEqual([])
    } finally {
      if (host) await stopWebSessionHost(host)
      await context.close()
      await rm(root, { recursive: true, force: true })
    }
  })
}
