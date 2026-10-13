import { expect, test } from 'bun:test'
import { nodeCallAuthoritySchema } from '@hbar/contracts/node-authority'
import {
  nodeWorkspaceMountManifestSchema,
  type NodeWorkspaceMountManifest,
} from '@hbar/contracts/node-workspace-mount-plan'
import { nodeWorkspaceMountPath, nodeWorkspaceMountsSchema } from '@hbar/contracts/node-workspace-mounts'

const manifest = {
  schemaVersion: 1,
  workspaceId: 'workspace-a',
  revision: 3,
  digest: 'a'.repeat(64),
  nodeId: 'builder',
  primaryRootId: 'engine',
  roots: [
    { rootId: 'engine', expectedRoot: '/srv/engine', alias: 'src' },
    { rootId: 'docs', expectedRoot: '/srv/docs', alias: 'docs' },
  ],
} satisfies NodeWorkspaceMountManifest

test('a captured manifest survives the ordinary call authority JSON boundary without changing its pins', () => {
  const authority = {
    sessionId: 'session-a',
    runId: 'run-a',
    callId: 'call-a',
    sandbox: null,
    admission: { kind: 'allow' },
    managedWorktree: { worktreeId: 'b'.repeat(32), targetRevision: 2 },
    workspaceMounts: manifest,
  }
  const decoded = nodeCallAuthoritySchema.parse(JSON.parse(JSON.stringify(authority)))
  expect(decoded.workspaceMounts).toEqual(manifest)
  expect(decoded.managedWorktree).toEqual(authority.managedWorktree)
  expect(nodeCallAuthoritySchema.parse({ ...authority, workspaceMounts: undefined }).workspaceMounts).toBeUndefined()
  expect(nodeCallAuthoritySchema.safeParse({ ...authority, execute: () => undefined }).success).toBe(false)
})

test('manifest validation rejects ambiguous aliases, duplicate roots and a missing primary root', () => {
  expect(nodeWorkspaceMountManifestSchema.safeParse(manifest).success).toBe(true)
  expect(
    nodeWorkspaceMountManifestSchema.safeParse({
      ...manifest,
      roots: [manifest.roots[0], { rootId: 'docs', expectedRoot: '/srv/docs', alias: 'SRC' }],
    }).success,
  ).toBe(false)
  expect(
    nodeWorkspaceMountManifestSchema.safeParse({
      ...manifest,
      roots: [manifest.roots[0], { rootId: 'engine', expectedRoot: '/srv/another-engine', alias: 'other' }],
    }).success,
  ).toBe(false)
  expect(nodeWorkspaceMountManifestSchema.safeParse({ ...manifest, primaryRootId: 'missing' }).success).toBe(false)
  expect(nodeWorkspaceMountManifestSchema.safeParse({ ...manifest, digest: 'not-a-digest' }).success).toBe(false)
  expect(nodeWorkspaceMountManifestSchema.safeParse({ ...manifest, schemaVersion: 2 }).success).toBe(false)
})

test('folder declarations are bounded locators and cannot carry local paths or traversal', () => {
  const folders = Array.from({ length: 32 }, (_, index) => ({
    id: `folder-${index}`,
    alias: `root-${index}`,
    path: nodeWorkspaceMountPath('builder', `root-${index}`),
  }))
  expect(nodeWorkspaceMountsSchema.parse(folders)).toHaveLength(32)
  expect(
    nodeWorkspaceMountsSchema.safeParse([
      ...folders,
      { id: 'extra', alias: 'extra', path: 'hbar-node://builder/extra' },
    ]).success,
  ).toBe(false)
  expect(nodeWorkspaceMountsSchema.safeParse([]).success).toBe(false)
  for (const path of ['/srv/engine', 'C:\\engine', 'hbar-node://builder/../engine', 'hbar-node://builder/engine/child'])
    expect(nodeWorkspaceMountsSchema.safeParse([{ id: 'one', alias: 'src', path }]).success).toBe(false)
  expect(
    nodeWorkspaceMountsSchema.safeParse([
      { id: 'a', alias: 'src', path: 'hbar-node://builder/engine' },
      { id: 'b', alias: 'SRC', path: 'hbar-node://builder/docs' },
    ]).success,
  ).toBe(false)
})

test('manifest capacity accepts 32 distinct roots and rejects the next root', () => {
  const roots = Array.from({ length: 32 }, (_, index) => ({
    rootId: `root-${index}`,
    expectedRoot: `/srv/root-${index}`,
    alias: `root-${index}`,
  }))
  expect(nodeWorkspaceMountManifestSchema.parse({ ...manifest, primaryRootId: 'root-0', roots }).roots).toHaveLength(32)
  expect(
    nodeWorkspaceMountManifestSchema.safeParse({
      ...manifest,
      primaryRootId: 'root-0',
      roots: [...roots, { rootId: 'extra', expectedRoot: '/srv/extra', alias: 'extra' }],
    }).success,
  ).toBe(false)
})
