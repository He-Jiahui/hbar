import { expect, type BrowserContext, type Page } from '@playwright/test'
import { realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { stopWebSessionHost, type WebSessionHost } from './web-session-host'

type GoalFixturePrefix =
  | 'hbar-goal-lifecycle-'
  | 'hbar-goal-only-pages-'
  | 'hbar-goal-continuation-'
  | 'hbar-goal-diff-history-'
  | 'hbar-goal-diff-editor-'
  | 'hbar-goal-diff-pages-'
async function removeOwnedGoalFixture(root: string, prefix: GoalFixturePrefix): Promise<void> {
  const target = await realpath(root)
  if (
    target !== resolve(root) ||
    dirname(target) !== (await realpath(tmpdir())) ||
    !basename(target).startsWith(prefix)
  )
    throw new Error('Refusing cleanup outside the captured Goal fixture')
  await rm(target, { recursive: true, force: true })
}
export async function disposeOwnedGoalFixture(
  context: BrowserContext,
  host: WebSessionHost | undefined,
  root: string,
  prefix: GoalFixturePrefix,
): Promise<void> {
  try {
    await context.close()
  } finally {
    if (host) {
      await stopWebSessionHost(host)
      await expect.poll(() => host.child.exitCode !== null || host.child.signalCode !== null).toBe(true)
    }
    await removeOwnedGoalFixture(root, prefix)
  }
}
export async function selectGoalFixtureSession(page: Page, host: WebSessionHost): Promise<void> {
  const project = page.getByRole('treeitem', { name: host.ready.workspaceName, exact: true })
  await expect(project).toBeVisible()
  if ((await project.getAttribute('aria-expanded')) === 'false') {
    await project.focus()
    await project.press('ArrowRight')
    await expect(project).toHaveAttribute('aria-expanded', 'true')
  }
  await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
}
