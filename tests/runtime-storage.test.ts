import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import type { ExecutionOwnership, RuntimeOwner } from '@hbar/contracts/runtime'

const fixtures: { root: string; storage: Storage }[] = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.storage.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})
const kernel: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'kernel-one' }
const driver = { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) }
async function rejects(promise: Promise<unknown>, code: string) {
  let failure: unknown
  try {
    await promise
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code })
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-storage-'))
  const storage = new Storage(join(root, 'test.sqlite'))
  const fixture = { root, storage }
  fixtures.push(fixture)
  expect(await storage.call('ready')).toEqual({ version: 24 })
  const workspace = await storage.call('createWorkspace', root, 'runtime')
  const session = await storage.call('createSession', workspace.id)
  async function queue(request: string, source?: 'goal') {
    return storage.call(
      'enqueue',
      session.id,
      request,
      { text: request, images: [], ...(source ? { source } : {}) },
      'test',
    )
  }
  async function claim(runId: string, owner = kernel) {
    const draft: ExecutionOwnership = {
      leaseId: crypto.randomUUID(),
      sessionId: session.id,
      runId,
      owner,
      fence: 1,
      acquiredAt: Date.now(),
      versions: {
        kernel: { unitId: owner.unitId, generation: owner.generation, artifactId: 'a'.repeat(64) },
        driver,
        plugins: [],
        hooks: [],
      },
    }
    const lease = await storage.call('runtimeExecutionClaim', draft)
    if (!lease) throw new Error('Fixture claim unavailable')
    return lease
  }
  async function interrupt(lease: ExecutionOwnership) {
    await storage.call('runtimeExecutionRevoke', lease.owner, [lease.runId])
    return storage.call('recover', { runIds: [lease.runId], preserveQueued: true, preserveApprovals: true })
  }
  return { ...fixture, fixture, session, queue, claim, interrupt }
}

test('the database fences late commits and preserves unrelated ownership and queue identities', async () => {
  const { storage, session, queue, claim, interrupt } = await fixture()
  const run = await queue('first')
  const queued = await queue('queued')
  const lease = await claim(run.id)
  await storage.callOwned(lease, 'commit', session.id, run.id, 'user', [{ type: 'text', text: 'first' }])
  await rejects(storage.call('recover', { runIds: [run.id], preserveQueued: true }), 'EXECUTION_OWNER_ACTIVE')
  await rejects(storage.call('setRun', run.id, 'completed'), 'EXECUTION_AUTHORITY_REQUIRED')
  const other = await storage.call('createSession', session.workspaceId)
  await rejects(
    storage.callOwned(lease, 'commit', other.id, run.id, 'assistant', [{ type: 'text', text: 'foreign Session' }]),
    'RUNTIME_OWNER_MISMATCH',
  )
  const otherRun = await storage.call('enqueue', other.id, 'other', { text: 'other', images: [] }, 'test')
  await storage.call('claim', other.id)
  expect(await interrupt(lease)).toBe(1)
  await rejects(
    storage.callOwned(lease, 'commit', session.id, run.id, 'assistant', [{ type: 'text', text: 'late' }]),
    'EXECUTION_OWNER_REVOKED',
  )
  expect((await storage.call('run', queued.id)).status).toBe('queued')
  expect((await storage.call('run', otherRun.id)).status).toBe('running')
  expect((await storage.call('snapshot', session.id)).messages).toHaveLength(1)
})

test('restart reconciliation pages unfinished Runs and also includes terminal results whose release receipt was lost', async () => {
  const f = await fixture()
  const run = await f.queue('completed-with-stale-authority')
  const lease = await f.claim(run.id)
  expect(await f.storage.call('runtimeActiveRuns', '', 1)).toMatchObject([{ id: run.id }])
  await f.storage.callOwned(lease, 'setRun', run.id, 'completed')
  expect(await f.storage.call('runtimeActiveRuns')).toEqual([])
  expect(await f.storage.call('runtimeUnreleasedExecutions')).toEqual([lease])
  expect(await f.storage.call('runtimeUnreleasedExecutions', lease.leaseId)).toEqual([])
  await f.storage.call('runtimeExecutionRevoke', lease.owner, [run.id])
  expect(await f.storage.call('runtimeUnreleasedExecutions')).toEqual([])
  expect((await f.storage.call('run', run.id)).status).toBe('completed')
  await rejects(f.storage.call('runtimeActiveRuns', '', 257), 'STORAGE_ERROR')
})

test('ordinary and Goal recovery enqueue once, retain committed context, and prefer user input', async () => {
  const { storage, session, queue, claim, interrupt } = await fixture()
  const run = await queue('goal', 'goal')
  const lease = await claim(run.id)
  await storage.callOwned(lease, 'commit', session.id, run.id, 'assistant', [
    { type: 'tool_call', callId: 'write', name: 'write_file', args: { path: 'out' } },
  ])
  await storage.callOwned(lease, 'toolStart', session.id, run.id, 'write', 'write_file', { path: 'out' })
  await storage.callOwned(lease, 'commit', session.id, run.id, 'tool', [
    { type: 'tool_result', callId: 'write', name: 'write_file', text: 'written', isError: false },
  ])
  expect(await interrupt(lease)).toBe(1)
  const [first, duplicate] = await Promise.all([
    storage.call('runtimeRecoveryPlan', run.id),
    storage.call('runtimeRecoveryPlan', run.id),
  ])
  expect(duplicate.recoveryId).toBe(first.recoveryId)
  expect(first.chain.status).toBe('pending')
  const [queued, repeated] = await Promise.all([
    storage.call('runtimeRecoveryQueue', run.id, first.recoveryId),
    storage.call('runtimeRecoveryQueue', run.id, first.recoveryId),
  ])
  expect(repeated.run?.id).toBe(queued.run?.id)
  expect(queued.run?.recovery).toMatchObject({ attempt: 1, rootRunId: run.id, predecessorRunId: run.id })
  expect((await storage.call('run', run.id)).status).toBe('interrupted')
  expect((await storage.call('snapshot', session.id)).messages).toHaveLength(2)
  const user = await queue('user input')
  expect((await storage.call('claim', session.id))?.id).toBe(user.id)
  await storage.call('setRun', user.id, 'completed')
  expect((await storage.call('claim', session.id))?.id).toBe(queued.run?.id)
})

test('unknown effects, pending approvals and cancellation block automatic recovery', async () => {
  const { storage, session, queue, claim, interrupt } = await fixture()
  const uncertain = await queue('uncertain')
  const lease = await claim(uncertain.id)
  await storage.callOwned(lease, 'toolStart', session.id, uncertain.id, 'call', 'write_file', {})
  await interrupt(lease)
  const unknown = await storage.call('runtimeRecoveryPlan', uncertain.id)
  expect(unknown.chain).toMatchObject({ status: 'waiting', reasonCode: 'EFFECT_UNKNOWN' })
  expect((await storage.call('runtimeRecoveryQueue', uncertain.id, unknown.recoveryId)).run).toBeNull()
  const pending = await queue('approval')
  const approvalLease = await claim(pending.id)
  await storage.callOwned(approvalLease, 'createApproval', {
    id: 'approval',
    sessionId: session.id,
    runId: pending.id,
    callId: 'request',
    tool: 'write_file',
    args: {},
    status: 'pending',
    createdAt: Date.now(),
  })
  await interrupt(approvalLease)
  expect((await storage.call('approval', 'approval')).status).toBe('pending')
  expect((await storage.call('runtimeRecoveryPlan', pending.id)).chain).toMatchObject({
    status: 'waiting',
    reasonCode: 'APPROVAL_PENDING',
  })
  const cancelled = await queue('cancel')
  const cancelLease = await claim(cancelled.id)
  await storage.call('requestCancel', cancelled.id)
  await interrupt(cancelLease)
  expect((await storage.call('runtimeRecoveryPlan', cancelled.id)).chain).toMatchObject({
    status: 'manual_required',
    reasonCode: 'USER_CANCELLED',
  })
})

test('two failed continuations leave a manual state and survive a JSONL projection rebuild', async () => {
  const { storage, fixture: entry, root, session, queue, claim, interrupt } = await fixture()
  let run = await queue('start')
  const original = run
  for (let index = 0; index < 2; index++) {
    const lease = await claim(run.id)
    await interrupt(lease)
    const plan = await storage.call('runtimeRecoveryPlan', run.id)
    const continuation = await storage.call('runtimeRecoveryQueue', run.id, plan.recoveryId)
    if (!continuation.run) throw new Error('Expected a continuation')
    run = continuation.run
  }
  const lease = await claim(run.id)
  await interrupt(lease)
  const exhausted = await storage.call('runtimeRecoveryPlan', run.id)
  expect(exhausted.chain).toMatchObject({ attempts: 2, status: 'manual_required', reasonCode: 'RECOVERY_LIMIT' })
  await storage.close()
  await rename(join(root, 'test.sqlite'), join(root, 'projection-backup.sqlite'))
  entry.storage = new Storage(join(root, 'test.sqlite'))
  await entry.storage.call('ready')
  expect((await entry.storage.call('run', run.id)).recovery).toEqual(run.recovery)
  expect((await entry.storage.call('runtimeRecoveryPlan', run.id)).recoveryId).toBe(exhausted.recoveryId)
  expect((await entry.storage.call('runtimeRecoveryChain', exhausted.chain.chainId))?.status).toBe('manual_required')
  expect((await entry.storage.call('run', original.id)).status).toBe('interrupted')
  expect((await entry.storage.call('snapshot', session.id)).runs.filter((item) => item.recovery)).toHaveLength(2)
  await rejects(entry.storage.callOwned(lease, 'setRun', run.id, 'completed'), 'EXECUTION_OWNER_REVOKED')
  const manual = {
    requestId: `command-${'c'.repeat(64)}`,
    command: {
      actorId: 'manual-actor',
      idempotencyKey: 'manual-after-limit',
      requestId: 'manual-request',
      inputHash: 'd'.repeat(64),
    },
  }
  await entry.storage.call('runtimeRecoveryHold', run.id, exhausted.recoveryId, null, manual)
  const continued = await entry.storage.call('runtimeRecoveryQueue', run.id, exhausted.recoveryId)
  if (!continued.run) throw new Error('Expected a manually admitted continuation')
  expect(continued.run.recovery).toMatchObject({ attempt: 3, automaticAttempt: 2, manual: true })
  await entry.storage.close()
  await rename(join(root, 'test.sqlite'), join(root, 'manual-projection-backup.sqlite'))
  entry.storage = new Storage(join(root, 'test.sqlite'))
  await entry.storage.call('ready')
  expect(await entry.storage.call('runByRequest', session.id, manual.requestId)).toEqual({
    run: continued.run,
    command: manual.command,
  })
  await entry.storage.call('claim', session.id)
  await entry.storage.call('recover', { runIds: [continued.run.id], preserveQueued: true })
  expect((await entry.storage.call('runtimeRecoveryPlan', continued.run.id)).chain).toMatchObject({
    attempts: 3,
    automaticAttempts: 2,
    status: 'manual_required',
    reasonCode: 'RECOVERY_LIMIT',
  })
})

test('a released lease allows a new owner and durable fences remain monotonic after restart', async () => {
  const { storage, fixture: entry, root, queue, claim } = await fixture()
  const first = await queue('first')
  const lease = await claim(first.id)
  await rejects(storage.call('runtimeExecutionRelease', lease), 'EXECUTION_UNSETTLED')
  await storage.callOwned(lease, 'setRun', first.id, 'completed')
  await storage.callOwned(lease, 'append', first.sessionId, 'fixture.runObserver', {}, first.id)
  await rejects(
    storage.callOwned(lease, 'toolStart', first.sessionId, first.id, 'late', 'write_file', {}),
    'EXECUTION_SETTLED',
  )
  await storage.call('runtimeExecutionRelease', lease)
  const second = await queue('second')
  await storage.close()
  entry.storage = new Storage(join(root, 'test.sqlite'))
  await entry.storage.call('ready')
  const renewed = await entry.storage.call('runtimeExecutionClaim', {
    ...lease,
    leaseId: 'new-lease',
    runId: second.id,
    owner: { ...kernel, incarnation: 'new-owner' },
    fence: 1,
  })
  expect(renewed?.fence).toBeGreaterThan(lease.fence)
})
