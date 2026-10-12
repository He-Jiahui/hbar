import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, workspaceLocationOf } from '@hbar/contracts'
import { nodeFloorSchema, nodeCapabilitiesSchema } from '@hbar/contracts/node'
import { Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { NodeRegistryService } from '@hbar/node-link'
import { createNodeIdentity } from '@hbar/node-core'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'

async function fixture(run: (storage: Storage, registry: NodeRegistryService, path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-workspace-storage-')),
    path = join(root, 'host.sqlite')
  const storage = new Storage(path)
  await storage.call('ready')
  const registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
  try {
    await run(storage, registry, path)
  } finally {
    registry.dispose()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  }
}
async function register(registry: NodeRegistryService, name: string) {
  const invite = await registry.invite(name)
  const identity = createNodeIdentity()
  const node = await registry.join(identity.publicKey, invite.code, name)
  const {
    roots: _roots,
    protectedPaths: _paths,
    environmentAllowlist: _allowlist,
    ...floor
  } = nodeFloorSchema.parse({ roots: [] })
  await registry.touch(
    node.nodeId,
    nodeCapabilitiesSchema.parse({
      protocol: 1,
      nodeId: node.nodeId,
      platform: 'linux',
      evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
      roots: [{ rootId: 'engine', name: 'Engine', nodePath: '/srv/' + name, access: 'write' }],
      sandbox: { backends: ['none'], filesystem: 'none', network: 'none' },
      floor,
    }),
  )
  return node
}
async function codeOf(work: Promise<unknown>) {
  try {
    await work
    return null
  } catch (error) {
    return error instanceof HbarError ? error.code : 'unexpected'
  }
}

test('node workspaces persist a verified owner and all directory projections preserve their location', async () => {
  await fixture(async (storage, registry, path) => {
    const node = await register(registry, 'build-box')
    const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
    expect(workspace).toMatchObject({
      path: `hbar-node://${node.nodeId}/engine`,
      name: 'Engine',
      location: { kind: 'node', nodeId: node.nodeId, rootId: 'engine', nodePath: '/srv/build-box' },
    })
    expect(await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })).toEqual(workspace)
    const folders = [{ id: 'root', alias: 'root', path: '/some-local-path' }]
    expect(
      await codeOf(
        storage.call('applyWorkspaceFolders', {
          actorId: 'operator',
          idempotencyKey: 'mount-remote',
          folders,
          request: { operation: 'save', input: { workspaceId: workspace.id, expectedRevision: 0, folders } },
        }),
      ),
    ).toBe('WORKSPACE_REMOTE')
    const parent = await storage.call('createSession', workspace.id, 'Parent')
    const child = await storage.call('createSession', workspace.id, 'Child', parent.id)
    await storage.call('append', child.id, 'agent.created', { parentSessionId: parent.id })
    const projections = [
      await storage.call('workspace', workspace.id),
      await storage.call('findWorkspace', workspace.id),
      ...(await storage.call('workspaces')),
      ...(await storage.call('workspacePage', {})).items,
      ...(await storage.call('workspaceActivityPage', {})).items.map((item) => item.workspace),
      ...(await storage.call('workspaceSidebarPage', {})).items.map((item) => item.workspace),
      ...(await storage.call('globalSessionActivityPage', {})).items.map((item) => item.workspace),
      (await storage.call('sessionAgentAncestors', child.id)).workspace,
    ]
    expect(projections.length).toBeGreaterThan(7)
    for (const value of projections) expect(value).toEqual(workspace)
    await storage.close()
    const reopened = new Storage(path)
    try {
      expect(workspaceLocationOf(await reopened.call('workspace', workspace.id))).toEqual(
        workspaceLocationOf(workspace),
      )
    } finally {
      await reopened.close()
    }
  })
})

test('node session pages include bound children and exclude local, other-node, moved and revoked sessions', async () => {
  await fixture(async (storage, registry) => {
    const first = await register(registry, 'first'),
      second = await register(registry, 'second')
    const a = await storage.call('createNodeWorkspace', { nodeId: first.nodeId, rootId: 'engine' })
    const b = await storage.call('createNodeWorkspace', { nodeId: second.nodeId, rootId: 'engine' })
    const local = await storage.call('createWorkspace', '/local', 'Local')
    const parent = await storage.call('createSession', a.id, 'Parent'),
      child = await storage.call('createSession', a.id, 'Child', parent.id)
    await storage.call('createSession', b.id, 'Other')
    await storage.call('createSession', local.id, 'Local')
    const page = await storage.call('nodeSessionsPage', { nodeId: first.nodeId, limit: 1 })
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).not.toBeNull()
    const rest = await storage.call('nodeSessionsPage', { nodeId: first.nodeId, after: page.nextCursor ?? '' })
    expect([...page.items, ...rest.items].map((item) => item.id).sort()).toEqual([parent.id, child.id].sort())
    await storage.call('moveSession', child.id, local.id)
    expect((await storage.call('nodeSessionsPage', { nodeId: first.nodeId })).items.map((item) => item.id)).toEqual([
      parent.id,
    ])
    await registry.revoke(first.nodeId)
    expect((await storage.call('nodeSessionsPage', { nodeId: first.nodeId })).items).toEqual([])
    expect((await storage.call('nodeSessionsPage', { nodeId: second.nodeId })).items).toHaveLength(1)
  })
})

test('unverified roots, forged local locators and revoked owners cannot create remote workspace rows', async () => {
  await fixture(async (storage, registry) => {
    const node = await register(registry, 'checked')
    expect(await codeOf(storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'missing' }))).toBe(
      'NODE_ROOT_NOT_FOUND',
    )
    expect(await codeOf(storage.call('createWorkspace', `hbar-node://${node.nodeId}/engine`, 'Forged'))).toBe(
      'WORKSPACE_REMOTE',
    )
    await registry.revoke(node.nodeId)
    expect(await codeOf(storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' }))).toBe(
      'NODE_REVOKED',
    )
    expect(await storage.call('workspaces')).toEqual([])
  })
})

test('migration 28 preserves pre-node local workspace rows without adding remote metadata', async () => {
  await fixture(async (storage, _registry, path) => {
    const local = await storage.call('createWorkspace', '/legacy', 'Legacy')
    await storage.close()
    const database = new Database(path)
    try {
      database.exec('DROP TABLE node_workspace_locations; PRAGMA user_version=27')
    } finally {
      database.close()
    }
    const migrated = new Storage(path)
    try {
      expect(await migrated.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
      expect(await migrated.call('workspace', local.id)).toEqual(local)
      expect(workspaceLocationOf(await migrated.call('workspace', local.id))).toEqual({ kind: 'local' })
    } finally {
      await migrated.close()
    }
  })
})
