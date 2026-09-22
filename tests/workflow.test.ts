import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture(maxExplorationCalls = 8, autoContinue = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  await kernel.changePlugin('goal.codex', true, {
    autoContinue,
    maxContinuations: autoContinue ? 8 : 0,
  })
  await kernel.changePlugin('workflow.focus', true, { maxExplorationCalls })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return {
    root,
    kernel,
    session,
    workflows: kernel.plugins.get<WorkflowService>('workflow'),
    goals: kernel.plugins.get<GoalService>('goal'),
    plans: kernel.plugins.get<PlanService>('plan'),
  }
}

const userVerifiedItem = {
  id: 'ship',
  title: 'Ship the focused change',
  scope: { readPaths: ['.'], writePaths: ['src'], tools: ['read_file'] },
  acceptanceChecks: [
    {
      id: 'user-review',
      description: 'The user accepts the result',
      verifier: { kind: 'user' as const },
    },
  ],
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
    throw new Error('Expected rejection')
  } catch (error) {
    return error
  }
}

test('legacy workflow drafts do not compete with Agent Plan focus and focus survives Host restart', async () => {
  const { root, kernel, session, workflows, plans } = await fixture()
  const draft = await workflows.savePlan(session.id, 'Deliver the verified workflow', [userVerifiedItem], null)
  expect(draft).toMatchObject({ plan: null, workflow: null })

  await kernel.submit(session.id, 'execute-draft', { text: 'Execute the saved plan', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(await workflows.get(session.id)).toMatchObject({
    plan: null,
    workflow: null,
  })

  const agentPlan = await plans.update(session.id, [{ step: userVerifiedItem.title, status: 'in_progress' }])
  await workflows.focus(session.id, 0, userVerifiedItem, 'user', agentPlan.revision)

  await kernel.close()
  resources.splice(
    resources.findIndex((entry) => entry.kernel === kernel),
    1,
  )
  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  expect(await restarted.plugins.get<WorkflowService>('workflow').get(session.id)).toMatchObject({
    plan: { revision: 1, plan: [{ step: userVerifiedItem.title, status: 'in_progress' }] },
    workflow: { status: 'active', revision: 1 },
  })
})

test('Goal auto-continuation pauses while the focused workflow waits for user evidence', async () => {
  const { kernel, session, workflows } = await fixture(8, true)
  await workflows.start(session.id, 'Wait for external acceptance', [userVerifiedItem])
  await kernel.submit(
    session.id,
    'workflow-user-evidence',
    { text: 'Implement the current item', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await kernel.snapshot(session.id)).runs).toHaveLength(1)
  expect(await workflows.get(session.id)).toMatchObject({
    workflow: { status: 'active', focus: { focusId: 'ship' } },
  })
})

test('goal completion is gated by Host-recorded acceptance state', async () => {
  const { session, workflows, goals } = await fixture()
  const started = await workflows.start(session.id, 'Finish only after verification', [userVerifiedItem])
  expect(started.workflow?.revision).toBe(1)

  expect(await rejection(goals.update(session.id, 'complete'))).toMatchObject({
    code: 'WORKFLOW_ACCEPTANCE_PENDING',
  })
  const waiting = await workflows.checkpoint(
    session.id,
    'ship',
    'complete',
    'Ready for the explicitly configured user review',
    null,
    1,
  )
  const accepted = await workflows.acceptCheck(
    session.id,
    'ship',
    'user-review',
    'accepted',
    'Reviewed in the test',
    waiting.workflow!.revision,
    'test-user',
  )
  expect(accepted.workflow?.evidence).toMatchObject([{ source: 'user', actorId: 'test-user', outcome: 'accepted' }])
  const checkpoint = await workflows.checkpoint(
    session.id,
    'ship',
    'complete',
    'Acceptance is recorded',
    null,
    accepted.workflow!.revision,
  )
  expect(checkpoint.workflow?.status).toBe('completed')
  expect(checkpoint.workflow?.focus).toBeNull()
  expect((await goals.get(session.id)).goal?.status).toBe('active')
  await goals.update(session.id, 'complete')
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
})

test('tool scope and exploration checkpoints are enforced before execution', async () => {
  const { root, kernel, session, workflows } = await fixture(1)
  await writeFile(join(root, 'allowed.txt'), 'allowed', 'utf8')
  await writeFile(join(root, 'outside.txt'), 'outside', 'utf8')
  await workflows.start(session.id, 'Read only declared files', [
    {
      id: 'inspect',
      title: 'Inspect one file',
      scope: { readPaths: ['allowed.txt'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
  ])

  await kernel.submit(
    session.id,
    'outside-read',
    { text: '/tool read_file {"path":"outside.txt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  let results = (await kernel.snapshot(session.id)).messages.flatMap((message) => message.content)
  expect(
    results.some(
      (block) =>
        block.type === 'tool_result' && block.isError && block.text.includes('outside the current workflow scope'),
    ),
  ).toBeTrue()

  const expanded = await workflows.expandScope(
    session.id,
    'inspect',
    { readPaths: ['outside.txt'], writePaths: [], tools: [] },
    'The second fixture is required',
    (await workflows.get(session.id)).workflow!.revision,
  )
  expect(expanded.workflow?.revision).toBe(3)
  await kernel.submit(
    session.id,
    'allowed-read',
    { text: '/tool read_file {"path":"outside.txt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await workflows.get(session.id)).workflow?.explorationCount).toBe(1)

  await kernel.submit(
    session.id,
    'checkpoint-required',
    { text: '/tool read_file {"path":"allowed.txt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  results = (await kernel.snapshot(session.id)).messages.flatMap((message) => message.content)
  expect(
    results.some(
      (block) => block.type === 'tool_result' && block.isError && block.text.includes('Record a checkpoint'),
    ),
  ).toBeTrue()

  const checkpoint = await workflows.checkpoint(
    session.id,
    'inspect',
    'progress',
    'The required files are now known',
    null,
    (await workflows.get(session.id)).workflow!.revision,
  )
  expect(checkpoint.workflow).toMatchObject({ explorationCount: 0 })
})

test('scope and checkpoint updates reject stale revisions', async () => {
  const { session, workflows } = await fixture()
  await workflows.start(session.id, 'Keep concurrent updates ordered', [userVerifiedItem])
  const updated = await workflows.expandScope(
    session.id,
    'ship',
    { readPaths: ['tests'], writePaths: [], tools: ['search_text'] },
    'Tests are needed for verification',
    1,
  )
  expect(updated.workflow?.revision).toBe(2)
  expect(await rejection(workflows.checkpoint(session.id, 'ship', 'progress', 'stale writer', null, 1))).toMatchObject({
    code: 'WORKFLOW_REVISION_CONFLICT',
  })
})

test('successful tool results become durable acceptance evidence only after settlement', async () => {
  const { root, kernel, session, workflows, goals } = await fixture()
  await writeFile(join(root, 'verified.txt'), 'verified content', 'utf8')
  await workflows.start(session.id, 'Verify with a real tool result', [
    {
      id: 'verify',
      title: 'Read the verification fixture',
      scope: { readPaths: ['verified.txt'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [
        {
          id: 'read-proof',
          description: 'The declared file is read successfully',
          verifier: { kind: 'tool', toolName: 'read_file', expectedArguments: { path: 'verified.txt' } },
        },
      ],
    },
  ])

  await kernel.submit(
    session.id,
    'verification-read',
    { text: '/tool read_file {"path":"verified.txt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const snapshot = await workflows.get(session.id)
  expect(snapshot.workflow?.focus?.acceptanceChecks[0]).toMatchObject({ status: 'passed' })
  expect(snapshot.workflow?.evidence[0]).toMatchObject({
    source: 'tool',
    outcome: 'passed',
    toolName: 'read_file',
  })
  const events = await kernel.storage.call('events', session.id, 0, 10_000)
  const toolResultIndex = events.findIndex(
    (event) =>
      event.type === 'message.committed' &&
      JSON.stringify(event.data).includes('read_file') &&
      JSON.stringify(event.data).includes('tool_result'),
  )
  const evidenceIndex = events.findIndex(
    (event) =>
      event.type === 'workflow.updated' &&
      typeof event.data === 'object' &&
      event.data !== null &&
      Object.hasOwn(event.data, 'verification'),
  )
  expect(toolResultIndex).toBeGreaterThanOrEqual(0)
  expect(evidenceIndex).toBeGreaterThan(toolResultIndex)

  const itemCompleted = await workflows.checkpoint(
    session.id,
    'verify',
    'complete',
    'The tool evidence is committed',
    null,
    3,
  )
  expect(itemCompleted.workflow?.status).toBe('completed')
  expect((await goals.get(session.id)).goal?.status).toBe('active')
  await goals.update(session.id, 'complete')

  await kernel.close()
  resources.splice(
    resources.findIndex((entry) => entry.kernel === kernel),
    1,
  )
  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  const replayed = await restarted.plugins.get<WorkflowService>('workflow').get(session.id)
  expect(replayed.workflow?.status).toBe('completed')
  expect(replayed.workflow?.evidence).toMatchObject([
    { source: 'tool', outcome: 'passed' },
    { source: 'agent', outcome: 'passed' },
  ])
})

test('three identical verifier failures block the work item instead of retrying forever', async () => {
  const { kernel, session, workflows } = await fixture()
  await workflows.start(session.id, 'Stop repeated failed verification', [
    {
      id: 'verify',
      title: 'Read a required file',
      scope: { readPaths: ['missing.txt'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [
        {
          id: 'missing-proof',
          description: 'The required file can be read',
          verifier: { kind: 'tool', toolName: 'read_file', expectedArguments: { path: 'missing.txt' } },
        },
      ],
    },
  ])

  for (let attempt = 0; attempt < 3; attempt++) {
    await kernel.submit(
      session.id,
      `failed-verification-${attempt}`,
      { text: '/tool read_file {"path":"missing.txt"}', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
  }
  const snapshot = await workflows.get(session.id)
  expect(snapshot.workflow).toMatchObject({ status: 'needs_revision' })
  expect(snapshot.workflow?.focus).toMatchObject({ status: 'blocked' })
  expect(snapshot.workflow?.evidence).toHaveLength(3)
  expect(snapshot.workflow?.evidence.every((entry) => entry.outcome === 'failed')).toBeTrue()

  await kernel.submit(
    session.id,
    'blocked-fourth-attempt',
    { text: '/tool read_file {"path":"missing.txt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await workflows.get(session.id)).workflow?.evidence).toHaveLength(3)
})
