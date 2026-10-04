import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { automationStateSchema, userInputQuestionSchema, userInputResponseSchema } from '@hbar/contracts'
import type { GoalService, PlanService } from '@hbar/plugin-sdk'
import { PLAN_MODE_INSTRUCTIONS } from '../plugins/plan/src/instructions.ts'

const resources: Array<{ root: string; kernel: Kernel }> = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-plan-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { root, kernel, session }
}

test('plan accepts an empty update and broadcasts a clear notification', async () => {
  const { kernel, session } = await fixture()
  const plans = kernel.plugins.get<PlanService>('plan')
  const events: unknown[] = []
  const unsubscribe = kernel.subscribe((event) => events.push(event))
  try {
    const first = await plans.update(session.id, [{ step: 'inspect', status: 'pending' }])
    expect(first.revision).toBe(1)
    try {
      await plans.update(
        session.id,
        [
          { step: 'first', status: 'in_progress' },
          { step: 'second', status: 'in_progress' },
        ],
        null,
        null,
        1,
      )
      throw new Error('Expected multiple in-progress steps to reject')
    } catch (error) {
      expect(error).toMatchObject({ code: 'PLAN_INVALID' })
    }
    expect((await plans.update(session.id, [], null, null, 1)).revision).toBe(2)
    try {
      await plans.update(session.id, [], null, null, 1)
      throw new Error('Expected stale plan update to reject')
    } catch (error) {
      expect(error).toMatchObject({ code: 'PLAN_REVISION_CONFLICT' })
    }
    expect(await plans.clear(session.id, 2)).toEqual({ cleared: true })
    expect(events.some((event) => (event as { method?: string }).method === 'plan.updated')).toBeTrue()
    expect(events.some((event) => (event as { method?: string }).method === 'plan.cleared')).toBeTrue()
  } finally {
    unsubscribe()
  }
})

test('plan mode state survives a host restart', async () => {
  const { root, kernel, session } = await fixture()
  const mode = kernel.plugins.get<{
    set(id: string, value: 'plan' | 'default'): Promise<{ mode: 'plan' | 'default' }>
    get(id: string): Promise<{ mode: 'plan' | 'default' }>
  }>('mode')
  await mode.set(session.id, 'plan')
  await kernel.close()
  const index = resources.findIndex((entry) => entry.kernel === kernel)
  if (index >= 0) resources.splice(index, 1)
  const restarted = await Kernel.create({ home: join(root, 'data'), demo: true, secrets: new MemorySecrets() })
  resources.push({ root, kernel: restarted })
  expect((await restarted.plugins.get<typeof mode>('mode').get(session.id)).mode).toBe('plan')
})

test('legacy plan events recover with monotonic revisions', async () => {
  const { root, kernel, session } = await fixture()
  await kernel.append(session.id, 'plan.updated', {
    plan: {
      sessionId: session.id,
      turnId: null,
      explanation: 'Legacy plan without a revision',
      plan: [{ step: 'Recover the plan', status: 'in_progress' }],
      updatedAt: 1,
    },
  })
  await kernel.close()
  const index = resources.findIndex((entry) => entry.kernel === kernel)
  if (index >= 0) resources.splice(index, 1)
  const restarted = await Kernel.create({ home: join(root, 'data'), demo: true, secrets: new MemorySecrets() })
  resources.push({ root, kernel: restarted })
  const plans = restarted.plugins.get<PlanService>('plan')
  expect(await plans.get(session.id)).toMatchObject({ revision: 1, explanation: 'Legacy plan without a revision' })
  expect((await plans.update(session.id, [{ step: 'Continue', status: 'in_progress' }])).revision).toBe(2)
})

test('plan mode exposes the Codex collaboration rules separately from update_plan', () => {
  expect(PLAN_MODE_INSTRUCTIONS).toContain('Plan Mode')
  expect(PLAN_MODE_INSTRUCTIONS).toContain('approves your `exit_plan_mode` request')
  expect(PLAN_MODE_INSTRUCTIONS).toContain('update_plan')
  expect(PLAN_MODE_INSTRUCTIONS).toContain('does not enter or exit Plan Mode')
  expect(PLAN_MODE_INSTRUCTIONS).toContain('mutating')
  expect(PLAN_MODE_INSTRUCTIONS).toContain('<proposed_plan>')
  expect(PLAN_MODE_INSTRUCTIONS).not.toContain('save_workflow_plan')
  expect(PLAN_MODE_INSTRUCTIONS).toContain('final acceptance checklist')
})

test('request user input contracts preserve free-text wire questions and answer-only responses', () => {
  const question = userInputQuestionSchema.parse({
    id: 'details',
    header: 'Details',
    question: 'What constraint should the plan account for?',
  })
  expect(question.options).toBeUndefined()
  expect(question.isOther).toBe(false)
  expect(question.isSecret).toBe(false)
  expect(userInputResponseSchema.parse({ answers: { details: { answers: ['offline'] } } })).toEqual({
    answers: { details: { answers: ['offline'] } },
  })
})

test('legacy automation events default the combined goal flag to false', () => {
  expect(automationStateSchema.parse({ sessionId: 'session-1', unattended: true })).toEqual({
    sessionId: 'session-1',
    unattended: true,
    goalEnabled: false,
  })
})

test('plan mode uses medium reasoning unless the caller explicitly chooses an effort', async () => {
  const { kernel, session } = await fixture()
  const mode = kernel.plugins.get<{
    set(id: string, value: 'plan' | 'default'): Promise<{ mode: 'plan' | 'default' }>
    get(id: string): Promise<{ mode: 'plan' | 'default' }>
  }>('mode')
  await mode.set(session.id, 'plan')
  const inherited = await kernel.submit(session.id, 'plan-medium', { text: 'inspect', images: [] }, 'local-fixture')
  expect((await kernel.storage.call('run', inherited.id)).input.thinking).toBe('medium')
  await kernel.waitForIdle()
  const explicit = await kernel.submit(
    session.id,
    'plan-high',
    { text: 'inspect', images: [], thinking: 'high' },
    'local-fixture',
  )
  expect((await kernel.storage.call('run', explicit.id)).input.thinking).toBe('high')
  await kernel.waitForIdle()
})

test('plan mode request_user_input pauses the run and resumes with validated answers', async () => {
  const { kernel, session } = await fixture()
  await kernel.setPermissionMode('allow')
  const mode = kernel.plugins.get<{
    set(id: string, value: 'default' | 'plan'): Promise<{ mode: 'default' | 'plan' }>
  }>('mode')
  await mode.set(session.id, 'plan')
  const run = await kernel.submit(
    session.id,
    'request-user-input',
    {
      mode: 'plan',
      text: '/tool request_user_input {"questions":[{"id":"scope","header":"Scope","question":"Which scope should the plan cover?","options":[{"label":"App","description":"Cover the application flow."},{"label":"API","description":"Cover the API contract."}]}]}',
      images: [],
    },
    'local-fixture',
  )
  let pending = (await kernel.snapshot(session.id)).userInputs[0]
  for (let attempt = 0; attempt < 100 && !pending; attempt++) {
    await Bun.sleep(5)
    pending = (await kernel.snapshot(session.id)).userInputs[0]
  }
  expect(pending?.questions[0]?.id).toBe('scope')
  expect(pending?.questions[0]?.isOther).toBe(false)
  expect(pending).toBeTruthy()
  expect(await kernel.resolveUserInput(pending!.requestId, { scope: { answers: ['App'] } })).toBeTrue()
  await kernel.waitForIdle()
  const snapshot = await kernel.snapshot(session.id)
  expect(snapshot.userInputs).toHaveLength(0)
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some(
        (block) => block.type === 'tool_result' && block.name === 'request_user_input' && block.text.includes('App'),
      ),
  ).toBeTrue()
  const responseBlock = snapshot.messages
    .flatMap((message) => message.content)
    .find((block) => block.type === 'tool_result' && block.name === 'request_user_input')
  expect(responseBlock?.type === 'tool_result' ? JSON.parse(responseBlock.text) : null).toEqual({
    answers: { scope: { answers: ['App'] } },
  })
  expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
})

test('Goal+Plan promotes the saved plan into a goal before continuing', async () => {
  const { kernel, session } = await fixture()
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  await kernel.automationSet(session.id, false, true)
  const mode = kernel.plugins.get<{
    set(id: string, value: 'plan' | 'default'): Promise<{ mode: 'plan' | 'default' }>
    get(id: string): Promise<{ mode: 'plan' | 'default' }>
  }>('mode')
  await mode.set(session.id, 'plan')
  const planRun = await kernel.submit(
    session.id,
    'goal-plan',
    {
      mode: 'plan',
      text: '/tool save_plan {"explanation":"Read-only review","plan":[{"step":"Inspect the repository","status":"pending"}]}',
      images: [],
    },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const goal = await kernel.plugins.get<GoalService>('goal').get(session.id)
  expect((await kernel.storage.call('run', planRun.id)).status).toBe('completed')
  expect(goal.goal?.objective).toContain('Inspect the repository')
  expect(goal.goal?.status).toBe('active')
  expect((await mode.get(session.id)).mode).toBe('default')
  expect((await kernel.automationGet(session.id)).goalEnabled).toBe(false)
})

test('unattended mode selects the unique recommended option without pausing', async () => {
  const { kernel, session } = await fixture()
  await kernel.automationSet(session.id, true)
  const run = await kernel.submit(
    session.id,
    'recommended-input',
    {
      text: '/tool request_user_input {"questions":[{"id":"scope","header":"Scope","question":"Which scope?","options":[{"label":"App","description":"Cover the app.","recommended":true},{"label":"API","description":"Cover the API."}]}]}',
      images: [],
    },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const snapshot = await kernel.snapshot(session.id)
  expect(snapshot.userInputs).toHaveLength(0)
  expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
  const result = snapshot.messages
    .flatMap((message) => message.content)
    .find((block) => block.type === 'tool_result' && block.name === 'request_user_input')
  expect(result?.type === 'tool_result' ? JSON.parse(result.text) : null).toEqual({
    answers: { scope: { answers: ['App'] } },
  })
})
