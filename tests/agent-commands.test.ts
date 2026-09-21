import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createAgentCommandClient } from '@hbar/client'
import { emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { BudgetService, HarnessDriver } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture(slow = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
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
    'goal.clear',
    'goal.create',
    'goal.get',
    'goal.set',
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
    'workflow.expandScope',
    'workflow.get',
    'workflow.plan.save',
    'workflow.start',
  ])
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
