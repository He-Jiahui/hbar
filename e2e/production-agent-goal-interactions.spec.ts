import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createGoalPlanCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlaywrightUiHarness } from './support/playwright-ui-harness.ts'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host.ts'

async function until<T>(read: () => Promise<T>, timeout = 15_000): Promise<T> {
  const started = Date.now()
  while (true) {
    try {
      return await read()
    } catch (error) {
      if (Date.now() - started >= timeout) throw error
      await new Promise<void>((resolve) => setTimeout(resolve, 50))
    }
  }
}

test('binds child agent and goal-plan actions to the original session entities', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-production-agent-goal-'))
  const artifactDirectory = 'artifacts/production-ui/web/agent-goal'
  await rm(artifactDirectory, { recursive: true, force: true })
  let host: WebSessionHost | undefined
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  try {
    host = await startWebSessionHost({ root })
    const authentication = await context.request.post(
      `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}/auth/token`,
      { data: { token: host.ready.token } },
    )
    expect(authentication.ok()).toBe(true)
    const page = await context.newPage()
    const harness = new PlaywrightUiHarness({
      page,
      platform: 'web',
      artifactDirectory,
      locale: 'en-US',
      theme: 'system',
    })
    await page.goto(`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`)
    await expect(page.locator('footer')).toContainText('Connected')
    await page.getByRole('button', { name: `Open session ${host.ready.sessionTitle}` }).click()
    const agentCommands = createAgentCommandClient(host.client)
    const goalCommands = createGoalPlanCommandClient(host.client)

    await harness.exercise(
      'session.tool.agents.toggle',
      { role: 'button', name: 'Child agents', description: 'session child-agent tool action' },
      async () => {
        await page.getByRole('button', { name: 'Child agents', exact: true }).click()
        const heading = page.getByRole('heading', { level: 2, name: 'Child agent management' })
        await expect(heading).toBeVisible()
        return {
          ui: [{ description: 'child-agent tool opens beside the parent session', passed: await heading.isVisible() }],
        }
      },
    )

    await harness.exercise(
      'agents.refresh',
      { role: 'button', name: 'Refresh', description: 'refresh child-agent list' },
      async () => {
        await page.getByRole('button', { name: 'Refresh' }).click()
        await expect(page.getByText('This session has no child agents.')).toBeVisible()
        return {
          ui: [
            {
              description: 'empty agent state is stable after refresh',
              passed: await page.getByText('This session has no child agents.').isVisible(),
            },
          ],
        }
      },
    )

    await harness.exercise(
      'agents.create.open',
      { role: 'button', name: 'Create child agent', description: 'open child-agent form' },
      async () => {
        await page.getByRole('button', { name: 'Create child agent' }).click()
        const objective = page.getByRole('textbox', { name: 'Objective' })
        await expect(objective).toBeVisible()
        return {
          ui: [
            {
              description: 'create form opens with objective focused and model populated',
              passed:
                (await objective.isVisible()) &&
                (await page.getByRole('textbox', { name: 'Model' }).inputValue()) === 'local-fixture',
            },
          ],
        }
      },
    )

    await page.getByRole('textbox', { name: 'Objective' }).fill('/slow')
    await page.getByRole('spinbutton', { name: 'Token budget' }).fill('5000')
    await page.getByRole('combobox', { name: 'Tool approval' }).selectOption('deny')
    let agentId = ''
    await harness.exercise(
      'agents.create.submit',
      { role: 'button', name: 'Create and run', description: 'submit child-agent form' },
      async () => {
        await page.getByRole('button', { name: 'Create and run' }).click()
        await expect(page.getByText('Child agent created.')).toBeVisible()
        const agents = await agentCommands.execute('agent.list', { parentSessionId: host!.ready.sessionId, limit: 50 })
        const created = agents.items.find((agent) => agent.objective === '/slow')
        if (!created) throw new Error('Created child agent is missing from Host list')
        agentId = created.agentId
        return {
          ui: [
            {
              description: 'created agent detail shows the submitted objective',
              passed:
                (await page.getByRole('heading', { level: 2, name: 'Child agent details' }).isVisible()) &&
                (await page.getByText('/slow', { exact: true }).count()) > 0,
            },
          ],
          host: [
            {
              description: 'Host child agent belongs to the original parent session and preserves form values',
              passed:
                created.parentSessionId === host!.ready.sessionId &&
                created.modelId === 'local-fixture' &&
                created.tokenBudget === 5000,
            },
          ],
          hostFact: created,
        }
      },
    )

    await harness.exercise(
      'agents.cancel',
      { role: 'button', name: 'Cancel agent', description: 'cancel the created slow child agent' },
      async () => {
        await page.getByRole('button', { name: 'Cancel agent' }).click()
        const cancelled = await until(async () => {
          const agents = await agentCommands.execute('agent.list', {
            parentSessionId: host!.ready.sessionId,
            limit: 50,
          })
          const candidate = agents.items.find((agent) => agent.agentId === agentId)
          if (!candidate || !['cancelRequested', 'cancelled'].includes(candidate.status))
            throw new Error('Child agent is not cancelled yet')
          return candidate
        })
        await expect(page.getByText(/Cancelling|Cancelled/).first()).toBeVisible()
        return {
          ui: [
            {
              description: 'cancel feedback remains in the original agent detail',
              passed: await page
                .getByText(/Cancelling|Cancelled/)
                .first()
                .isVisible(),
            },
          ],
          host: [
            {
              description: 'Host cancellation targets the exact created agent id',
              passed: cancelled.agentId === agentId && ['cancelRequested', 'cancelled'].includes(cancelled.status),
            },
          ],
          hostFact: cancelled,
        }
      },
    )

    await harness.exercise(
      'agents.back',
      { role: 'button', name: 'Back to child agents', description: 'return from child-agent detail' },
      async () => {
        await page.getByRole('button', { name: 'Back to child agents' }).click()
        const row = page.getByRole('button', { name: 'View details for /slow' })
        await expect(row).toBeVisible()
        return { ui: [{ description: 'created agent row returns', passed: await row.isVisible() }] }
      },
    )

    await harness.exercise(
      'agents.detail.open',
      { role: 'button', name: 'View details for /slow', description: 'open stable agent detail' },
      async () => {
        await page.getByRole('button', { name: 'View details for /slow' }).click()
        const heading = page.getByRole('heading', { level: 2, name: 'Child agent details' })
        await expect(heading).toBeVisible()
        return {
          ui: [
            {
              description: 'the clicked agent detail opens',
              passed: (await heading.isVisible()) && (await page.getByText('/slow', { exact: true }).count()) > 0,
            },
          ],
        }
      },
    )

    await page.getByRole('button', { name: 'Back to child agents' }).click()
    await harness.exercise(
      'agents.close',
      { role: 'button', name: 'Close child agent management', description: 'close child-agent tool' },
      async () => {
        await page.getByRole('button', { name: 'Close child agent management' }).click()
        const heading = page.getByRole('heading', { level: 2, name: 'Child agent management' })
        await expect(heading).toBeHidden()
        return { ui: [{ description: 'child-agent tool closes', passed: !(await heading.isVisible()) }] }
      },
    )

    await harness.exercise(
      'session.tool.goals.toggle',
      { role: 'button', name: 'Goals and plans', description: 'session goal-plan tool action' },
      async () => {
        await page.getByRole('button', { name: 'Goals and plans', exact: true }).click()
        const heading = page.getByRole('heading', { level: 2, name: 'Goals and plans' })
        await expect(heading).toBeVisible()
        return {
          ui: [{ description: 'goal-plan tool opens beside the parent session', passed: await heading.isVisible() }],
        }
      },
    )

    const objective = 'Complete production interaction coverage'
    await harness.exercise(
      'goals.goal.create',
      { role: 'button', name: 'Set goal', description: 'create a session goal' },
      async () => {
        await page.getByRole('button', { name: 'Set goal' }).click()
        await page.getByRole('textbox', { name: 'Goal objective' }).fill(objective)
        await page.getByRole('spinbutton', { name: 'Goal token budget' }).fill('16000')
        await page.getByRole('button', { name: 'Save goal' }).click()
        await expect(page.getByText('Goal saved.')).toBeVisible()
        const goal = await goalCommands.execute('goal.get', { sessionId: host!.ready.sessionId })
        return {
          ui: [
            {
              description: 'saved goal feedback is visible in the editor',
              passed: await page.getByText('Goal saved.').isVisible(),
            },
          ],
          host: [
            {
              description: 'Host goal preserves objective and token budget for the original session',
              passed: goal.goal?.objective === objective && goal.goal.tokenBudget === 16000,
            },
          ],
          hostFact: goal,
        }
      },
    )

    await page.getByRole('button', { name: 'Back to goals and plans' }).click()
    const revisedObjective = `${objective} and desktop parity`
    await harness.exercise(
      'goals.goal.save',
      { role: 'button', name: 'Save goal', description: 'edit the existing session goal' },
      async () => {
        await page.getByRole('button', { name: 'Edit goal' }).click()
        await page.getByRole('textbox', { name: 'Goal objective' }).fill(revisedObjective)
        await page.getByRole('button', { name: 'Save goal' }).click()
        await expect(page.getByText('Goal saved.')).toBeVisible()
        const goal = await goalCommands.execute('goal.get', { sessionId: host!.ready.sessionId })
        return {
          ui: [
            {
              description: 'edited goal remains in the same editor',
              passed: (await page.getByRole('textbox', { name: 'Goal objective' }).inputValue()) === revisedObjective,
            },
          ],
          host: [
            {
              description: 'Host updates the original session goal',
              passed: goal.goal?.objective === revisedObjective,
            },
          ],
          hostFact: goal,
        }
      },
    )

    await page.getByRole('button', { name: 'Back to goals and plans' }).click()
    await harness.exercise(
      'goals.plan.open',
      { role: 'button', name: 'Edit plan', description: 'open plan editor' },
      async () => {
        await page.getByRole('button', { name: 'Edit plan' }).click()
        const editor = page.getByRole('region', { name: 'Execution plan' })
        await expect(editor).toBeVisible()
        return {
          ui: [
            {
              description: 'plan editor opens with explanation and step input',
              passed:
                (await editor.isVisible()) &&
                (await page.getByRole('textbox', { name: 'Plan explanation' }).count()) === 1,
            },
          ],
        }
      },
    )

    await page.getByRole('textbox', { name: 'Plan explanation' }).fill('Keep changes reviewable.')
    await harness.exercise(
      'goals.plan.step.add',
      { role: 'button', name: 'Add step', description: 'add first plan step' },
      async () => {
        await page.getByRole('textbox', { name: 'Add plan step' }).fill('Verify Web')
        await page.getByRole('button', { name: 'Add step' }).click()
        const title = page.getByRole('textbox', { name: 'Step 1 title' })
        await expect(title).toHaveValue('Verify Web')
        return {
          ui: [
            {
              description: 'new step appears in the ordered draft',
              passed: (await title.inputValue()) === 'Verify Web',
            },
          ],
        }
      },
    )
    await page.getByRole('textbox', { name: 'Add plan step' }).fill('Verify Tauri')
    await page.getByRole('button', { name: 'Add step' }).click()

    await harness.exercise(
      'goals.plan.step.edit',
      { role: 'textbox', name: 'Step 1 title', description: 'edit plan step title' },
      async () => {
        const title = page.getByRole('textbox', { name: 'Step 1 title' })
        await title.fill('Verify Web production')
        return {
          ui: [
            {
              description: 'step title edit remains in the draft',
              passed: (await title.inputValue()) === 'Verify Web production',
            },
          ],
        }
      },
    )

    await harness.exercise(
      'goals.plan.step.status',
      { role: 'combobox', name: 'Step 1 status', description: 'change plan step status' },
      async () => {
        const status = page.getByRole('combobox', { name: 'Step 1 status' })
        await status.selectOption({ label: 'In progress' })
        return {
          ui: [
            {
              description: 'step status edit remains in the draft',
              passed: (await status.inputValue()) === 'running',
            },
          ],
        }
      },
    )

    await harness.exercise(
      'goals.plan.step.reorder',
      { role: 'button', name: 'Move Verify Tauri up', description: 'reorder plan steps' },
      async () => {
        await page.getByRole('button', { name: 'Move Verify Tauri up' }).click()
        return {
          ui: [
            {
              description: 'second step moves into the first position',
              passed: (await page.getByRole('textbox', { name: 'Step 1 title' }).inputValue()) === 'Verify Tauri',
            },
          ],
        }
      },
    )

    await harness.exercise(
      'goals.plan.step.remove',
      { role: 'button', name: 'Remove Verify Web production', description: 'remove a plan step' },
      async () => {
        await page.getByRole('button', { name: 'Remove Verify Web production' }).click()
        return {
          ui: [
            {
              description: 'only the retained step remains',
              passed:
                (await page.getByRole('textbox', { name: /^Step \d+ title$/ }).count()) === 1 &&
                (await page.getByRole('textbox', { name: 'Step 1 title' }).inputValue()) === 'Verify Tauri',
            },
          ],
        }
      },
    )

    await harness.exercise(
      'goals.plan.save',
      { role: 'button', name: 'Save 1 step', description: 'persist the plan draft' },
      async () => {
        await page.getByRole('button', { name: 'Save 1 step' }).click()
        await expect(page.getByText('Plan saved.')).toBeVisible()
        const plan = await goalCommands.execute('plan.get', { sessionId: host!.ready.sessionId })
        return {
          ui: [
            { description: 'plan save feedback is visible', passed: await page.getByText('Plan saved.').isVisible() },
          ],
          host: [
            {
              description: 'Host plan contains only the retained ordered step and explanation',
              passed:
                plan?.explanation === 'Keep changes reviewable.' &&
                plan.plan.length === 1 &&
                plan.plan[0]?.step === 'Verify Tauri',
            },
          ],
          hostFact: plan,
        }
      },
    )

    await harness.exercise(
      'goals.back',
      { role: 'button', name: 'Back to goals and plans', description: 'return from plan editor' },
      async () => {
        await page.getByRole('button', { name: 'Back to goals and plans' }).click()
        await expect(page.getByText('Verify Tauri', { exact: true })).toBeVisible()
        return {
          ui: [
            {
              description: 'overview renders the saved plan summary',
              passed: await page.getByText('Verify Tauri', { exact: true }).isVisible(),
            },
          ],
        }
      },
    )

    await harness.exercise(
      'goals.plan.clear',
      { role: 'button', name: 'Clear plan', description: 'clear the persisted session plan' },
      async () => {
        await page.getByRole('button', { name: 'Clear plan' }).click()
        await expect(page.getByText('Plan cleared.')).toBeVisible()
        const plan = await goalCommands.execute('plan.get', { sessionId: host!.ready.sessionId })
        return {
          ui: [
            {
              description: 'empty plan state replaces the saved summary',
              passed: await page.getByText('Plan cleared.').isVisible(),
            },
          ],
          host: [{ description: 'Host plan is absent for the original session', passed: plan === null }],
          hostFact: { sessionId: host!.ready.sessionId, plan },
        }
      },
    )

    await harness.exercise(
      'goals.goal.clear',
      { role: 'button', name: 'Clear goal', description: 'clear the persisted session goal' },
      async () => {
        await page.getByRole('button', { name: 'Clear goal' }).click()
        await expect(page.getByText('Goal cleared.')).toBeVisible()
        const goal = await goalCommands.execute('goal.get', { sessionId: host!.ready.sessionId })
        return {
          ui: [
            {
              description: 'no-goal state replaces the saved objective',
              passed: await page.getByText('Goal cleared.').isVisible(),
            },
          ],
          host: [{ description: 'Host goal is absent for the original session', passed: goal.goal === null }],
          hostFact: goal,
        }
      },
    )

    await harness.exercise(
      'goals.close',
      { role: 'button', name: 'Close goals and plans', description: 'close goal-plan tool' },
      async () => {
        await page.getByRole('button', { name: 'Close goals and plans' }).click()
        const heading = page.getByRole('heading', { level: 2, name: 'Goals and plans' })
        await expect(heading).toBeHidden()
        return { ui: [{ description: 'goal-plan tool closes', passed: !(await heading.isVisible()) }] }
      },
    )

    await harness.writeReport({ requireComplete: false })
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
