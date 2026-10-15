import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { HbarClient, createAgentCommandClient, createBudgetCommandClient } from '@hbar/client'
import { MemorySecrets } from '@hbar/kernel'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'

async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 20_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Agent budget process fixture did not settle')
    await Bun.sleep(20)
  }
}

async function rejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected rejection')
}

async function worktreeEntries(): Promise<string[]> {
  const root = join(process.cwd(), '.hbar-worktrees')
  return existsSync(root) ? (await readdir(root)).sort() : []
}

test('paired Agent commands validate configured budgets through real managed owners before child or worktree creation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-process-agent-budget-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  let storage: Storage | undefined
  let runtime: ProcessHostRuntime | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  let failed = false
  let primary: unknown
  const cleanup: unknown[] = []
  try {
    await ensurePathLayout(layout)
    storage = new Storage(layout.database, layout)
    await storage.call('ready')
    await storage.call('setPlugin', 'budget.codex', true, { maxLimit: 1_000, autoContinue: false })
    await storage.call('setPlugin', 'goal.codex', true, { autoContinue: false })
    await storage.close()
    storage = undefined
    runtime = await ProcessHostRuntime.create({
      layout,
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    const managed = runtime
    host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'Agent budget process fixture')
    await client.connect()
    const agents = createAgentCommandClient(client)
    const budgets = createBudgetCommandClient(client)
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected fixture workspace')
    const parent = await runtime.storage.call('createSession', workspace.id)
    const input = { parentSessionId: parent.id, objective: '/slow', modelId: 'local-fixture' }
    const beforeSessions = (await runtime.storage.call('sessions')).map((session) => session.id).sort()
    const beforeWorktrees = await worktreeEntries()
    for (const patch of [false, true]) {
      const invalid = {
        ...input,
        tokenBudget: 1_001,
        ...(patch
          ? {
              patchTask: {
                itemId: 'slice',
                planRevision: 1,
                scope: { readPaths: ['.'], writePaths: ['owned'], tools: [] },
                acceptanceChecks: [],
              },
            }
          : {}),
      }
      const options = { idempotencyKey: patch ? 'invalid-patch' : 'invalid-normal' }
      expect(await rejection(agents.execute('agent.create', invalid, options))).toMatchObject({
        code: 'BUDGET_INVALID',
      })
      // Rejected requests have no durable child receipt to turn into a different failed result on retry.
      expect(await rejection(agents.execute('agent.create', invalid, options))).toMatchObject({
        code: 'BUDGET_INVALID',
      })
    }
    expect((await runtime.storage.call('sessions')).map((session) => session.id).sort()).toEqual(beforeSessions)
    expect(
      (await runtime.storage.call('events', parent.id, 0, 1_000)).filter(
        (event) => event.type === 'agent.childCreated',
      ),
    ).toEqual([])
    expect(await worktreeEntries()).toEqual(beforeWorktrees)
    expect((await agents.execute('agent.list', { parentSessionId: parent.id })).items).toEqual([])

    const valid = { ...input, tokenBudget: 1_000 }
    const options = { idempotencyKey: 'valid-child' }
    const created = await agents.execute('agent.create', valid, options)
    expect(created.status).not.toBe('failed')
    const runId = created.runId
    if (!runId) throw new Error('Expected accepted child Run')
    await until(async () => (await managed.storage.call('runtimeExecutionRead', runId))?.state === 'active')
    await agents.execute('agent.cancel', { parentSessionId: parent.id, agentId: created.agentId })
    await until(async () => (await managed.storage.call('runtimeExecutionRead', runId))?.state === 'released')
    expect(await budgets.execute('session.getBudget', { sessionId: created.sessionId })).toMatchObject({ limit: 1_000 })
    expect((await agents.execute('agent.create', valid, options)).agentId).toBe(created.agentId)
    expect(await rejection(agents.execute('agent.create', { ...valid, tokenBudget: 999 }, options))).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    })
    await runtime.waitForIdle(20_000)
    expect((await runtime.storage.call('run', runId)).status).toBe('cancelled')
    expect(runtime.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
    expect(
      runtime
        .snapshot()
        .units.flatMap((unit) => unit.generations)
        .every((generation) => generation.references.runs === 0 && generation.references.resources === 0),
    ).toBe(true)
    expect((await runtime.storage.call('sessions')).length).toBe(beforeSessions.length + 1)
    expect(await worktreeEntries()).toEqual(beforeWorktrees)
  } catch (error) {
    failed = true
    primary = error
  }
  try {
    client?.disconnect()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await host?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await runtime?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await storage?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    const resolved = resolve(root)
    if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith('hbar-process-agent-budget-'))
      throw new Error('Unsafe process fixture cleanup path')
    await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch (error) {
    cleanup.push(error)
  }
  if (failed) {
    if (cleanup.length)
      throw new AggregateError([primary, ...cleanup], 'Agent budget process scenario and cleanup failed', {
        cause: primary,
      })
    throw primary
  }
  if (cleanup.length) throw new AggregateError(cleanup, 'Agent budget process cleanup failed')
}, 120_000)
