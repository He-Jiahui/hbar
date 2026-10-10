import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { HbarError, RUN_STEP_LIMIT_CODE, emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, GoalService, HarnessDriver, PlanService, WorkflowService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
async function closeFixture(root: string, kernel: Kernel) {
  await kernel.close()
  const actual = await realpath(root)
  if (dirname(actual) !== (await realpath(tmpdir())) || !basename(actual).startsWith('hbar-workflow-verifying-'))
    throw new Error('Refusing to clean an unowned workflow continuation fixture')
  await rm(actual, { recursive: true, force: true })
}
afterEach(async () => {
  const failures: unknown[] = []
  for (const { root, kernel } of resources.splice(0)) {
    try {
      await closeFixture(root, kernel)
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Workflow continuation fixtures did not close')
})

function scriptedDriver(script: (input: DriverInput) => Promise<void>) {
  return definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Workflow verifying continuation fixture',
      description: 'Bounded local driver for Goal and Workflow admission',
      permissions: [],
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        run: async (input) => {
          const step = crypto.randomUUID()
          const request = await input.beforeRequest(input.request, step)
          await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, step)
          await script({ ...input, request })
          await input.stepEnded(step)
        },
        summarize: async () => ({ text: 'workflow continuation fixture', usage: emptyUsage() }),
      })
    },
  })
}

async function execute(input: DriverInput, name: string, args: Record<string, unknown>) {
  const callId = crypto.randomUUID()
  await input.commit('assistant', [{ type: 'tool_call', callId, name, args }])
  const result = await input.execute(name, args, callId)
  expect(result.isError ?? false).toBe(false)
}

async function fixture(script: (input: DriverInput) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-verifying-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': scriptedDriver(script) } },
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Expected the fixture workspace to exist')
  const session = await kernel.createSession(workspace.id)
  return {
    root,
    kernel,
    session,
    goals: kernel.plugins.get<GoalService>('goal'),
    plans: kernel.plugins.get<PlanService>('plan'),
    workflows: kernel.plugins.get<WorkflowService>('workflow'),
  }
}

const focus = {
  id: 'verify-slice',
  title: 'Verify bounded slice',
  scope: {
    readPaths: ['result.txt'],
    writePaths: ['result.txt'],
    tools: ['write_file', 'read_file'],
  },
  acceptanceChecks: [
    {
      id: 'workspace-result',
      description: 'The durable result exists',
      verifier: { kind: 'workspace' as const, path: 'result.txt', expectation: { kind: 'exists' as const } },
    },
    {
      id: 'readback-result',
      description: 'The result is read back by the Host',
      verifier: {
        kind: 'tool' as const,
        toolName: 'read_file',
        result: { kind: 'textContains' as const, value: 'durable' },
      },
    },
  ],
}

test('verifying agent-owned checks admit exactly one typed step-limit continuation', async () => {
  let turns = 0
  let pauseGoal: (() => Promise<void>) | undefined
  const { kernel, session, goals, plans, workflows } = await fixture(async (input) => {
    turns++
    if (turns === 1) {
      await execute(input, 'write_file', { path: 'result.txt', text: 'durable' })
      throw new HbarError(RUN_STEP_LIMIT_CODE, 'bounded fixture slice')
    }
    await pauseGoal?.()
  })

  await goals.create(session.id, 'Finish the durable verification without false completion')
  const originalGoal = (await goals.get(session.id)).goal
  if (!originalGoal?.goalId) throw new Error('Expected the fixture Goal to have an id')
  pauseGoal = async () => {
    await goals.set(session.id, { status: 'paused', expectedGoalId: originalGoal.goalId })
  }
  const plan = await plans.update(session.id, [{ step: 'Verify durable result', status: 'in_progress' }])
  await workflows.focus(session.id, 0, focus, 'agent', plan.revision)
  await kernel.submit(
    session.id,
    'start',
    { text: 'Begin bounded verification', images: [], approval: 'allow' },
    'local-fixture',
  )
  await kernel.waitForIdle()
  await kernel.waitForIdle()

  const workflow = (await workflows.get(session.id)).workflow
  expect(workflow?.status).toBe('verifying')
  expect(workflow?.focus?.completionPolicy).toBe('agent')
  expect(
    workflow?.focus?.acceptanceChecks.filter((check) => check.required && check.status === 'pending'),
  ).toHaveLength(2)
  expect(turns).toBe(2)

  const snapshot = await kernel.snapshot(session.id)
  const goalRuns = snapshot.runs.filter((run) => run.input.source === 'goal')
  expect(goalRuns).toHaveLength(1)
  expect(goalRuns[0]?.input.continuation?.goalId).toBe(originalGoal.goalId)
  const failed = snapshot.runs.find((run) => run.status === 'failed')
  expect(failed?.failure).toEqual({ code: RUN_STEP_LIMIT_CODE, category: 'execution', retryable: false })
  const intent = (await kernel.storage.call('events', session.id, 0))
    .filter((event) => event.type === 'goal.updated')
    .map((event) =>
      z
        .object({
          goal: z.object({
            continuationIntent: z.object({ intentId: z.string(), trigger: z.string() }).nullable().optional(),
          }),
        })
        .safeParse(event.data),
    )
    .flatMap((parsed) =>
      parsed.success && parsed.data.goal.continuationIntent ? [parsed.data.goal.continuationIntent] : [],
    )
    .find((candidate) => candidate.trigger === `step-limit:${failed?.id}`)
  expect(intent?.intentId).toBe(goalRuns[0]?.input.continuation?.intentId)

  expect((await goals.get(session.id)).goal?.status).toBe('paused')
  expect((await workflows.get(session.id)).workflow?.status).toBe('verifying')
})

test('workflow admission keeps required user review waiting', async () => {
  const { kernel, session, goals, plans, workflows } = await fixture(async () => {})
  await goals.create(session.id, 'Keep human review pending')
  const plan = await plans.update(session.id, [{ step: 'Require review', status: 'in_progress' }])
  const userFocus = {
    ...focus,
    id: 'user-review',
    acceptanceChecks: [{ id: 'human', description: 'Human acceptance', verifier: { kind: 'user' as const } }],
  }
  await workflows.focus(session.id, 0, userFocus, 'user', plan.revision)
  const current = await workflows.get(session.id)
  expect(current.workflow?.focus?.completionPolicy).toBe('user')
  expect(current.workflow?.status).toBe('active')
  if (!current.workflow) throw new Error('Expected the focused workflow to exist')
  const waiting = await workflows.checkpoint(
    session.id,
    'user-review',
    'complete',
    'Await human acceptance',
    null,
    current.workflow.revision,
  )
  expect(waiting.workflow?.status).toBe('waiting_user')
  const goal = (await goals.get(session.id)).goal
  if (!goal) throw new Error('Expected the fixture Goal to exist')
  const blockedByUser = await kernel.hooks.dispatch('goal.beforeContinue', {
    sessionId: session.id,
    runId: 'fixture-run',
    goal,
    allowed: true,
  })
  expect(blockedByUser.allowed).toBe(false)
  expect(blockedByUser.reason).toBe('workflow_wait')
})
