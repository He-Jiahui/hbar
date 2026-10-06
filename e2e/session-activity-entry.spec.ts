import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText } from './support/composer-text'

async function cleanupFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-session-activity-'))
    throw new Error('Refusing cleanup outside the owned Activity fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session Activity shows Host active runs and preserves their source: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-activity-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317), sessionCount: 2 })
      const sessionId = host.ready.sessionId
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const copy = getShellCopy(locale)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      if (process.env.HBAR_ACTIVITY_EXPECTED_ASSET)
        await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
          'src',
          new RegExp(process.env.HBAR_ACTIVITY_EXPECTED_ASSET),
        )
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Keep the parent draft while inspecting delegated work.'
      await prompt.fill(draft)
      await expectComposerText(prompt, draft)
      const activity = page.getByRole('button', { name: copy.session.tools.activity, exact: true })
      await expect(activity).toBeVisible()
      await activity.click()
      const pane = page.locator('.hbar-session-activity-workspace')
      const runGroup = pane.locator('.hbar-session-activity-runs')
      await expect(pane).toBeVisible()
      await expect(pane.getByText(copy.activity.empty, { exact: true })).toBeVisible()
      await expect(runGroup.getByRole('listitem')).toHaveCount(0)
      await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()

      const millisecondsLeftInMinute = 60_000 - (Date.now() % 60_000)
      if (millisecondsLeftInMinute < 20_000) await page.waitForTimeout(millisecondsLeftInMinute + 100)
      const text = `/tool write_file ${JSON.stringify({ path: 'activity-confirmed.txt', text: 'confirmed' })}`
      const runs = createRunCommandClient(host.client)
      const accepted = await runs.execute(
        'run.submit',
        { sessionId, modelId: 'local-fixture', input: { text, images: [], approval: 'ask' } },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('waiting_approval')
      const queuedText = 'Inspect the retry queue identity while approval is pending.'
      const queued = await runs.execute(
        'run.submit',
        { sessionId, modelId: 'local-fixture', input: { text: queuedText, images: [], approval: 'ask' } },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: queued.operationId })).status)
        .toBe('queued')
      await activity.click()
      await expect(runGroup.getByRole('listitem')).toHaveCount(2)
      const approvedRun = pane.locator(`[data-operation-id="${accepted.operationId}"]`)
      const queuedRun = pane.locator(`[data-operation-id="${queued.operationId}"]`)
      await expect(approvedRun).toContainText(copy.activity.intentPreview(text))
      await expect(approvedRun).toContainText(copy.activity.status('waiting_approval'))
      await expect(queuedRun).toContainText(copy.activity.intentPreview(queuedText))
      await expect(queuedRun).toContainText(copy.activity.status('queued'))
      const activePage = await runs.execute('session.activeOperations', { sessionId })
      const approvedOperation = activePage.items.find((item) => item.operationId === accepted.operationId)
      const queuedOperation = activePage.items.find((item) => item.operationId === queued.operationId)
      if (!approvedOperation || !queuedOperation) throw new Error('Activity page omitted one of its active runs')
      expect(Math.floor(approvedOperation.createdAt / 60_000)).toBe(Math.floor(queuedOperation.createdAt / 60_000))
      const agents = createAgentCommandClient(host.client)
      const objective = `/tool write_file ${JSON.stringify({ path: 'agent-activity-pending.txt', text: 'Only write after fixture approval.' })}`
      const childTitle =
        locale === 'zh-CN'
          ? '子 Agent · 核查导航入口与当前工作区的长标题'
          : 'Child Agent · review navigation entrances and current project context'
      const created = await agents.execute(
        'agent.create',
        { parentSessionId: sessionId, objective, modelId: 'local-fixture', title: childTitle, approval: 'ask' },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(
          async () =>
            (await agents.execute('agent.result.get', { parentSessionId: sessionId, agentId: created.agentId })).status,
        )
        .toBe('waiting_approval')
      const agentRow = pane.locator(`[data-activity-agent-id="${created.agentId}"]`)
      await expect(agentRow).toBeVisible()
      await expect(agentRow).toContainText(copy.activity.agents.status('waiting_approval'))
      await expect(pane.getByRole('heading', { name: copy.activity.agents.title, exact: true })).toBeVisible()
      const evidence = resolve('artifacts/activity-agents/hbar-e2e')
      await mkdir(evidence, { recursive: true })
      await page.screenshot({ path: join(evidence, `${locale}-1440.png`) })
      await page.screenshot({ path: testInfo.outputPath(`activity-${locale}-1440.png`) })
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(pane).toBeVisible()
      await expect(pane.getByRole('button', { name: copy.activity.close, exact: true })).toBeInViewport()
      await expect(approvedRun).toBeInViewport()
      await expect(queuedRun).toBeInViewport()
      await expect(agentRow.getByRole('button')).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`activity-${locale}-320.png`) })
      await page.screenshot({ path: join(evidence, `${locale}-320.png`) })
      const openAgent = agentRow.getByRole('button', { name: copy.activity.agents.open(objective), exact: true })
      await openAgent.focus()
      await openAgent.press('Enter')
      await expect(page.getByRole('tab', { name: childTitle, exact: true })).toHaveAttribute('aria-selected', 'true')
      const back = page.getByRole('button', { name: copy.agents.returnToParent(host.ready.sessionTitle), exact: true })
      await expect(back).toBeInViewport()
      await back.click()
      await expect(page.getByRole('tab', { name: host.ready.sessionTitle, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(pane).toBeVisible()
      await agents.execute('agent.cancel', { parentSessionId: sessionId, agentId: created.agentId })
      await expect
        .poll(
          async () =>
            (await agents.execute('agent.result.get', { parentSessionId: sessionId, agentId: created.agentId })).status,
        )
        .toBe('cancelled')
      await expect(agentRow).toContainText(copy.activity.agents.status('cancelled'))

      await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()
      await expectComposerText(prompt, draft)
      await runs.execute('operation.cancel', { operationId: queued.operationId })
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: queued.operationId })).status)
        .toBe('cancelled')
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
      await activity.click()
      await expect(pane.getByText(copy.activity.empty, { exact: true })).toBeVisible()
      await expect(runGroup.getByRole('listitem')).toHaveCount(0)
      await expect(pane.locator('[data-activity-agent-id]')).toHaveCount(0)
      await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await activity.click()
      await expect(runGroup.getByRole('listitem')).toHaveCount(1)
      await expect(agentRow).toBeVisible()
      await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()

      await page
        .getByRole('region', { name: copy.session.decisions.approval, exact: true })
        .getByRole('button', { name: copy.session.decisions.allow, exact: true })
        .click()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('completed')
      await activity.click()
      await pane.getByRole('button', { name: copy.activity.refresh, exact: true }).click()
      await expect(pane.getByText(copy.activity.empty, { exact: true })).toBeVisible()
      expect(errors).toEqual([])
      await writeFile(
        join(evidence, `${locale}-manifest.json`),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            asset: process.env.HBAR_ACTIVITY_EXPECTED_ASSET ?? null,
            originalReference: 'artifacts/activity-agents-reference-v7/manifest.json',
            boundary:
              'Temporary real Host and synthetic parent/child Sessions, local-fixture provider only; pending writes remain unapproved and child is cancelled. No paid provider or real profile.',
            sessionId,
            agentId: created.agentId,
            childSessionId: created.sessionId,
            checks: [
              'visible Agent creation/status hints without manual refresh',
              'keyboard child open and original-parent Back',
              'parent draft retained',
              'cancelled status updated in same pane',
              'other parent has no foreign Agent',
              '1440/320 row controls and no horizontal overflow',
            ],
            pageErrors: errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })
}
