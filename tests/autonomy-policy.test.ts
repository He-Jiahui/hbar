import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage, type StoragePort } from '@hbar/storage'
import { HbarError } from '@hbar/contracts'
import { SettingsService } from '@hbar/kernel/controller'
import {
  AUTONOMY_DECISION_MODE_SETTING,
  AUTONOMY_DECISION_TARGET_SETTING,
  AUTONOMY_DECISION_TIMEOUT_SETTING,
  AUTONOMY_LEGACY_MIGRATED_SETTING,
  AUTONOMY_DECISION_MODES,
  autonomyDecisionPolicySchema,
} from '@hbar/contracts/autonomy'
import type { SettingsChange } from '@hbar/settings-core'
import { encodePath } from '@hbar/schema-core'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { removeOwnedTestDirectory } from './owned-temp-directory'

type Scope = Parameters<SettingsService['get']>[0]
const path = (name: string) => [{ kind: 'field' as const, name }]
const set = (name: string, value: unknown): SettingsChange => ({ op: 'set', path: path(name), value })
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected policy mutation to fail')
}
async function fixture() {
  const prefix = 'hbar-autonomy-policy-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'Source')
  const otherWorkspace = await storage.call('createWorkspace', join(root, 'other'), 'Target')
  const source = await storage.call('createSession', workspace.id)
  const target = await storage.call('createSession', otherWorkspace.id)
  let service = new SettingsService(storage)
  return {
    root,
    workspace,
    source,
    target,
    get service() {
      return service
    },
    get storage() {
      return storage
    },
    async apply(scope: Scope, changes: SettingsChange[], id: string = crypto.randomUUID()) {
      const before = await service.get(scope)
      return service.apply({
        schemaVersion: before.schemaVersion,
        scope,
        changes,
        baselineRevisions: before.revisions,
        actorId: 'fixture-actor',
        idempotencyKey: id,
      })
    },
    async restart() {
      await storage.close()
      storage = new Storage(join(root, 'state.sqlite'))
      await storage.call('ready')
      service = new SettingsService(storage)
    },
    async close() {
      await storage.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('decision policies default to waiting and resolve one persisted global mode with explicit session overrides', async () => {
  const f = await fixture()
  try {
    expect(await f.service.decisionPolicy(f.source.id)).toMatchObject({
      policy: { mode: 'wait_user' },
      source: 'default',
    })
    await f.apply({ kind: 'global' }, [set(AUTONOMY_DECISION_MODE_SETTING, 'recommended')])
    expect(await f.service.decisionPolicy(f.source.id)).toMatchObject({
      policy: { mode: 'recommended' },
      source: 'global',
    })
    await f.apply({ kind: 'session', targetId: f.source.id }, [set(AUTONOMY_DECISION_MODE_SETTING, 'wait_user')])
    expect(await f.service.decisionPolicy(f.source.id)).toMatchObject({
      policy: { mode: 'wait_user' },
      source: 'session',
    })
    expect(await f.service.decisionPolicy(f.target.id)).toMatchObject({
      policy: { mode: 'recommended' },
      source: 'global',
    })
    await f.restart()
    expect(await f.service.decisionPolicy(f.source.id)).toMatchObject({
      policy: { mode: 'wait_user' },
      source: 'session',
    })
    await f.apply({ kind: 'session', targetId: f.source.id }, [
      { op: 'unset', path: path(AUTONOMY_DECISION_MODE_SETTING) },
    ])
    expect(await f.service.decisionPolicy(f.source.id)).toMatchObject({
      policy: { mode: 'recommended' },
      source: 'global',
    })
  } finally {
    await f.close()
  }
})

test('legacy automation migrates once into the real settings layer and cannot resurrect after inheritance', async () => {
  const f = await fixture()
  try {
    const before = await f.service.get({ kind: 'session', targetId: f.source.id })
    await f.service.migrateLegacyDecisionPolicy(f.source.id, true)
    const migrated = await f.service.get({ kind: 'session', targetId: f.source.id })
    expect(migrated.revisions).not.toEqual(before.revisions)
    expect(migrated.resolution.reports[encodePath(path(AUTONOMY_DECISION_MODE_SETTING))]).toMatchObject({
      effectiveValue: 'recommended',
      sourceLayer: `settings:session:${f.source.id}`,
    })
    expect(await f.service.decisionPolicy(f.source.id)).toMatchObject({
      policy: { mode: 'recommended' },
      source: 'session',
      revisions: migrated.revisions,
    })
    await f.service.migrateLegacyDecisionPolicy(f.source.id, true)
    expect((await f.service.get({ kind: 'session', targetId: f.source.id })).revisions).toEqual(migrated.revisions)
    await f.apply({ kind: 'global' }, [set(AUTONOMY_DECISION_MODE_SETTING, 'wait_user')])
    expect((await f.service.decisionPolicy(f.source.id)).source).toBe('session')
    await f.apply({ kind: 'session', targetId: f.source.id }, [set(AUTONOMY_DECISION_MODE_SETTING, 'wait_user')])
    expect(await f.service.decisionPolicy(f.source.id)).toMatchObject({
      policy: { mode: 'wait_user' },
      source: 'session',
    })
    await f.apply({ kind: 'session', targetId: f.source.id }, [
      { op: 'unset', path: path(AUTONOMY_DECISION_MODE_SETTING) },
    ])
    await f.restart()
    await f.service.migrateLegacyDecisionPolicy(f.source.id, true)
    expect(await f.service.decisionPolicy(f.source.id)).toMatchObject({
      policy: { mode: 'wait_user' },
      source: 'global',
    })
    await f.service.migrateLegacyDecisionPolicy(f.target.id, false)
    expect(await f.service.decisionPolicy(f.target.id)).toMatchObject({
      policy: { mode: 'wait_user' },
      source: 'session',
    })
    expect(
      await failure(
        f.apply({ kind: 'session', targetId: f.source.id }, [set(AUTONOMY_LEGACY_MIGRATED_SETTING, false)]),
      ),
    ).toMatchObject({ code: 'READ_ONLY_SETTING' })
    await f.service.setLegacyDecisionPolicy(f.source.id, true)
    expect((await f.service.decisionPolicy(f.source.id)).policy.mode).toBe('recommended')
  } finally {
    await f.close()
  }
})

test('choosing and then inheriting a policy before migration preserves the user choice', async () => {
  const f = await fixture()
  try {
    const scope: Scope = { kind: 'session', targetId: f.source.id }
    await f.apply(scope, [set(AUTONOMY_DECISION_MODE_SETTING, 'wait_user')])
    await f.apply(scope, [{ op: 'unset', path: path(AUTONOMY_DECISION_MODE_SETTING) }])
    const before = await f.service.get(scope)
    await f.service.migrateLegacyDecisionPolicy(f.source.id, true)
    expect((await f.service.get(scope)).revisions).toEqual(before.revisions)
    expect((await f.service.decisionPolicy(f.source.id)).policy.mode).toBe('wait_user')
  } finally {
    await f.close()
  }
})

test('a lost migration commit reply preserves the atomic mode and marker without repeating a write', async () => {
  const f = await fixture()
  let committed = 0
  const port: StoragePort = {
    async call(method, ...args) {
      const result = await f.storage.call(method, ...args)
      if (method === 'commitSettings') {
        committed++
        throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Fixture loses the accepted commit reply')
      }
      return result
    },
    close: async () => {},
  }
  try {
    const service = new SettingsService(port)
    expect(await failure(service.migrateLegacyDecisionPolicy(f.source.id, true))).toMatchObject({
      code: 'STORAGE_RESULT_UNKNOWN',
    })
    await f.restart()
    await service.migrateLegacyDecisionPolicy(f.source.id, true)
    expect(committed).toBe(1)
    expect((await f.service.decisionPolicy(f.source.id)).policy.mode).toBe('recommended')
  } finally {
    await f.close()
  }
})

test('delegation requires an explicit live same-Host target, rejects self and workspace policy scopes, and persists atomically', async () => {
  const f = await fixture()
  try {
    const scope: Scope = { kind: 'session', targetId: f.source.id }
    const before = await f.service.get(scope)
    expect(await failure(f.apply(scope, [set(AUTONOMY_DECISION_MODE_SETTING, 'delegate')]))).toMatchObject({
      code: 'AUTONOMY_TARGET_REQUIRED',
    })
    expect((await f.service.get(scope)).revisions).toEqual(before.revisions)
    expect(
      await failure(
        f.apply(scope, [
          set(AUTONOMY_DECISION_MODE_SETTING, 'delegate'),
          set(AUTONOMY_DECISION_TARGET_SETTING, f.source.id),
        ]),
      ),
    ).toMatchObject({ code: 'AUTONOMY_DELEGATION_SELF' })
    expect(
      await failure(
        f.apply(scope, [
          set(AUTONOMY_DECISION_MODE_SETTING, 'delegate'),
          set(AUTONOMY_DECISION_TARGET_SETTING, 'missing-session'),
        ]),
      ),
    ).toMatchObject({ code: 'AUTONOMY_TARGET_UNAVAILABLE' })
    expect(
      await failure(
        f.apply({ kind: 'workspace', targetId: f.workspace.id }, [set(AUTONOMY_DECISION_MODE_SETTING, 'recommended')]),
      ),
    ).toMatchObject({ code: 'LAYER_FORBIDDEN' })
    await f.storage.call('updateSession', f.target.id, { archived: true })
    expect(
      await failure(
        f.apply(scope, [
          set(AUTONOMY_DECISION_MODE_SETTING, 'delegate'),
          set(AUTONOMY_DECISION_TARGET_SETTING, f.target.id),
        ]),
      ),
    ).toMatchObject({ code: 'AUTONOMY_TARGET_UNAVAILABLE' })
    await f.storage.call('updateSession', f.target.id, { archived: false })
    const changes = [
      set(AUTONOMY_DECISION_MODE_SETTING, 'delegate'),
      set(AUTONOMY_DECISION_TARGET_SETTING, f.target.id),
    ]
    const saved = await f.apply(scope, changes, 'delegation')
    expect(await f.service.decisionPolicy(f.source.id)).toMatchObject({
      policy: { mode: 'delegate', targetSessionId: f.target.id },
      source: 'session',
    })
    const repeated = await f.service.apply({
      schemaVersion: 1,
      scope,
      changes,
      baselineRevisions: before.revisions,
      actorId: 'fixture-actor',
      idempotencyKey: 'delegation',
    })
    expect(repeated.commitId).toBe(saved.commitId)
    await f.restart()
    expect((await f.service.decisionPolicy(f.source.id)).policy).toEqual({
      mode: 'delegate',
      targetSessionId: f.target.id,
    })
  } finally {
    await f.close()
  }
})

test('policy configuration is exclusive and carries localized bounded form choices with conditional target input', async () => {
  const f = await fixture()
  try {
    const description = f.service.describe()
    const mode = description.fields.find(
      (field) => encodePath(field.path) === encodePath(path(AUTONOMY_DECISION_MODE_SETTING)),
    )
    const target = description.fields.find(
      (field) => encodePath(field.path) === encodePath(path(AUTONOMY_DECISION_TARGET_SETTING)),
    )
    const timeout = description.fields.find(
      (field) => encodePath(field.path) === encodePath(path(AUTONOMY_DECISION_TIMEOUT_SETTING)),
    )
    expect(timeout).toMatchObject({
      component: 'NumberField',
      type: 'integer',
      defaultValue: 300,
      minimum: 1,
      maximum: 3600,
      allowedScopes: ['global', 'session'],
      applyMode: 'nextRequest',
      visibleWhen: target?.visibleWhen,
    })
    expect(mode).toMatchObject({
      choices: [...AUTONOMY_DECISION_MODES],
      allowedScopes: ['global', 'session'],
      defaultValue: 'wait_user',
      applyMode: 'nextRequest',
      component: 'PopupSelect',
    })
    expect(target?.visibleWhen).toEqual({ all: [{ path: path(AUTONOMY_DECISION_MODE_SETTING), equals: 'delegate' }] })
    expect(autonomyDecisionPolicySchema.safeParse({ mode: 'recommended', targetSessionId: f.target.id }).success).toBe(
      false,
    )
    expect(autonomyDecisionPolicySchema.safeParse({ mode: 'delegate' }).success).toBe(false)
    for (const locale of ['zh-CN', 'en-US'] as const) {
      const copy = getShellCopy(locale).settings
      expect(copy.resolve('i18n:settings.backend.decisionMode.label')).not.toStartWith('i18n:')
      expect(copy.resolve('i18n:settings.backend.decisionTimeout.label')).not.toStartWith('i18n:')
      expect(copy.resolve('i18n:settings.backend.decisionTimeout.help')).toContain('300')
      const labels =
        locale === 'zh-CN'
          ? ([
              ['wait_user', '需要输入时等待用户'],
              ['recommended', '自动选择推荐项'],
              ['delegate', '交给另一个会话抉择'],
            ] as const)
          : ([
              ['wait_user', 'Wait when user input is needed'],
              ['recommended', 'Choose recommended options'],
              ['delegate', 'Delegate to another session'],
            ] as const)
      for (const [value, label] of labels) expect(copy.form.selectedInvalid(value)).toContain(label)
    }
  } finally {
    await f.close()
  }
})

test('delegation wait time inherits globally, supports session overrides and persists across restart', async () => {
  const f = await fixture()
  try {
    await f.apply({ kind: 'global' }, [set(AUTONOMY_DECISION_TIMEOUT_SETTING, 120)])
    const scope: Scope = { kind: 'session', targetId: f.source.id }
    await f.apply(scope, [
      set(AUTONOMY_DECISION_MODE_SETTING, 'delegate'),
      set(AUTONOMY_DECISION_TARGET_SETTING, f.target.id),
    ])
    expect((await f.service.decisionPolicy(f.source.id)).policy).toEqual({
      mode: 'delegate',
      targetSessionId: f.target.id,
      timeoutMs: 120_000,
    })
    await f.apply(scope, [set(AUTONOMY_DECISION_TIMEOUT_SETTING, 1)])
    expect((await f.service.decisionPolicy(f.source.id)).policy).toEqual({
      mode: 'delegate',
      targetSessionId: f.target.id,
      timeoutMs: 1_000,
    })
    await f.restart()
    expect((await f.service.decisionPolicy(f.source.id)).policy).toMatchObject({ timeoutMs: 1_000 })
    await f.apply(scope, [{ op: 'unset', path: path(AUTONOMY_DECISION_TIMEOUT_SETTING) }])
    expect((await f.service.decisionPolicy(f.source.id)).policy).toMatchObject({ timeoutMs: 120_000 })
    await f.apply({ kind: 'global' }, [{ op: 'unset', path: path(AUTONOMY_DECISION_TIMEOUT_SETTING) }])
    expect((await f.service.decisionPolicy(f.source.id)).policy).toEqual({
      mode: 'delegate',
      targetSessionId: f.target.id,
    })
  } finally {
    await f.close()
  }
})

test('invalid wait times never commit or change the policy revisions', async () => {
  const f = await fixture()
  try {
    const scope: Scope = { kind: 'session', targetId: f.source.id }
    const before = await f.service.get(scope)
    for (const value of [0, 3601, 1.5, '2', null]) {
      await failure(f.apply(scope, [set(AUTONOMY_DECISION_TIMEOUT_SETTING, value)]))
      expect((await f.service.get(scope)).revisions).toEqual(before.revisions)
    }
    expect(
      autonomyDecisionPolicySchema.safeParse({ mode: 'delegate', targetSessionId: f.target.id, timeoutMs: 999 })
        .success,
    ).toBe(false)
    expect(
      autonomyDecisionPolicySchema.safeParse({ mode: 'delegate', targetSessionId: f.target.id, timeoutMs: 3_600_001 })
        .success,
    ).toBe(false)
  } finally {
    await f.close()
  }
})

test('changing only the wait time preserves migration of the original legacy decision mode', async () => {
  const f = await fixture()
  try {
    const scope: Scope = { kind: 'session', targetId: f.source.id }
    await f.apply(scope, [set(AUTONOMY_DECISION_TIMEOUT_SETTING, 10)])
    await f.service.migrateLegacyDecisionPolicy(f.source.id, true)
    expect((await f.service.decisionPolicy(f.source.id)).policy).toEqual({ mode: 'recommended' })
    await f.apply(scope, [
      set(AUTONOMY_DECISION_MODE_SETTING, 'delegate'),
      set(AUTONOMY_DECISION_TARGET_SETTING, f.target.id),
    ])
    expect((await f.service.decisionPolicy(f.source.id)).policy).toEqual({
      mode: 'delegate',
      targetSessionId: f.target.id,
      timeoutMs: 10_000,
    })
  } finally {
    await f.close()
  }
})
