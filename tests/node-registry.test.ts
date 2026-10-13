import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { NodeRegistryService } from '@hbar/node-link'
import { createNodeIdentity, nodeIdFromPublicKey, nodeFingerprint } from '@hbar/node-core'
import { NODE_PROTOCOL_VERSION, nodeFloorSchema, nodeCapabilitiesSchema } from '@hbar/contracts/node'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import { HbarError } from '@hbar/contracts'

async function fixture(
  run: (registry: NodeRegistryService, storage: Storage, path: string, now: { value: number }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-registry-'))
  const path = join(root, 'host.sqlite')
  const storage = new Storage(path)
  let registry: NodeRegistryService | undefined
  try {
    await storage.call('ready')
    const now = { value: 1_000_000 }
    registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage), () => now.value)
    await run(registry, storage, path, now)
  } finally {
    registry?.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}
async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return error instanceof HbarError ? error.code : 'unexpected'
  }
}
function capabilities(nodeId: string) {
  const {
    roots: _roots,
    protectedPaths: _paths,
    environmentAllowlist: _allowlist,
    ...floor
  } = nodeFloorSchema.parse({ roots: [] })
  return nodeCapabilitiesSchema.parse({
    protocol: NODE_PROTOCOL_VERSION,
    nodeId,
    platform: process.platform,
    evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
    roots: [],
    sandbox: { backends: ['none'], filesystem: 'none', network: 'none' },
    floor,
  })
}
test('conversation node invitations register pinned identities without granting operator device access', async () => {
  await fixture(async (registry, storage) => {
    const workspace = createNodeIdentity()
    const invitation = await registry.invite('build-box')
    expect(invitation.fingerprint).toBe(nodeFingerprint(registry.identity.publicKey))
    const node = await registry.join(workspace.publicKey, invitation.code, '127.0.0.1')
    expect(node).toMatchObject({
      nodeId: nodeIdFromPublicKey(workspace.publicKey),
      name: 'build-box',
      revokedAt: null,
      lastSeenAt: null,
    })
    expect(await registry.known(workspace.publicKey)).toEqual(node)
    expect(await storage.call('devices')).toEqual([])
    expect(await codeOf(registry.join(createNodeIdentity().publicKey, invitation.code, '127.0.0.1'))).toBe(
      'NODE_PAIRING_FAILED',
    )
    expect(await codeOf(registry.invite('BUILD-BOX'))).toBe('NODE_NAME_CONFLICT')
    expect(JSON.stringify(await registry.list())).not.toContain('privateKey')
  })
})
test('a node invitation admits at most one concurrent join and expires after five minutes', async () => {
  await fixture(async (registry, _storage, _path, now) => {
    const invitation = await registry.invite('concurrent')
    const results = await Promise.allSettled([
      registry.join(createNodeIdentity().publicKey, invitation.code, 'one'),
      registry.join(createNodeIdentity().publicKey, invitation.code, 'two'),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await registry.list()).toHaveLength(1)
    const expired = await registry.invite('expired')
    now.value = expired.expiresAt
    expect(await codeOf(registry.join(createNodeIdentity().publicKey, expired.code, 'three'))).toBe(
      'NODE_PAIRING_FAILED',
    )
  })
})
test('source rate limiting rejects node code guessing and bounds pending invitations', async () => {
  await fixture(async (registry, _storage, _path, now) => {
    const key = createNodeIdentity().publicKey
    for (let count = 0; count < 5; count++)
      expect(await codeOf(registry.join(key, '00000000', 'source'))).toBe('NODE_PAIRING_FAILED')
    expect(await codeOf(registry.join(key, '00000000', 'source'))).toBe('RATE_LIMIT')
    now.value += 60_001
    const invitation = await registry.invite('valid')
    await registry.join(key, invitation.code, 'source')
    const pending = await Promise.allSettled(Array.from({ length: 132 }, (_, count) => registry.invite('box-' + count)))
    expect(pending.filter((value) => value.status === 'fulfilled')).toHaveLength(128)
    expect(await codeOf(registry.invite('overflow'))).toBe('NODE_INVITE_CAPACITY')
  })
})
test('revoke persists the pinned tombstone, fires a link fence and prevents touch or re-pairing', async () => {
  await fixture(async (registry, storage) => {
    const workspace = createNodeIdentity()
    const invitation = await registry.invite('build-box')
    const node = await registry.join(workspace.publicKey, invitation.code, 'source')
    const fenced: string[] = []
    const dispose = registry.onRevoke((id) => fenced.push(id))
    const touched = await registry.touch(node.nodeId, capabilities(node.nodeId))
    expect(touched.lastSeenAt).not.toBeNull()
    await registry.revoke('build-box')
    expect(fenced).toEqual([node.nodeId])
    dispose()
    expect(await codeOf(registry.known(workspace.publicKey))).toBe('NODE_REVOKED')
    expect(await codeOf(registry.touch(node.nodeId, capabilities(node.nodeId)))).toBe('NODE_REVOKED')
    const restarted = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
    try {
      expect(restarted.identity).toEqual(registry.identity)
      expect(await codeOf(restarted.known(workspace.publicKey))).toBe('NODE_REVOKED')
      const next = await restarted.invite('build-box')
      expect(await codeOf(restarted.join(workspace.publicKey, next.code, 'source'))).toBe('NODE_REVOKED')
      await restarted.join(createNodeIdentity().publicKey, next.code, 'source')
    } finally {
      restarted.dispose()
    }
  })
})
test('capabilities cannot rename another node identity or reopen a revoked node', async () => {
  await fixture(async (registry) => {
    const invitation = await registry.invite('box')
    const node = await registry.join(createNodeIdentity().publicKey, invitation.code, 'source')
    const foreign = nodeIdFromPublicKey(createNodeIdentity().publicKey)
    expect(await codeOf(registry.touch(node.nodeId, capabilities(foreign)))).toBe('NODE_IDENTITY_CONFLICT')
    expect((await registry.list())[0]?.lastSeenAt).toBeNull()
  })
})
test('migration 27 adds a separate node registry and preserves legacy devices and workspaces', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-migration-')),
    path = join(root, 'host.sqlite')
  let storage = new Storage(path)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'legacy')
    await storage.call('putDevice', { id: 'legacy', name: 'legacy', createdAt: 1, lastSeenAt: 1 }, 'legacy-hash')
    await storage.close()
    const old = new Database(path)
    old.exec(
      'DROP INDEX node_run_workspace_mounts_session; DROP TABLE node_run_workspace_mounts; DROP INDEX node_run_worktrees_session; DROP TABLE node_run_worktrees; DROP TABLE node_execution_intents; DROP TABLE node_workspace_locations; DROP TABLE workspace_nodes; DROP TABLE node_conversation_identity; PRAGMA user_version=26',
    )
    old.close()
    storage = new Storage(path)
    expect(await storage.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    expect(await storage.call('nodes')).toEqual([])
    expect(await storage.call('findWorkspace', workspace.id)).toMatchObject({ name: 'legacy', path: root })
    expect(await storage.call('deviceByHash', 'legacy-hash')).toMatchObject({ role: 'operator', workspaceIds: null })
    const registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
    const identity = registry.identity
    registry.dispose()
    await storage.close()
    storage = new Storage(path)
    await storage.call('ready')
    const reopened = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
    expect(reopened.identity).toEqual(identity)
    reopened.dispose()
  } finally {
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
})
