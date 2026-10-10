import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string) {
  const resolved = await realpath(root)
  if (
    dirname(resolved).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(resolved).startsWith('hbar-goal-diff-')
  )
    throw new Error('Refusing cleanup outside the owned Goal diff fixture')
  await rm(resolved, { recursive: true, force: true })
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`replacement history shows immutable before/after excerpts, full text and keyboard disclosure: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-goal-diff-history-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45488),
        goalAutoContinue: false,
      })
      const { sessionId } = host.ready
      const goals = createGoalPlanCommandClient(host.client)
      const previous = `检查桌面🧭${'保留已验证成果'.repeat(600).slice(0, 3989)}取消旧动作`
      const next = previous.replace('桌面🧭', '窄屏🚀').replace('取消旧动作', '新增新目标')
      expect(previous).toHaveLength(4000)
      expect(next).toHaveLength(4000)
      const old = (await goals.execute('goal.create', { sessionId, objective: previous })).goal
      const replacement = (await goals.execute('goal.set', { sessionId, expectedGoalId: old?.goalId, objective: next }))
        .goal
      await goals.execute('goal.set', {
        sessionId,
        expectedGoalId: replacement?.goalId,
        objective: 'Later requirements 后续调整',
      })
      const copy = getShellCopy(locale)
      const labels = copy.session.goalLifecycle
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45487}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const cards = page.locator('[data-goal-action="replaced"]')
      await expect(cards).toHaveCount(2)
      const first = cards.first()
      const identity = await first.getAttribute('data-goal-event-id')
      await expect(first).toContainText(labels.previousObjective)
      await expect(first).toContainText(labels.nextObjective)
      await expect(first.locator('del')).toContainText(['桌面🧭', '取消旧动作'])
      await expect(first.locator('ins')).toContainText(['窄屏🚀', '新增新目标'])
      await expect(first).not.toContainText('Later requirements')
      const full = first.getByRole('button', { name: labels.showComparison, exact: true })
      await expect(full).toHaveAttribute('aria-expanded', 'false')
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await first.scrollIntoViewIfNeeded()
        expect(await first.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/goal-replacement/diff-${locale}-${width}.png` })
      }
      await full.focus()
      await full.press('Enter')
      const objectives = first.locator('.hbar-goal-diff-objective')
      await expect(objectives.nth(0)).toHaveText(previous)
      await expect(objectives.nth(1)).toHaveText(next)
      await expect(first.getByRole('button', { name: labels.hideComparison, exact: true })).toBeFocused()
      expect(await first.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      await first.getByRole('button', { name: labels.hideComparison, exact: true }).press('Space')
      await expect(full).toHaveAttribute('aria-expanded', 'false')
      const heading = first.locator('.hbar-goal-lifecycle-heading')
      await heading.focus()
      await heading.press('Enter')
      await expect(first.locator('.hbar-goal-lifecycle-body')).toBeHidden()
      await heading.press('Space')
      await expect(first.locator('.hbar-goal-lifecycle-body')).toBeVisible()
      await page.reload()
      await expect(cards).toHaveCount(2)
      await expect(first).toHaveAttribute('data-goal-event-id', identity!)
      await expect(first.locator('ins')).toContainText(['窄屏🚀', '新增新目标'])
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })
}

test('the Goal editor hands off a pending Run and exposes its before/after record', async ({ browser }) => {
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-diff-editor-'))
  const context = await browser.newContext({ locale: 'zh-CN' })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45488),
      budgetAutoContinue: false,
    })
    const target = host
    const { sessionId } = host.ready
    const goals = createGoalPlanCommandClient(host.client)
    const runs = createRunCommandClient(host.client)
    // Keep replacement auto-continuation enabled so the editor handoff still
    // exercises its real Goal-owned Run. A one-token inherited budget makes
    // that intentional continuation settle once, then stop at the budget
    // boundary instead of spawning the unbounded no-progress chain.
    await goals.execute('goal.create', { sessionId, objective: '验证旧目标，删除旧动作', tokenBudget: 1 })
    const copy = getShellCopy('zh-CN')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45487}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const pending = await runs.execute(
      'run.submit',
      {
        sessionId,
        modelId: 'local-fixture',
        input: {
          text: '/tool write_file {"path":"obsolete-editor.txt","text":"must not execute"}',
          images: [],
          approval: 'ask',
        },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(
        async () =>
          (await target.client.call('session.snapshot', { sessionId })).approvals.filter(
            (approval) => approval.status === 'pending',
          ).length,
      )
      .toBe(1)
    await page
      .locator('.hbar-session-current-goal')
      .getByRole('button', { name: copy.session.intent.expand, exact: true })
      .click()
    await page.getByRole('textbox', { name: copy.goals.goal.objective, exact: true }).fill('验证新目标，新增键盘验收')
    await page.getByRole('button', { name: copy.goals.goal.save, exact: true }).click()
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: pending.operationId })).status)
      .toBe('completed')
    await expect
      .poll(
        async () =>
          (await target.client.call('session.snapshot', { sessionId })).runs.filter(
            (run) => run.input.source === 'goal' && run.status === 'completed',
          ).length,
      )
      .toBe(1)
    const snapshot = await host.client.call('session.snapshot', { sessionId })
    expect(snapshot.runs).toHaveLength(2)
    expect(snapshot.runs.every((run) => run.error === null)).toBe(true)
    expect(existsSync(join(root, 'obsolete-editor.txt'))).toBe(false)
    const card = page.locator('[data-goal-action="replaced"]')
    const removed = (await card.locator('del').allTextContents()).join('')
    const added = (await card.locator('ins').allTextContents()).join('')
    expect(removed).toContain('旧目标')
    expect(removed).toContain('删除旧动作')
    expect(added).toContain('新目标')
    expect(added).toContain('新增键盘验收')
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupFixture(root)
  }
})

test('a replacement at the history page boundary keeps its preceding objective after refresh', async ({ browser }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-diff-pages-'))
  const context = await browser.newContext({ locale: 'en-US' })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45488),
      goalAutoContinue: false,
    })
    const { sessionId } = host.ready
    const goals = createGoalPlanCommandClient(host.client)
    const first = (
      await goals.execute('goal.set', {
        sessionId,
        objective: 'Original paged objective',
        status: 'paused',
        tokenBudget: 2000,
      })
    ).goal
    for (let index = 1; index <= 5; index++)
      await goals.execute('goal.set', { sessionId, expectedGoalId: first?.goalId, tokenBudget: 2000 + index })
    const next = (
      await goals.execute('goal.set', {
        sessionId,
        expectedGoalId: first?.goalId,
        objective: 'Replacement paged objective',
      })
    ).goal
    for (let index = 1; index <= 99; index++)
      await goals.execute('goal.set', { sessionId, expectedGoalId: next?.goalId, tokenBudget: 3000 + index })
    const copy = getShellCopy('en-US')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45487}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const list = page.locator('[data-hbar-app-ui-list-strategy="virtualized"]')
    const viewport = page.locator('.lumen-conversation-messages')
    const card = page.locator('[data-goal-action="replaced"]')
    const verify = async () => {
      await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '100')
      await expect
        .poll(async () => {
          await viewport.evaluate((node) => node.scrollTo({ top: 0 }))
          return {
            removed: (await card.locator('del').allTextContents()).join(''),
            added: (await card.locator('ins').allTextContents()).join(''),
          }
        })
        .toEqual({ removed: 'Original', added: 'Replacement' })
    }
    await verify()
    const identity = await card.getAttribute('data-goal-event-id')
    await page.getByRole('button', { name: copy.session.goalHistory.loadOlder, exact: true }).click()
    await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '106')
    await expect(card).toHaveAttribute('data-goal-event-id', identity!)
    await expect(card.locator('del')).toHaveText('Original')
    await page.reload()
    await verify()
    expect((await host.client.call('session.snapshot', { sessionId })).runs).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await cleanupFixture(root)
  }
})
