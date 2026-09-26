import { expect, type Page } from '@playwright/test'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from '../e2e/support/composer-text'

/** Called only inside an already ownership-verified disposable main WebView fixture. */
export async function verifyNativeSessionArchive(
  page: Page,
  api: HbarClient,
  source: {
    readonly workspaceId: string
    readonly workspaceName: string
    readonly sessionId: string
    readonly title: string
  },
) {
  const copy = getShellCopy('zh-CN')
  const commands = createWorkspaceSessionCommandClient(api)
  const output = resolve('artifacts/desktop-entry-matrix/archive/native')
  await mkdir(output, { recursive: true })
  // The caller is on General after its saved-language reload. Back restores its existing source Session.
  await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: source.title, exact: true })).toBeVisible()
  const a = await commands.execute(
    'session.create',
    { workspaceId: source.workspaceId, title: 'Native 原归档目标 A — 不保留失效页签' },
    { idempotencyKey: crypto.randomUUID() },
  )
  const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
  await page.getByRole('button', { name: copy.shell.roster.refreshExpanded, exact: true }).click()
  await page.getByRole('button', { name: copy.shell.openSession(a.title), exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(a.title)
  const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
  await prompt.fill('Native 原A未发送草稿')
  await page.getByRole('tab', { name: source.title, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(source.title)
  await prompt.fill('Native 保留B输入，不暗选邻居')
  if (await show.isVisible()) await show.click()
  const row = page.locator(`[data-session-id="${a.id}"]`)
  await row.locator('summary').click()
  await row.getByRole('menuitem', { name: copy.shell.archiveSession, exact: true }).click()
  const confirm = page.getByRole('group', { name: copy.shell.archive.confirmTitle(a.title), exact: true })
  await expect(confirm.getByRole('button', { name: copy.shell.archive.cancel, exact: true })).toBeFocused()
  await confirm.getByRole('button', { name: copy.shell.archive.confirm, exact: true }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByRole('tab', { name: a.title, exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: source.title, exact: true })).toHaveAttribute('aria-selected', 'true')
  await expectComposerText(prompt, 'Native 保留B输入，不暗选邻居')
  expect((await commands.execute('session.get', { sessionId: a.id }))?.archived).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.screenshot({ path: join(output, 'confirmed-original-a-b-draft-900.png') })
  await page.getByRole('button', { name: copy.shell.archive.dismiss, exact: true }).click()
  await page.getByTitle(copy.shell.workspaceActions(source.workspaceName), { exact: true }).click()
  await page.getByRole('menuitem', { name: copy.shell.archive.openList(source.workspaceName), exact: true }).click()
  await page.getByRole('button', { name: copy.shell.archive.restoreSession(a.title), exact: true }).click()
  await expect(row).toBeVisible()
  await expect(page.getByRole('tab', { name: a.title, exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(source.title)
  await page.getByRole('button', { name: copy.shell.archive.close, exact: true }).click()
  await row.locator('.hbar-app-react-session-target').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(a.title)
  await expectComposerText(prompt, 'Native 原A未发送草稿')
  // Archive currently selected A. B remains open but is not selected now or after reload.
  if (await show.isVisible()) await show.click()
  await row.locator('summary').click()
  await row.getByRole('menuitem', { name: copy.shell.archiveSession, exact: true }).click()
  await confirm.getByRole('button', { name: copy.shell.archive.confirm, exact: true }).click()
  await expect(page.getByRole('tab', { name: a.title, exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: source.title, exact: true })).toHaveAttribute('aria-selected', 'false')
  await expect
    .poll(() =>
      page.evaluate((sourceWorkspaceId) => {
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index)
          if (!key?.endsWith(':preferences')) continue
          const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
          if (
            !raw ||
            typeof raw !== 'object' ||
            !('value' in raw) ||
            !raw.value ||
            typeof raw.value !== 'object' ||
            !('workspaceTabs' in raw.value)
          )
            continue
          const tabs: unknown = raw.value.workspaceTabs
          if (tabs && typeof tabs === 'object' && 'activeId' in tabs && 'activeWorkspaceId' in tabs)
            return tabs.activeId === null && tabs.activeWorkspaceId === sourceWorkspaceId
        }
        return false
      }, source.workspaceId),
    )
    .toBe(true)
  await page.reload()
  await expect(page.getByRole('tab', { name: source.title, exact: true })).toHaveAttribute('aria-selected', 'false')
  await expect(page.getByRole('tab', { name: a.title, exact: true })).toHaveCount(0)
  await page.screenshot({ path: join(output, 'current-a-retired-reloaded-no-neighbour-900.png') })
  expect((await api.call('session.snapshot', { sessionId: source.sessionId })).runs).toEqual([])
  expect((await api.call('session.snapshot', { sessionId: a.id })).runs).toEqual([])
  await writeFile(
    join(output, 'verification.json'),
    JSON.stringify(
      {
        width: 900,
        originalArchivedTabRetired: true,
        sourceDraftKeptBeforeReload: true,
        restoredOriginalDraft: true,
        noImplicitNeighbourOnArchiveOrReload: true,
        noProviderRuns: true,
      },
      null,
      2,
    ),
  )
}
