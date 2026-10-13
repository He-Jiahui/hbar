import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { NodeFloor } from '@hbar/contracts/node'
import { nodeFloorSchema } from '@hbar/contracts/node'
import {
  acceptedNodeWorktreeTargetDigest,
  acceptedWorkspaceFolderDigest,
  type NodeWorktreeProvisioningAuthority,
} from '@hbar/contracts/node-worktree-provisioning'
import { createManagedNodeBackend } from '../apps/node/src/managed-backend'
import { GitRuntime, gitConfigSchema } from '../plugins/git/src/index'
import { createNodeGitRunner, withNodeGitAdmission } from '../packages/node-core/src/git-service'
import {
  createManagedNodeWorktreeAllocator,
  type ManagedNodeWorktreeGitOperation,
} from '../packages/node-core/src/worktrees'
import { ManagedNodeRootRegistry, managedNodeFloor } from '../packages/node-core/src/managed-root-registry'
import { nodeOwnedPath } from '../packages/node-core/src/paths'

const temporaryRoots: string[] = []

async function fixtureGit(cwd: string, ...args: string[]): Promise<void> {
  const child = Bun.spawn(['git', ...args], { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(stderr || stdout || `git exited ${code}`)
}

async function repository(): Promise<{ root: string; dataRoot: string }> {
  const parent = await mkdtemp(join(tmpdir(), 'hbar-node-managed-worktree-'))
  temporaryRoots.push(parent)
  const root = join(parent, 'shared')
  const dataRoot = join(parent, 'node-private')
  await mkdir(root)
  await mkdir(dataRoot)
  await fixtureGit(root, 'init', '--initial-branch=main')
  await fixtureGit(root, 'config', 'user.name', 'Managed Worktree Test')
  await fixtureGit(root, 'config', 'user.email', 'managed-worktree@example.invalid')
  await writeFile(join(root, 'tracked.txt'), 'main\n')
  await fixtureGit(root, 'add', '--', 'tracked.txt')
  await fixtureGit(root, 'commit', '-m', 'initial')
  return { root, dataRoot }
}

function provisioning(root: string, runId: string): NodeWorktreeProvisioningAuthority {
  const folderSnapshot = {
    schemaVersion: 1 as const,
    workspaceId: 'workspace-worktree-test',
    revision: 1,
    folders: [{ id: 'engine', alias: 'engine', path: root }],
  }
  const accepted = {
    workspaceId: folderSnapshot.workspaceId,
    sessionId: 'session-worktree-test',
    runId,
    nodeId: 'node-worktree-test',
    targetRevision: 1,
    selection: {
      mode: 'isolated-worktree' as const,
      branch: { kind: 'new' as const, name: 'hbar/session-worktree-test' },
    },
    workspaceFolderRevision: folderSnapshot.revision,
    workspaceFolderDigest: acceptedWorkspaceFolderDigest(folderSnapshot),
  }
  return { kind: 'launch-target', ...accepted, acceptedTargetDigest: acceptedNodeWorktreeTargetDigest(accepted) }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('managed B worktree allocator', () => {
  it('hides allocator storage under the shared root while allowing the registered child root', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'hbar-node-worktree-scope-'))
    temporaryRoots.push(parent)
    const root = join(parent, 'shared')
    const dataRoot = join(parent, 'node-private')
    const worktreeId = '0123456789abcdef0123456789abcdef'
    const child = join(root, '.hbar-worktrees', worktreeId)
    await mkdir(child, { recursive: true })
    await mkdir(dataRoot)
    const floor: NodeFloor = nodeFloorSchema.parse({
      roots: [{ rootId: 'engine', name: 'Engine', path: root, access: 'write' }],
    })
    const managed = {
      worktreeId,
      sessionId: 'session-scope',
      createdByRunId: 'run-scope',
      targetRevision: 1,
      worktreeRootId: `wt_${worktreeId}`,
      parentRootId: 'engine',
      nodePath: child,
      branch: 'feature/scope',
      createdAt: 1,
    }
    await expect(nodeOwnedPath(floor, dataRoot, 'engine', '.hbar-worktrees')).rejects.toThrow()
    expect((await nodeOwnedPath(managedNodeFloor(floor, managed), dataRoot, managed.worktreeRootId, '.')).root).toBe(
      child,
    )
  })

  it.skipIf(process.platform === 'win32')(
    'creates, reopens, and removes a worktree through Git admission and managed argv',
    async () => {
      const { root, dataRoot } = await repository()
      const floor: NodeFloor = nodeFloorSchema.parse({
        roots: [{ rootId: 'engine', name: 'Engine', path: root, access: 'write' }],
      })
      const backend = await createManagedNodeBackend({ dataRoot, backend: 'auto' })
      let allocator: Awaited<ReturnType<typeof createManagedNodeWorktreeAllocator>> | undefined
      const registered = new ManagedNodeRootRegistry(() => floor)
      const receipts = new Map<string, { digest: string; path: string }>()
      const runtime = new GitRuntime(root, gitConfigSchema.parse({}), createNodeGitRunner())
      const createProvisioning = provisioning(root, 'run-worktree-test')
      const git = {
        async worktree(
          input: {
            operationId: string
            rootId: string
            expectedRoot: string
            provisioning: NodeWorktreeProvisioningAuthority
            operation: ManagedNodeWorktreeGitOperation
          },
          signal: AbortSignal,
        ) {
          if (!allocator) throw new Error('allocator is not installed')
          const authorized = await allocator.authorizeGitOperation(input)
          const authorizedPath = authorized.path
          if (authorizedPath !== resolve(root, '.hbar-worktrees', input.operation.worktreeId))
            throw new Error('allocator authorized an unexpected worktree path')
          const requestDigest = JSON.stringify(input.operation)
          const prior = receipts.get(input.operationId)
          if (prior) {
            if (prior.digest !== requestDigest) throw new Error('worktree operation id reused with different arguments')
            return { path: prior.path }
          }
          if (resolve(input.expectedRoot) !== root || input.rootId !== 'engine')
            throw new Error('unexpected root binding')
          const operation =
            input.operation.kind === 'add'
              ? {
                  operation: 'add' as const,
                  path: input.operation.worktreeId,
                  branch: input.operation.branch,
                  createBranch: input.operation.createBranch,
                }
              : { operation: 'remove' as const, path: input.operation.worktreeId }
          const result = await withNodeGitAdmission(
            {
              rootPath: root,
              cwd: root,
              run: async (args, callSignal, limits) => {
                const processResult = await backend.execArgv?.(root, ['git', ...args], callSignal, {
                  timeoutMs: limits.timeoutMs,
                  environment: {},
                  environmentAllowlist: ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR'],
                  confinement: null,
                  protectedPaths: [],
                  readOnlyPaths: [],
                })
                if (!processResult) throw new Error('managed argv backend is unavailable')
                return {
                  stdout: processResult.stdout,
                  stderr: processResult.stderr,
                  code: processResult.exitCode,
                  truncated: processResult.truncated,
                }
              },
            },
            signal,
            () => runtime.worktree(undefined, operation, signal),
          )
          const path = Array.isArray(result) ? '' : result.path
          receipts.set(input.operationId, { digest: requestDigest, path })
          return { path }
        },
      }
      const roots = registered
      try {
        allocator = await createManagedNodeWorktreeAllocator({ dataRoot, floor, git, roots })
        const created = await allocator.create(
          {
            operationId: `${createProvisioning.runId}:worktree-create`,
            rootId: 'engine',
            expectedRoot: root,
            provisioning: createProvisioning,
            branch: 'hbar/session-worktree-test',
            createBranch: true,
          },
          AbortSignal.timeout(30_000),
        )
        expect(created).toMatchObject({
          sessionId: createProvisioning.sessionId,
          createdByRunId: createProvisioning.runId,
          targetRevision: 1,
          parentRootId: 'engine',
          nodePath: resolve(root, '.hbar-worktrees', created.worktreeId),
        })
        expect(
          (
            await registered.resolve(created.worktreeRootId, {
              sessionId: createProvisioning.sessionId,
              managedWorktree: { worktreeId: created.worktreeId, targetRevision: created.targetRevision },
            })
          )?.nodePath,
        ).toBe(created.nodePath)
        await expect(
          registered.resolve(created.worktreeRootId, {
            sessionId: createProvisioning.sessionId,
            managedWorktree: { worktreeId: created.worktreeId, targetRevision: created.targetRevision + 1 },
          }),
        ).rejects.toThrow()
        await expect(
          registered.resolve(created.worktreeRootId, {
            sessionId: 'another-session',
            managedWorktree: { worktreeId: created.worktreeId, targetRevision: created.targetRevision },
          }),
        ).rejects.toThrow()
        expect(await readFile(join(created.nodePath, 'tracked.txt'), 'utf8')).toBe('main\n')
        await expect(nodeOwnedPath(floor, dataRoot, 'engine', '.hbar-worktrees')).rejects.toThrow()
        expect(
          (await nodeOwnedPath(managedNodeFloor(floor, created), dataRoot, created.worktreeRootId, '.')).root,
        ).toBe(created.nodePath)
        const laterProvisioning = provisioning(root, 'run-worktree-test-later')
        const reused = await allocator.create(
          {
            operationId: `${laterProvisioning.runId}:worktree-create`,
            rootId: 'engine',
            expectedRoot: root,
            provisioning: laterProvisioning,
            branch: 'hbar/session-worktree-test',
            createBranch: true,
          },
          AbortSignal.timeout(30_000),
        )
        expect(reused).toEqual(created)
        const lookup = {
          rootId: 'engine',
          expectedRoot: root,
          operationId: `${createProvisioning.runId}:worktree-get`,
          branch: 'hbar/session-worktree-test',
          createBranch: true,
          provisioning: createProvisioning,
        }
        expect(await allocator.get(lookup, AbortSignal.timeout(2_000))).toEqual(created)

        const restarted = await createManagedNodeWorktreeAllocator({ dataRoot, floor, git, roots })
        expect(await restarted.get(lookup, AbortSignal.timeout(2_000))).toEqual(created)
        await restarted.close()

        const removeProvisioning = provisioning(root, 'run-worktree-remove')
        await allocator.remove(
          {
            operationId: `${removeProvisioning.runId}:worktree-remove`,
            rootId: 'engine',
            expectedRoot: root,
            worktreeId: created.worktreeId,
            provisioning: removeProvisioning,
          },
          AbortSignal.timeout(30_000),
        )
        expect(
          await registered.resolve(created.worktreeRootId, {
            sessionId: createProvisioning.sessionId,
            managedWorktree: { worktreeId: created.worktreeId, targetRevision: created.targetRevision },
          }),
        ).toBeNull()
        expect(await allocator.get(lookup, AbortSignal.timeout(2_000))).toBeNull()
      } finally {
        await allocator?.close()
        await backend.dispose?.()
      }
    },
    60_000,
  )
})
