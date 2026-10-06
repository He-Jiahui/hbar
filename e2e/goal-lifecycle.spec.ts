import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`canonical Goal lifecycle survives clear, another Goal, reload and keyboard disclosure: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-goal-lifecycle-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
      })
      const { sessionId } = host.ready
      const goals = createGoalPlanCommandClient(host.client)
      const copy = getShellCopy(locale)
      const objective = `${locale === 'zh-CN' ? '原始长目标：' : 'Original long goal: '}${'0123456789目标Evidence-'.repeat(185)}`
      expect(objective.length).toBeLessThanOrEqual(4000)
      const first = await goals.execute('goal.create', { sessionId, objective, tokenBudget: 2000 })
      const firstId = first.goal?.goalId
      if (!firstId) throw new Error('Expected confirmed Goal identity')
      await goals.execute('goal.set', { sessionId, expectedGoalId: firstId, status: 'paused' })
      await goals.execute('goal.set', { sessionId, expectedGoalId: firstId, status: 'active' })
      await goals.execute('goal.update', { sessionId, status: 'complete' })
      const second = await goals.execute('goal.create', {
        sessionId,
        objective: 'Second objective, never the first historical objective',
      })
      await goals.execute('goal.set', { sessionId, expectedGoalId: second.goal?.goalId, status: 'paused' })
      await goals.execute('goal.clear', { sessionId, expectedGoalId: second.goal?.goalId })
      await goals.execute('goal.create', { sessionId, objective: 'Current third Goal', tokenBudget: 5000 })
      const expected = ['created', 'paused', 'resumed', 'completed', 'created', 'paused', 'cleared', 'created']
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toEqual([])
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const cards = page.locator('[data-goal-event-id]')
      await expect(cards).toHaveCount(expected.length)
      expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-goal-action')))).toEqual(
        expected,
      )
      const identities = await cards.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-goal-event-id')),
      )
      await expect(cards.first()).toContainText(objective)
      await expect(cards.nth(3)).toContainText(objective)
      await expect(cards.nth(6)).toContainText('Second objective')
      await expect(cards.first()).not.toContainText('Current third Goal')
      await expect(page.locator('.hbar-session-current-goal .hbar-composer-goal-strip')).toContainText(
        'Current third Goal',
      )
      await expect(page.locator('.hbar-app-react-session-footer .hbar-composer-goal-strip')).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-session-empty-hero')).toHaveCount(0)
      const headerPosition = await page.locator('.hbar-session-current-goal').evaluate((node) => {
        const header = node.previousElementSibling?.getBoundingClientRect()
        const strip = node.getBoundingClientRect()
        const timeline = document.querySelector('.hbar-app-react-session-main')?.getBoundingClientRect()
        return Boolean(header && timeline && header.bottom <= strip.top + 1 && strip.bottom <= timeline.top + 1)
      })
      expect(headerPosition).toBe(true)
      const heading = cards.first().locator('.hbar-goal-lifecycle-heading')
      await heading.focus()
      await heading.press('Enter')
      await expect(heading).toHaveAttribute('aria-expanded', 'false')
      await expect(cards.first().locator('.hbar-goal-lifecycle-body')).toBeHidden()
      await expect(heading).toBeFocused()
      await heading.press('Space')
      await expect(heading).toHaveAttribute('aria-expanded', 'true')
      await expect(cards.first().locator('.hbar-goal-lifecycle-body')).toBeVisible()
      await expect(cards.first().getByRole('button')).toHaveCount(2) // disclosure + read-only long-objective expansion
      await expect(cards.nth(4).getByRole('button')).toHaveCount(1)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('Unsent draft remains independent of historical disclosures')
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await cards.first().scrollIntoViewIfNeeded()
        expect(await cards.first().evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await expect(page.locator('.hbar-session-current-goal')).toBeVisible()
        await page.screenshot({ path: `artifacts/goal-lifecycle/host-${locale}-${width}-expanded.png` })
      }
      await cards.first().getByRole('button', { name: copy.session.goalLifecycle.showObjective, exact: true }).click()
      await expect(
        cards.first().getByRole('button', { name: copy.session.goalLifecycle.hideObjective, exact: true }),
      ).toHaveAttribute('aria-expanded', 'true')
      expect(await cards.first().evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/goal-lifecycle/host-${locale}-320-full-objective.png` })
      await cards.first().getByRole('button', { name: copy.session.goalLifecycle.hideObjective, exact: true }).click()
      await expect(prompt).toHaveText('Unsent draft remains independent of historical disclosures')
      await heading.click()
      await page.screenshot({ path: `artifacts/goal-lifecycle/host-${locale}-320-collapsed.png` })
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.reload()
      await expect(cards).toHaveCount(expected.length)
      expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-goal-event-id')))).toEqual(
        identities,
      )
      const current = (await goals.execute('goal.get', { sessionId })).goal
      await goals.execute('goal.update', { sessionId, status: 'complete' })
      await expect(page.locator('.hbar-composer-goal-strip')).toHaveCount(0)
      await expect(cards).toHaveCount(expected.length + 1)
      await expect(cards.last()).toContainText('Current third Goal')
      const other = await host.client.call('session.create', {
        workspaceId: host.ready.workspaceId,
        title: 'Other Goal lifecycle fixture',
      })
      await page.getByRole('treeitem', { name: other.title, exact: true }).click()
      await expect(cards).toHaveCount(0)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expect(cards).toHaveCount(expected.length + 1)
      expect(current?.objective).toBe('Current third Goal')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('Goal-only history has its own cursor and recoverable pagination without message fabrication', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-only-pages-'))
  const context = await browser.newContext({ locale: 'en-US' })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
    })
    const { sessionId } = host.ready
    const goals = createGoalPlanCommandClient(host.client)
    const first = await goals.execute('goal.set', {
      sessionId,
      objective: 'Goal-only paged objective',
      status: 'paused',
      tokenBudget: 2000,
    })
    for (let index = 1; index <= 105; index++)
      await goals.execute('goal.set', { sessionId, expectedGoalId: first.goal?.goalId, tokenBudget: 2000 + index })
    const copy = getShellCopy('en-US')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const cards = page.locator('[data-goal-event-id]')
    const list = page.locator('[data-hbar-app-ui-list-strategy="virtualized"]')
    const viewport = page.locator('.lumen-conversation-messages')
    await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '100')
    await viewport.evaluate((node) => node.scrollTo({ top: 0 }))
    const newest = await goals.history({ sessionId, limit: 100 })
    await expect(cards.first()).toHaveAttribute('data-goal-event-id', newest.items[0]!.eventId)
    await expect(cards.first()).toHaveAttribute('data-goal-action', 'updated')
    await expect(page.getByRole('button', { name: copy.session.loadOlder, exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: copy.session.goalHistory.loadOlder, exact: true }).click()
    await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '106')
    await expect
      .poll(async () => {
        await viewport.evaluate((node) => node.scrollTo({ top: 0 }))
        return cards.first().getAttribute('data-goal-action')
      })
      .toBe('created')
    await expect(page.getByRole('button', { name: copy.session.goalHistory.loadOlder, exact: true })).toHaveCount(0)
    const seen = new Map<number, string>()
    const firstVisible = await cards.first().evaluate((node) => ({
      seq: Number(node.getAttribute('data-goal-seq')),
      id: node.getAttribute('data-goal-event-id')!,
    }))
    seen.set(firstVisible.seq, firstVisible.id)
    for (let step = 0; step < 100; step++) {
      for (const item of await cards.evaluateAll((nodes) =>
        nodes.map((node) => ({
          seq: Number(node.getAttribute('data-goal-seq')),
          id: node.getAttribute('data-goal-event-id')!,
        })),
      ))
        seen.set(item.seq, item.id)
      expect(await cards.count()).toBeLessThan(41)
      const finished = await viewport.evaluate(async (node) => {
        if (node.scrollTop + node.clientHeight >= node.scrollHeight - 1) return true
        node.scrollBy({ top: Math.max(1, node.clientHeight / 2) })
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return false
      })
      if (finished) break
    }
    await viewport.evaluate((node) => node.scrollTo({ top: node.scrollHeight }))
    await expect(cards.last()).toHaveAttribute('data-goal-event-id', newest.items.at(-1)!.eventId)
    for (const item of await cards.evaluateAll((nodes) =>
      nodes.map((node) => ({
        seq: Number(node.getAttribute('data-goal-seq')),
        id: node.getAttribute('data-goal-event-id')!,
      })),
    ))
      seen.set(item.seq, item.id)
    const earlier = await goals.history({
      sessionId,
      anchorSeq: newest.anchorSeq,
      beforeSeq: newest.nextBeforeSeq ?? undefined,
      limit: 100,
    })
    // The measured prepend preserves the old reading anchor. Return to the
    // beginning after measuring the tail, as a user can, rather than sampling
    // its transient first-frame position during the anchor correction.
    await expect
      .poll(async () => {
        await viewport.evaluate((node) => node.scrollTo({ top: 0 }))
        return cards.first().getAttribute('data-goal-event-id')
      })
      .toBe(earlier.items[0]!.eventId)
    for (const item of await cards.evaluateAll((nodes) =>
      nodes.map((node) => ({
        seq: Number(node.getAttribute('data-goal-seq')),
        id: node.getAttribute('data-goal-event-id')!,
      })),
    ))
      seen.set(item.seq, item.id)
    expect([...earlier.items, ...newest.items].filter((item) => !seen.has(item.seq)).map((item) => item.seq)).toEqual(
      [],
    )
    expect(seen.size).toBe(106)
    expect(new Set(seen.values()).size).toBe(106)
    await page.reload()
    await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '100')
    await page.getByRole('button', { name: copy.session.goalHistory.loadOlder, exact: true }).click()
    await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '106')
    expect((await host.client.call('session.snapshot', { sessionId })).messages).toEqual([])
    expect((await host.client.call('session.snapshot', { sessionId })).runs).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
