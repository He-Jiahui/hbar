import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { definePlugin, provide, type HarnessDriver } from '@hbar/plugin-sdk'
import { emptyUsage, providerSchema } from '@hbar/contracts'
import { encodePath } from '@hbar/schema-core'

const approvalPath = [{ kind: 'field' as const, name: 'session.approval' }]
const approvalKey = encodePath(approvalPath)

async function open(home: string) {
  const workspace = join(dirname(home), 'workspace')
  await mkdir(workspace, { recursive: true })
  return Kernel.create({ home, demo: true, workspace, secrets: new MemorySecrets() })
}

test('session approval setting persists, inherits the Host default, and snapshots each accepted Run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-permission-'))
  const home = join(root, 'data')
  let kernel = await open(home)
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const first = await kernel.createSession(workspace.id, 'first')
    const second = await kernel.createSession(workspace.id, 'second')
    let commits = 0
    let settings = new SettingsService(kernel.storage, undefined, () => {
      commits++
    })
    await kernel.setPermissionMode('allow')
    const scope = { kind: 'session' as const, targetId: first.id }
    const before = await settings.get(scope)
    expect(before.resolution.reports[approvalKey]).toMatchObject({
      effectiveValue: null,
      localPresence: false,
      inherited: true,
    })
    expect(await kernel.sessionPermissionMode(first.id)).toBe('allow')
    const receipt = await settings.apply({
      schemaVersion: 1,
      scope,
      changes: [{ op: 'set', path: approvalPath, value: 'deny' }],
      baselineRevisions: before.revisions,
      actorId: 'device-a',
      idempotencyKey: 'first-deny',
    })
    expect(receipt.resolution.reports[approvalKey]).toMatchObject({
      effectiveValue: 'deny',
      localPresence: true,
    })
    expect(commits).toBe(1)
    const replay = await settings.apply({
      schemaVersion: 1,
      scope,
      changes: [{ op: 'set', path: approvalPath, value: 'deny' }],
      baselineRevisions: before.revisions,
      actorId: 'device-a',
      idempotencyKey: 'first-deny',
    })
    expect(replay.commitId).toBe(receipt.commitId)
    expect(commits).toBe(1)
    expect((await settings.getReceipt(scope, 'device-a', 'first-deny'))?.commitId).toBe(receipt.commitId)
    expect(await kernel.sessionPermissionMode(first.id)).toBe('deny')
    expect(await kernel.sessionPermissionMode(second.id)).toBe('allow')
    const denied = await kernel.submit(first.id, 'first-denied', { text: 'one', images: [] }, 'local-fixture')
    const inherited = await kernel.submit(second.id, 'second-inherited', { text: 'two', images: [] }, 'local-fixture')
    const explicit = await kernel.submit(
      first.id,
      'first-explicit',
      { text: 'three', images: [], approval: 'ask' },
      'local-fixture',
    )
    expect([denied.input.approval, inherited.input.approval, explicit.input.approval]).toEqual(['deny', 'allow', 'ask'])
    await kernel.submit(
      first.id,
      'blocked-write',
      { text: '/tool write_file {"path":"blocked.txt","text":"blocked"}', images: [] },
      'local-fixture',
    )
    await kernel.submit(
      second.id,
      'allowed-write',
      { text: '/tool write_file {"path":"allowed.txt","text":"allowed"}', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
    expect(await Bun.file(join(root, 'workspace', 'blocked.txt')).exists()).toBe(false)
    expect(await Bun.file(join(root, 'workspace', 'allowed.txt')).text()).toBe('allowed')
    await kernel.setPermissionMode('ask')
    expect(denied.input.approval).toBe('deny')
    expect(inherited.input.approval).toBe('allow')
    expect(await kernel.sessionPermissionMode(first.id)).toBe('deny')
    expect(await kernel.sessionPermissionMode(second.id)).toBe('ask')
    await kernel.close()
    kernel = await open(home)
    settings = new SettingsService(kernel.storage)
    expect(await kernel.sessionPermissionMode(first.id)).toBe('deny')
    expect(await kernel.sessionPermissionMode(second.id)).toBe('ask')
    const latest = await settings.get(scope)
    const unset = await settings.apply({
      schemaVersion: 1,
      scope,
      changes: [{ op: 'unset', path: approvalPath }],
      baselineRevisions: latest.revisions,
      actorId: 'device-a',
      idempotencyKey: 'first-inherit',
    })
    expect(unset.resolution.reports[approvalKey]).toMatchObject({ localPresence: false, effectiveValue: null })
    expect(await kernel.sessionPermissionMode(first.id)).toBe('ask')
    const after = await settings.get(scope)
    const forbidden = await settings
      .apply({
        schemaVersion: 1,
        scope: { kind: 'global' },
        changes: [{ op: 'set', path: approvalPath, value: 'allow' }],
        baselineRevisions: { 'settings:global': after.revisions['settings:global']! },
        actorId: 'device-a',
        idempotencyKey: 'invalid-global',
      })
      .then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      )
    if (!('error' in forbidden)) throw new Error('Expected session-only scope rejection')
    expect(forbidden.error).toMatchObject({ code: 'LAYER_FORBIDDEN' })
  } finally {
    await kernel.close().catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

test('an older Kernel reads a tightened shared policy before its next tool, while preserving its original admission', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-shared-run-policy-'))
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const running = new Promise<void>(resolve => { entered = resolve })
  const driver = definePlugin({
    manifest: { id: 'driver.pi', name: 'Retained executor', description: 'Verify authoritative policy', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', provides: { driver: '1.0.0' }, permissions: [] },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          entered(); await gate
          await input.commit('assistant', [{ type: 'tool_call', callId: 'retained-write', name: 'write_file', args: { path: 'blocked-old-owner.txt', text: 'must not execute' } }])
          const result = await input.execute('write_file', { path: 'blocked-old-owner.txt', text: 'must not execute' }, 'retained-write')
          expect(result.isError).toBe(true)
          expect(result.text).toContain('approval policy changed')
          await input.commit('assistant', [{ type: 'text', text: 'The tightened policy stopped the write.' }])
        },
        summarize: async () => ({ text: '', usage: emptyUsage() }),
      })
    },
  })
  const older = await Kernel.create({ home: join(root, 'data'), workspace, demo: true, lifecycle: 'managed', secrets: new MemorySecrets(), profile: { replacements: { 'driver.pi': driver } } })
  let newer: Kernel | undefined
  try {
    await older.setPermissionMode('allow')
    const target = await older.storage.call('createWorkspace', workspace, 'retained policy')
    const session = await older.createSession(target.id)
    await older.storage.call('saveProvider', providerSchema.parse({ id: 'local-fixture', name: 'Fixture', protocol: 'mock', baseUrl: 'http://127.0.0.1', model: 'fixture' }))
    await older.activate()
    const run = await older.submit(session.id, 'retained-policy', { text: 'perform the write later', images: [], permissionAtAdmission: 'deny' }, 'local-fixture')
    await running
    expect(run.input.permissionAtAdmission).toBe('allow')
    newer = await Kernel.create({ home: join(root, 'data'), demo: true, lifecycle: 'managed', secrets: new MemorySecrets(), profile: { createStorage: async () => ({ call: (method, ...args) => older.storage.call(method, ...args), close: async () => {} }) } })
    await newer.setPermissionMode('deny')
    expect(older.permissionMode()).toBe('allow')
    expect(await older.sessionPermissionMode(session.id)).toBe('deny')
    release(); await older.waitForIdle()
    expect(await Bun.file(join(workspace, 'blocked-old-owner.txt')).exists()).toBe(false)
    expect((await older.storage.call('events', session.id, 0)).filter(event => event.type === 'tool.started')).toHaveLength(0)
  } finally { release(); await newer?.close(); await older.close(); await rm(root, { recursive: true, force: true }) }
}, 40_000)
