import { expect, test } from '@playwright/test'
import { createWorkflowCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host.ts'

test('renders and accepts Host-owned focused workflow state at desktop and narrow widths', async ({ browser }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-focus-'))
  const artifacts = 'artifacts/production-ui/web/workflow-focus'
  await mkdir(artifacts, { recursive: true })
  let host: WebSessionHost | undefined
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  try {
    host = await startWebSessionHost({ root })
    const workflows = createWorkflowCommandClient(host.client)
    const started = await workflows.execute(
      'workflow.start',
      {
        sessionId: host.ready.sessionId,
        objective: 'Keep the browser task focused and externally verified',
        items: [
          {
            id: 'browser-focus',
            title: 'Verify the focused workflow in the browser',
            scope: {
              readPaths: ['packages/app-react'],
              writePaths: [],
              tools: ['browser'],
            },
            acceptanceChecks: [
              {
                id: 'browser-review',
                description: 'Browser acceptance confirms the focused result',
                verifier: { kind: 'user' },
              },
            ],
          },
        ],
      },
      { idempotencyKey: 'workflow-focus-e2e' },
    )
    expect(started.workflow).toMatchObject({ status: 'active', focus: { focusId: 'browser-focus' } })
    const waiting = await workflows.execute('workflow.checkpoint', {
      sessionId: host.ready.sessionId,
      itemId: 'browser-focus',
      outcome: 'complete',
      summary: 'The explicitly requested browser review can begin',
      evidenceIds: [],
      nextItemId: null,
      expectedRevision: started.workflow!.revision,
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
    await page.getByRole('button', { name: `Open session ${host.ready.sessionTitle}` }).click()
    await page.getByRole('button', { name: 'Goals and plans', exact: true }).click()

    const overview = page.locator('.hbar-app-react-workflow-overview')
    await expect(overview.getByRole('heading', { level: 2, name: 'Focused workflow' })).toBeVisible()
    await expect(overview.getByText('Current focus', { exact: true })).toBeVisible()
    const focusedTitle = overview.getByText('Verify the focused workflow in the browser', { exact: true })
    await expect(focusedTitle).toHaveCount(1)
    await expect(focusedTitle.first()).toBeVisible()
    await expect(overview.getByText('Explicit user review', { exact: true })).toBeVisible()
    await expect(overview.getByText('Acceptance checks', { exact: true })).toBeVisible()
    await expect(overview.getByText('No external acceptance evidence is recorded.', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `${artifacts}/desktop-pending.png`, fullPage: true })

    await overview.getByRole('button', { name: 'Accept check: Browser acceptance confirms the focused result' }).click()
    await expect(overview.getByText('Accepted', { exact: true })).toBeVisible()
    await expect(overview.getByText('Showing 1 of 1', { exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const snapshot = await workflows.execute('workflow.get', { sessionId: host!.ready.sessionId })
        return {
          status: snapshot.workflow?.focus?.acceptanceChecks[0]?.status,
          evidence: snapshot.workflow?.evidence.length,
        }
      })
      .toEqual({ status: 'accepted', evidence: 1 })
    await page.screenshot({ path: `${artifacts}/desktop-accepted.png`, fullPage: true })

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
    await rm(root, { recursive: true, force: true })
  }
})
