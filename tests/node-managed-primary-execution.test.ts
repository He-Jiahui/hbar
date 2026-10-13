import { afterEach, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { nodeFloorSchema, type NodeCallAuthority } from '@hbar/contracts/node'
import {
  nodeWorkspaceMountManifestSchema,
  type NodeWorkspaceMountManifest,
} from '@hbar/contracts/node-workspace-mount-plan'
import { nodeExecOutputReadResultSchema } from '@hbar/contracts/node-execution-output'
import { LocalExecution } from '@hbar/local-tools'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { WorkspaceNodeProtocol, WorkspaceNodeService, nodeProtectedPaths } from '@hbar/node-core'
import { createManagedNodeBackend } from '../apps/node/src/managed-backend'
import { createWorkspaceNodeGitRuntime } from '../apps/node/src/git-runtime'
import { installManagedNodeWorktrees } from '../apps/node/src/managed-worktrees'
import { createNodeGitRunner } from '../packages/node-core/src/git-service'

const temporary: string[] = []

async function git(cwd: string, ...args: string[]): Promise<void> {
  const child = Bun.spawn(['git', ...args], { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (exitCode !== 0) throw new Error(stderr || stdout || `git ${args[0]} exited ${exitCode}`)
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

it.skipIf(process.platform !== 'linux' || Bun.which('bwrap') === null)(
  'managed primary execution accepts pinned roots and keeps parent, hooks, and sibling paths hidden',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-managed-primary-'))
    temporary.push(root)
    const repository = join(root, 'shared')
    const dataRoot = join(root, 'node-private')
    await mkdir(repository)
    await mkdir(dataRoot)
    await git(repository, 'init', '--initial-branch=main')
    await git(repository, 'config', 'user.name', 'Managed Primary Test')
    await git(repository, 'config', 'user.email', 'managed-primary@example.invalid')
    await writeFile(join(repository, 'tracked.txt'), 'tracked\n')
    const parentSentinel = join(repository, 'parent-secret')
    const parentContents = 'parent sentinel stays unchanged\n'
    await writeFile(parentSentinel, parentContents)
    await git(repository, 'add', '--', 'tracked.txt', 'parent-secret')
    await git(repository, 'commit', '-m', 'initial')

    const hookSentinel = join(repository, '.git', 'hooks', 'private-sentinel')
    const hookContents = 'hook sentinel stays unchanged\n'
    await writeFile(hookSentinel, hookContents)
    const siblingPath = join(repository, '.hbar-worktrees', 'sibling')
    await mkdir(join(repository, '.hbar-worktrees'), { recursive: true })
    await git(repository, 'worktree', 'add', '-b', 'side-sentinel', siblingPath)
    const siblingMetadataLine = (await readFile(join(siblingPath, '.git'), 'utf8')).trim()
    const siblingMetadata = resolve(siblingPath, siblingMetadataLine.replace(/^gitdir:\s*/, ''))
    const siblingSentinel = join(siblingPath, 'sibling-secret')
    const siblingContents = 'sibling sentinel stays unchanged\n'
    await writeFile(siblingSentinel, siblingContents)
    await git(siblingPath, 'add', '--', 'sibling-secret')
    await git(siblingPath, 'commit', '-m', 'sibling sentinel')

    const state = new NodeStateStorage(join(dataRoot, 'node.sqlite'))
    const floor = nodeFloorSchema.parse({
      roots: [{ rootId: 'engine', name: 'Engine', path: repository, access: 'write' }],
      process: true,
      network: false,
      backend: 'auto',
      osConfinement: 'required',
      environmentAllowlist: ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR'],
    })
    let backend: Awaited<ReturnType<typeof createManagedNodeBackend>> | undefined
    let node: WorkspaceNodeService | undefined
    let protocol: WorkspaceNodeProtocol | undefined
    const local = new LocalExecution([dataRoot], undefined, undefined, {
      get: (workspace) => nodeProtectedPaths(node?.policy ?? floor, dataRoot, workspace),
    })

    try {
      await state.call('ready', {})
      await state.call('floor.set', floor)
      backend = await createManagedNodeBackend({ dataRoot, backend: 'auto' })
      expect(backend).toMatchObject({ name: 'bwrap', filesystem: true, processTree: true })
      node = await WorkspaceNodeService.open('node-managed-primary-execution', dataRoot, state, local, backend)
      protocol = new WorkspaceNodeProtocol(node)
      node.installGit((gitRoot) => createWorkspaceNodeGitRuntime(gitRoot, createNodeGitRunner()))
      await installManagedNodeWorktrees(node)

      const creationAuthority: NodeCallAuthority = {
        sessionId: 'session-managed-primary',
        runId: 'run-managed-worktree-create',
        callId: 'call-managed-worktree-create',
        sandbox: null,
        admission: { kind: 'allow' },
      }
      const created = (await protocol.invoke(
        'worktree.create',
        {
          operationId: `${creationAuthority.runId}:${creationAuthority.callId}`,
          rootId: 'engine',
          expectedRoot: repository,
          targetRevision: 1,
          branch: 'hbar/managed-primary',
          startPoint: 'main',
          createBranch: true,
          authority: creationAuthority,
        },
        AbortSignal.timeout(60_000),
      )) as { worktreeId: string; worktreeRootId: string; nodePath: string }

      const unsigned = {
        schemaVersion: 1 as const,
        workspaceId: 'managed-primary-workspace',
        revision: 1,
        nodeId: 'node-managed-primary-execution',
        primaryRootId: 'engine',
        roots: [{ rootId: 'engine', expectedRoot: repository, alias: 'src' }],
      }
      const workspaceMounts: NodeWorkspaceMountManifest = nodeWorkspaceMountManifestSchema.parse({
        ...unsigned,
        digest: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'),
      })
      const authority: NodeCallAuthority = {
        sessionId: 'session-managed-primary',
        runId: 'run-managed-primary-exec',
        callId: 'call-managed-primary-exec',
        sandbox: null,
        admission: { kind: 'allow' },
        workspaceMounts,
        managedWorktree: { worktreeId: created.worktreeId, targetRevision: 1 },
      }
      const operationId = `${authority.runId}:${authority.callId}`
      const command = [
        'set -eu',
        'cd /workspace/src',
        'test -f tracked.txt',
        `if test -e '${parentSentinel}'; then echo PARENT_VISIBLE; exit 61; fi`,
        `if test -e '${hookSentinel}'; then echo HOOK_VISIBLE; exit 62; fi`,
        `if test -e '${join(siblingMetadata, 'gitdir')}'; then echo SIBLING_METADATA_VISIBLE; exit 63; fi`,
        `if test -e '${siblingSentinel}'; then echo SIBLING_VISIBLE; exit 64; fi`,
        'git status --short >/tmp/managed-primary-git-status',
        "printf 'child-only\\n' >> child-output.txt",
        'echo MANAGED_PRIMARY_OS_OK',
      ].join('; ')
      const started = await node.start({
        ...authority,
        rootId: created.worktreeRootId,
        expectedRoot: created.nodePath,
        operationId,
        cwd: 'src',
        command,
        timeoutMs: 20_000,
      })
      expect(['started', 'settled']).toContain(started.state)

      const deadline = Date.now() + 30_000
      let receipt = await node.receipt(operationId)
      while (receipt.state !== 'settled' && Date.now() < deadline) {
        await Bun.sleep(20)
        receipt = await node.receipt(operationId)
      }
      expect(receipt.state).toBe('settled')
      if (receipt.state !== 'settled') throw new Error('Managed primary process receipt did not settle')
      expect(receipt.result).toMatchObject({
        isError: false,
        details: { code: 0, exitCode: 0, executionStarted: true, backend: 'bwrap' },
      })
      expect(receipt.result.text).toContain('MANAGED_PRIMARY_OS_OK')
      const outputPage = nodeExecOutputReadResultSchema.parse(
        await protocol.invoke('exec.output.read', { operationId, afterSeq: 0 }, AbortSignal.timeout(5_000)),
      )
      expect(outputPage.operationId).toBe(operationId)
      expect(outputPage.items.length).toBeGreaterThan(0)
      expect(outputPage.items.map((item) => item.text).join('')).toContain('MANAGED_PRIMARY_OS_OK')
      expect(await readFile(join(created.nodePath, 'child-output.txt'), 'utf8')).toBe('child-only\n')
      expect(await readFile(parentSentinel, 'utf8')).toBe(parentContents)
      expect(await readFile(hookSentinel, 'utf8')).toBe(hookContents)
      expect(await readFile(siblingSentinel, 'utf8')).toBe(siblingContents)
    } finally {
      await protocol?.dispose()
      await node?.dispose()
      await local.workspaceQuery.dispose()
      await state.close()
      await backend?.dispose?.()
    }
  },
  90_000,
)
