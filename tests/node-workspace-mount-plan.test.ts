import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { nodeFloorSchema } from '@hbar/contracts/node'
import { createNodeWorkspaceMountPlan, type NodeWorkspaceMountPlanOptions } from '@hbar/node-core/workspace-mount-plan'

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'hbar-node-mount-plan-'))
  const dataRoot = join(base, 'private')
  await mkdir(dataRoot)
  const roots: [string, string] = [join(base, 'engine'), join(base, 'docs')]
  await Promise.all(roots.map((root) => mkdir(root)))
  const floor = nodeFloorSchema.parse({
    roots: [
      { rootId: 'engine', name: 'Engine', path: roots[0], access: 'write' },
      { rootId: 'docs', name: 'Docs', path: roots[1], access: 'read' },
    ],
  })
  const unsigned = {
    schemaVersion: 1 as const,
    workspaceId: 'workspace-1',
    revision: 7,
    nodeId: 'builder',
    primaryRootId: 'engine',
    roots: [
      { rootId: 'engine', expectedRoot: roots[0]!, alias: 'src' },
      { rootId: 'docs', expectedRoot: roots[1]!, alias: 'docs' },
    ],
  }
  const manifest = {
    ...unsigned,
    digest: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'),
  }
  return { base, dataRoot, roots, floor, manifest }
}

test('creates a B-owned alias view from registered roots and snapshot rights', async () => {
  const state = await fixture()
  try {
    const plan = await createNodeWorkspaceMountPlan({
      nodeId: 'builder',
      dataRoot: state.dataRoot,
      floor: state.floor,
      manifest: state.manifest,
      snapshotPermissions: async (rootId, _alias, root) => ({
        writableRoots: rootId === 'engine' ? [root] : [],
        readOnlyPaths: [],
        protectedPaths: [],
      }),
      signal: new AbortController().signal,
    })
    expect(plan.primaryTarget).toBe('/workspace/src')
    expect(
      plan.mounts.map(({ rootId, expectedRoot, sourceRoot, alias, target, access, writePaths, readOnlyPaths }) => ({
        rootId,
        expectedRoot,
        sourceRoot,
        alias,
        target,
        access,
        writePaths,
        readOnlyPaths,
      })),
    ).toEqual([
      {
        rootId: 'engine',
        expectedRoot: state.roots[0],
        sourceRoot: state.roots[0],
        alias: 'src',
        target: '/workspace/src',
        access: 'write',
        writePaths: [],
        readOnlyPaths: [],
      },
      {
        rootId: 'docs',
        expectedRoot: state.roots[1],
        sourceRoot: state.roots[1],
        alias: 'docs',
        target: '/workspace/docs',
        access: 'read',
        writePaths: [],
        readOnlyPaths: [],
      },
    ])
    expect(plan.mounts[0]?.protectedPaths.map((item) => item.targetPath)).toContain('/workspace/src/.git/hooks')
    expect(plan.mounts[0]?.protectedPaths.map((item) => item.targetPath)).toContain('/workspace/src/.hbar-worktrees')
    expect(plan.mounts[1]?.protectedPaths.map((item) => item.targetPath)).toContain('/workspace/docs/.git/hooks')
    expect(plan.mounts[1]?.protectedPaths.map((item) => item.targetPath)).toContain('/workspace/docs/.hbar-worktrees')
  } finally {
    await rm(state.base, { recursive: true, force: true })
  }
})

test('rejects digest tampering, node mismatch, rebinding, overlap and protected ancestors', async () => {
  const state = await fixture()
  const run = (overrides: Partial<NodeWorkspaceMountPlanOptions>) =>
    createNodeWorkspaceMountPlan({
      nodeId: 'builder',
      dataRoot: state.dataRoot,
      floor: state.floor,
      manifest: state.manifest,
      snapshotPermissions: async (_rootId, _alias, root) => ({
        writableRoots: [root],
        readOnlyPaths: [],
        protectedPaths: [],
      }),
      signal: new AbortController().signal,
      ...overrides,
    })
  try {
    await expect(run({ manifest: { ...state.manifest, revision: 8 } })).rejects.toThrow(
      'Workspace mount manifest digest does not match its contents',
    )
    await expect(run({ nodeId: 'other' })).rejects.toThrow('Workspace mount manifest targets a different node')
    await expect(
      run({
        floor: nodeFloorSchema.parse({
          ...state.floor,
          roots: state.floor.roots.map((root) => ({ ...root, path: `${root.path}-moved` })),
        }),
      }),
    ).rejects.toThrow('Mounted root engine no longer matches its pinned path')
    const overlappingFloor = nodeFloorSchema.parse({
      roots: [
        { rootId: 'engine', name: 'Engine', path: state.roots[0], access: 'write' },
        { rootId: 'nested', name: 'Nested', path: join(state.roots[0]!, 'nested'), access: 'read' },
      ],
    })
    await mkdir(join(state.roots[0]!, 'nested'))
    await expect(
      run({
        floor: overlappingFloor,
        manifest: {
          ...state.manifest,
          roots: [
            { rootId: 'engine', expectedRoot: state.roots[0]!, alias: 'src' },
            { rootId: 'nested', expectedRoot: resolve(state.roots[0]!, 'nested'), alias: 'nested' },
          ],
          digest: createHash('sha256')
            .update(
              JSON.stringify({
                schemaVersion: 1,
                workspaceId: state.manifest.workspaceId,
                revision: state.manifest.revision,
                nodeId: state.manifest.nodeId,
                primaryRootId: state.manifest.primaryRootId,
                roots: [
                  { rootId: 'engine', expectedRoot: state.roots[0]!, alias: 'src' },
                  { rootId: 'nested', expectedRoot: resolve(state.roots[0]!, 'nested'), alias: 'nested' },
                ],
              }),
            )
            .digest('hex'),
        },
      }),
    ).rejects.toThrow('Mounted roots must not overlap each other')
    const protectedFloor = nodeFloorSchema.parse({
      roots: state.floor.roots,
      protectedPaths: [state.base],
    })
    await expect(run({ floor: protectedFloor })).rejects.toThrow('The path is protected by this node')
  } finally {
    await rm(state.base, { recursive: true, force: true })
  }
})
