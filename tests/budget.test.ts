import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { BudgetService } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const resources: Array<{ root: string; kernel: Kernel; close?: () => Promise<void> }> = []

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.close?.()
    await resource.kernel.close()
    await rm(resource.root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-budget-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { root, kernel, session }
}

test('budget accounts completed runs, blocks exhausted runs, and restores after restart', async () => {
  const { root, kernel, session } = await fixture()
  const budget = kernel.plugins.get<BudgetService>('budget')
  const created = await budget.set(session.id, 1)
  expect(created.phase).toBe('active')

  const run = await kernel.submit(session.id, 'budget-run', { text: 'hello', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const exhausted = await budget.get(session.id)
  expect(exhausted?.usedTokens).toBeGreaterThan(0)
  expect(exhausted?.phase).toBe('exhausted')
  const blockedRun = await kernel.submit(session.id, 'blocked-run', { text: 'second', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
  expect((await kernel.storage.call('run', blockedRun.id)).status).toBe('failed')

  const increased = await budget.set(session.id, exhausted!.usedTokens + 100)
  expect(increased.phase).toBe('active')
  expect(increased.remainingTokens).toBe(100)

  await kernel.close()
  const index = resources.findIndex((resource) => resource.kernel === kernel)
  if (index >= 0) resources.splice(index, 1)
  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  expect((await restarted.plugins.get<BudgetService>('budget').get(session.id))?.budgetId).toBe(created.budgetId)
})

test('budget RPC exposes set, get, and clear through the authenticated client', async () => {
  const { kernel, session } = await fixture()
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  resources[0]!.close = async () => {
    client.disconnect()
    await host.close()
  }
  await client.pair(host.pairing.code, 'budget test')
  const created = await client.call('budget.set', { sessionId: session.id, limit: 500 })
  expect(created.limit).toBe(500)
  expect((await client.call('budget.get', { sessionId: session.id }))?.budgetId).toBe(created.budgetId)
  expect(await client.call('budget.clear', { sessionId: session.id })).toEqual({ cleared: true })
  expect(await client.call('budget.get', { sessionId: session.id })).toBeNull()
})
