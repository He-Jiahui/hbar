import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { workflowStateSchema } from '@hbar/contracts'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
async function rejection(operation: Promise<unknown>) {
  // Await worker-backed I/O before matching the rejection (Bun's async matcher can stall this wait).
  try {
    await operation
    throw new Error('Expected rejection')
  } catch (error) {
    return error
  }
}
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

type WorkspaceExpectation = { kind: 'textContains'; value: string } | { kind: 'sha256'; value: string }

async function fixture(
  initialVerifier: 'tool' | 'workspace' = 'tool',
  workspaceExpectation: WorkspaceExpectation = { kind: 'textContains', value: 'correct proof' },
  initialTools = ['read_file', 'write_file'],
  deferInitialFocus = false,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-proof-freshness-'))
  await writeFile(join(root, 'proof.txt'), 'correct proof')
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
  await kernel.setPermissionMode('allow')
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  const plans = kernel.plugins.get<PlanService>('plan')
  const goals = kernel.plugins.get<GoalService>('goal')
  const workflows = kernel.plugins.get<WorkflowService>('workflow')
  await goals.create(session.id, 'Keep the proof correct until completion')
  const plan = await plans.update(session.id, [{ step: 'Produce verified proof', status: 'in_progress' }])
  const focus = async (tools = initialTools, verifier: 'tool' | 'workspace' = initialVerifier) =>
    workflows.focus(
      session.id,
      0,
      {
        id: 'proof',
        title: 'Produce verified proof',
        scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools },
        acceptanceChecks: [
          {
            id: 'content',
            description: 'Current proof is correct',
            verifier:
              verifier === 'workspace'
                ? {
                    kind: 'workspace',
                    path: 'proof.txt',
                    expectation: workspaceExpectation,
                  }
                : {
                    kind: 'tool',
                    toolName: tools.includes('delayed_read') ? 'delayed_read' : 'read_file',
                    result: { kind: 'textContains', value: 'correct proof' },
                  },
          },
        ],
      },
      'agent',
      plan.revision,
    )
  // Publish the canonical item once, after custom tools exist; changing scope on
  // the same active canonical Plan revision is intentionally rejected.
  if (!deferInitialFocus) await focus()
  const run = async (name: string, args: Record<string, unknown>) => {
    await kernel.submit(
      session.id,
      crypto.randomUUID(),
      { text: `/tool ${name} ${JSON.stringify(args)}`, images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
  }
  const check = async () => (await workflows.get(session.id)).workflow!.focus!.acceptanceChecks[0]!
  const complete = async () =>
    workflows.checkpoint(
      session.id,
      'proof',
      'complete',
      'Current proof verified',
      null,
      (await workflows.get(session.id)).workflow!.revision,
    )
  return { root, kernel, session, workflows, goals, plans, focus, run, check, complete }
}

async function replaceReadFileResult(
  kernel: Awaited<ReturnType<typeof Kernel.create>>,
  result: { text: string; details?: unknown; content?: { type: 'image'; data: string; mimeType: string }[] },
) {
  await kernel.changePlugin('tools.workspace', false)
  let calls = 0
  kernel.tools.register({
    name: 'read_file',
    description: 'Fixture read result',
    inputSchema: z.object({ path: z.string() }),
    effect: 'read',
    workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'read' }] },
    execute: async () => {
      calls++
      return result
    },
  })
  return () => calls
}

test('workspace verifiers accept absolute full-file reads and reject ranged reads', async () => {
  const { root, run, check } = await fixture('workspace')

  await run('read_file', { path: join(root, 'proof.txt'), startLine: 1, lineCount: 1 })
  expect((await check()).status).toBe('pending')

  await run('read_file', { path: join(root, 'proof.txt') })
  expect((await check()).status).toBe('passed')
})

test('workspace verifiers fail when a complete read contains the wrong text', async () => {
  const { root, run, check } = await fixture('workspace')
  await run('read_file', { path: join(root, 'proof.txt') })
  expect((await check()).status).toBe('passed')

  await run('write_file', { path: 'proof.txt', text: 'wrong proof' })
  await run('read_file', { path: join(root, 'proof.txt') })
  expect((await check()).status).toBe('failed')
})

test('outside workspace reads do not produce workspace verifier evidence', async () => {
  const { root, run, check } = await fixture('workspace')
  await run('read_file', { path: join(root, '..', 'outside-proof.txt') })
  expect((await check()).status).toBe('pending')
})

test('workspace text verifiers reject truncated read results', async () => {
  const { root, kernel, run, check } = await fixture('workspace')
  const calls = await replaceReadFileResult(kernel, { text: 'correct proof', details: { truncated: true } })
  await run('read_file', { path: join(root, 'proof.txt') })
  expect(calls()).toBe(1)
  expect((await check()).status).toBe('pending')
})

test('workspace text verifiers reject image-only read results', async () => {
  const { root, kernel, run, check } = await fixture('workspace')
  const calls = await replaceReadFileResult(kernel, {
    text: 'correct proof',
    content: [{ type: 'image', data: 'AA==', mimeType: 'image/png' }],
  })
  await run('read_file', { path: join(root, 'proof.txt') })
  expect(calls()).toBe(1)
  expect((await check()).status).toBe('pending')
})

test('workspace sha256 verifiers pass the complete file and fail a changed file', async () => {
  const { root, run, check } = await fixture('workspace', {
    kind: 'sha256',
    value: createHash('sha256').update('correct proof').digest('hex'),
  })
  await run('read_file', { path: join(root, 'proof.txt') })
  expect((await check()).status).toBe('passed')

  await writeFile(join(root, 'proof.txt'), 'changed proof')
  await run('read_file', { path: join(root, 'proof.txt') })
  expect((await check()).status).toBe('failed')
})

test('a later write invalidates earlier verification and completion requires a new passing read', async () => {
  const { run, check, complete, goals, session } = await fixture()
  await run('read_file', { path: 'proof.txt' })
  expect((await check()).status).toBe('passed')
  await run('write_file', { path: 'proof.txt', text: 'broken proof' })
  expect(await check()).toMatchObject({ status: 'pending', evidenceId: null })
  expect(await rejection(complete())).toMatchObject({ code: 'WORKFLOW_ACCEPTANCE_PENDING' })
  await run('read_file', { path: 'proof.txt' })
  expect((await check()).status).toBe('failed')
  await run('write_file', { path: 'proof.txt', text: 'correct proof again' })
  await run('read_file', { path: 'proof.txt' })
  expect((await check()).status).toBe('passed')
  expect((await complete()).workflow?.status).toBe('completed')
  expect((await goals.update(session.id, 'complete')).goal?.status).toBe('complete')
})

test('stable focus checkpoint survives read/write bookkeeping but never accepts stale proof', async () => {
  const { session, workflows, run, check } = await fixture()
  const baseline = (await workflows.get(session.id)).workflow!
  const checkpoint = {
    itemId: 'proof',
    outcome: 'complete',
    summary: 'Verified current proof',
    expectedFocusRevision: baseline.focusRevision,
    expectedPlanRevision: baseline.planRevision,
  }
  await run('read_file', { path: 'proof.txt' })
  await run('write_file', { path: 'proof.txt', text: 'bad proof' })
  await run('workflow_checkpoint', checkpoint)
  expect((await workflows.get(session.id)).workflow?.status).not.toBe('completed')
  expect((await check()).status).toBe('pending')
  await run('write_file', { path: 'proof.txt', text: 'correct proof' })
  await run('read_file', { path: 'proof.txt' })
  await workflows.expandScope(
    session.id,
    'proof',
    { readPaths: ['extra.txt'], writePaths: [], tools: [] },
    'Add an authorized read prefix without replacing the focus',
    (await workflows.get(session.id)).workflow!.revision,
  )
  await run('workflow_checkpoint', checkpoint)
  expect((await workflows.get(session.id)).workflow?.status).toBe('completed')
})

test('stable focus checkpoint rejects replacement focus and changed Plan while numeric CAS stays strict', async () => {
  const { session, workflows, plans, focus, run } = await fixture()
  const baseline = (await workflows.get(session.id)).workflow!
  const checkpoint = {
    itemId: 'proof',
    outcome: 'complete',
    summary: 'Verified current proof',
    expectedFocusRevision: baseline.focusRevision,
    expectedPlanRevision: baseline.planRevision,
  }
  await run('read_file', { path: 'proof.txt' })
  expect(
    await rejection(
      workflows.checkpoint(session.id, 'proof', 'complete', 'Old numeric version', null, baseline.revision),
    ),
  ).toMatchObject({ code: 'WORKFLOW_REVISION_CONFLICT' })
  await focus()
  await run('read_file', { path: 'proof.txt' })
  await run('workflow_checkpoint', checkpoint)
  expect((await workflows.get(session.id)).workflow?.status).not.toBe('completed')
  const current = (await workflows.get(session.id)).workflow!
  await plans.update(session.id, [{ step: 'New objective', status: 'in_progress' }])
  await run('workflow_checkpoint', {
    ...checkpoint,
    expectedFocusRevision: current.focusRevision,
    expectedPlanRevision: current.planRevision,
  })
  expect((await workflows.get(session.id)).workflow?.status).not.toBe('completed')
})

test('completion cannot race an in-flight mutation and a partial failure cannot reuse old proof', async () => {
  const { root, kernel, session, workflows, focus, run, check, complete } = await fixture(
    'tool',
    { kind: 'textContains', value: 'correct proof' },
    ['read_file', 'delayed_write'],
    true,
  )
  const entered = Promise.withResolvers<void>()
  const finish = Promise.withResolvers<void>()
  kernel.tools.register({
    name: 'delayed_write',
    description: 'Fixture partial mutation',
    inputSchema: z.object({ path: z.string() }),
    effect: 'write',
    workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'write' }] },
    execute: async () => {
      await writeFile(join(root, 'proof.txt'), 'partially changed')
      entered.resolve()
      await finish.promise
      throw new Error('Fixture failed after changing the file')
    },
  })
  await focus()
  await run('read_file', { path: 'proof.txt' })
  await kernel.submit(
    session.id,
    'partial-write',
    { text: '/tool delayed_write {"path":"proof.txt"}', images: [] },
    'local-fixture',
  )
  try {
    await entered.promise
    expect(await rejection(complete())).toMatchObject({ code: 'WORKFLOW_TOOL_IN_FLIGHT' })
    expect(await rejection(focus(['read_file']))).toMatchObject({ code: 'WORKFLOW_TOOL_IN_FLIGHT' })
    expect(await check()).toMatchObject({ status: 'pending', evidenceId: null })
  } finally {
    finish.resolve()
    await kernel.waitForIdle()
  }
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('partially changed')
  expect(await rejection(complete())).toMatchObject({ code: 'WORKFLOW_ACCEPTANCE_PENDING' })
  expect((await workflows.get(session.id)).workflow?.status).not.toBe('completed')
})

test('denied mutations preserve valid evidence because execution never starts', async () => {
  const { kernel, run, check } = await fixture()
  await run('read_file', { path: 'proof.txt' })
  const before = await check()
  await kernel.setPermissionMode('deny')
  await run('write_file', { path: 'proof.txt', text: 'not allowed' })
  expect(await check()).toEqual(before)
})

test('a late read result cannot validate a replacement focus', async () => {
  const { kernel, session, focus, check } = await fixture(
    'tool',
    { kind: 'textContains', value: 'correct proof' },
    ['delayed_read'],
    true,
  )
  const entered = Promise.withResolvers<void>()
  const finish = Promise.withResolvers<void>()
  kernel.tools.register({
    name: 'delayed_read',
    description: 'Fixture late read',
    inputSchema: z.object({}),
    effect: 'read',
    workspaceAccess: { kind: 'none' },
    execute: async () => {
      entered.resolve()
      await finish.promise
      return { text: 'correct proof' }
    },
  })
  await focus()
  await kernel.submit(session.id, 'late-read', { text: '/tool delayed_read {}', images: [] }, 'local-fixture')
  try {
    await entered.promise
    await focus(['delayed_read'])
  } finally {
    finish.resolve()
    await kernel.waitForIdle()
  }
  expect(await check()).toMatchObject({ status: 'pending', evidenceId: null })
})

test('pre-execution observers cannot change the approved arguments or execute after failing', async () => {
  const { root, kernel, session, run } = await fixture()
  const stopTamper = kernel.hooks.on('tool.executing', (event) => {
    if (event.name === 'write_file') event.args.path = 'unapproved.txt'
    return event
  })
  await run('write_file', { path: 'proof.txt', text: 'approved target' })
  await stopTamper()
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('approved target')
  expect(await Bun.file(join(root, 'unapproved.txt')).exists()).toBe(false)
  kernel.hooks.on('tool.executing', () => {
    throw new Error('Fixture execution guard failed')
  })
  await run('write_file', { path: 'proof.txt', text: 'must not execute' })
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('approved target')
  expect(
    (await kernel.snapshot(session.id)).messages
      .flatMap((message) => message.content)
      .some(
        (block) => block.type === 'tool_result' && block.isError && block.text === 'Fixture execution guard failed',
      ),
  ).toBe(true)
})

test('restart retains invalid proof and permits bounded focus repair without replaying the mutation', async () => {
  const { root, kernel, session, run } = await fixture()
  await run('read_file', { path: 'proof.txt' })
  await run('write_file', { path: 'proof.txt', text: 'interrupted change' })
  const records = await kernel.storage.call('events', session.id, 0, 10000)
  const started = records.findLast(
    (event) =>
      event.type === 'workflow.updated' &&
      z.object({ verificationInvalidated: z.object({ callId: z.string() }) }).safeParse(event.data).success,
  )
  if (!started) throw new Error('Missing persisted pre-execution invalidation')
  const interrupted = z.object({ workflow: workflowStateSchema }).parse(started.data).workflow
  expect(interrupted.pendingMutations).toHaveLength(1)
  // Restore the actual pre-settlement snapshot to simulate a process loss at this point.
  const latest = await kernel.plugins.get<WorkflowService>('workflow').get(session.id)
  await kernel.storage.call('append', session.id, 'workflow.updated', {
    workflow: { ...interrupted, revision: latest.workflow!.revision + 1 },
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
  const workflows = restarted.plugins.get<WorkflowService>('workflow')
  const restored = await workflows.get(session.id)
  expect(restored.workflow).toMatchObject({ status: 'needs_revision', pendingMutations: [] })
  expect(restored.workflow?.focus?.acceptanceChecks[0]).toMatchObject({ status: 'pending', evidenceId: null })
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('interrupted change')
  const plan = await restarted.plugins.get<PlanService>('plan').get(session.id)
  await workflows.focus(
    session.id,
    0,
    {
      id: 'proof',
      title: 'Inspect actual outcome',
      scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [
        {
          id: 'content',
          description: 'Verify actual contents',
          verifier: { kind: 'tool', toolName: 'read_file', result: { kind: 'textContains', value: 'correct proof' } },
        },
      ],
    },
    'agent',
    plan!.revision,
  )
  await restarted.submit(
    session.id,
    'inspect-after-restart',
    { text: '/tool read_file {"path":"proof.txt"}', images: [] },
    'local-fixture',
  )
  await restarted.waitForIdle()
  expect((await workflows.get(session.id)).workflow?.focus?.acceptanceChecks[0]?.status).toBe('failed')
})

test('clearing a Goal during a mutation does not leave the cancelled workflow permanently locked', async () => {
  const { kernel, session, goals, workflows, focus } = await fixture(
    'tool',
    { kind: 'textContains', value: 'correct proof' },
    ['delayed_change'],
    true,
  )
  const entered = Promise.withResolvers<void>()
  const finish = Promise.withResolvers<void>()
  kernel.tools.register({
    name: 'delayed_change',
    description: 'Fixture in-flight mutation',
    inputSchema: z.object({}),
    effect: 'write',
    workspaceAccess: { kind: 'none' },
    execute: async () => {
      entered.resolve()
      await finish.promise
      return { text: 'settled' }
    },
  })
  await focus()
  await kernel.submit(
    session.id,
    'clear-during-write',
    { text: '/tool delayed_change {}', images: [] },
    'local-fixture',
  )
  try {
    await entered.promise
    await goals.clear(session.id)
    expect((await workflows.get(session.id)).workflow?.status).toBe('cancelled')
  } finally {
    finish.resolve()
    await kernel.waitForIdle()
  }
  expect((await workflows.get(session.id)).workflow).toMatchObject({ status: 'cancelled', pendingMutations: [] })
  await goals.create(session.id, 'A new authorized task')
  const plan = await kernel.plugins
    .get<PlanService>('plan')
    .update(session.id, [{ step: 'Inspect the file', status: 'in_progress' }])
  expect(
    (
      await workflows.focus(
        session.id,
        0,
        {
          id: 'new',
          title: 'Inspect the file',
          scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] },
          acceptanceChecks: [],
        },
        'agent',
        plan.revision,
      )
    ).workflow?.status,
  ).toBe('active')
})
