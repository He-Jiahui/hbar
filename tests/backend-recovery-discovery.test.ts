import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage, providerSchema, type Run } from '@hbar/contracts'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { SettingsService } from '@hbar/kernel/controller'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import { Storage, type StoragePort } from '@hbar/storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function configure(kernel: Kernel, enabled: boolean) {
  const settings = new SettingsService(kernel.storage)
  const before = await settings.get({ kind: 'global' })
  await settings.apply({
    schemaVersion: before.schemaVersion,
    scope: before.scope,
    baselineRevisions: before.revisions,
    actorId: 'backend-discovery-fixture',
    idempotencyKey: crypto.randomUUID(),
    changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: enabled }],
  })
}

async function closeAfterFailure(close: () => Promise<void>, primary: unknown): Promise<never> {
  let cleanupFailure: { error: unknown } | undefined
  try {
    await close()
  } catch (cleanup) {
    cleanupFailure = { error: cleanup }
  }
  if (cleanupFailure)
    throw new AggregateError([primary, cleanupFailure.error], 'Recovery discovery failed and cleanup also failed', {
      cause: primary,
    })
  throw primary
}

async function fixture(beforeDiscoveryRead?: () => Promise<void>) {
  const prefix = 'hbar-backend-discovery-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  let kernel: Kernel | undefined
  let closing: Promise<void> | undefined
  const close = () => (closing ??= closeResources())
  const closeResources = async () => {
    const failures: unknown[] = []
    try {
      await kernel?.close()
    } catch (error) {
      failures.push(error)
    }
    try {
      await storage.close()
    } catch (error) {
      failures.push(error)
    }
    if (failures.length)
      throw new AggregateError(failures, 'Recovery discovery close failed; temporary directory retained')
    await removeOwnedTestDirectory(root, prefix)
  }
  try {
    await storage.call('ready')
    await storage.call(
      'saveProvider',
      providerSchema.parse({
        id: 'fixture',
        name: 'Fixture',
        protocol: 'mock',
        baseUrl: 'http://127.0.0.1',
        model: 'fixture',
      }),
    )
    const workspace = await storage.call('createWorkspace', root, 'fixture')
    const session = await storage.call('createSession', workspace.id)
    const executions: Run[] = []
    const statistics = { discoveryReads: 0 }
    const driver = definePlugin({
      manifest: {
        id: 'driver.pi',
        name: 'Backend discovery fixture',
        description: 'Verify recovery discovery through public activation',
        version: '1.0.0',
        apiVersion: '^1.0.0',
        scope: 'host',
        provides: { driver: '1.0.0' },
        permissions: [],
      },
      apply(api) {
        provide<HarnessDriver>(api, 'driver', {
          async run(input) {
            executions.push(input.run)
            await input.commit('assistant', [{ type: 'text', text: 'Completed the interrupted request' }])
          },
          summarize: async () => ({ text: '', usage: emptyUsage() }),
        })
      },
    })
    const port: StoragePort = {
      call: (method, ...args) => {
        if (method === 'runtimeBackendRecoveryPage') {
          statistics.discoveryReads++
          return (beforeDiscoveryRead?.() ?? Promise.resolve()).then(() => storage.call(method, ...args))
        }
        return storage.call(method, ...args)
      },
      close: async () => {},
    }
    kernel = await Kernel.create({
      home: join(root, 'data'),
      demo: true,
      lifecycle: 'managed',
      secrets: new MemorySecrets(),
      profile: { createStorage: async () => port, replacements: { 'driver.pi': driver } },
    })
    await configure(kernel, false)
    const original = await kernel.submit(
      session.id,
      'original',
      { text: 'Finish the interrupted request', images: [], source: 'user' },
      'fixture',
    )
    await storage.call('claim', session.id)
    await storage.call('commit', session.id, original.id, 'user', [
      { type: 'text', text: 'Finish the interrupted request' },
    ])
    const held = (await kernel.recoverRuns([original.id]))[0]
    if (!held) throw new Error('Expected the canonical held recovery')
    expect(held.run).toBeNull()
    expect(held.manual).toBeUndefined()
    expect(held.chain).toMatchObject({
      status: 'waiting',
      reasonCode: 'BACKEND_AUTOMATION_DISABLED',
      attempts: 0,
      automaticAttempts: 0,
    })
    expect((await storage.call('run', original.id)).status).toBe('interrupted')
    await kernel.activate()
    await kernel.waitForIdle()
    expect(executions).toHaveLength(0)
    expect((await storage.call('runtimeRecoveryRead', original.id))?.run).toBeNull()
    expect((await storage.call('snapshot', session.id)).runs).toHaveLength(1)
    return { kernel, storage, session, original, held, executions, statistics, close }
  } catch (error) {
    return closeAfterFailure(close, error)
  }
}

async function assertCompletedOnce(f: Awaited<ReturnType<typeof fixture>>) {
  const resumed = await f.storage.call('runtimeRecoveryRead', f.original.id)
  expect(resumed?.recoveryId).toBe(f.held.recoveryId)
  expect(resumed?.run).not.toBeNull()
  if (!resumed?.run) throw new Error('Expected activation to accept the held recovery')
  const successor = resumed.run
  expect(successor.id).not.toBe(f.original.id)
  expect(successor.recovery).toMatchObject({
    predecessorRunId: f.original.id,
    rootRunId: f.original.id,
    attempt: 1,
    automaticAttempt: 1,
  })
  expect(resumed.manual).toBeUndefined()
  expect(f.executions.map((run) => run.id)).toEqual([successor.id])
  expect((await f.storage.call('run', f.original.id)).status).toBe('interrupted')
  expect((await f.storage.call('run', successor.id)).status).toBe('completed')
  const snapshot = await f.storage.call('snapshot', f.session.id)
  expect(snapshot.runs).toHaveLength(2)
  expect(snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(1)
  expect(snapshot.messages.filter((message) => message.role === 'assistant')).toHaveLength(1)
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .filter((block) => block.type === 'text' && block.text === 'Completed the interrupted request'),
  ).toHaveLength(1)
  await f.kernel.activate()
  await f.kernel.waitForIdle()
  expect((await f.storage.call('runtimeRecoveryRead', f.original.id))?.run?.id).toBe(successor.id)
  expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(2)
  expect(f.executions.map((run) => run.id)).toEqual([successor.id])
}

test('control: explicit recovery resumes the held identity after background re-enable', async () => {
  const f = await fixture()
  try {
    await configure(f.kernel, true)
    const accepted = await f.kernel.resumeRecovery(f.original.id)
    expect(accepted.recoveryId).toBe(f.held.recoveryId)
    expect(accepted.run).not.toBeNull()
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    await assertCompletedOnce(f)
  } catch (error) {
    return closeAfterFailure(f.close, error)
  }
  await f.close()
}, 20_000)

test('concurrent activation preserves a disable and later re-enable without duplicate recovery', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let first = true
  const f = await fixture(async () => {
    if (!first) return
    first = false
    entered.resolve()
    await release.promise
  })
  try {
    await configure(f.kernel, true)
    await f.kernel.activate()
    await entered.promise
    expect(f.kernel.runtimeView().idle).toBe(false)
    expect(() => f.kernel.assertIdle()).toThrow('Wait for active and queued runs to settle')
    await configure(f.kernel, false)
    await Promise.all([f.kernel.activate(), f.kernel.activate()])
    release.resolve()
    await f.kernel.waitForIdle()
    expect(f.executions).toHaveLength(0)
    expect((await f.storage.call('runtimeRecoveryRead', f.original.id))?.run).toBeNull()
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
    await configure(f.kernel, true)
    await Promise.all([f.kernel.activate(), f.kernel.activate(), f.kernel.activate()])
    await f.kernel.waitForIdle()
    await assertCompletedOnce(f)
    expect(f.statistics.discoveryReads).toBeLessThanOrEqual(5)
  } catch (error) {
    release.resolve()
    return closeAfterFailure(f.close, error)
  }
  await f.close()
}, 20_000)

test('draining after discovery starts preserves the held identity until default activation', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let first = true
  const f = await fixture(async () => {
    if (!first) return
    first = false
    entered.resolve()
    await release.promise
  })
  try {
    await configure(f.kernel, true)
    await f.kernel.activate()
    await entered.promise
    await f.kernel.activate('draining')
    release.resolve()
    await f.kernel.waitForIdle()
    expect(f.executions).toHaveLength(0)
    expect((await f.storage.call('runtimeRecoveryRead', f.original.id))?.run).toBeNull()
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    await assertCompletedOnce(f)
  } catch (error) {
    release.resolve()
    return closeAfterFailure(f.close, error)
  }
  await f.close()
}, 20_000)

test('close joins the owned discovery read without admitting a successor', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await fixture(async () => {
    entered.resolve()
    await release.promise
  })
  try {
    await configure(f.kernel, true)
    await f.kernel.activate()
    await entered.promise
    let settled = false
    const closing = f.close().then(
      () => {
        settled = true
        return { ok: true, error: undefined }
      },
      (error: unknown) => {
        settled = true
        return { ok: false, error }
      },
    )
    await Bun.sleep(0)
    expect(settled).toBe(false)
    release.resolve()
    const outcome = await closing
    if (!outcome.ok) throw outcome.error
    expect(settled).toBe(true)
    expect(f.executions).toHaveLength(0)
    expect(f.statistics.discoveryReads).toBe(1)
  } catch (error) {
    release.resolve()
    return closeAfterFailure(f.close, error)
  }
  await f.close()
}, 20_000)

test('activation does not reopen a recovery chain that requires a manual budget decision', async () => {
  const f = await fixture()
  try {
    await f.kernel.activate('draining')
    await configure(f.kernel, true)
    let predecessor = f.original
    for (let index = 0; index < 2; index++) {
      const accepted = await f.kernel.resumeRecovery(predecessor.id)
      if (!accepted.run) throw new Error('Expected the existing automatic recovery allowance')
      await f.storage.call('claim', f.session.id)
      await f.storage.call('recover', { runIds: [accepted.run.id], preserveQueued: true, preserveApprovals: true })
      predecessor = await f.storage.call('run', accepted.run.id)
    }
    const blocked = await f.kernel.resumeRecovery(predecessor.id)
    expect(blocked.run).toBeNull()
    expect(blocked.chain).toMatchObject({
      status: 'manual_required',
      reasonCode: 'RECOVERY_LIMIT',
      automaticAttempts: 2,
    })
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    const repeated = await f.storage.call('runtimeRecoveryRead', predecessor.id)
    expect(repeated?.recoveryId).toBe(blocked.recoveryId)
    expect(repeated?.run).toBeNull()
    expect(repeated?.chain).toMatchObject({ status: 'manual_required', automaticAttempts: 2 })
    expect(f.executions).toHaveLength(0)
    const snapshot = await f.storage.call('snapshot', f.session.id)
    expect(snapshot.runs).toHaveLength(3)
    expect(snapshot.runs.every((run) => run.status === 'interrupted')).toBe(true)
  } catch (error) {
    return closeAfterFailure(f.close, error)
  }
  await f.close()
}, 20_000)

test('discovery leaves a newly unknown effect waiting under the same recovery identity', async () => {
  const f = await fixture()
  try {
    await f.storage.call('setRun', f.original.id, 'interrupted', 'Original result is unknown', {
      code: 'RESULT_UNKNOWN',
      category: 'result_unknown',
      retryable: false,
    })
    await configure(f.kernel, true)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    const blocked = await f.storage.call('runtimeRecoveryRead', f.original.id)
    expect(blocked?.recoveryId).toBe(f.held.recoveryId)
    expect(blocked?.run).toBeNull()
    expect(blocked?.chain).toMatchObject({ reasonCode: 'EFFECT_UNKNOWN', attempts: 0, automaticAttempts: 0 })
    expect(f.executions).toHaveLength(0)
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.executions).toHaveLength(0)
    expect((await f.storage.call('runtimeRecoveryRead', f.original.id))?.run).toBeNull()
  } catch (error) {
    return closeAfterFailure(f.close, error)
  }
  await f.close()
}, 20_000)

test('bounded continuations discover a candidate beyond four empty metadata pages', async () => {
  const f = await fixture()
  try {
    await f.storage.call('runtimeRecoveryHold', f.original.id, f.held.recoveryId, 'WORKFLOW_WAIT')
    const records = [f.held]
    for (let index = 0; index < 129; index++) {
      const run = await f.storage.call(
        'enqueue',
        f.session.id,
        crypto.randomUUID(),
        { text: 'Other interrupted request', images: [], source: 'user' },
        'fixture',
      )
      await f.storage.call('claim', f.session.id)
      await f.storage.call('recover', { runIds: [run.id], preserveQueued: true, preserveApprovals: true })
      const planned = await f.storage.call('runtimeRecoveryPlan', run.id)
      records.push(await f.storage.call('runtimeRecoveryHold', run.id, planned.recoveryId, 'WORKFLOW_WAIT'))
    }
    records.sort((left, right) => (left.predecessorRunId < right.predecessorRunId ? -1 : 1))
    const target = records.at(-1)
    if (!target) throw new Error('Missing the continuation target')
    await f.storage.call(
      'runtimeRecoveryHold',
      target.predecessorRunId,
      target.recoveryId,
      'BACKEND_AUTOMATION_DISABLED',
    )
    await configure(f.kernel, true)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    const accepted = await f.storage.call('runtimeRecoveryRead', target.predecessorRunId)
    if (!accepted?.run) throw new Error('Expected the later metadata window to resume its candidate')
    expect(accepted.recoveryId).toBe(target.recoveryId)
    expect(accepted.run.id).not.toBe(target.predecessorRunId)
    expect(f.executions.map((run) => run.id)).toEqual([accepted.run.id])
    expect((await f.storage.call('run', target.predecessorRunId)).status).toBe('interrupted')
    expect((await f.storage.call('run', accepted.run.id)).status).toBe('completed')
    expect(f.statistics.discoveryReads).toBe(5)
    for (const record of records) {
      expect((await f.storage.call('run', record.predecessorRunId)).status).toBe('interrupted')
      const persisted = await f.storage.call('runtimeRecoveryRead', record.predecessorRunId)
      expect(persisted?.recoveryId).toBe(record.recoveryId)
      expect(persisted?.run?.id ?? null).toBe(record.recoveryId === target.recoveryId ? accepted.run.id : null)
    }
    expect(f.kernel.runtimeView().idle).toBe(true)
  } catch (error) {
    return closeAfterFailure(f.close, error)
  }
  await f.close()
}, 20_000)

test('background re-enable discovers and completes the held recovery without an explicit recovery call', async () => {
  const f = await fixture()
  try {
    await configure(f.kernel, true)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    await assertCompletedOnce(f)
  } catch (error) {
    return closeAfterFailure(f.close, error)
  }
  await f.close()
}, 20_000)
