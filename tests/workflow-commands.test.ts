import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createWorkflowCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  await client.pair(host.pairing.code, 'workflow command test')
  const close = async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
  cleanups.push(close)
  return { root, kernel, session, host, client, commands: createWorkflowCommandClient(client), close }
}

const startInput = (sessionId: string) => ({
  sessionId,
  objective: 'Complete a command-driven workflow',
  items: [
    {
      id: 'ship',
      title: 'Ship the workflow',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [
        {
          id: 'review',
          description: 'A user accepts the result',
          verifier: { kind: 'user' as const },
        },
      ],
    },
  ],
})

test('workflow commands expose the core catalog and preserve start idempotency across restart', async () => {
  const resource = await fixture()
  const { root, kernel, session, host, client, commands } = resource
  const port = host.server.port
  if (!port) throw new Error('Workflow command Host did not bind a port')
  const catalog = await client.call('command.catalog', { category: 'agent.goal.plan', limit: 100 })
  const ids = catalog.items.map((item) => item.metadata.id)
  expect(ids).toContain('workflow.start')
  expect(ids).toContain('workflow.complete')
  expect(ids).toContain('workflow.delegate')

  const input = startInput(session.id)
  const [first, duplicate] = await Promise.all([
    commands.execute('workflow.start', input, { idempotencyKey: 'workflow-one', requestId: 'workflow-first' }),
    commands.execute('workflow.start', input, { idempotencyKey: 'workflow-one', requestId: 'workflow-retry' }),
  ])
  expect(duplicate.workflow?.workflowId).toBe(first.workflow?.workflowId)
  await expect(
    commands.execute(
      'workflow.start',
      { ...input, objective: 'Different objective' },
      { idempotencyKey: 'workflow-one' },
    ),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })

  const accepted = await commands.execute('workflow.acceptCheck', {
    sessionId: session.id,
    itemId: 'ship',
    checkId: 'review',
    decision: 'accepted',
    note: 'Accepted through the authenticated command',
    expectedRevision: 1,
  })
  expect(accepted.workflow?.evidence[0]).toMatchObject({ source: 'user', outcome: 'accepted' })
  const checkpoint = await commands.execute('workflow.checkpoint', {
    sessionId: session.id,
    itemId: 'ship',
    outcome: 'complete',
    summary: 'The required acceptance is durable',
    nextItemId: null,
    expectedRevision: 2,
  })
  const completed = await commands.execute('workflow.complete', {
    sessionId: session.id,
    expectedRevision: checkpoint.workflow!.revision,
  })
  expect(completed.workflow?.status).toBe('completed')

  client.disconnect()
  await host.close()
  await kernel.close()
  cleanups.pop()
  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const restartedHost = await startServer(restarted, { port })
  await client.connect()
  cleanups.push(async () => {
    client.disconnect()
    await restartedHost.close()
    await restarted.close()
    await rm(root, { recursive: true, force: true })
  })
  const replayed = await createWorkflowCommandClient(client).execute('workflow.start', input, {
    idempotencyKey: 'workflow-one',
  })
  expect(replayed.workflow).toMatchObject({ workflowId: first.workflow?.workflowId, status: 'completed' })
})

test('workflow commands reject stale mutations and gate completion', async () => {
  const { session, commands } = await fixture()
  const started = await commands.execute('workflow.start', startInput(session.id), {
    idempotencyKey: 'workflow-two',
  })
  expect(started.workflow?.revision).toBe(1)
  await expect(
    commands.execute('workflow.complete', { sessionId: session.id, expectedRevision: 1 }),
  ).rejects.toMatchObject({ code: 'WORKFLOW_ACCEPTANCE_PENDING' })
  const expanded = await commands.execute('workflow.expandScope', {
    sessionId: session.id,
    itemId: 'ship',
    scope: { readPaths: ['tests'], writePaths: [], tools: ['search_text'] },
    reason: 'Verification needs the test tree',
    expectedRevision: 1,
  })
  expect(expanded.workflow?.revision).toBe(2)
  await expect(
    commands.execute('workflow.checkpoint', {
      sessionId: session.id,
      itemId: 'ship',
      outcome: 'progress',
      summary: 'stale update',
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: 'WORKFLOW_REVISION_CONFLICT' })
})
