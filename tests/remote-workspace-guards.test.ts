import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'
import { LOCAL_EXECUTION_DISABLED } from '@hbar/contracts/local-execution-policy'
import { nodeWorkspaceLocator } from '@hbar/contracts/node-address'
import { nodeCapabilitiesSchema, nodeFloorSchema } from '@hbar/contracts/node'
import { workspaceFindInputSchema, workspaceSearchInputSchema } from '@hbar/contracts/workspace-query'
import { LocalExecution, workspacePath } from '@hbar/local-tools'
import { GitRuntime, ProcessGitRunner, gitConfigSchema } from '@hbar/git'
import { createRuntimeSkillCatalog } from '@hbar/kernel/skills'
import { Kernel, SessionLaunchTargetService } from '@hbar/kernel'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createNodeIdentity } from '@hbar/node-core'
import { NodeRegistryService } from '@hbar/node-link'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import { createPathLayout, ensurePathLayout, Storage } from '@hbar/storage'
import { StorageNodeRegistryPort } from '@hbar/storage/node-registry'
import { WorkspaceSandboxService } from '../packages/kernel/src/workspace-sandbox'
import { WorkspaceFolderService } from '../packages/kernel/src/workspace-folders'
import { inspectBranchRepository } from '../packages/kernel/src/session-branch-git'
import { collectScopeFiles, synchronizeScope, applyFiles } from '../plugins/agent/src/patches'
import { SystemTerminalManager } from '../apps/host/src/system-terminal'

const remote = nodeWorkspaceLocator('build-box', 'engine')
const signal = new AbortController().signal
async function denied(work: () => unknown): Promise<void> {
  let result: unknown
  try {
    await work()
  } catch (error) {
    result = error
  }
  expect(result).toMatchObject({ code: 'WORKSPACE_REMOTE' })
}
async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-remote-guards-'))
  const absolute = resolve(root)
  if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith('hbar-remote-guards-'))
    throw new Error('Refusing to remove an unowned guard fixture')
  try {
    await run(root)
  } finally {
    await rm(absolute, { recursive: true, force: true })
  }
}

test('local workspace validation rejects locators and explicit remote ownership before local resolution', async () => {
  expect(assertLocalWorkspace('C:/projects/engine')).toBe('C:/projects/engine')
  expect(assertLocalWorkspace({ path: '/srv/engine' })).toBe('/srv/engine')
  for (const path of [remote, 'HBAR-NODE://build-box/engine', 'hbar-node:invalid'])
    await denied(() => assertLocalWorkspace(path))
  await denied(() =>
    assertLocalWorkspace({
      path: '/same-looking-local-path',
      location: { kind: 'node', nodeId: 'build-box', rootId: 'engine', nodePath: '/srv/engine' },
    }),
  )
})

test('local files, restore, process and native query entrypoints refuse remote locators before consulting local mounts', async () => {
  await fixture(async (root) => {
    await writeFile(join(root, 'sentinel.txt'), 'unchanged')
    let mountLookups = 0
    const execution = new LocalExecution([], undefined, {
      get: () => {
        mountLookups++
        return undefined
      },
      verify: async () => {},
    })
    try {
      for (const work of [
        () => workspacePath(remote, 'sentinel.txt'),
        () => execution.list(remote, '.'),
        () => execution.read(remote, 'sentinel.txt'),
        () => execution.readBytes(remote, 'sentinel.txt'),
        () => execution.write(remote, 'sentinel.txt', 'remote write'),
        () => execution.restoreFiles(remote, [], signal),
        () => execution.resolveDirectory(remote, '.'),
        () => execution.exec(remote, 'echo should-not-run', signal),
        () =>
          execution.workspaceQuery.search(remote, workspaceSearchInputSchema.parse({ pattern: 'sentinel' }), signal),
        () => execution.workspaceQuery.find(remote, workspaceFindInputSchema.parse({}), signal),
        () => execution.workspaceQuery.readRange(remote, 'sentinel.txt', 1, 10, signal),
        () => execution.workspaceQuery.invalidate(remote, 'sentinel.txt'),
      ])
        await denied(work)
      expect(mountLookups).toBe(0)
      expect(await readFile(join(root, 'sentinel.txt'), 'utf8')).toBe('unchanged')
    } finally {
      execution.dispose()
    }
  })
})

test('Git and system terminal cannot spawn locally for a remote workspace', async () => {
  await fixture(async (root) => {
    const configuration = gitConfigSchema.parse({})
    await denied(() => new GitRuntime(remote, configuration))
    const git = new GitRuntime(root, configuration)
    await denied(() => git.status(remote, signal))
    await denied(() => git.worktree(remote, { operation: 'add', path: 'child', branch: 'HEAD' }, signal))
    await denied(() =>
      new ProcessGitRunner().run(remote, ['--version'], signal, { timeoutMs: 1000, maxOutputBytes: 1000 }),
    )
    await denied(() => inspectBranchRepository(async () => ({ code: 0, stdout: root, stderr: '' }), remote, signal))
    const terminals = new SystemTerminalManager()
    await denied(() =>
      terminals.open('operator', 'workspace', remote, 80, 24, { onOutput: () => {}, onExit: () => {} }),
    )
    expect(terminals.list('operator')).toEqual([])
  })
})

test('disabled local execution preserves workspace files and rejects terminal and worktree starts before side effects', async () => {
  await fixture(async (root) => {
    const sentinel = join(root, 'sentinel.txt')
    const mountCache = join(root, 'mount-cache')
    await writeFile(sentinel, 'unchanged')
    const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
    await ensurePathLayout(layout)
    const storage = new Storage(layout.database, layout)
    await storage.call('ready')
    let gitStarts = 0
    const launch = new SessionLaunchTargetService(
      storage,
      layout,
      async () => {
        gitStarts++
        return { code: 0, stdout: '', stderr: '' }
      },
      undefined,
      LOCAL_EXECUTION_DISABLED,
    )
    const mounts = new WorkspaceSandboxService(storage, mountCache, LOCAL_EXECUTION_DISABLED)
    const terminals = new SystemTerminalManager(LOCAL_EXECUTION_DISABLED)
    try {
      await expect(mounts.prepare('workspace', root, signal)).rejects.toMatchObject({ code: 'LOCAL_EXECUTION_DISABLED' })
      await expect(launch.branchTargetGit(root, ['status'], signal)).rejects.toMatchObject({ code: 'LOCAL_EXECUTION_DISABLED' })
      let terminalFailure: unknown
      try {
        terminals.open('operator', 'workspace', root, 80, 24, { onOutput: () => {}, onExit: () => {} })
      } catch (error) {
        terminalFailure = error
      }
      expect(terminalFailure).toMatchObject({ code: 'LOCAL_EXECUTION_DISABLED' })
      expect(terminals.list('operator')).toEqual([])
      expect(gitStarts).toBe(0)
      expect(await readFile(sentinel, 'utf8')).toBe('unchanged')
      await expect(stat(mountCache)).rejects.toMatchObject({ code: 'ENOENT' })
      const folders = new WorkspaceFolderService(storage, [], LOCAL_EXECUTION_DISABLED)
      await expect(folders.browse({ path: root }, signal)).rejects.toMatchObject({ code: 'LOCAL_EXECUTION_DISABLED' })
      expect(await readFile(sentinel, 'utf8')).toBe('unchanged')
    } finally {
      await launch.close()
      await storage.close()
    }
  })
})

test('workspace Skills and local Agent patch operations refuse remote roots, including empty mutations', async () => {
  await fixture(async (root) => {
    const catalog = createRuntimeSkillCatalog(root)
    for (const work of [
      () => catalog.snapshot(remote, signal),
      () => catalog.search(remote, {}, signal),
      () => collectScopeFiles(remote, []),
      () => synchronizeScope(root, remote, []),
      () => applyFiles(remote, root, []),
      () => applyFiles(root, remote, []),
    ])
      await denied(work)
  })
})

test('persisted node ownership prevents A mounts, local folder changes and worktree preparation before any local intent', async () => {
  await fixture(async (root) => {
    const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
    await ensurePathLayout(layout)
    const storage = new Storage(layout.database, layout)
    await storage.call('ready')
    const registry = await NodeRegistryService.open(new StorageNodeRegistryPort(storage))
    const launch = new SessionLaunchTargetService(storage, layout)
    const mounts = new WorkspaceSandboxService(storage, join(root, 'mounts'))
    try {
      const invite = await registry.invite('build-box')
      const node = await registry.join(createNodeIdentity().publicKey, invite.code, 'fixture')
      const {
        roots: _roots,
        protectedPaths: _paths,
        environmentAllowlist: _environment,
        ...floor
      } = nodeFloorSchema.parse({ roots: [] })
      await registry.touch(
        node.nodeId,
        nodeCapabilitiesSchema.parse({
          protocol: 1,
          nodeId: node.nodeId,
          platform: 'linux',
          evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
          roots: [{ rootId: 'engine', name: 'Engine', nodePath: '/srv/engine', access: 'write' }],
          sandbox: { backends: ['none'], filesystem: 'none', network: 'none' },
          floor,
        }),
      )
      const workspace = await storage.call('createNodeWorkspace', { nodeId: node.nodeId, rootId: 'engine' })
      const session = await storage.call('createSession', workspace.id, 'Remote')
      await denied(() => mounts.prepare(workspace.id, workspace.path, signal))
      await denied(() => mounts.prepare(workspace.id, root, signal))
      await denied(() => mounts.grantPaths(workspace.path, '.'))
      const folders = new WorkspaceFolderService(storage, [])
      await denied(() => folders.browse({ path: workspace.path }, signal))
      await denied(() =>
        folders.apply(
          'actor',
          'remote-mount',
          {
            operation: 'save',
            input: {
              workspaceId: workspace.id,
              expectedRevision: 0,
              folders: [{ id: 'local', alias: 'local', path: root }],
            },
          },
          signal,
        ),
      )
      const directory = await folders.browse({ path: root }, signal)
      expect(directory.roots.some((item) => item.path === workspace.path)).toBe(false)
      await denied(() => launch.checkoutRootForWorkspace(workspace.path, signal))
      await denied(() => launch.workspaceForRun(session.id, workspace.path, signal))
      await denied(() => launch.prepare(session.id, 0, signal))
      const changed = await storage.call('setSessionLaunchTarget', {
        actorId: 'actor',
        idempotencyKey: 'worktree',
        sessionId: session.id,
        expectedRevision: 0,
        selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/node', startPoint: 'main' } },
      })
      await denied(() => launch.prepare(session.id, changed.revision, signal))
      expect((await storage.call('sessionLaunchTargetRuntime', session.id)).resolution).toBeNull()
      expect((await storage.call('workspaceFolders', workspace.id)).revision).toBe(0)
      expect(await Bun.file(join(root, 'mounts')).exists()).toBe(false)
      const kernel = await Kernel.create({
        layout: createPathLayout(
          join(root, 'kernel-data'),
          join(root, 'kernel-cache'),
          join(root, 'kernel-pointer.json'),
        ),
        demo: true,
        secrets: new MemorySecrets(),
      })
      try {
        await denied(() => kernel.createWorkspace(workspace.path))
      } finally {
        await kernel.close()
      }
    } finally {
      mounts.dispose()
      await launch.close()
      registry.dispose()
      await storage.close()
    }
  })
}, 30_000)
