import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createGoalPlanCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-history-host-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'Goal history Host fixture')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'Goal history fixture')
  return { kernel, host, client, workspace, session, goals: createGoalPlanCommandClient(client) }
}

test('authenticated Host/typed Client query reads persistent lifecycle facts, not current Goal or recent Run snapshots', async () => {
  const { kernel, client, session, goals } = await fixture()
  expect(await goals.history({ sessionId: session.id })).toMatchObject({
    items: [],
    preceding: { seq: 0, goal: null },
    nextBeforeSeq: null,
  })
  const first = await goals.execute('goal.create', {
    sessionId: session.id,
    objective: 'Original goal preserved after clear',
    tokenBudget: 1000,
  })
  await goals.execute('goal.set', { sessionId: session.id, status: 'paused', expectedGoalId: first.goal?.goalId })
  await goals.execute('goal.set', { sessionId: session.id, status: 'active', expectedGoalId: first.goal?.goalId })
  await goals.execute('goal.update', { sessionId: session.id, status: 'complete' })
  const second = await goals.execute('goal.create', {
    sessionId: session.id,
    objective: 'The new goal has a different identity',
  })
  await goals.execute('goal.clear', { sessionId: session.id, expectedGoalId: second.goal?.goalId })
  expect((await goals.execute('goal.get', { sessionId: session.id })).goal).toBeNull()
  const before = await kernel.storage.call('session', session.id)
  const snapshot = await kernel.snapshot(session.id)
  const latest = await goals.execute('goal.history', { sessionId: session.id, anchorSeq: snapshot.cursor, limit: 1 })
  expect(latest.items[0]).toMatchObject({ type: 'goal.cleared', goal: null })
  expect(latest.preceding.goal).toMatchObject({
    goalId: second.goal?.goalId,
    objective: 'The new goal has a different identity',
  })
  const all = await goals.history({ sessionId: session.id, anchorSeq: latest.anchorSeq, limit: 100 })
  expect(all.items.map((item) => item.type)).toEqual([
    'goal.created',
    'goal.updated',
    'goal.updated',
    'goal.updated',
    'goal.created',
    'goal.cleared',
  ])
  expect(all.items.map((item) => item.goal?.status ?? null)).toEqual([
    'active',
    'paused',
    'active',
    'complete',
    'active',
    null,
  ])
  expect(all.items[0]?.goal?.objective).toBe('Original goal preserved after clear')
  expect(all.items[3]?.goal?.goalId).toBe(first.goal?.goalId)
  expect(all.items[4]?.goal?.goalId).not.toBe(first.goal?.goalId)
  expect(all.items.every((item) => item.runId === null)).toBe(true)
  expect(all.preceding).toEqual({ seq: 0, goal: null })
  expect(JSON.stringify(all)).not.toMatch(
    /accountedRuns|continuationIntent|progressKeys|blockedAuditRuns|repairKey|trigger/,
  )
  expect(await kernel.storage.call('session', session.id)).toEqual(before)
  expect((await kernel.snapshot(session.id)).runs).toEqual(snapshot.runs)
  const catalog = await client.call('command.catalog', { category: 'agent.goal.plan', limit: 50 })
  expect(catalog.items.find((item) => item.metadata.id === 'goal.history')?.metadata).toMatchObject({
    kind: 'query',
    execution: 'host',
    stateEffect: 'none',
    scope: 'session',
    surfaces: ['api'],
  })
})

test('Host query rejects unauthorized/unknown targets and future anchors; fork has no borrowed parent history', async () => {
  const { client, host, goals, session } = await fixture()
  await goals.execute('goal.create', { sessionId: session.id, objective: 'Parent only' })
  const child = await createWorkspaceSessionCommandClient(client).execute(
    'session.fork',
    { sessionId: session.id },
    { idempotencyKey: crypto.randomUUID() },
  )
  expect(await goals.history({ sessionId: child.id })).toMatchObject({
    sessionId: child.id,
    items: [],
    preceding: { seq: 0, goal: null },
    nextBeforeSeq: null,
  })
  await expect(goals.history({ sessionId: 'unknown-session' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(goals.history({ sessionId: session.id, anchorSeq: 9999 })).rejects.toMatchObject({
    code: 'INVALID_CURSOR',
  })
  await expect(goals.history({ sessionId: session.id, limit: 101 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  const unpaired = new WebSocket(`ws://127.0.0.1:${host.server.port}/rpc`)
  try {
    const denied = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Unauthenticated history request timed out')), 5000)
      unpaired.onopen = () =>
        unpaired.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'command.execute',
            params: {
              protocol: 1,
              requestId: 'unauthenticated-history',
              commandId: 'goal.history',
              commandVersion: 1,
              input: { sessionId: session.id },
            },
          }),
        )
      unpaired.onmessage = (event) => {
        clearTimeout(timer)
        try {
          const parsed = z
            .object({ error: z.object({ data: z.string() }) })
            .parse(JSON.parse(String(event.data)) as unknown)
          resolve(parsed.error.data)
        } catch (error) {
          reject(error)
        }
      }
      unpaired.onerror = () => {
        clearTimeout(timer)
        reject(new Error('Unauthenticated fixture connection failed'))
      }
    })
    expect(denied).toBe('UNAUTHORIZED')
  } finally {
    unpaired.close()
  }
})
