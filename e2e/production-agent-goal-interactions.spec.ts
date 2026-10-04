import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createGoalPlanCommandClient, createRunCommandClient } from '@hbar/client'
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
              description: 'Host updates only the objective while retaining its explicit budget',
              passed: goal.goal?.objective === revisedObjective && goal.goal.tokenBudget === 16000,
            },
          ],
          hostFact: goal,
        }
      },
    )

    await harness.exercise(
      'goals.back',
      { role: 'button', name: 'Back to goals and plans', description: 'return from goal editor' },
      async () => {
        await page.getByRole('button', { name: 'Back to goals and plans' }).click()
        const visible = await page.getByText(revisedObjective, { exact: true }).isVisible()
        return { ui: [{ description: 'goal summary returns to the original session', passed: visible }] }
      },
    )

    const runCommands = createRunCommandClient(host.client)
    const publishPlan = async (plan: { step: string; status: 'pending' | 'in_progress' | 'completed' }[]) => {
      await runCommands.execute(
        'run.submit',
        {
          sessionId: host!.ready.sessionId,
          modelId: 'local-fixture',
          input: {
            text: `/tool update_plan ${JSON.stringify({ plan, explanation: 'Agent-owned verification steps' })}`,
            images: [],
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await goalCommands.execute('plan.get', { sessionId: host!.ready.sessionId }))?.plan)
        .toEqual(plan)
    }
    const panel = page.locator('.hbar-app-react-goal-plan-workspace')
    await publishPlan([
      { step: 'Verify Web', status: 'in_progress' },
      { step: 'Verify Tauri', status: 'pending' },
    ])
    await harness.exercise(
      'goals.plan.observe',
      {
        role: 'heading',
        name: 'Execution plan',
        description: 'observe agent-published Plan without user edit controls',
      },
      async () => {
        await expect(panel.locator('.hbar-app-react-plan-summary strong')).toHaveText(['Verify Web', 'Verify Tauri'])
        await expect(panel.getByRole('button', { name: /Edit plan|Clear plan|Add step/ })).toHaveCount(0)
        const plan = await goalCommands.execute('plan.get', { sessionId: host!.ready.sessionId })
        return {
          ui: [
            {
              description: 'ordered Plan and progress are projected without a second editable TODO list',
              passed: await panel.getByText('In progress', { exact: true }).isVisible(),
            },
          ],
          host: [
            {
              description: 'Host owns the same two ordered steps',
              passed: plan?.plan.length === 2 && plan.plan[0]?.step === 'Verify Web',
            },
          ],
          hostFact: plan,
        }
      },
    )
    await publishPlan([{ step: 'Verify Tauri', status: 'completed' }])
    await harness.exercise(
      'goals.plan.refresh',
      {
        role: 'button',
        name: 'Refresh',
        description: 'refresh authoritative Plan after agent reorder/removal/completion',
      },
      async () => {
        await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
        await expect(panel.locator('.hbar-app-react-plan-summary strong')).toHaveText(['Verify Tauri'])
        await expect(panel.locator('.hbar-app-react-plan-summary')).toContainText('Completed')
        const plan = await goalCommands.execute('plan.get', { sessionId: host!.ready.sessionId })
        return {
          ui: [
            {
              description: 'removed steps disappear and completed status remains read-only',
              passed: (await panel.getByText('Verify Web', { exact: true }).count()) === 0,
            },
          ],
          host: [
            {
              description: 'the original Session retains the latest Agent Plan revision',
              passed: plan?.plan.length === 1 && plan.plan[0]?.status === 'completed',
            },
          ],
          hostFact: plan,
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
        await expect(panel.locator('.hbar-app-react-plan-summary')).toHaveCount(0)
        expect(await goalCommands.execute('plan.get', { sessionId: host!.ready.sessionId })).toBeNull()
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
