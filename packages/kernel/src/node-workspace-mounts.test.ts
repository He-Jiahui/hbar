import { expect, test } from 'bun:test'
import { nodeWorkspaceMountsSchema } from '@hbar/contracts/node-workspace-mounts'
import { resolveNodeWorkspaceMounts } from './node-workspace-mounts'

const roots = [
  { rootId: 'engine', name: 'Engine', nodePath: '/srv/engine', access: 'write' as const },
  { rootId: 'docs', name: 'Docs', nodePath: '/srv/docs', access: 'read' as const },
]

test('resolves aliases only through canonical registered roots on the owning node', async () => {
  expect(
    await resolveNodeWorkspaceMounts(
      'builder',
      [
        { id: 'main', alias: 'src', path: 'hbar-node://builder/engine' },
        { id: 'docs', alias: 'docs', path: 'hbar-node://builder/docs' },
      ],
      { nodeId: 'builder', roots },
      { canonicalRoot: async (_rootId, expectedNodePath) => expectedNodePath },
      new AbortController().signal,
    ),
  ).toEqual([
    {
      id: 'main',
      alias: 'src',
      nodeId: 'builder',
      rootId: 'engine',
      nodePath: '/srv/engine',
      access: 'write',
    },
    {
      id: 'docs',
      alias: 'docs',
      nodeId: 'builder',
      rootId: 'docs',
      nodePath: '/srv/docs',
      access: 'read',
    },
  ])
})

test('rejects cross-node mounts, unknown roots and a mismatched capability owner', async () => {
  await expect(
    resolveNodeWorkspaceMounts(
      'builder',
      [{ id: 'other', alias: 'other', path: 'hbar-node://other-node/engine' }],
      { nodeId: 'builder', roots },
      { canonicalRoot: async (_rootId, expectedNodePath) => expectedNodePath },
      new AbortController().signal,
    ),
  ).rejects.toThrow('Cross-node workspace mounts are not supported')
  await expect(
    resolveNodeWorkspaceMounts(
      'builder',
      [{ id: 'missing', alias: 'missing', path: 'hbar-node://builder/gone' }],
      { nodeId: 'builder', roots },
      { canonicalRoot: async (_rootId, expectedNodePath) => expectedNodePath },
      new AbortController().signal,
    ),
  ).rejects.toThrow('Workspace node no longer shares root gone')
  await expect(
    resolveNodeWorkspaceMounts(
      'builder',
      [],
      { nodeId: 'another', roots },
      { canonicalRoot: async (_rootId, expectedNodePath) => expectedNodePath },
      new AbortController().signal,
    ),
  ).rejects.toThrow('Workspace mounts belong to a different workspace node')
})

test('rejects a B root whose fresh canonical path differs from its capability binding', async () => {
  await expect(
    resolveNodeWorkspaceMounts(
      'builder',
      [{ id: 'docs', alias: 'docs', path: 'hbar-node://builder/docs' }],
      { nodeId: 'builder', roots },
      { canonicalRoot: async () => '/srv/rebound-docs' },
      new AbortController().signal,
    ),
  ).rejects.toThrow('Workspace node root docs changed its canonical path')
})

test('rejects traversal and duplicate aliases before resolving any node path', () => {
  expect(
    nodeWorkspaceMountsSchema.safeParse([{ id: 'bad', alias: 'bad', path: 'hbar-node://builder/../outside' }]).success,
  ).toBe(false)
  expect(
    nodeWorkspaceMountsSchema.safeParse([
      { id: 'a', alias: 'same', path: 'hbar-node://builder/engine' },
      { id: 'b', alias: 'SAME', path: 'hbar-node://builder/docs' },
    ]).success,
  ).toBe(false)
})

test('rejects more than 64 roots from a node response', async () => {
  const tooMany = Array.from({ length: 65 }, (_, index) => ({
    rootId: `root-${index}`,
    name: `Root ${index}`,
    nodePath: `/srv/${index}`,
    access: 'read' as const,
  }))
  await expect(
    resolveNodeWorkspaceMounts(
      'builder',
      [],
      { nodeId: 'builder', roots: tooMany },
      { canonicalRoot: async (_rootId, expectedNodePath) => expectedNodePath },
      new AbortController().signal,
    ),
  ).rejects.toThrow('Workspace node advertised more than 64 shared roots')
})
