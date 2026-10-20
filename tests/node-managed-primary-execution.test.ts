import { afterEach, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { nodeFloorSchema, type NodeCallAuthority } from '@hbar/contracts/node'
import { nodeExecOutputReadResultSchema } from '@hbar/contracts/node-execution-output'
import { nodeWorkspaceMountManifestSchema } from '@hbar/contracts/node-workspace-mount-plan'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { LocalExecution } from '@hbar/local-tools'
import { WorkspaceNodeProtocol, WorkspaceNodeService, nodeProtectedPaths } from '@hbar/node-core'
import { createManagedNodeBackend } from '../apps/node/src/managed-backend'
import { createWorkspaceNodeGitRuntime } from '../apps/node/src/git-runtime'
import { installManagedNodeWorktrees } from '../apps/node/src/managed-worktrees'
import { createNodeGitRunner } from '../packages/node-core/src/git-service'

const temporaryRoots: string[] = []

async function git(cwd: string, ...args: string[]): Promise<void> {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(stderr || stdout || `git ${args[0]} exited ${code}`)
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

it.skipIf(process.platform !== 'linux')(
  'runs a managed primary through B bwrap and masks the parent, hooks, and sibling worktree',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-managed-primary-execution-'))
    temporaryRoots.push(root)
    const repository = join(root, 'shared')
    const dataRoot = join(root, 'node-private')
    await mkdir(repository)
    await mkdir(dataRoot)
    await git(repository, 'init', '--initial-branch=main')
    await git(repository, 'config', 'user.name', 'Managed Primary Test')
    await git(repository, 'config', 'user.email', 'managed-primary@example.invalid')
    await writeFile(join(repository, 'tracked.txt'), 'tracked\n')
    await writeFile(join(repository, 'parent-secret'), 'parent sentinel stays on parent\n')
    await git(repository, 'add', '--', 'tracked.txt', 'parent-secret')
    await git(repository, 'commit', '-m', 'initial')

    const hookSentinel = join(repository, '.git', 'hooks', 'private-sentinel')
    await writeFile(hookSentinel, 'hook sentinel\n')
    const siblingPath = join(repository, '.hbar-worktrees', 'sibling')
    await mkdir(join(repository, '.hbar-worktrees'), { recursive: true })
    await git(repository, 'worktree', 'add', '-b', 'side-sentinel', siblingPath)
    const siblingGitdirText = (await readFile(join(siblingPath, '.git'), 'utf8')).trim()
    const siblingMetadata = resolve(siblingPath, siblingGitdirText.replace(/^gitdir:\s*/, ''))
    const siblingSentinel = join(siblingPath, 'sibling-secret')
    await writeFile(siblingSentinel, 'sibling sentinel\n')
    await git(siblingPath, 'add', '--', 'sibling-secret')
    await git(siblingPath, 'commit', '-m', 'sibling sentinel')

    let state: NodeStateStorage | undefined
    let backend: Awaited<ReturnType<typeof createManagedNodeBackend>> | undefined
    let localExecution: LocalExecution | undefined
    let node: WorkspaceNodeService | undefined
    let protocol: WorkspaceNodeProtocol | undefined
    try {
      state = new NodeStateStorage(join(dataRoot, 'node.sqlite'))
      await state.call('ready', {})
      const floor = nodeFloorSchema.parse({
        roots: [{ rootId: 'engine', name: 'Engine', path: repository, access: 'write' }],
        process: true,
        network: false,
        backend: 'bwrap',
        osConfinement: 'required',
        environmentAllowlist: ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR'],
      })
      await state.call('floor.set', floor)
      backend = await createManagedNodeBackend({ dataRoot, backend: 'bwrap' })
      expect(backend.name).toBe('bwrap')
      expect(backend.filesystem).toBe(true)
      expect(backend.processTree).toBe(true)

      localExecution = new LocalExecution([dataRoot], undefined, undefined, {
        get: (workspace) => nodeProtectedPaths(node?.policy ?? floor, dataRoot, workspace),
      })
      node = await WorkspaceNodeService.open('node-managed-primary-execution', dataRoot, state, localExecution, backend)
      protocol = new WorkspaceNodeProtocol(node)
      node.installGit((gitRoot) => createWorkspaceNodeGitRuntime(gitRoot, createNodeGitRunner()))
      await installManagedNodeWorktrees(node)

      const createAuthority: NodeCallAuthority = {
        sessionId: 'session-managed-primary',
        runId: 'run-managed-primary-create',
        callId: 'call-managed-primary-create',
        sandbox: null,
        admission: { kind: 'allow' },
      }
      const created = (await protocol.invoke(
        'worktree.create',
        {
          operationId: `${createAuthority.runId}:${createAuthority.callId}`,
          rootId: 'engine',
          expectedRoot: repository,
          targetRevision: 1,
          branch: 'hbar/managed-primary-proof',
          startPoint: 'main',
          createBranch: true,
          authority: createAuthority,
        },
        AbortSignal.timeout(60_000),
      )) as { worktreeId: string; worktreeRootId: string; nodePath: string }

      const unsignedManifest = {
        schemaVersion: 1 as const,
        workspaceId: 'managed-primary-workspace',
        revision: 1,
        nodeId: 'node-managed-primary-execution',
        primaryRootId: 'engine',
        roots: [{ rootId: 'engine', expectedRoot: repository, alias: 'src' }],
      }
      const workspaceMounts = nodeWorkspaceMountManifestSchema.parse({
        ...unsignedManifest,
        digest: createHash('sha256').update(JSON.stringify(unsignedManifest)).digest('hex'),
      })
      const runAuthority: NodeCallAuthority = {
        sessionId: createAuthority.sessionId,
        runId: 'run-managed-primary-proof',
        callId: 'call-managed-primary-proof',
        sandbox: null,
        admission: { kind: 'allow' },
        workspaceMounts,
        managedWorktree: { worktreeId: created.worktreeId, targetRevision: 1 },
      }
      const operationId = `${runAuthority.runId}:${runAuthority.callId}`
      const command = [
        'set -eu',
        'cd /workspace/src',
        'test -f tracked.txt',
        `if test -e '${join(repository, 'parent-secret')}'; then echo PARENT_VISIBLE; exit 61; fi`,
        `if test -e '${hookSentinel}'; then echo HOOK_VISIBLE; exit 62; fi`,
        `if test -e '${join(siblingMetadata, 'gitdir')}'; then echo SIBLING_METADATA_VISIBLE; exit 63; fi`,
        `if test -e '${siblingSentinel}'; then echo SIBLING_VISIBLE; exit 64; fi`,
        'git status --short >/tmp/managed-primary-git-status',
        "printf 'child-only\\n' >> child-output.txt",
        'echo MANAGED_PRIMARY_OS_OK',
      ].join('; ')

      const started = await node.start({
        ...runAuthority,
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
      if (receipt.state !== 'settled') throw new Error('Managed primary execution did not settle')
      expect(receipt.result.details.code).toBe(0)
      expect(receipt.result.text).toContain('MANAGED_PRIMARY_OS_OK')

      const output = nodeExecOutputReadResultSchema.parse(
        await protocol.invoke('exec.output.read', { operationId, afterSeq: 0 }, AbortSignal.timeout(5_000)),
      )
      expect(output.items.some((item) => item.text.includes('MANAGED_PRIMARY_OS_OK'))).toBe(true)
      expect(await readFile(join(created.nodePath, 'child-output.txt'), 'utf8')).toBe('child-only\n')
      expect(await readFile(join(repository, 'tracked.txt'), 'utf8')).toBe('tracked\n')
      expect(await readFile(join(repository, 'parent-secret'), 'utf8')).toBe('parent sentinel stays on parent\n')
      expect(await readFile(hookSentinel, 'utf8')).toBe('hook sentinel\n')
      expect(await readFile(siblingSentinel, 'utf8')).toBe('sibling sentinel\n')
    } finally {
      await protocol?.dispose()
      await node?.dispose()
      localExecution?.dispose()
      await backend?.dispose?.()
      await state?.close()
    }
  },
  90_000,
)
