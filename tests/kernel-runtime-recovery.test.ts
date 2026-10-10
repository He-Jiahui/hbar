import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'
import { definePlugin, provide, service, type HarnessDriver, type GoalService, type BudgetService } from '@hbar/plugin-sdk'
import { emptyUsage, providerSchema, type Run } from '@hbar/contracts'

const resources: { root: string; kernel: Kernel; storage: Storage }[] = []
afterEach(async () => {
  for (const entry of resources.splice(0)) {
    await entry.kernel.close()
    await entry.storage.close()
    await rm(entry.root, { recursive: true, force: true })
  }
})
async function fixture(source: 'user' | 'goal' = 'user') {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-recovery-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  await storage.call('saveProvider', providerSchema.parse({ id: 'fixture', name: 'Fixture', protocol: 'mock', baseUrl: 'http://127.0.0.1', model: 'fixture', imageInput: true, reasoning: true }))
  const workspace = await storage.call('createWorkspace', root, 'fixture')
  const session = await storage.call('createSession', workspace.id)
  const executions: Run[] = []
  const histories: string[][] = []
  const driver = definePlugin({
    manifest: { id: 'driver.pi', name: 'Recovery fixture', description: 'Verify preserved context', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', provides: { driver: '1.0.0' }, requires: { goal: '^1.0.0' }, permissions: [] },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          executions.push(input.run)
          histories.push(input.request.messages.flatMap(message => message.content.flatMap(block => block.type === 'text' || block.type === 'tool_result' ? [block.text] : [])))
          if (source === 'goal') await service<GoalService>(ctx, 'goal').update(input.session.id, 'complete', input.run.id)
          await input.commit('assistant', [{ type: 'text', text: 'Recovered remaining work' }])
        },
        summarize: async () => ({ text: '', usage: emptyUsage() }),
      })
    },
  })
  const port: StoragePort = { call: (method, ...args) => storage.call(method, ...args), close: async () => {} }
  const kernel = await Kernel.create({ home: join(root, 'data'), demo: true, lifecycle: 'managed', secrets: new MemorySecrets(), profile: { createStorage: async () => port, replacements: { 'driver.pi': driver } } })
  resources.push({ root, kernel, storage })
  const goal = source === 'goal' ? await kernel.plugins.get<GoalService>('goal').create(session.id, 'Finish the remaining work', 100) : null
  const original = await kernel.submit(session.id, 'original', { text: 'original user request', images: [], source }, 'fixture')
  await storage.call('claim', session.id)
  await storage.call('commit', session.id, original.id, 'user', [{ type: 'text', text: 'original user request' }])
  if (goal?.goal) await storage.call('append', session.id, 'goal.run_bound', { accounting: { goalId: goal.goal.goalId, sessionId: session.id, startedAt: Date.now(), usageThroughSeq: 0, tokensAccounted: 0, timeAccounted: 0 } }, original.id)
  return { root, storage, kernel, session, original, goal, executions, histories }
}

for (const source of ['user', 'goal'] as const) test(`${source} recovery retains one user message and one settled effect across duplicate fault notifications`, async () => {
  const f = await fixture(source)
  await f.storage.call('commit', f.session.id, f.original.id, 'assistant', [{ type: 'tool_call', callId: 'written', name: 'write_file', args: { path: 'result' } }])
  await f.storage.call('toolStart', f.session.id, f.original.id, 'written', 'write_file', { path: 'result' })
  await f.storage.call('commit', f.session.id, f.original.id, 'tool', [{ type: 'tool_result', callId: 'written', name: 'write_file', text: 'The write committed once', isError: false }])
  const [a, b] = await Promise.all([f.kernel.recoverRuns([f.original.id]), f.kernel.recoverRuns([f.original.id])])
  const first = a[0], second = b[0]
  if (!first?.run || !second) throw new Error('Expected durable recovery records')
  expect(first.recoveryId).toBe(second.recoveryId)
  expect(a[0]?.run?.recovery).toMatchObject({ attempt: 1, predecessorRunId: f.original.id })
  await f.kernel.activate()
  await f.kernel.waitForIdle()
  const snapshot = await f.storage.call('snapshot', f.session.id)
  expect(snapshot.messages.filter(message => message.role === 'user')).toHaveLength(1)
  expect(snapshot.messages.flatMap(message => message.content).filter(block => block.type === 'tool_result' && block.callId === 'written')).toHaveLength(1)
  expect(f.executions).toHaveLength(1)
  expect(f.histories[0]).toContain('The write committed once')
  expect((await f.storage.call('run', f.original.id)).status).toBe('interrupted')
  expect((await f.storage.call('run', a[0]!.run!.id)).status).toBe('completed')
  expect((await f.storage.call('runtimeRecoveryChain', a[0]!.chain.chainId))?.status).toBe('settled')
})

test('recovery waits for missing models and changed permissions, then reconciles the same recovery identity', async () => {
  const f = await fixture()
  await f.storage.call('deleteProvider', 'fixture')
  const records = await f.kernel.recoverRuns([f.original.id])
  const identity = records[0]?.recoveryId
  if (!identity) throw new Error('Expected a recovery identity')
  expect(records[0]?.chain).toMatchObject({ status: 'waiting', reasonCode: 'MODEL_NOT_FOUND' })
  expect(records[0]?.run).toBeNull()
  await f.storage.call('saveProvider', providerSchema.parse({ id: 'fixture', name: 'Fixture', protocol: 'mock', baseUrl: 'http://127.0.0.1', model: 'fixture' }))
  await f.kernel.setPermissionMode('allow')
  expect((await f.kernel.resumeRecovery(f.original.id)).chain.reasonCode).toBe('PERMISSION_CHANGED')
  expect(f.executions).toHaveLength(0)
  await f.kernel.setPermissionMode('ask')
  const resumed = await f.kernel.resumeRecovery(f.original.id)
  expect(resumed.recoveryId).toBe(identity)
  expect(resumed.run).not.toBeNull()
  await f.kernel.activate()
  await f.kernel.waitForIdle()
  expect(f.executions).toHaveLength(1)
})

test('paused Goal and exhausted budgets cannot automatically resume the interrupted work', async () => {
  const f = await fixture('goal')
  await f.kernel.plugins.get<GoalService>('goal').set(f.session.id, { status: 'paused' })
  const paused = await f.kernel.recoverRuns([f.original.id])
  expect(paused[0]?.chain.reasonCode).toBe('GOAL_PAUSED')
  expect(paused[0]?.run).toBeNull()
  await f.kernel.plugins.get<GoalService>('goal').set(f.session.id, { status: 'active' })
  await f.kernel.plugins.get<BudgetService>('budget').set(f.session.id, 1)
  await f.storage.call('append', f.session.id, 'usage.recorded', { ...emptyUsage(), output: 2 }, f.original.id)
  const budget = await f.kernel.resumeRecovery(f.original.id)
  expect(budget.run).toBeNull()
  expect(budget.chain.reasonCode).toMatch(/BUDGET/)
  expect(f.executions).toHaveLength(0)
})

test('an unknown side effect preserves waiting without driver execution', async () => {
  const f = await fixture()
  await f.storage.call('toolStart', f.session.id, f.original.id, 'unknown', 'write_file', {})
  const unknown = await f.kernel.recoverRuns([f.original.id])
  expect(unknown[0]?.chain.reasonCode).toBe('EFFECT_UNKNOWN')
  expect(unknown[0]?.run).toBeNull()
  expect((await f.kernel.resumeRecovery(f.original.id)).run).toBeNull()
  expect(f.executions).toHaveLength(0)
})

test('pending approval remains pending across fault recovery and cancellation prevents queueing', async () => {
  const f = await fixture()
  await f.storage.call('createApproval', { id: 'pending', sessionId: f.session.id, runId: f.original.id, callId: 'call', tool: 'write_file', args: {}, status: 'pending', createdAt: Date.now() })
  const pending = await f.kernel.recoverRuns([f.original.id])
  expect(pending[0]?.chain.reasonCode).toBe('APPROVAL_PENDING')
  expect((await f.storage.call('approval', 'pending')).status).toBe('pending')
  expect((await f.kernel.resumeRecovery(f.original.id)).run).toBeNull()
  expect(f.executions).toHaveLength(0)
  const other = await f.storage.call('createSession', f.session.workspaceId)
  const run = await f.storage.call('enqueue', other.id, 'cancelled', { text: 'cancelled', images: [] }, 'fixture')
  await f.storage.call('claim', other.id)
  await f.storage.call('requestCancel', run.id)
  const cancelled = await f.kernel.recoverRuns([run.id])
  expect(cancelled[0]?.chain).toMatchObject({ status: 'manual_required', reasonCode: 'USER_CANCELLED' })
})

test('recovery after interruption before input commit creates the user message once and respects queued user priority', async () => {
  const f = await fixture()
  await f.storage.call('setRun', f.original.id, 'completed')
  const other = await f.storage.call('createSession', f.session.workspaceId)
  const interrupted = await f.kernel.submit(other.id, 'before-message', { text: 'accepted once', images: [] }, 'fixture')
  await f.storage.call('claim', other.id)
  const user = await f.kernel.submit(other.id, 'user-first', { text: 'queued user', images: [] }, 'fixture')
  const records = await f.kernel.recoverRuns([interrupted.id])
  const continuation = records[0]?.run
  if (!continuation) throw new Error('Expected a recovery Run')
  await f.kernel.activate()
  await f.kernel.waitForIdle()
  expect(f.executions.map(run => run.id)).toEqual([user.id, continuation.id])
  const snapshot = await f.storage.call('snapshot', other.id)
  expect(snapshot.messages.filter(message => message.role === 'user')).toHaveLength(2)
  expect(snapshot.messages.flatMap(message => message.content).filter(block => block.type === 'text' && block.text === 'accepted once')).toHaveLength(1)
})
