import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage, planStateSchema, workflowSnapshotSchema } from '@hbar/contracts'
import type { WorkflowPlanItemInput } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, GoalService, HarnessDriver, PlanService, WorkflowService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

const repairTools = [
  'get_goal',
  'update_goal',
  'get_plan',
  'update_plan',
  'get_workflow',
  'workflow_focus',
  'workflow_update',
  'workflow_checkpoint',
  'workflow_expand_scope',
]
const item: WorkflowPlanItemInput = {
  id: 'verify',
  title: 'Verify the proof',
  scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] },
  acceptanceChecks: [
    {
      id: 'proof',
      description: 'Host verifies the proof text',
      verifier: { kind: 'tool', toolName: 'read_file', result: { kind: 'textContains', value: 'verified proof' } },
    },
  ],
}

async function invoke(input: DriverInput, name: string, args: Record<string, unknown>, error = false) {
  const callId = crypto.randomUUID()
  await input.commit('assistant', [{ type: 'tool_call', callId, name, args }])
  const result = await input.execute(name, args, callId)
  expect(result.isError ?? false).toBe(error)
  return result
}

async function fixture(script: (input: DriverInput) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-autonomous-repair-'))
  await writeFile(join(root, '.gitignore'), 'data/\n', 'utf8')
  await writeFile(join(root, 'proof.txt'), 'verified proof', 'utf8')
  const initialized = Bun.spawn({ cmd: ['git', 'init', '--quiet'], cwd: root, stdout: 'ignore', stderr: 'pipe' })
  if ((await initialized.exited) !== 0) throw new Error(await new Response(initialized.stderr).text())
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Workflow repair fixture',
      description: 'Scripted recovery and independent review',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        run: async (input) => {
          const step = crypto.randomUUID()
          await input.beforeRequest(input.request, step)
          await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, step)
          await script(input)
          await input.stepEnded(step)
        },
        summarize: async () => ({ text: 'fixture', usage: emptyUsage() }),
      })
    },
  })
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
  })
  resources.push({ root, kernel })
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  const goals = kernel.plugins.get<GoalService>('goal')
  const plans = kernel.plugins.get<PlanService>('plan')
  const workflows = kernel.plugins.get<WorkflowService>('workflow')
  await goals.create(session.id, 'Recover focus, verify proof and finish independent review', 1000)
  const plan = await plans.update(session.id, [{ step: 'Verify the bounded proof', status: 'in_progress' }])
  await workflows.focus(
    session.id,
    0,
    { ...item, scope: { readPaths: ['elsewhere'], writePaths: [], tools: ['read_file'] } },
    'agent',
    plan.revision,
  )
  await kernel.waitForIdle()
  return { kernel, session, goals, plans, workflows }
}

test('scope denial, stale Plan revision and reviewer rejection recover through fourteen main turns with no user decision', async () => {
  let mainTurns = 0
  let reviews = 0
  const { kernel, session, goals, plans, workflows } = await fixture(async (input) => {
    if (input.session.parentId) {
      reviews++
      const reviewId = /Review id: ([\w-]+)/.exec(input.run.input.text)?.[1]
      expect(reviewId).toBeDefined()
      await invoke(input, 'workflow_review_submit', {
        reviewId,
        verdict: reviews === 1 ? 'rejected' : 'approved',
        summary: reviews === 1 ? 'Revise the verification focus once' : 'Proof independently verified',
      })
      return
    }
    mainTurns++
    if (mainTurns === 1) {
      for (let attempt = 0; attempt < 3; attempt++) await invoke(input, 'read_file', { path: 'proof.txt' }, true)
      return
    }
    if (mainTurns === 2 || mainTurns === 12) {
      expect(input.tools.map((tool) => tool.name).sort()).toEqual([...repairTools].sort())
      expect((await invoke(input, 'read_file', { path: 'proof.txt' }, true)).text).toContain(
        'Only Goal, Plan and Workflow',
      )
      const prior = planStateSchema.parse((await invoke(input, 'get_plan', {})).details)
      const current = planStateSchema.parse(
        (await invoke(input, 'update_plan', { plan: [{ step: `Revised proof ${mainTurns}`, status: 'in_progress' }] }))
          .details,
      )
      expect(
        (
          await invoke(
            input,
            'workflow_focus',
            { stepIndex: 0, item, completionPolicy: 'review_agent', expectedPlanRevision: prior.revision },
            true,
          )
        ).text,
      ).toContain('Agent Plan changed')
      await invoke(input, 'workflow_focus', {
        stepIndex: 0,
        item,
        completionPolicy: 'review_agent',
        expectedPlanRevision: current.revision,
      })
      return
    }
    if (mainTurns >= 3 && mainTurns <= 10) {
      const plan = planStateSchema.parse(
        (
          await invoke(input, 'update_plan', {
            plan: [{ step: `Verified milestone ${mainTurns}`, status: 'in_progress' }],
          })
        ).details,
      )
      await invoke(input, 'workflow_focus', {
        stepIndex: 0,
        item,
        completionPolicy: 'review_agent',
        expectedPlanRevision: plan.revision,
      })
      await invoke(input, 'read_file', { path: 'proof.txt' })
      return
    }
    if (mainTurns === 11 || mainTurns === 13) {
      expect(input.tools.some((tool) => tool.name === 'read_file')).toBe(true)
      await invoke(input, 'read_file', { path: 'proof.txt' })
      const state = workflowSnapshotSchema.parse((await invoke(input, 'get_workflow', {})).details)
      await invoke(input, 'workflow_update', {
        action: 'checkpoint',
        itemId: item.id,
        outcome: 'complete',
        summary: 'Proof read and validated by Host',
        expectedRevision: state.workflow!.revision,
      })
      return
    }
    expect(mainTurns).toBe(14)
    await invoke(input, 'update_goal', { status: 'complete' })
  })
  await kernel.submit(session.id, 'start', { text: 'Complete the workflow autonomously', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(
    (await kernel.snapshot(session.id)).runs.filter((run) => run.status === 'failed').map((run) => run.error),
  ).toEqual([])
  expect(mainTurns).toBe(14)
  expect(reviews).toBe(2)
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
  expect((await plans.get(session.id))?.plan[0]?.status).toBe('completed')
  expect((await workflows.get(session.id)).workflow).toMatchObject({
    status: 'completed',
    review: { status: 'approved' },
  })
  const events = await kernel.storage.call('events', session.id, 0)
  expect(events.filter((event) => event.type === 'run.queued')).toHaveLength(14)
  expect(events.some((event) => event.type === 'user_input.requested' || event.type === 'approval.requested')).toBe(
    false,
  )
}, 30000)

test('three unsuccessful restricted repair turns stop durably without enabling ordinary tools', async () => {
  let turns = 0
  const { kernel, session, goals, workflows } = await fixture(async (input) => {
    turns++
    if (turns === 1) {
      for (let attempt = 0; attempt < 3; attempt++) await invoke(input, 'read_file', { path: 'proof.txt' }, true)
    } else {
      expect(input.tools.map((tool) => tool.name).sort()).toEqual([...repairTools].sort())
      await invoke(input, 'get_workflow', {})
      await invoke(input, 'read_file', { path: 'proof.txt' }, true)
    }
  })
  await kernel.submit(session.id, 'start', { text: 'Attempt bounded recovery', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(turns).toBe(4)
  expect((await goals.get(session.id)).goal?.continuation).toMatchObject({
    phase: 'stopped',
    reason: 'repair_exhausted',
  })
  expect((await workflows.get(session.id)).workflow?.status).toBe('needs_revision')
})

test('re-publishing an identical focus does not count changing revision, evidence ids or timestamps as progress', async () => {
  let turns = 0
  const { kernel, session, goals } = await fixture(async (input) => {
    turns++
    const plan = planStateSchema.parse((await invoke(input, 'get_plan', {})).details)
    await invoke(input, 'workflow_focus', {
      stepIndex: 0,
      item,
      completionPolicy: 'agent',
      expectedPlanRevision: plan.revision,
    })
  })
  await kernel.submit(session.id, 'start', { text: 'Do not repeat focus forever', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(turns).toBe(4)
  expect((await goals.get(session.id)).goal?.continuation).toMatchObject({ phase: 'stopped', reason: 'no_progress' })
})
