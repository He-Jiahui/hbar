import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { SettingsService } from '@hbar/kernel/controller'
import type { RuntimeManualRecovery, RuntimeRecoveryRecord, StorageMethods, StoragePort } from '@hbar/storage'
import { RuntimeRecoveryService } from '../packages/kernel/src/runtime-recovery'
import { createInProcessStorage } from './in-process-storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

async function failureOf(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
    return undefined
  } catch (error) {
    return error
  }
}

function manualRequest(digit = 'a'): RuntimeManualRecovery {
  return {
    requestId: `command-${digit.repeat(64)}`,
    command: {
      actorId: 'manual-actor',
      idempotencyKey: 'continue-original',
      inputHash: '1'.repeat(64),
      requestId: 'transport-original',
    },
  }
}

interface FixtureOptions {
  automatic?: boolean
  unknownEffect?: boolean
  reconcile?(): Promise<void>
  afterCall?(method: keyof StorageMethods): Promise<void>
  publish?(record: RuntimeRecoveryRecord): void
}

async function fixture(options: FixtureOptions = {}) {
  const prefix = 'hbar-recovery-handoff-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = createInProcessStorage(join(root, 'state.sqlite'))
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Recovery handoff fixture')
    const session = await storage.call('createSession', workspace.id, 'Original task')
    const accepted = await storage.call(
      'enqueue',
      session.id,
      'original-task',
      {
        text: 'Keep the original task',
        images: [],
        source: 'user',
      },
      'fixture',
    )
    await storage.call('claim', session.id)
    await storage.call('commit', session.id, accepted.id, 'assistant', [
      { type: 'text', text: 'Already committed partial work' },
    ])
    if (options.unknownEffect) {
      await storage.call('commit', session.id, accepted.id, 'assistant', [
        { type: 'tool_call', callId: 'unknown-write', name: 'write_file', args: { path: 'out' } },
      ])
      await storage.call('toolStart', session.id, accepted.id, 'unknown-write', 'write_file', { path: 'out' })
    }
    await storage.call('recover', { runIds: [accepted.id], preserveQueued: true, preserveApprovals: true })
    const original = await storage.call('run', accepted.id)
    if (original.status !== 'interrupted') throw new Error('Expected the original interrupted Run')
    const baseline = await storage.call('snapshot', session.id)
    const settings = new SettingsService(storage)
    const before = await settings.get({ kind: 'global' })
    await settings.apply({
      schemaVersion: before.schemaVersion,
      scope: before.scope,
      baselineRevisions: before.revisions,
      actorId: 'handoff-fixture',
      idempotencyKey: crypto.randomUUID(),
      changes: [
        { op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: options.automatic ?? false },
      ],
    })
    const port: StoragePort = {
      async call(method, ...args) {
        const result = await storage.call(method, ...args)
        await options.afterCall?.(method)
        return result
      },
      close: async () => {},
    }
    let reconciliations = 0
    const published: RuntimeRecoveryRecord[] = []
    const service = new RuntimeRecoveryService(port, {
      async reconcile() {
        reconciliations++
        await options.reconcile?.()
      },
      check: async () => null,
      publish(record) {
        published.push(record)
        options.publish?.(record)
      },
    })
    const admissions = new Set<Promise<RuntimeRecoveryRecord>>()
    const track = (operation: Promise<RuntimeRecoveryRecord>) => {
      admissions.add(operation)
      return operation
    }
    return {
      storage,
      service,
      session,
      original,
      baseline,
      published,
      resume: (id: string) => track(service.resume(id)),
      resumeManual: (id: string, manual: RuntimeManualRecovery) => track(service.resumeManual(id, manual)),
      get reconciliations() {
        return reconciliations
      },
      async close() {
        service.close()
        await Promise.allSettled(admissions)
        await storage.close()
        await removeOwnedTestDirectory(root, prefix)
      },
    }
  } catch (error) {
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
    throw error
  }
}

function firstReconciliation() {
  const entered = deferred<void>()
  const release = deferred<void>()
  let first = true
  return {
    entered,
    release,
    async reconcile() {
      if (!first) return
      first = false
      entered.resolve()
      await release.promise
    },
  }
}

async function expectOneSuccessor(
  f: Awaited<ReturnType<typeof fixture>>,
  record: RuntimeRecoveryRecord,
  manual?: RuntimeManualRecovery,
) {
  if (!record.run) throw new Error('Expected one canonical successor')
  expect(record.chain).toMatchObject({ attempts: 1, automaticAttempts: manual ? 0 : 1 })
  expect(record.run).toMatchObject({
    status: 'queued',
    input: f.original.input,
    recovery: { predecessorRunId: f.original.id, attempt: 1 },
  })
  expect(record.manual).toEqual(manual)
  expect(await f.storage.call('run', f.original.id)).toEqual(f.original)
  const snapshot = await f.storage.call('snapshot', f.session.id)
  expect(snapshot.runs).toHaveLength(2)
  expect(snapshot.messages).toEqual(f.baseline.messages)
  if (manual) {
    const receipt = await f.storage.call('runByRequest', f.session.id, manual.requestId)
    expect(receipt?.run.id).toBe(record.run.id)
    expect(receipt?.command).toEqual(manual.command)
  }
}

test('a late manual request rechecks an automatic off-switch hold and keeps one durable successor', async () => {
  const gate = firstReconciliation()
  const f = await fixture({ reconcile: gate.reconcile })
  try {
    const automatic = f.resume(f.original.id)
    await gate.entered.promise
    const manual = manualRequest()
    const requested = f.resumeManual(f.original.id, manual)
    expect(requested).toBe(automatic)
    gate.release.resolve()
    const result = await requested
    await expectOneSuccessor(f, result, manual)
    expect(f.reconciliations).toBe(2)
    expect(f.published.map((record) => record.chain.status)).toEqual(['waiting', 'running'])
    expect(f.published[0]?.recoveryId).toBe(result.recoveryId)
  } finally {
    gate.release.resolve()
    await f.close()
  }
}, 5_000)

test('an automatic caller joining a manual admission preserves its canonical manual request', async () => {
  const gate = firstReconciliation()
  const f = await fixture({ reconcile: gate.reconcile })
  try {
    const manual = manualRequest()
    const requested = f.resumeManual(f.original.id, manual)
    await gate.entered.promise
    expect(f.resume(f.original.id)).toBe(requested)
    gate.release.resolve()
    await expectOneSuccessor(f, await requested, manual)
    expect(f.reconciliations).toBe(1)
  } finally {
    gate.release.resolve()
    await f.close()
  }
}, 5_000)

test('duplicate manual identities share admission across changed transport request IDs', async () => {
  const gate = firstReconciliation()
  const f = await fixture({ reconcile: gate.reconcile })
  try {
    const automatic = f.resume(f.original.id)
    await gate.entered.promise
    const manual = manualRequest()
    expect(f.resumeManual(f.original.id, manual)).toBe(automatic)
    const duplicate = structuredClone(manual)
    duplicate.command.requestId = 'transport-reconnected'
    expect(f.resumeManual(f.original.id, duplicate)).toBe(automatic)
    gate.release.resolve()
    await expectOneSuccessor(f, await automatic, manual)
    expect(f.reconciliations).toBe(2)
  } finally {
    gate.release.resolve()
    await f.close()
  }
}, 5_000)

for (const conflict of ['actor', 'request'] as const)
  test(`a competing manual ${conflict} cannot replace the one pending human intent`, async () => {
    const gate = firstReconciliation()
    const f = await fixture({ reconcile: gate.reconcile })
    try {
      const automatic = f.resume(f.original.id)
      await gate.entered.promise
      const manual = manualRequest()
      expect(f.resumeManual(f.original.id, manual)).toBe(automatic)
      const other = manualRequest('b')
      if (conflict === 'actor') other.command.actorId = 'another-actor'
      else other.command.idempotencyKey = 'another-request'
      expect(await failureOf(f.resumeManual(f.original.id, other))).toMatchObject({
        code: conflict === 'actor' ? 'IDEMPOTENCY_CONFLICT' : 'CONTINUATION_ALREADY_EXISTS',
      })
      gate.release.resolve()
      await expectOneSuccessor(f, await automatic, manual)
      expect(f.reconciliations).toBe(2)
    } finally {
      gate.release.resolve()
      await f.close()
    }
  }, 5_000)

test('a pending manual intent is a validated copy rather than mutable caller state', async () => {
  const gate = firstReconciliation()
  const f = await fixture({ reconcile: gate.reconcile })
  try {
    const automatic = f.resume(f.original.id)
    await gate.entered.promise
    const manual = manualRequest()
    const expected = structuredClone(manual)
    expect(f.resumeManual(f.original.id, manual)).toBe(automatic)
    manual.command.actorId = 'changed-after-admission'
    manual.command.idempotencyKey = 'changed-key'
    manual.requestId = `command-${'c'.repeat(64)}`
    gate.release.resolve()
    await expectOneSuccessor(f, await automatic, expected)
  } finally {
    gate.release.resolve()
    await f.close()
  }
}, 5_000)

test('invalid manual command identities do not occupy or poison a recovery entry', async () => {
  const f = await fixture()
  try {
    const invalid = manualRequest()
    invalid.command.inputHash = 'invalid'
    expect(await failureOf(f.resumeManual(f.original.id, invalid))).toMatchObject({ code: 'INVALID_INPUT' })
    expect(await f.storage.call('runtimeRecoveryRead', f.original.id)).toBeNull()
    const manual = manualRequest()
    await expectOneSuccessor(f, await f.resumeManual(f.original.id, manual), manual)
  } finally {
    await f.close()
  }
}, 5_000)

test('an automatic successor accepted during a race keeps its original receipt and consumes no manual attempt', async () => {
  const gate = firstReconciliation()
  const f = await fixture({ automatic: true, reconcile: gate.reconcile })
  try {
    const automatic = f.resume(f.original.id)
    await gate.entered.promise
    expect(f.resumeManual(f.original.id, manualRequest())).toBe(automatic)
    gate.release.resolve()
    await expectOneSuccessor(f, await automatic)
    expect(f.reconciliations).toBe(1)
  } finally {
    gate.release.resolve()
    await f.close()
  }
}, 5_000)

test('manual handoff still waits on an unknown write instead of creating a successor', async () => {
  const entered = deferred<void>()
  const release = deferred<void>()
  let first = true
  const f = await fixture({
    unknownEffect: true,
    async afterCall(method) {
      if (method !== 'runtimeRecoveryPlan' || !first) return
      first = false
      entered.resolve()
      await release.promise
    },
  })
  try {
    const automatic = f.resume(f.original.id)
    await entered.promise
    const manual = manualRequest()
    expect(f.resumeManual(f.original.id, manual)).toBe(automatic)
    release.resolve()
    expect(await automatic).toMatchObject({
      run: null,
      manual,
      chain: { status: 'waiting', reasonCode: 'EFFECT_UNKNOWN', attempts: 0, automaticAttempts: 0 },
    })
    expect(f.reconciliations).toBe(0)
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
    expect(await f.storage.call('run', f.original.id)).toEqual(f.original)
  } finally {
    release.resolve()
    await f.close()
  }
}, 5_000)

test('a lost queue acknowledgement rejects joined callers and reconciles the accepted identity on a later request', async () => {
  const gate = firstReconciliation()
  let loseAcknowledgement = true
  const f = await fixture({
    automatic: true,
    reconcile: gate.reconcile,
    async afterCall(method) {
      if (method === 'runtimeRecoveryQueue' && loseAcknowledgement) {
        loseAcknowledgement = false
        throw new HbarError('RESULT_UNKNOWN', 'Fixture lost the accepted queue acknowledgement')
      }
    },
  })
  try {
    const automatic = f.resume(f.original.id)
    await gate.entered.promise
    expect(f.resumeManual(f.original.id, manualRequest())).toBe(automatic)
    const failure = failureOf(automatic)
    gate.release.resolve()
    expect(await failure).toMatchObject({ code: 'RESULT_UNKNOWN' })
    const accepted = await f.storage.call('runtimeRecoveryRead', f.original.id)
    if (!accepted?.run) throw new Error('Expected the original accepted receipt after acknowledgement loss')
    const reconciled = await f.resumeManual(f.original.id, manualRequest())
    expect(reconciled.run?.id).toBe(accepted.run.id)
    await expectOneSuccessor(f, reconciled)
    expect(f.reconciliations).toBe(1)
  } finally {
    gate.release.resolve()
    await f.close()
  }
}, 5_000)

test('closing during automatic admission does not start a second manual pass', async () => {
  const gate = firstReconciliation()
  const f = await fixture({ reconcile: gate.reconcile })
  try {
    const automatic = f.resume(f.original.id)
    await gate.entered.promise
    expect(f.resumeManual(f.original.id, manualRequest())).toBe(automatic)
    f.service.close()
    gate.release.resolve()
    expect(await automatic).toMatchObject({ run: null, chain: { reasonCode: 'BACKEND_AUTOMATION_DISABLED' } })
    expect(f.reconciliations).toBe(1)
    expect(await failureOf(f.resumeManual(f.original.id, manualRequest()))).toMatchObject({ code: 'RUNTIME_CLOSED' })
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
  } finally {
    gate.release.resolve()
    await f.close()
  }
}, 5_000)

function unavailableStorage(operation: () => Promise<never>): StoragePort {
  return { call: operation, close: async () => {} }
}

function unusedAdmission() {
  return {
    reconcile: async () => {
      throw new Error('Unexpected admission reconciliation')
    },
    check: async (): Promise<string | null> => {
      throw new Error('Unexpected admission check')
    },
    publish() {
      throw new Error('Unexpected recovery publication')
    },
  }
}

test('closing before asynchronous admission starts prevents any storage call', async () => {
  let calls = 0
  const service = new RuntimeRecoveryService(
    unavailableStorage(async () => {
      calls++
      throw new HbarError('FIXTURE_UNAVAILABLE', 'Unexpected storage request')
    }),
    unusedAdmission(),
  )
  const pending = service.resume('predecessor')
  service.close()
  expect(await failureOf(pending)).toMatchObject({ code: 'RUNTIME_CLOSED' })
  expect(await failureOf(service.resume('predecessor'))).toMatchObject({ code: 'RUNTIME_CLOSED' })
  expect(calls).toBe(0)
})

test('capacity stays at 256 predecessors while a duplicate manual request shares one entry', async () => {
  const release = deferred<never>()
  const service = new RuntimeRecoveryService(
    unavailableStorage(() => release.promise),
    unusedAdmission(),
  )
  const operations = Array.from({ length: 256 }, (_, index) => service.resume(`predecessor-${index}`))
  const failures = operations.map(failureOf)
  try {
    const firstOperation = operations[0]
    if (!firstOperation) throw new Error('Expected the first of 256 pending recovery operations')
    expect(service.resumeManual('predecessor-0', manualRequest())).toBe(firstOperation)
    expect(service.resume('predecessor-0')).toBe(firstOperation)
    expect(await failureOf(service.resume('overflow'))).toMatchObject({ code: 'RECOVERY_CAPACITY' })
    release.reject(new HbarError('FIXTURE_RELEASED', 'Release the bounded test requests'))
    for (const failure of await Promise.all(failures)) expect(failure).toMatchObject({ code: 'FIXTURE_RELEASED' })
    expect(await failureOf(service.resume('after-release'))).toMatchObject({ code: 'FIXTURE_RELEASED' })
  } finally {
    release.reject(new HbarError('FIXTURE_RELEASED', 'Release the bounded test requests'))
    await Promise.all(failures)
    service.close()
  }
})

test('failed planning removes the shared entry without automatically retrying an uncertain operation', async () => {
  let calls = 0
  const service = new RuntimeRecoveryService(
    unavailableStorage(async () => {
      calls++
      throw new HbarError('RESULT_UNKNOWN', 'Fixture could not confirm planning')
    }),
    unusedAdmission(),
  )
  try {
    const automatic = service.resume('predecessor')
    expect(service.resumeManual('predecessor', manualRequest())).toBe(automatic)
    expect(await failureOf(automatic)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(calls).toBe(1)
    expect(await failureOf(service.resumeManual('predecessor', manualRequest()))).toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(calls).toBe(2)
  } finally {
    service.close()
  }
})

for (const turns of [0, 1, 2, 3])
  test(`a manual request ${turns} microtasks after hold publication cannot fall between handoff and cleanup`, async () => {
    let late: Promise<RuntimeRecoveryRecord> | undefined
    const f = await fixture({
      publish(record) {
        if (record.chain.reasonCode !== 'BACKEND_AUTOMATION_DISABLED' || late) return
        late = (async () => {
          for (let index = 0; index < turns; index++) await Promise.resolve()
          return f.resumeManual(f.original.id, manualRequest())
        })()
      },
    })
    try {
      await f.resume(f.original.id)
      if (!late) throw new Error('Expected the publication-triggered manual request')
      await expectOneSuccessor(f, await late, manualRequest())
      expect(f.reconciliations).toBe(2)
    } finally {
      if (late) await failureOf(late)
      await f.close()
    }
  }, 5_000)
