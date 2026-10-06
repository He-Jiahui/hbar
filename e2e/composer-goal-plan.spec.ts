import { expect, test } from '@playwright/test'
import { createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`Goal intent and durable Host Plan mode share the composer entry: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-intent-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const { sessionId } = host.ready
      const copy = getShellCopy(locale)
      const labels = copy.session.intent
      const goals = createGoalPlanCommandClient(host.client)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const modes = page.locator('.hbar-composer-intents')
      const plus = page.getByRole('button', { name: copy.session.addMenu.open, exact: true })
      const addMenu = page.getByRole('group', { name: copy.session.addMenu.menu })
      const prepareGoal = async () => {
        await plus.click()
        await addMenu.getByRole('button', { name: labels.goalMenu, exact: true }).click()
        await expect(addMenu).toBeHidden()
      }
      const permission = page.locator('.hbar-composer-permission-picker')
      const planEntry = permission.getByRole('menuitemradio', {
        name: copy.session.permissionPicker.plan.label,
        exact: false,
      })
      const openModes = () =>
        permission
          .getByRole('button', {
            name: copy.session.permissionPicker.trigger(
              copy.session.permissionPicker.inheritedTrigger(copy.session.permissionPicker.options.ask.label),
            ),
          })
          .click()
      const objective = 'Verify the composer goal controls — 检查目标操作与当前会话绑定'
      await prompt.fill(objective)
      await prepareGoal()
      await expect(prompt).toHaveAttribute('placeholder', labels.goalPlaceholder)
      await expect(modes.getByRole('button', { name: labels.cancelGoal })).toHaveAttribute('aria-pressed', 'true')
      await expect(modes.getByRole('button', { name: labels.cancelGoal })).toContainText(labels.goalPrepared)
      await expect(modes.getByRole('button', { name: labels.cancelGoal })).toHaveAttribute(
        'title',
        labels.goalPreparedHint,
      )
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-goal-chip-${locale}.png` })
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(modes.getByRole('button', { name: labels.cancelGoal })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-goal-chip-${locale}-320.png` })
      await page.setViewportSize({ width: 1440, height: 960 })
      await modes.getByRole('button', { name: labels.cancelGoal }).click()
      expect((await goals.execute('goal.get', { sessionId })).goal).toBeNull()
      await expectComposerText(prompt, objective)
      await openModes()
      await planEntry.click()
      await expect(prompt).toHaveAttribute('placeholder', labels.planPlaceholder)
      await expect(
        permission.getByRole('button', {
          name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label),
        }),
      ).toBeVisible()
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
      await permission
        .getByRole('button', { name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label) })
        .click()
      await expect(
        permission.getByRole('menuitemradio', { name: copy.session.permissionPicker.plan.label }),
      ).toBeVisible()
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-durable-plan-menu-${locale}-1440.png` })
      await permission.getByRole('button', { name: copy.session.permissionPicker.close }).click()
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-plan-chip-${locale}.png` })
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(
        permission.getByRole('button', {
          name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label),
        }),
      ).toBeInViewport()
      await permission
        .getByRole('button', { name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label) })
        .click()
      await expect(
        permission.getByRole('menuitemradio', { name: copy.session.permissionPicker.plan.label }),
      ).toBeVisible()
      await permission.getByRole('menuitemradio').first().focus()
      await page.keyboard.press('End')
      await expect(permission.locator('[role="menuitemradio"][data-choice="inherit"]')).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await expect(
        permission.getByRole('menuitemradio', { name: copy.session.permissionPicker.plan.label }),
      ).toBeFocused()
      expect(
        await permission.locator('.hbar-composer-permission-popover').evaluate((popup) => {
          const option = popup.querySelector('[role="menuitemradio"][data-choice="plan"]')?.getBoundingClientRect()
          const bounds = popup.getBoundingClientRect()
          return Boolean(option && option.top >= bounds.top && option.bottom <= bounds.bottom)
        }),
      ).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-durable-plan-menu-${locale}-320.png` })
      await permission.getByRole('button', { name: copy.session.permissionPicker.close }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-plan-chip-${locale}-320.png` })
      await page.setViewportSize({ width: 1440, height: 960 })
      await permission
        .getByRole('button', { name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label) })
        .click()
      await permission.locator('[role="menuitemradio"][data-choice="inherit"]').click()
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'default' })
      await expectComposerText(prompt, objective)

      await prepareGoal()
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      const strip = page.locator('.hbar-composer-goal-strip')
      await expect(strip).toContainText(objective)
      await expectComposerText(prompt, '')
      expect((await goals.execute('goal.get', { sessionId })).goal?.objective).toBe(objective)
      const initialRuns = (await host.client.call('session.snapshot', { sessionId, limit: 60 })).runs
      expect(initialRuns.filter((run) => run.input.source === 'user')).toHaveLength(1)
      expect(initialRuns.find((run) => run.input.source === 'user')?.input.mode).toBe('default')
      await test.info().attach('goal-before-pause-runs', {
        body: JSON.stringify((await host.client.call('session.snapshot', { sessionId, limit: 60 })).runs),
        contentType: 'application/json',
      })
      await strip.getByRole('button', { name: labels.pause, exact: true }).click()
      await expect(strip).toContainText(labels.statuses.paused)
      expect((await goals.execute('goal.get', { sessionId })).goal?.status).toBe('paused')
      await test.info().attach('goal-after-pause-runs', {
        body: JSON.stringify((await host.client.call('session.snapshot', { sessionId, limit: 60 })).runs),
        contentType: 'application/json',
      })
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-goal-paused-${locale}.png` })
      await strip.getByRole('button', { name: labels.resume, exact: true }).click()
      await expect(strip).toContainText(labels.statuses.active)
      await strip.getByRole('button', { name: labels.pause, exact: true }).click()
      await expect(strip).toContainText(labels.statuses.paused)

      await strip.getByRole('button', { name: labels.expand, exact: true }).click()
      const editor = page.getByRole('textbox', { name: copy.goals.goal.objective, exact: true })
      await expect(editor).toHaveValue(objective)
      await editor.fill('This replacement will be discarded')
      await expect(page.getByText(copy.goals.goal.replacementWarning, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.goals.goal.cancel, exact: true }).click()
      await expect(editor).toHaveValue(objective)
      await editor.fill(`${objective}\n\nKeep the changes scoped and verified.`)
      await page.getByRole('button', { name: copy.goals.goal.save, exact: true }).click()
      await expect(page.getByText(copy.goals.goal.saved, { exact: true })).toBeVisible()
      await expect(strip).toContainText('Keep the changes scoped and verified.')
      await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-goal-document-${locale}.png` })
      await page.getByRole('button', { name: copy.goals.close, exact: true }).click()

      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 390, height: 844 },
        { width: 320, height: 720 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(strip).toBeVisible()
        await expect(strip.getByRole('button', { name: labels.expand, exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        const goalGeometry = await strip.evaluate((element) => {
          const strip = element.getBoundingClientRect()
          const summary = element.querySelector('.hbar-composer-goal-summary')?.getBoundingClientRect()
          const tail = element.querySelector('.hbar-composer-goal-tail')?.getBoundingClientRect()
          const objective = element.querySelector('.hbar-composer-goal-objective')?.getBoundingClientRect()
          const actions = element.querySelector('.hbar-composer-goal-actions')?.getBoundingClientRect()
          return {
            fits: element.scrollWidth <= element.clientWidth + 1,
            summaryWidth: summary?.width ?? 0,
            objectiveWidth: objective?.width ?? 0,
            tailFits: Boolean(tail && actions && tail.right <= strip.right + 1 && actions.right <= strip.right + 1),
            tailBelowSummary: Boolean(summary && tail && tail.top >= summary.bottom - 1),
          }
        })
        expect(goalGeometry.fits).toBe(true)
        expect(goalGeometry.tailFits).toBe(true)
        if (viewport.width <= 390) {
          expect(goalGeometry.summaryWidth).toBeGreaterThan(200)
          expect(goalGeometry.objectiveWidth).toBeGreaterThan(80)
          expect(goalGeometry.tailBelowSummary).toBe(true)
        }
        await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-goal-${locale}-${viewport.width}.png` })
      }
      await strip.getByRole('button', { name: labels.clear, exact: true }).click()
      const confirmation = page.getByRole('group', { name: labels.clear, exact: true })
      await confirmation.getByRole('button', { name: labels.cancel, exact: true }).click()
      await expect(strip).toBeVisible()
      await strip.getByRole('button', { name: labels.clear, exact: true }).click()
      await confirmation.getByRole('button', { name: labels.clear, exact: true }).click()
      await expect(strip).toHaveCount(0)
      expect((await goals.execute('goal.get', { sessionId })).goal).toBeNull()

      await prompt.fill('Plan the next task without making changes.')
      await openModes()
      await planEntry.click()
      await expect(
        permission.getByRole('button', {
          name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label),
        }),
      ).toBeVisible()
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expectComposerText(prompt, '')
      await prompt.fill('Continue planning in the same session.')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expectComposerText(prompt, '')
      const snapshot = await host.client.call('session.snapshot', { sessionId, limit: 60 })
      const planRun = snapshot.runs.find((run) => run.input.text === 'Plan the next task without making changes.')
      expect(planRun?.input.mode).toBe('plan')
      expect(snapshot.runs.find((run) => run.input.text === 'Continue planning in the same session.')?.input.mode).toBe(
        'plan',
      )
      expect(await host.client.call('mode.get', { sessionId })).toEqual({ mode: 'plan' })
      await prompt.fill('/tool write_file {"path":"blocked-plan.txt","text":"must-not-write"}')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expectComposerText(prompt, '')
      await expect
        .poll(async () => {
          const runs = (await host!.client.call('session.snapshot', { sessionId, limit: 60 })).runs
          return runs.find((run) => run.input.text.startsWith('/tool write_file'))?.status
        })
        .toBe('completed')
      const blocked = await host.client.call('session.snapshot', { sessionId, limit: 60 })
      expect(blocked.runs.find((run) => run.input.text.startsWith('/tool write_file'))?.input.mode).toBe('plan')
      expect(
        blocked.messages
          .flatMap((message) => message.content)
          .some(
            (part) =>
              part.type === 'tool_result' &&
              part.name === 'write_file' &&
              part.isError &&
              /PLAN_READ_ONLY|Plan mode cannot execute/.test(part.text),
          ),
      ).toBe(true)
      expect(existsSync(join(root, 'blocked-plan.txt'))).toBe(false)
      await page.reload()
      await expect(
        permission.getByRole('button', {
          name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label),
        }),
      ).toBeVisible()
      await permission
        .getByRole('button', { name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label) })
        .click()
      await permission.locator('[role="menuitemradio"][data-choice="inherit"]').click()
      await prompt.fill('Act in default mode after explicit exit.')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expectComposerText(prompt, '')
      const final = await host.client.call('session.snapshot', { sessionId, limit: 60 })
      expect(final.runs.find((run) => run.input.text === 'Act in default mode after explicit exit.')?.input.mode).toBe(
        'default',
      )
      expect((await goals.execute('goal.get', { sessionId })).goal).toBeNull()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
