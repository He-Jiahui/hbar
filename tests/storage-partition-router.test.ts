import { expect, test } from 'bun:test'
import type { StorageCall, StorageMethods } from '../packages/storage/src/types'
import { STORAGE_RPC_METHODS } from '../packages/storage/src/rpc-catalog'
import { partitionRouteCatalog, type PartitionRouteDefinition } from '../packages/storage/src/partition-route-catalog'
import { resolvePartitionRoute } from '../packages/storage/src/partition-router'
import type { PartitionLocatorReader } from '../packages/storage/src/partition-locator'
import type { SessionLocator } from '../packages/storage/src/partition-locator-schema'
import type { PartitionManifest } from '../packages/storage/src/partition-manifest'

const generation = '11111111-1111-4111-8111-111111111111'
const project = '22222222-2222-4222-8222-222222222222'
const partition = '33333333-3333-4333-8333-333333333333'
const incarnation = '44444444-4444-4444-8444-444444444444'
const session: SessionLocator = {
  sessionId: 'session',
  workspaceId: 'workspace',
  sourceEpoch: incarnation,
  revision: 1,
  state: 'active',
  address: { generation, projectPartitionId: project, partitionId: partition, incarnation },
}
const manifest: PartitionManifest = {
  schema: 'hbar.storage-partitions',
  formatVersion: 1,
  minimumReaderVersion: 1,
  activeGeneration: generation,
  storageIdentity: incarnation,
  activatedAt: 0,
  ownership: { global: 'global', project: 'project', session: 'session' },
}
function reader() {
  const lookups: string[] = []
  const locators: PartitionLocatorReader = {
    generation,
    resolveWorkspace: () => {
      throw new Error('No global/project fallback permitted')
    },
    resolveSession(id) {
      lookups.push(`session:${id}`)
      return id === session.sessionId ? { status: 'active', session } : { status: 'missing' }
    },
    resolveEntity(kind, id) {
      lookups.push(`${kind}:${id}`)
      return id === `${kind}-id` ? { status: 'active', session } : { status: 'missing' }
    },
  }
  return { context: { manifest, locators }, lookups }
}
test('catalog exactly covers the current public port; adding a method cannot compile without a route', () => {
  expect(Object.keys(partitionRouteCatalog).sort()).toEqual([...STORAGE_RPC_METHODS].sort())
  expect(Object.keys(partitionRouteCatalog)).toHaveLength(245)
  type ExpandedMethods = StorageMethods & { deliberatelyUnrouted(): void }
  // @ts-expect-error A new public method must make the exhaustive route catalog fail compilation.
  const incomplete: { readonly [K in keyof ExpandedMethods]: PartitionRouteDefinition } = partitionRouteCatalog
  expect(Object.hasOwn(incomplete, 'deliberatelyUnrouted')).toBe(false)
})
test('every enabled read selects the actual signature owner without opening a database', () => {
  const calls: StorageCall[] = [
    { id: 1, method: 'session', args: ['session'] },
    { id: 2, method: 'findSession', args: ['session'] },
    { id: 3, method: 'sessionSummary', args: ['session'] },
    { id: 4, method: 'snapshot', args: ['session', 40, 5] },
    { id: 5, method: 'events', args: ['session', 10, 5] },
    {
      id: 6,
      method: 'readEventPage',
      args: [{ sessionId: 'session', afterSeq: 0, types: ['goal.updated'], limit: 5, maxReplyBytes: 4096 }],
    },
    { id: 7, method: 'context', args: ['session'] },
    { id: 8, method: 'runByRequest', args: ['session', 'request'] },
    { id: 9, method: 'run', args: ['run-id'] },
    { id: 10, method: 'approval', args: ['approval-id'] },
    { id: 11, method: 'runtimeExecutionRead', args: ['run-id'] },
    { id: 12, method: 'runtimeRecoveryRead', args: ['run-id'] },
    { id: 13, method: 'runtimeRecoveryChain', args: ['recoveryChain-id'] },
    { id: 14, method: 'recoveryInputMessage', args: ['run-id'] },
    { id: 15, method: 'runFileChanges', args: ['session', 'run-id', undefined, 5] },
    { id: 16, method: 'runFileChangeDiff', args: ['session', 'run-id', 'src/file.ts', 0] },
    { id: 17, method: 'runFileChangeVersions', args: ['session', 'run-id'] },
  ]
  const enabled = Object.entries(partitionRouteCatalog)
    .filter(([, value]) => value.route === 'session-read')
    .map(([method]) => method)
    .sort()
  const actualMethods: string[] = calls.map((call) => call.method).sort()
  expect(actualMethods).toEqual(enabled)
  for (const call of calls) {
    const { context } = reader()
    expect(resolvePartitionRoute(call, context)).toEqual({ status: 'resolved', session, call })
  }
  const { context, lookups } = reader()
  resolvePartitionRoute({ id: 1, method: 'runtimeRecoveryChain', args: ['recoveryChain-id'] }, context)
  expect(lookups[0]).toBe('recoveryChain:recoveryChain-id')
})
test('unsupported and coordination routes reject before any locator access; missing never becomes global', () => {
  const { context, lookups } = reader()
  const calls: StorageCall[] = [
    { id: 1, method: 'append', args: ['session', 'event', {}] },
    { id: 2, method: 'runByRequestInWorkspace', args: ['workspace', 'request'] },
    { id: 3, method: 'settingsReceipt', args: ['actor', 'key'] },
    { id: 4, method: 'close', args: [] },
  ]
  for (const call of calls) {
    const route = partitionRouteCatalog[call.method].route
    if (route === 'session-read') throw new Error('Fixture must contain only rejected routes')
    expect(resolvePartitionRoute(call, context).status).toBe(route)
  }
  expect(lookups).toEqual([])
  expect(resolvePartitionRoute({ id: 5, method: 'run', args: ['missing'] }, context)).toEqual({ status: 'missing' })
  expect(resolvePartitionRoute({ id: 6, method: 'session', args: ['missing'] }, context)).toEqual({ status: 'missing' })
  expect(
    resolvePartitionRoute(
      { id: 7, method: 'session', args: ['session'] },
      { ...context, manifest: { ...manifest, activeGeneration: project } },
    ),
  ).toEqual({ status: 'wrong-generation' })
})

test('JavaScript method tampering and accidentally enabled catalog entries fail before locator access', () => {
  const { context, lookups } = reader()
  const unknown: StorageCall = { id: 1, method: 'session', args: ['session'] }
  expect(Reflect.set(unknown, 'method', 'unregisteredJavaScriptMethod')).toBe(true)
  expect(() => resolvePartitionRoute(unknown, context)).toThrow('PARTITION_ROUTE_UNKNOWN_METHOD')
  expect(lookups).toEqual([])

  const entry = partitionRouteCatalog.append
  const originalRoute = entry.route
  try {
    expect(Reflect.set(entry, 'route', 'session-read')).toBe(true)
    const write: StorageCall = { id: 2, method: 'append', args: ['session', 'event', {}] }
    expect(() => resolvePartitionRoute(write, context)).toThrow('PARTITION_ROUTE_SELECTOR_MISSING')
    expect(lookups).toEqual([])
  } finally {
    Reflect.set(entry, 'route', originalRoute)
  }
  expect(partitionRouteCatalog.append.route).toBe(originalRoute)
})
test('cross-Session Run arguments and forged authority cannot cross the locator fence', () => {
  const { context } = reader()
  const foreign = { ...session, sessionId: 'foreign', address: { ...session.address, partitionId: incarnation } }
  const locators: PartitionLocatorReader = {
    ...context.locators,
    resolveEntity: () => ({ status: 'active', session: foreign }),
  }
  expect(() =>
    resolvePartitionRoute(
      { id: 1, method: 'runFileChangeDiff', args: ['session', 'foreign-run', 'file', 0] },
      { manifest, locators },
    ),
  ).toThrow('IDENTITY_CONFLICT')
  const authority = {
    leaseId: incarnation,
    sessionId: 'foreign',
    runId: 'run-id',
    fence: 1,
    acquiredAt: 0,
    owner: { unitId: 'kernel', generation: 1, incarnation: 'owner' },
    versions: {
      kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
      driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
      plugins: [],
      hooks: [],
    },
  }
  expect(() => resolvePartitionRoute({ id: 2, method: 'session', args: ['session'], authority }, context)).toThrow(
    'AUTHORITY_MISMATCH',
  )
  expect(
    resolvePartitionRoute(
      { id: 3, method: 'session', args: ['session'], authority: { ...authority, sessionId: 'session' } },
      context,
    ).status,
  ).toBe('resolved')
  const changed: PartitionLocatorReader = {
    ...context.locators,
    resolveSession: () => ({ status: 'active', session: { ...session, revision: 2 } }),
  }
  expect(resolvePartitionRoute({ id: 4, method: 'run', args: ['run-id'] }, { manifest, locators: changed })).toEqual({
    status: 'recovering',
  })
})
