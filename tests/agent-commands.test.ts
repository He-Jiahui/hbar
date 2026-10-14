import { afterEach, expect, test } from 'bun:test'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { HbarClient, createAgentCommandClient } from '@hbar/client'
import { emptyUsage } from '@hbar/contracts'
import { agentCreateInputSchema } from '@hbar/contracts/commands/agents'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { BudgetService, HarnessDriver } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture(slow = false, noLocalExec = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    noLocalExec,
    secrets: new MemorySecrets(),
    ...(slow
      ? {
          profile: {
            replacements: {
              'driver.pi': definePlugin({
                manifest: {
                  id: 'driver.pi',
                  name: 'Cancellable fixture driver',
                  version: '1.0.0',
                  apiVersion: '^1.0.0',
                  description: 'Waits until child agent cancellation',
                  scope: 'host',
                  required: true,
                  provides: { driver: '1.0.0' },
                  permissions: [],
                },
                apply(ctx) {
                  provide<HarnessDriver>(ctx, 'driver', {
                    run(input) {
                      return new Promise<void>((_resolve, reject) => {
                        input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true })
                      })
                    },
                    summarize: async () => ({ text: 'summary', usage: emptyUsage() }),
                  })
                },
              }),
            },
          },
        }
      : {}),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const parent = await kernel.createSession(workspace.id, 'parent')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  const close = async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
  }
  cleanups.push(async () => {
    await close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'agent command test')
  return { root, kernel, workspace, parent, client, commands: createAgentCommandClient(client), close }
}

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 5_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for agent state')
    await Bun.sleep(10)
  }
}

test('agent commands create one budgeted child session per actor key and recover from events', async () => {
  const resource = await fixture()
  const { root, kernel, workspace, parent, client, commands } = resource
  const catalog = await client.call('command.catalog', { category: 'agent.goal.plan', limit: 50 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual([
    'agent.cancel',
    'agent.create',
    'agent.list',
    'agent.patch.apply',
    'agent.policy.get',
    'agent.policy.set',
    'agent.profiles.list',
    'agent.result.get',
    'goal.clear',
    'goal.create',
    'goal.get',
    'goal.history',
    'goal.set',
    'goal.snapshot',
    'goal.update',
    'mode.get',
    'mode.set',
    'plan.clear',
    'plan.get',
    'plan.update',
    'workflow.acceptCheck',
    'workflow.activate',
    'workflow.checkpoint',
    'workflow.complete',
    'workflow.delegate',
    'workflow.expandScope',
    'workflow.focus.set',
    'workflow.get',
    'workflow.plan.save',
    'workflow.start',
    'workflow.targets.cancel',
    'workflow.targets.dispatch',
    'workflow.targets.reconcile',
  ])
  expect(await commands.execute('agent.profiles.list', {})).toEqual(['explore'])
  const input = {
    parentSessionId: parent.id,
    objective: 'Inspect the child task',
    modelId: 'local-fixture',
    tokenBudget: 500,
    approval: 'deny' as const,
  }
  const [first, duplicate] = await Promise.all([
    commands.execute('agent.create', input, { idempotencyKey: 'child-one', requestId: 'create-one' }),
    commands.execute('agent.create', input, { idempotencyKey: 'child-one', requestId: 'create-retry' }),
  ])
  expect(duplicate.agentId).toBe(first.agentId)
  expect(first.parentSessionId).toBe(parent.id)
  expect((await kernel.storage.call('session', first.sessionId)).parentId).toBe(parent.id)
  expect(await kernel.plugins.get<BudgetService>('budget').get(first.sessionId)).toMatchObject({ limit: 500 })
  let conflict: unknown
  try {
    await commands.execute('agent.create', { ...input, objective: 'different' }, { idempotencyKey: 'child-one' })
  } catch (error) {
    conflict = error
  }
  expect(conflict).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  await kernel.waitForIdle()
  expect(await commands.execute('agent.list', { parentSessionId: parent.id })).toMatchObject({
    items: [{ agentId: first.agentId, status: 'completed', tokenBudget: 500 }],
    nextCursor: null,
  })

  client.disconnect()
  await resource.close()
  cleanups.shift()
  const reopened = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(reopened, { port: 0 })
  const reconnected = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    reconnected.disconnect()
    await host.close()
    await reopened.close()
    await rm(root, { recursive: true, force: true })
  })
  await reconnected.pair(host.pairing.code, 'agent recovery test')
  expect(
    await createAgentCommandClient(reconnected).execute('agent.list', { parentSessionId: parent.id }),
  ).toMatchObject({
    items: [{ agentId: first.agentId, status: 'completed' }],
  })
  expect((await reopened.storage.call('workspace', workspace.id)).id).toBe(workspace.id)
})

test('no-local-exec rejects Agent patch application at the authenticated Host command boundary', async () => {
  const resource = await fixture(false, true)
  try {
    await expect(
      resource.commands.execute(
        'agent.patch.apply',
        { parentSessionId: resource.parent.id, agentId: 'agent-child', planRevision: 1 },
        { idempotencyKey: 'local-disabled-patch', requestId: 'local-disabled-patch' },
      ),
    ).rejects.toMatchObject({ code: 'LOCAL_EXECUTION_DISABLED' })
  } finally {
    await resource.close()
  }
})

test('completed child Agent vetoes budget-only continuation Runs', async () => {
  const resource = await fixture()
  const { kernel, parent, commands } = resource
  const child = await commands.execute(
    'agent.create',
    {
      parentSessionId: parent.id,
      objective: 'Return AGENT-BUDGET-CONTINUE-OK after a bounded read-only check.',
      modelId: 'local-fixture',
      profileId: 'explore',
      tokenBudget: 50_000,
      approval: 'deny',
    },
    { idempotencyKey: 'agent-budget-continuation-veto' },
  )
  await kernel.waitForIdle()
  const snapshot = await kernel.storage.call('snapshot', child.sessionId)
  const budget = await kernel.plugins.get<BudgetService>('budget').get(child.sessionId)
  expect(budget).toMatchObject({ phase: 'active' })
  expect(budget?.remainingTokens).toBeGreaterThan(0)
  expect(snapshot.runs[0]?.status).toBe('completed')
  expect(snapshot.runs).toHaveLength(1)
  expect(snapshot.runs[0]?.input.text).toContain('AGENT-BUDGET-CONTINUE-OK')
  expect(snapshot.runs.some((run) => run.input.text === '')).toBe(false)
  expect(
    (await commands.execute('agent.result.get', { parentSessionId: parent.id, agentId: child.agentId })).status,
  ).toBe('completed')
})

test('Host-owned Explore profile keeps the exact objective and advertises only read tools', async () => {
  const resource = await fixture()
  const { root, kernel, parent, client, commands } = resource
  const objective = 'Find the files responsible for session navigation; do not edit anything.'
  const input = {
    parentSessionId: parent.id,
    objective,
    modelId: 'local-fixture',
    profileId: 'explore' as const,
  }
  const created = await commands.execute('agent.create', input, { idempotencyKey: 'explore-one' })
  expect(created.profileId).toBe('explore')
  expect(created.objective).toBe(objective)
  expect((await commands.execute('agent.create', input, { idempotencyKey: 'explore-one' })).agentId).toBe(
    created.agentId,
  )
  await expect(
    commands.execute('agent.create', { ...input, profileId: undefined }, { idempotencyKey: 'explore-one' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  await kernel.waitForIdle()
  const snapshot = await kernel.storage.call('snapshot', created.sessionId)
  expect(snapshot.runs[0]?.input).toMatchObject({
    text: objective,
    approval: kernel.permissionMode(),
    source: 'system',
  })
  const requests = (await kernel.storage.call('events', created.sessionId, 0)).filter(
    (event) => event.type === 'request.started',
  )
  const request = z
    .object({ request: z.object({ system: z.string(), toolNames: z.array(z.string()) }) })
    .parse(requests[0]?.data).request
  expect(request.system).toContain('You are an Explore child agent.')
  expect(request.toolNames).toContain('read_file')
  expect(request.toolNames).toContain('search_text')
  expect(request.toolNames).not.toContain('write_file')
  expect(request.toolNames).not.toContain('shell')
  expect((await commands.execute('agent.list', { parentSessionId: parent.id })).items[0]?.profileId).toBe('explore')
  await expect(
    client.call('command.execute', {
      protocol: COMMAND_PROTOCOL_VERSION,
      requestId: 'invalid-explore-profile',
      commandId: 'agent.create',
      commandVersion: 1,
      idempotencyKey: 'invalid-explore-profile',
      input: { ...input, profileId: 'unknown' },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect((await commands.execute('agent.list', { parentSessionId: parent.id })).items).toHaveLength(1)
  expect(agentCreateInputSchema.safeParse({ ...input, profileId: 'unknown' }).success).toBe(false)
  expect(
    agentCreateInputSchema.safeParse({
      ...input,
      patchTask: {
        itemId: 'unrelated-workflow',
        planRevision: 1,
        scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
        acceptanceChecks: [],
      },
    }).success,
  ).toBe(false)

  client.disconnect()
  await resource.close()
  cleanups.shift()
  const reopened = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(reopened, { port: 0 })
  const reconnected = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    reconnected.disconnect()
    await host.close()
    await reopened.close()
    await rm(root, { recursive: true, force: true })
  })
  await reconnected.pair(host.pairing.code, 'explore profile recovery test')
  expect(
    (await createAgentCommandClient(reconnected).execute('agent.list', { parentSessionId: parent.id })).items[0],
  ).toMatchObject({ agentId: created.agentId, profileId: 'explore', objective })
})

test('Explore profile does not gain write access even when its child Run requests allow', async () => {
  const { root, kernel, parent, commands } = await fixture()
  const child = await commands.execute(
    'agent.create',
    {
      parentSessionId: parent.id,
      objective: '/tool write_file {"path":"blocked.txt","text":"should not exist"}',
      modelId: 'local-fixture',
      profileId: 'explore',
      approval: 'allow',
    },
    { idempotencyKey: 'explore-write-denied' },
  )
  await kernel.waitForIdle()
  await expect(access(join(root, 'blocked.txt'))).rejects.toThrow()
  const events = await kernel.storage.call('events', child.sessionId, 0)
  const requests = events
    .filter((event) => event.type === 'request.started')
    .map((event) => z.object({ request: z.object({ toolNames: z.array(z.string()) }) }).parse(event.data).request)
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.every((request) => !request.toolNames.includes('write_file'))).toBe(true)
  expect(
    (await commands.execute('agent.result.get', { parentSessionId: parent.id, agentId: child.agentId })).profileId,
  ).toBe('explore')
})

test('cancelling a child agent propagates through its descendant agent sessions', async () => {
  const { kernel, parent, commands } = await fixture(true)
  const rootAgent = await commands.execute(
    'agent.create',
    { parentSessionId: parent.id, objective: 'root child', modelId: 'local-fixture', approval: 'deny' },
    { idempotencyKey: 'root-agent' },
  )
  const nested = await commands.execute(
    'agent.create',
    { parentSessionId: rootAgent.sessionId, objective: 'nested child', modelId: 'local-fixture', approval: 'deny' },
    { idempotencyKey: 'nested-agent' },
  )
  await until(async () => {
    const root = (await commands.execute('agent.list', { parentSessionId: parent.id })).items[0]
    const child = (await commands.execute('agent.list', { parentSessionId: rootAgent.sessionId })).items[0]
    return root?.status === 'running' && child?.status === 'running'
  })
  const cancelled = await commands.execute('agent.cancel', { parentSessionId: parent.id, agentId: rootAgent.agentId })
  expect(['cancelRequested', 'cancelled']).toContain(cancelled.status)
  await kernel.waitForIdle()
  expect((await commands.execute('agent.list', { parentSessionId: parent.id })).items[0]).toMatchObject({
    agentId: rootAgent.agentId,
    status: 'cancelled',
  })
  expect((await commands.execute('agent.list', { parentSessionId: rootAgent.sessionId })).items[0]).toMatchObject({
    agentId: nested.agentId,
    status: 'cancelled',
  })
  await expect(
    commands.execute('agent.cancel', { parentSessionId: nested.sessionId, agentId: rootAgent.agentId }),
  ).rejects.toMatchObject({ code: 'AGENT_NOT_FOUND' })
})
