import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
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
