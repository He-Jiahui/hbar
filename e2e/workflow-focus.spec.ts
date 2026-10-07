import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createWorkflowCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host.ts'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { openSessionTool } from './support/session-tools-menu'
import { verifyReadableText } from '../scripts/support/verify-readable-text'

async function removeOwnedWorkflowFixture(root: string): Promise<void> {
  const owned = await realpath(root)
  if (
    owned !== resolve(root) ||
    dirname(owned) !== (await realpath(tmpdir())) ||
    !basename(owned).startsWith('hbar-workflow-focus-')
  )
    throw new Error('Unowned focused Workflow fixture')
  await rm(owned, { recursive: true, force: true })
}

test('renders and accepts Host-owned focused workflow state at desktop, tablet, and narrow widths', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-focus-'))
  const artifacts = 'artifacts/production-ui/web/workflow-focus'
  await mkdir(artifacts, { recursive: true })
  let host: WebSessionHost | undefined
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const sessionId = host.ready.sessionId
    const copy = getShellCopy('en-US')
    const title = 'Verify the complete focused workflow title in the browser — 保留完整原始工作流标题 '.repeat(4).trim()
    const goals = createGoalPlanCommandClient(host.client)
    const workflows = createWorkflowCommandClient(host.client)
    const plan = await goals.execute('plan.update', {
      sessionId: host.ready.sessionId,
      explanation: 'Keep the browser task focused and externally verified',
      plan: [{ step: title, status: 'in_progress' }],
    })
    const started = await workflows.execute('workflow.focus.set', {
      sessionId: host.ready.sessionId,
      stepIndex: 0,
      item: {
        id: 'browser-focus',
        title: 'Ignored in favor of the Agent Plan step',
        scope: {
          readPaths: ['packages/app-react'],
          writePaths: [],
          tools: ['read_file'],
        },
        acceptanceChecks: [
          {
            id: 'browser-review',
            description: 'Browser acceptance confirms the focused result',
            verifier: { kind: 'user' },
          },
        ],
      },
      completionPolicy: 'user',
      expectedPlanRevision: plan.revision,
    })
    expect(started.workflow).toMatchObject({ status: 'active', focus: { focusId: 'browser-focus' } })
    if (!started.workflow) throw new Error('No original Host workflow')
    const waiting = await workflows.execute('workflow.checkpoint', {
      sessionId: host.ready.sessionId,
      itemId: 'browser-focus',
      outcome: 'complete',
      summary: 'The explicitly requested browser review can begin',
      evidenceIds: [],
      nextItemId: null,
      expectedRevision: started.workflow.revision,
    })
    expect(waiting.workflow?.status).toBe('waiting_user')

    const authentication = await context.request.post(
      `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}/auth/token`,
      { data: { token: host.ready.token } },
    )
    expect(authentication.ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
    await expect(page.locator('footer')).toContainText('Connected')
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await openSessionTool(page, copy.session.tools, 'goals')

    const overview = page.locator('.hbar-app-react-workflow-overview')
    await expect(overview.getByRole('heading', { level: 2, name: 'Focused workflow' })).toBeVisible()
    await expect(overview.getByText('Current focus', { exact: true })).toBeVisible()
    const focusedTitle = overview.getByText(title, { exact: true })
    await expect(focusedTitle).toHaveCount(1)
    await expect(focusedTitle.first()).toBeVisible()
    await expect(overview.getByText('Explicit user review', { exact: true })).toBeVisible()
    await expect(overview.getByText('Acceptance checks', { exact: true })).toBeVisible()
    await expect(overview.getByText('No external acceptance evidence is recorded.', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${artifacts}/desktop-pending.png`, fullPage: true })

    for (const width of [1440, 1100, 900, 390, 320]) {
      await page.setViewportSize({ width, height: 960 })
      await verifyReadableText(focusedTitle, title, true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    }
    await page.setViewportSize({ width: 1440, height: 960 })

    await overview.getByRole('button', { name: 'Accept check: Browser acceptance confirms the focused result' }).click()
    await expect(overview.getByText('Accepted', { exact: true })).toBeVisible()
    await expect(overview.getByText('Showing 1 of 1', { exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const snapshot = await workflows.execute('workflow.get', { sessionId })
        return {
          status: snapshot.workflow?.focus?.acceptanceChecks[0]?.status,
          evidence: snapshot.workflow?.evidence.length,
        }
      })
      .toEqual({ status: 'accepted', evidence: 1 })
    await page.screenshot({ path: `${artifacts}/desktop-accepted.png`, fullPage: true })

    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(overview.getByRole('heading', { level: 2, name: 'Focused workflow' })).toBeVisible()
    await expect(focusedTitle).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${artifacts}/tablet-accepted.png`, fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(overview.getByRole('heading', { level: 2, name: 'Focused workflow' })).toBeVisible()
    await expect(focusedTitle).toHaveCount(1)
    await expect(focusedTitle.first()).toBeVisible()
    await expect(overview.getByText('Showing 1 of 1', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${artifacts}/narrow-accepted.png`, fullPage: true })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedWorkflowFixture(root)
  }
})
