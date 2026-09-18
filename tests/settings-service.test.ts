import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { encodePath, type SchemaPath } from '@hbar/schema-core'

const path = (name: string): SchemaPath => [{ kind: 'field', name }]
const modelPath = encodePath(path('provider.model'))
const thinkingPath = encodePath(path('provider.thinkingLevel'))

async function open(home: string) {
  const workspace = join(home, 'workspace')
  await mkdir(workspace, { recursive: true })
  return Kernel.create({ home, demo: true, workspace, secrets: new MemorySecrets() })
}

test('settings apply commits one layered patch with vector CAS, idempotent receipts and restart recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-settings-service-'))
  const home = join(root, 'data')
  let kernel = await open(home)
  try {
    let service = new SettingsService(kernel.storage)
    const bootstrap = await kernel.bootstrap({
      version: 'test',
      protocol: 1,
      instanceId: kernel.instanceId,
      platform: process.platform,
      addresses: [],
      activeRuns: 0,
      demo: true,
    })
    const workspace = bootstrap.workspaces[0]!
    const session = await kernel.createSession(workspace.id, 'settings')

    const globalBefore = await service.get({ kind: 'global' })
    const globalReceipt = await service.apply({
      schemaVersion: 1,
      scope: { kind: 'global' },
      changes: [{ op: 'set', path: path('provider.model'), value: 'global-model' }],
      baselineRevisions: globalBefore.revisions,
      actorId: 'device-1',
      idempotencyKey: 'global-model',
    })
    expect(globalReceipt).toMatchObject({ layerId: 'settings:global', revision: 1 })
    expect(globalReceipt.resolution.reports[modelPath]).toMatchObject({
      effectiveValue: 'global-model',
      applyMode: 'nextRun',
      applyState: 'pending',
    })
    const retried = await service.apply({
      schemaVersion: 1,
      scope: { kind: 'global' },
      changes: [{ op: 'set', path: path('provider.model'), value: 'global-model' }],
      baselineRevisions: globalBefore.revisions,
      actorId: 'device-1',
      idempotencyKey: 'global-model',
    })
    expect(retried.commitId).toBe(globalReceipt.commitId)
    expect(retried.revision).toBe(globalReceipt.revision)
    const conflictingRetry = service
      .apply({
        schemaVersion: 1,
        scope: { kind: 'global' },
        changes: [{ op: 'set', path: path('provider.model'), value: 'different' }],
        baselineRevisions: globalBefore.revisions,
        actorId: 'device-1',
        idempotencyKey: 'global-model',
      })
      .then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      )
    const conflictingRetryOutcome = await conflictingRetry
    if (!('error' in conflictingRetryOutcome)) throw new Error('Expected idempotency conflict')
    expect(conflictingRetryOutcome.error).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })

    const workspaceBefore = await service.get({ kind: 'workspace', targetId: workspace.id })
    const workspaceReceipt = await service.apply({
      schemaVersion: 1,
      scope: { kind: 'workspace', targetId: workspace.id },
      changes: [
        { op: 'set', path: path('provider.model'), value: 'workspace-model' },
        { op: 'set', path: path('provider.thinkingLevel'), value: 'high' },
      ],
      baselineRevisions: workspaceBefore.revisions,
      actorId: 'device-1',
      idempotencyKey: 'workspace-model',
    })
    expect(workspaceReceipt.revision).toBe(1)
    expect(workspaceReceipt.values).toEqual({ [modelPath]: 'workspace-model', [thinkingPath]: 'high' })

    const sessionBefore = await service.get({ kind: 'session', targetId: session.id })
    const sessionReceipt = await service.apply({
      schemaVersion: 1,
      scope: { kind: 'session', targetId: session.id },
      changes: [{ op: 'set', path: path('provider.model'), value: null }],
      baselineRevisions: sessionBefore.revisions,
      actorId: 'device-1',
      idempotencyKey: 'session-null',
    })
    expect(sessionReceipt.resolution.reports[modelPath]).toMatchObject({
      localPresence: true,
      localValue: null,
      effectiveValue: null,
      inherited: false,
    })
    const sessionWithNull = await service.get({ kind: 'session', targetId: session.id })
    const unset = await service.apply({
      schemaVersion: 1,
      scope: { kind: 'session', targetId: session.id },
      changes: [{ op: 'unset', path: path('provider.model') }],
      baselineRevisions: sessionWithNull.revisions,
      actorId: 'device-1',
      idempotencyKey: 'session-unset',
    })
    expect(unset.resolution.reports[modelPath]).toMatchObject({
      localPresence: false,
      effectiveValue: 'workspace-model',
      inherited: true,
    })

    const stale = await service.get({ kind: 'session', targetId: session.id })
    const latestGlobal = await service.get({ kind: 'global' })
    await service.apply({
      schemaVersion: 1,
      scope: { kind: 'global' },
      changes: [{ op: 'set', path: path('provider.model'), value: 'global-new' }],
      baselineRevisions: latestGlobal.revisions,
      actorId: 'device-1',
      idempotencyKey: 'global-new',
    })
    const staleApply = await service
      .apply({
        schemaVersion: 1,
        scope: { kind: 'session', targetId: session.id },
        changes: [{ op: 'set', path: path('provider.thinkingLevel'), value: 'low' }],
        baselineRevisions: stale.revisions,
        actorId: 'device-1',
        idempotencyKey: 'stale-session',
      })
      .then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      )
    if (!('error' in staleApply)) throw new Error('Expected revision conflict')
    expect(staleApply.error).toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(
      (await service.get({ kind: 'session', targetId: session.id })).resolution.reports[thinkingPath],
    ).toMatchObject({
      localPresence: false,
      effectiveValue: 'high',
    })
    const currentSession = await service.get({ kind: 'session', targetId: session.id })
    const forbidden = await service
      .apply({
        schemaVersion: 1,
        scope: { kind: 'session', targetId: session.id },
        changes: [{ op: 'set', path: path('session.defaultBudget'), value: 100 }],
        baselineRevisions: currentSession.revisions,
        actorId: 'device-1',
        idempotencyKey: 'bad-layer',
      })
      .then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      )
    if (!('error' in forbidden)) throw new Error('Expected layer rejection')
    expect(forbidden.error).toMatchObject({ code: 'LAYER_FORBIDDEN' })

    await kernel.close()
    kernel = await open(home)
    service = new SettingsService(kernel.storage)
    const restored = await service.get({ kind: 'workspace', targetId: workspace.id })
    expect(restored.resolution.reports[modelPath]).toMatchObject({ effectiveValue: 'workspace-model' })
    expect(restored.resolution.reports[thinkingPath]).toMatchObject({ effectiveValue: 'high' })
  } finally {
    await kernel.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})
