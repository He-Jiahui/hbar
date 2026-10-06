import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  startGoalPlanRecovery,
  stopGoalPlanRecovery,
  openSession,
  composer,
  setDraft,
  assertNoExecution,
  capture,
  type GoalPlanRecoveryFixture,
} from './support/goal-plan-recovery-fixture'
import { expectComposerText } from './support/composer-text'

const evidence = process.env.HBAR_GOAL_PLAN_RECOVERY_EVIDENCE ?? 'artifacts/goal-plan-recovery/browser'
test.beforeAll(async () => mkdir(evidence, { recursive: true }))

function controls(f: GoalPlanRecoveryFixture) {
  const labels = f.copy.session.intent
  const summary = f.page.locator('.hbar-session-current-goal')
  const clear = summary.locator('.hbar-composer-goal-strip').getByRole('button', { name: labels.clear, exact: true })
  const group = summary.getByRole('group', { name: labels.clear, exact: true })
  return {
    summary,
    clear,
    group,
    confirm: group.getByRole('button', { name: labels.clear, exact: true }),
    cancel: group.getByRole('button', { name: labels.cancel, exact: true }),
    goalEntry: f.page.getByRole('button', { name: f.copy.session.addMenu.open, exact: true }),
  }
}
async function finish(f: GoalPlanRecoveryFixture, name: string, completed: boolean) {
  const cleanup = await stopGoalPlanRecovery(f)
  await writeFile(join(evidence, `${name}-cleanup.json`), JSON.stringify({ completed, cleanup }, null, 2))
}

for (const [locale, width] of [
  ['en-US', 1440],
  ['zh-CN', 320],
] as const) {
  test(`long Goal confirmation keeps exact copy in its reading region and actions reachable: ${locale} ${width}`, async ({
    browser,
  }) => {
    const f = await startGoalPlanRecovery(browser, { locale, width, goal: 'none' })
    const name = `clear-capacity-${locale}-${width}`
    let completed = false
    try {
      const objective = `Long Goal ${'容量Capacity目标'.repeat(280)}`
      expect(objective.length).toBeLessThanOrEqual(4000)
      const created = await f.goals.execute('goal.create', { sessionId: f.ready.firstSession.id, objective })
      const c = controls(f)
      await expect(c.summary).toContainText(objective)
      await c.clear.click()
      const reading = c.group.getByRole('region', { name: f.copy.session.intent.clear, exact: true })
      await expect(reading.locator('[data-text-context="dialog.body"]')).toHaveText(
        f.copy.session.intent.confirmClear(objective),
      )
      await expect(reading).toBeInViewport()
      if (width === 320) {
        expect(await reading.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
        await reading.focus()
        await f.page.keyboard.press('End')
      }
      for (const action of [c.cancel, c.confirm]) {
        await expect(action).toBeInViewport()
        expect(
          await action.evaluate((element) => {
            const box = element.getBoundingClientRect()
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
            return hit !== null && element.contains(hit)
          }),
        ).toBe(true)
      }
      expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await capture(f, evidence, name)
      await c.cancel.click()
      expect((await f.goals.execute('goal.snapshot', { sessionId: f.ready.firstSession.id })).goal?.goalId).toBe(
        created.goal?.goalId,
      )
      expect(f.faults.count('goal.clear')).toBe(0)
      await assertNoExecution(f)
      completed = true
    } finally {
      await finish(f, name, completed)
    }
  })

  test(`Goal clear returns local focus only after explicit cancel or confirmation: ${locale} ${width}`, async ({
    browser,
  }) => {
    const f = await startGoalPlanRecovery(browser, { locale, width })
    const name = `clear-focus-${locale}-${width}`
    let completed = false
    try {
      const c = controls(f)
      const draft = `Keep clear draft ${name}`
      await setDraft(f, draft)
      await c.clear.click()
      await expect(c.group).toBeVisible()
      await c.cancel.click()
      await expect(c.group).toHaveCount(0)
      await expect(c.clear).toBeFocused()
      expect(f.faults.count('goal.clear')).toBe(0)
      await capture(f, evidence, `${name}-cancelled`)
      await c.clear.click()
      await c.confirm.click()
      await expect(c.group).toHaveCount(0)
      await expect(c.goalEntry).toBeFocused()
      expect((await f.goals.execute('goal.snapshot', { sessionId: f.ready.firstSession.id })).goal).toBeNull()
      expect(f.faults.count('goal.clear')).toBe(1)
      await expectComposerText(composer(f), draft)
      await capture(f, evidence, `${name}-confirmed`)
      await assertNoExecution(f)
      completed = true
    } finally {
      await finish(f, name, completed)
    }
  })

  for (const change of ['focus', 'session', 'replacement'] as const) {
    test(`A late Goal clear cannot take focus after a ${change} change: ${locale} ${width}`, async ({ browser }) => {
      const f = await startGoalPlanRecovery(browser, { locale, width })
      const name = `clear-late-${change}-${locale}-${width}`
      let completed = false
      try {
        const c = controls(f)
        const id = f.ready.firstSession.id
        const draft = `Keep original clear A ${name}`
        await setDraft(f, draft)
        const held = f.faults.arm({ command: 'goal.clear', sessionId: id, kind: 'hold' })
        await c.clear.click()
        await c.confirm.click()
        await expect.poll(() => f.faults.pending(held)).toBe(1)
        expect((await f.goals.execute('goal.snapshot', { sessionId: id })).goal).toBeNull()
        if (change === 'session') {
          await openSession(f, f.ready.secondSession)
          await setDraft(f, `Keep independent B ${name}`)
          await openSession(f)
          await expectComposerText(composer(f), draft)
          await composer(f).click()
        } else if (change === 'replacement') {
          const replacement = await f.goals.execute('goal.create', { sessionId: id, objective: `Replacement ${name}` })
          expect(replacement.goal?.goalId).not.toBe(f.ready.firstGoal.goal?.goalId)
          await expect(c.summary).toContainText(`Replacement ${name}`)
        } else {
          await composer(f).click()
        }
        f.faults.release(held)
        await expect(f.page.getByText(f.copy.session.intent.pending, { exact: true })).toHaveCount(0)
        if (change === 'replacement') {
          await expect(c.goalEntry).not.toBeFocused()
          await expect(c.summary).toContainText(`Replacement ${name}`)
        } else await expect(composer(f)).toBeFocused()
        expect(f.faults.count('goal.clear')).toBe(1)
        await expectComposerText(composer(f), draft)
        await capture(f, evidence, `${name}-settled`)
        await assertNoExecution(f)
        completed = true
      } finally {
        await finish(f, name, completed)
      }
    })
  }

  test(`Unknown Goal clear never moves focus or replays the write: ${locale} ${width}`, async ({ browser }) => {
    const f = await startGoalPlanRecovery(browser, { locale, width })
    const name = `clear-unknown-${locale}-${width}`
    let completed = false
    try {
      const c = controls(f)
      const id = f.ready.firstSession.id
      const lost = f.faults.arm({ command: 'goal.clear', sessionId: id, kind: 'unknown' })
      await c.clear.click()
      await c.confirm.click()
      const recovery = c.summary.getByTestId('composer-goal-recovery')
      await expect(recovery).toBeVisible()
      f.faults.assertMatched(lost)
      await expect(c.goalEntry).not.toBeFocused()
      await composer(f).click()
      await recovery.getByRole('button', { name: f.copy.session.intent.recovery.reconcile, exact: true }).click()
      await expect(recovery).toHaveCount(0)
      await expect(c.goalEntry).not.toBeFocused()
      expect(f.faults.count('goal.clear')).toBe(1)
      expect((await f.goals.execute('goal.snapshot', { sessionId: id })).goal).toBeNull()
      await assertNoExecution(f)
      completed = true
    } finally {
      await finish(f, name, completed)
    }
  })
}
