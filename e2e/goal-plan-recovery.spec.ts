import { expect, test, type Locator } from '@playwright/test'
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

function summary(f: GoalPlanRecoveryFixture) {
  return f.page.locator('.hbar-session-current-goal')
}
async function goalHelp(f: GoalPlanRecoveryFixture) {
  await f.page.getByRole('button', { name: f.copy.session.intent.goal, exact: true }).click()
  const popup = f.page.getByRole('dialog', { name: f.copy.session.intent.blocked.title, exact: true })
  await expect(popup).toBeVisible()
  return popup
}
async function visibleControl(target: Locator) {
  await target.scrollIntoViewIfNeeded()
  await expect(target).toBeInViewport()
  const geometry = await target.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return {
      within: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1,
      hit: hit !== null && element.contains(hit),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }
  })
  expect(geometry).toEqual({ within: true, hit: true, overflow: false })
}
async function finish(f: GoalPlanRecoveryFixture, name: string, completed: boolean) {
  const cleanup = await stopGoalPlanRecovery(f)
  await writeFile(join(evidence, `${name}-cleanup.json`), JSON.stringify({ completed, cleanup }, null, 2))
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 900, 320]) {
    test(`Goal original check is shared, local and read-only across failures and session changes: ${locale} ${width}`, async ({
      browser,
    }) => {
      const name = `goal-${locale}-${width}`
      const f = await startGoalPlanRecovery(browser, { locale, width })
      let completed = false
      try {
        const id = f.ready.firstSession.id
        const copy = f.copy.session.intent
        const draft = `Keep original A draft ${name}`
        await setDraft(f, draft)
        const lost = f.faults.arm({ command: 'goal.set', sessionId: id, kind: 'unknown' })
        await summary(f).getByRole('button', { name: copy.pause, exact: true }).click()
        const recovery = summary(f).getByTestId('composer-goal-recovery')
        await expect(recovery).toContainText(copy.recovery.unknown)
        f.faults.assertMatched(lost)
        expect((await f.goals.execute('goal.snapshot', { sessionId: id })).goal?.status).toBe('paused')
        const held = f.faults.arm({ command: 'goal.snapshot', sessionId: id, kind: 'hold' })
        const check = recovery.getByRole('button', { name: copy.recovery.reconcile, exact: true })
        await check.click()
        await expect.poll(() => f.faults.pending(held)).toBe(1)
        await expect(recovery).toHaveAttribute('aria-busy', 'true')
        await expect(recovery).toContainText(copy.recovery.checking)
        await expect(check).toBeDisabled()
        await visibleControl(check)
        await capture(f, evidence, `${name}-checking`)
        const checks = f.faults.count('goal.snapshot', id)
        const popup = await goalHelp(f)
        const secondary = popup.getByTestId('composer-goal-recovery')
        await expect(secondary).toContainText(copy.recovery.checking)
        await expect(secondary.getByRole('button', { name: copy.recovery.reconcile, exact: true })).toBeDisabled()
        expect(f.faults.count('goal.snapshot', id)).toBe(checks)
        await capture(f, evidence, `${name}-shared-check`)
        f.faults.release(held, { fail: true })
        await expect(recovery).toContainText(copy.recovery.failed)
        await expect(secondary).toContainText(copy.recovery.failed)
        await expect(summary(f).getByRole('button', { name: copy.refresh, exact: true })).toHaveCount(0)
        await expect(popup).not.toContainText(/PRIVATE|EXECUTION_FAILED|READ_FAILED/)
        await capture(f, evidence, `${name}-read-failed`)
        await popup.getByRole('button', { name: copy.blocked.close, exact: true }).click()
        const old = f.faults.arm({ command: 'goal.snapshot', sessionId: id, kind: 'hold' })
        await check.click()
        await expect.poll(() => f.faults.pending(old)).toBe(1)
        await openSession(f, f.ready.secondSession)
        await setDraft(f, `Current B draft ${name}`)
        f.faults.release(old)
        await expect(composer(f)).toBeFocused()
        await expectComposerText(composer(f), `Current B draft ${name}`)
        await expect(summary(f).getByTestId('composer-goal-recovery')).toHaveCount(0)
        await openSession(f)
        await expectComposerText(composer(f), draft)
        await expect(check).toBeEnabled()
        await check.click()
        await expect(recovery).toHaveCount(0)
        await expect(summary(f)).toContainText(copy.statuses.paused)
        expect(f.faults.count('goal.set', id)).toBe(1)
        expect(f.faults.count('mode.set')).toBe(0)
        await capture(f, evidence, `${name}-confirmed`)
        await assertNoExecution(f)
        completed = true
      } finally {
        await finish(f, name, completed)
      }
    })

    test(`Plan unknown never looks like an ordinary approval selection: ${locale} ${width}`, async ({ browser }) => {
      const name = `plan-${locale}-${width}`
      const f = await startGoalPlanRecovery(browser, { locale, width, goal: 'none' })
      let completed = false
      try {
        const id = f.ready.firstSession.id
        const copy = f.copy.session.permissionPicker
        const goalCopy = f.copy.session.intent
        const draft = `Keep original Plan draft ${name}`
        await setDraft(f, draft)
        const picker = f.page.locator('.hbar-composer-permission-picker')
        const trigger = picker.locator('.hbar-composer-permission-trigger')
        const popup = f.page.getByRole('dialog', { name: copy.title, exact: true })
        await trigger.click()
        await popup.locator('[role="menuitemradio"][data-choice="ask"]').click()
        await expect(trigger).toContainText(copy.options.ask.label)
        await trigger.click()
        const lost = f.faults.arm({ command: 'mode.set', sessionId: id, kind: 'unknown' })
        await popup.locator('[data-choice="plan"]').click()
        await expect(trigger).toContainText(copy.execution.unknown)
        f.faults.assertMatched(lost)
        expect((await f.configuration.execute('mode.get', { sessionId: id })).mode).toBe('plan')
        for (const choice of ['ask', 'deny', 'allow', 'inherit']) {
          const item = popup.locator(`[role="menuitemradio"][data-choice="${choice}"]`)
          await expect(item).toBeDisabled()
          await expect(item).toHaveAttribute('aria-checked', 'false')
        }
        await expect(popup.locator('[data-choice="plan"]')).toHaveAttribute('aria-checked', 'false')
        await expect(popup).toContainText(copy.execution.approvalFrozen)
        await capture(f, evidence, `${name}-unknown`)
        const held = f.faults.arm({ command: 'mode.get', sessionId: id, kind: 'hold' })
        const check = popup.locator('button[data-execution-recovery]')
        await check.click()
        await expect.poll(() => f.faults.pending(held)).toBe(1)
        await expect(check).toBeDisabled()
        await expect(trigger).toContainText(copy.execution.checking)
        await visibleControl(check)
        await capture(f, evidence, `${name}-checking`)
        await f.page.keyboard.press('Escape')
        await expect(popup).not.toBeVisible()
        await expect(trigger).toBeFocused()
        await trigger.click()
        await expect(check).toBeDisabled()
        await popup.getByRole('button', { name: copy.close, exact: true }).click()
        await expect(trigger).toBeFocused()
        const helper = await goalHelp(f)
        await expect(helper).toContainText(goalCopy.blocked.checkingPlan)
        await expect(helper.getByRole('button', { name: goalCopy.blocked.reconcilePlan, exact: true })).toBeDisabled()
        f.faults.release(held, { fail: true })
        await expect(helper).toContainText(goalCopy.blocked.planCheckFailed)
        await helper.getByRole('button', { name: goalCopy.blocked.close, exact: true }).click()
        await trigger.click()
        await expect(popup).toContainText(copy.execution.checkFailed)
        await expect(popup.getByText(copy.execution.checkFailed, { exact: true })).toBeInViewport()
        await visibleControl(check)
        await expect(popup).not.toContainText(/PRIVATE|EXECUTION_FAILED/)
        await capture(f, evidence, `${name}-read-failed`)
        const staleRead = f.faults.arm({ command: 'mode.get', sessionId: id, kind: 'hold' })
        await check.click()
        await expect.poll(() => f.faults.pending(staleRead)).toBe(1)
        await popup.getByRole('button', { name: copy.close, exact: true }).click()
        await openSession(f, f.ready.secondSession)
        await setDraft(f, `Independent B Plan draft ${name}`)
        await openSession(f)
        await expectComposerText(composer(f), draft)
        await expect(trigger).toContainText(copy.execution.checking)
        f.faults.release(staleRead)
        await expect(trigger).toContainText(copy.execution.unknown)
        await trigger.click()
        await expect(check).toBeEnabled()
        expect(f.faults.count('mode.set', id)).toBe(1)
        await check.click()
        await expect(trigger).toContainText(copy.plan.label)
        if (!(await popup.isVisible())) await trigger.click()
        await expect(popup.locator('[data-choice="plan"]')).toHaveAttribute('aria-checked', 'true')
        await popup.locator('[data-choice="plan"]').click()
        await expect(trigger).toContainText(copy.options.ask.label)
        if (!(await popup.isVisible())) await trigger.click()
        await expect(popup.locator('[role="menuitemradio"][data-choice="ask"]')).toHaveAttribute('aria-checked', 'true')
        await popup.getByRole('button', { name: copy.close, exact: true }).click()
        await expect(trigger).toBeFocused()
        await expectComposerText(composer(f), draft)
        expect(f.faults.count('mode.set', id)).toBe(2)
        expect(f.faults.count('goal.set')).toBe(0)
        await capture(f, evidence, `${name}-confirmed`)
        await assertNoExecution(f)
        completed = true
      } finally {
        await finish(f, name, completed)
      }
    })
  }
}
