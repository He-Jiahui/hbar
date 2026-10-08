import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import {
  createBudgetCommandClient,
  createGitCommandClient,
  createModelCommandClient,
  createRunCommandClient,
  createSessionLaunchTargetReader,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'
import { sessionBranchTargetCopy } from '../apps/web/src/session-branch-target-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-branch-picker-e2e-'
const origin = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 48729}`
function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()
}
async function removeOwnedFixture(root: string) {
  const owned = resolve(root)
  if (dirname(owned) !== resolve(tmpdir()) || !basename(owned).startsWith(prefix))
    throw new Error('Refusing to remove an unowned E2E fixture')
  await rm(owned, { recursive: true, force: true })
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`branch chooser switches real directories, creates targets and stays usable at 320 px (${locale})`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 48717),
        goalAutoContinue: false,
      })
      const client = host.client
      const repository = join(root, 'repository')
      await mkdir(repository)
      await writeFile(join(repository, 'file.md'), '# Branch picker\n')
      for (const args of [
        ['init', '-q', '-b', 'main'],
        ['config', 'user.name', 'hbar test'],
        ['config', 'user.email', 'hbar@example.invalid'],
        ['add', '.'],
        ['commit', '-q', '-m', 'initial'],
      ])
        git(repository, args)
      const branch = 'feature/local-工作树-with-a-long-branch-name-for-layout-and-directory-verification'
      const worktree = join(root, 'existing-local-worktree')
      git(repository, ['worktree', 'add', '-b', branch, worktree])
      const directory = createWorkspaceSessionCommandClient(client)
      const workspace = await directory.execute('workspace.create', { path: repository })
      const session = await directory.execute(
        'session.create',
        { workspaceId: workspace.id, title: 'Branch picker fixture' },
        { idempotencyKey: crypto.randomUUID() },
      )
      const models = createModelCommandClient(client)
      const baseline = await models.execute('session.getModel', { sessionId: session.id })
      await models.execute(
        'session.setModel',
        { sessionId: session.id, modelId: 'local-fixture', baselineRevisions: baseline.revisions },
        { idempotencyKey: crypto.randomUUID() },
      )
      await createBudgetCommandClient(client).execute(
        'session.setBudget',
        { sessionId: session.id, tokens: 100_000 },
        { idempotencyKey: crypto.randomUUID() },
      )
      const runs = createRunCommandClient(client)
      const accepted = await runs.execute(
        'run.submit',
        { sessionId: session.id, modelId: 'local-fixture', input: { text: 'Prepare branch picker', images: [] } },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status, {
          timeout: 20_000,
        })
        .toBe('completed')
      const userRunCount = async () =>
        (await client.call('session.snapshot', { sessionId: session.id })).runs.filter(
          (run) => !run.input.source || run.input.source === 'user',
        ).length
      const initialRunCount = await userRunCount()
      await context.request.post(`${origin()}/auth/token`, { data: { token: host.ready.token } })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${origin()}/apps/web/`)
      const shell = getShellCopy(locale).shell
      const copy = sessionContextCopy(locale)
      const labels = sessionBranchTargetCopy(locale)
      await page.getByTitle(shell.workspaceActions(workspace.name), { exact: true }).waitFor()
      const expand = page.getByRole('treeitem', { expanded: false, name: workspace.name, exact: true })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('treeitem', { name: session.title, exact: true }).click()
      const project = page.getByRole('group', { name: copy.project(workspace.name), exact: true })
      const dialog = page.getByRole('dialog', { name: labels.title, exact: true })
      await project.getByRole('button', { name: copy.branch('main'), exact: true }).click()
      await expect(dialog.getByRole('option').filter({ hasText: branch })).toBeEnabled()
      await expect(dialog.getByRole('button', { name: labels.newBranch, exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: labels.newWorktree, exact: true })).toBeVisible()
      await page.screenshot({ path: `artifacts/branch-target/branch-panel-${locale}-1440.png` })
      await dialog.getByRole('option').filter({ hasText: branch }).click()
      await expect(dialog).toBeHidden()
      await expect(project.getByRole('button', { name: copy.branch(branch), exact: true })).toBeVisible()
      await expect(project.getByTitle(worktree, { exact: true })).toBeVisible()
      const target = await createSessionLaunchTargetReader(client).read(session.id)
      expect(
        (
          await createGitCommandClient(client).execute('sessionGit.info', {
            workspaceId: workspace.id,
            sessionId: session.id,
            expectedRevision: target.revision,
          })
        ).branch,
      ).toBe(branch)
      expect(git(repository, ['branch', '--show-current'])).toBe('main')

      await project.getByRole('button', { name: copy.branch(branch), exact: true }).click()
      await dialog.getByRole('textbox', { name: labels.search, exact: true }).fill('does-not-exist')
      await expect(dialog.getByText(labels.empty, { exact: true })).toBeVisible()
      await dialog.getByRole('textbox', { name: labels.search, exact: true }).fill('工作树')
      await expect(dialog.getByRole('option')).toHaveCount(1)
      await dialog.getByRole('textbox', { name: labels.search, exact: true }).press('ArrowDown')
      await expect(dialog.getByRole('option')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(project.getByRole('button', { name: copy.branch(branch), exact: true })).toBeFocused()

      await project.getByRole('button', { name: copy.branch(branch), exact: true }).click()
      await dialog.getByRole('button', { name: labels.newBranch, exact: true }).click()
      await dialog.getByRole('textbox', { name: labels.branchName, exact: true }).fill('codex/ui-branch')
      await expect(dialog.getByText(labels.aiHint, { exact: true })).toBeVisible()
      await page.screenshot({ path: `artifacts/branch-target/create-branch-${locale}-1440.png` })
      await dialog.getByRole('textbox', { name: labels.branchName, exact: true }).press('Enter')
      await expect(dialog).toBeHidden()
      await expect(project.getByRole('button', { name: copy.branch('codex/ui-branch'), exact: true })).toBeVisible()
      expect(git(worktree, ['branch', '--show-current'])).toBe('codex/ui-branch')
      await project.getByRole('button', { name: copy.branch('codex/ui-branch'), exact: true }).click()
      await dialog.getByRole('button', { name: labels.newWorktree, exact: true }).click()
      await dialog.getByRole('textbox', { name: labels.branchName, exact: true }).fill('codex/ui-worktree')
      await dialog.getByRole('button', { name: labels.create, exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(project.getByRole('button', { name: copy.branch('codex/ui-worktree'), exact: true })).toBeVisible()
      expect(await userRunCount()).toBe(initialRunCount)

      await page.setViewportSize({ width: 320, height: 844 })
      await project.getByRole('button', { name: copy.branch('codex/ui-worktree'), exact: true }).click()
      await expect(dialog.getByRole('option').filter({ hasText: 'codex/ui-worktree' })).toBeVisible()
      const bounds = await dialog.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(-1)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/branch-target/branch-panel-${locale}-320.png` })
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
