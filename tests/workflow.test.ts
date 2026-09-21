import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService, WorkflowService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture(maxExplorationCalls = 8) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  await kernel.changePlugin('workflow.focus', true, { maxExplorationCalls })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return {
    root,
    kernel,
    session,
    workflows: kernel.plugins.get<WorkflowService>('workflow'),
    goals: kernel.plugins.get<GoalService>('goal'),
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

test('workflow plans activate on the next user run and survive Host restart', async () => {
  const { root, kernel, session, workflows } = await fixture()
  const draft = await workflows.savePlan(session.id, 'Deliver the verified workflow', [userVerifiedItem], null)
  expect(draft.plan).toMatchObject({ revision: 1, phase: 'draft' })

  await kernel.submit(session.id, 'execute-draft', { text: 'Execute the saved plan', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(await workflows.get(session.id)).toMatchObject({
    plan: { revision: 1, phase: 'active' },
    workflow: { status: 'active', planRevision: 1, activeItemId: 'ship' },
  })

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
    plan: { revision: 1, phase: 'active' },
    workflow: { status: 'active', revision: 1 },
  })
})

test('goal completion is gated by Host-recorded acceptance state', async () => {
  const { session, workflows, goals } = await fixture()
  const started = await workflows.start(session.id, 'Finish only after verification', [userVerifiedItem])
  expect(started.workflow?.revision).toBe(1)

  expect(await rejection(goals.update(session.id, 'complete'))).toMatchObject({
    code: 'WORKFLOW_ACCEPTANCE_PENDING',
  })
  const accepted = await workflows.acceptCheck(
    session.id,
    'ship',
    'user-review',
    'accepted',
    'Reviewed in the test',
    1,
    'test-user',
  )
  expect(accepted.workflow?.evidence).toMatchObject([{ source: 'user', actorId: 'test-user', outcome: 'accepted' }])
  const checkpoint = await workflows.checkpoint(session.id, 'ship', 'complete', 'Acceptance is recorded', null, 2)
  expect(checkpoint.workflow?.workItems[0]?.status).toBe('completed')
  const completed = await workflows.complete(session.id, 3)
  expect(completed.workflow?.status).toBe('completed')
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
    1,
  )
  expect(expanded.workflow?.revision).toBe(2)
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
    3,
  )
  expect(checkpoint.workflow).toMatchObject({ revision: 4, explorationCount: 0 })
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
