import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nodeFloorSchema } from '@hbar/contracts/node'
import { HbarError } from '@hbar/contracts'
import { createSessionLaunchBranchesReader, HbarClient } from '@hbar/client'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { createWindowsExecutionBackend } from '../apps/node/src/windows-backend'

async function until(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 30_000,
  diagnostic?: () => unknown,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      if (await check()) return
    } catch (error) {
      if (!(error instanceof HbarError) || error.code !== 'NODE_LINK_UNAVAILABLE') throw error
    }
    if (Date.now() > deadline)
      throw new Error(`The real Host and workspace node did not converge: ${JSON.stringify(diagnostic?.())}`)
    await Bun.sleep(20)
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  const child = Bun.spawn(['git', ...args], { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(stderr || stdout || `git ${args[0]} exited with ${code}`)
}

interface Fixture {
  readonly root: string
  readonly hostWorkspace: string
  readonly nodeWorkspace: string
  readonly nodeHome: string
  readonly runtime: ProcessHostRuntime
  readonly host: Awaited<ReturnType<typeof startServer>>
  readonly nodeId: string
  readonly workspace: Awaited<ReturnType<ProcessHostRuntime['kernel']['createNodeWorkspace']>>
}

async function withHostAndNode<T>(initializeGit: boolean, run: (fixture: Fixture) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-managed-host-node-execution-'))
  const hostWorkspace = join(root, 'a-workspace')
  const nodeWorkspace = join(root, 'b-workspace')
  const nodeHome = join(root, 'node-home')
  await mkdir(hostWorkspace)
  await mkdir(nodeWorkspace)
  await mkdir(nodeHome)
  await writeFile(join(nodeWorkspace, 'remote-input.txt'), 'content stored on B')
  if (initializeGit) {
    await git(nodeWorkspace, 'init', '--initial-branch=main')
    await git(nodeWorkspace, 'config', 'user.name', 'Remote worktree test')
    await git(nodeWorkspace, 'config', 'user.email', 'worktree-test@example.invalid')
    await git(nodeWorkspace, 'add', '--', 'remote-input.txt')
    await git(nodeWorkspace, 'commit', '-m', 'initial remote workspace')
  }
  const nodeState = new NodeStateStorage(join(nodeHome, 'node.sqlite'))
  await nodeState.call('ready', {})
  await nodeState.call(
    'floor.set',
    nodeFloorSchema.parse({ roots: [{ rootId: 'engine', name: 'Engine', path: nodeWorkspace, access: 'write' }] }),
  )
  await nodeState.close()

  const layout = createPathLayout(join(root, 'a-data'), join(root, 'a-cache'), join(root, 'pointer.json'))
  const runtime = await ProcessHostRuntime.create({
    layout,
    sourceRoot: process.cwd(),
    workspace: hostWorkspace,
    demo: true,
    noLocalExec: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let nodeProcess: Bun.Subprocess<'pipe', 'pipe', 'pipe'> | undefined
  let nodeId: string | undefined
  try {
    host = await startServer(runtime.kernel, {
      port: 0,
      runtime,
      controller: runtime.controller,
      nodeLink: runtime.nodeLink,
    })
    const url = `http://127.0.0.1:${host.server.port}`
    const invitation = await runtime.nodeLink.invite('execution-builder')
    const startedNodeProcess = Bun.spawn(
      [
        process.execPath,
        join(process.cwd(), 'tests', 'fixtures', 'node-process-runner.ts'),
        '--home',
        nodeHome,
        '--join',
        url,
        '--code',
        invitation.code,
        '--fingerprint',
        invitation.fingerprint,
      ],
      { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', windowsHide: true },
    )
    nodeProcess = startedNodeProcess
    let stderr = ''
    void new Response(startedNodeProcess.stderr).text().then((text) => {
      stderr = text
    })
    const nodeReady = new Promise<string>((resolve, reject) => {
      const reader = startedNodeProcess.stdout.getReader()
      const decoder = new TextDecoder()
      let output = ''
      let settled = false
      void (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            output += decoder.decode(value, { stream: true })
            const lines = output.split(/\r?\n/)
            output = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.startsWith('HBAR_NODE_READY ')) continue
              settled = true
              resolve(line.slice('HBAR_NODE_READY '.length))
            }
          }
          if (!settled) reject(new Error(`Workspace node child exited before ready: ${stderr}`))
        } catch (error) {
          if (!settled) reject(error)
        }
      })()
    })
    let startupTimer: ReturnType<typeof setTimeout> | undefined
    try {
      nodeId = await Promise.race([
        nodeReady,
        new Promise<never>((_, reject) => {
          startupTimer = setTimeout(
            () => reject(new Error(`Workspace node child startup timed out: ${stderr}`)),
            30_000,
          )
        }),
      ])
    } finally {
      if (startupTimer) clearTimeout(startupTimer)
    }
    if (!nodeId) throw new Error(`Workspace node child returned an empty identity: ${stderr}`)
    const liveNodeId = nodeId
    let observedNodes: unknown = []
    await until(
      async () => {
        const listing = await runtime.nodeLink.list({ limit: 10 })
        observedNodes = listing.items
        return listing.items.some((item) => item.nodeId === liveNodeId && item.online)
      },
      30_000,
      () => ({
        snapshot: runtime.snapshot(),
        transports: runtime.transportDiagnostics(),
        nodeLink: { childNodeId: liveNodeId, childExitCode: nodeProcess?.exitCode ?? null },
        registeredNodes: observedNodes,
      }),
    )
    const workspace = await runtime.kernel.createNodeWorkspace({ nodeId: liveNodeId, rootId: 'engine' })
    return await run({ root, hostWorkspace, nodeWorkspace, nodeHome, runtime, host, nodeId: liveNodeId, workspace })
  } finally {
    if (nodeProcess) {
      try {
        await nodeProcess.stdin.write('close\n')
        await nodeProcess.stdin.end()
        let shutdownTimer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            nodeProcess.exited,
            new Promise<void>((resolve) => {
              shutdownTimer = setTimeout(resolve, 10_000)
            }),
          ])
        } finally {
          if (shutdownTimer) clearTimeout(shutdownTimer)
        }
      } finally {
        if (nodeProcess.exitCode === null) nodeProcess.kill('SIGTERM')
        await nodeProcess.exited
      }
    }
    await host?.close()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}

test('the owned Host Kernel routes shared-current file reads and writes to B without touching A files', async () => {
  await withHostAndNode(false, async ({ root, hostWorkspace, nodeWorkspace, runtime, workspace }) => {
    expect(runtime.kernel.options.noLocalExec).toBe(true)
    const localWorkspace = (await runtime.storage.call('workspaces')).find((item) => item.path === hostWorkspace)
    if (!localWorkspace) throw new Error('The conversation-only Host fixture has no registered local placeholder')
    const localSession = await runtime.storage.call('createSession', localWorkspace.id)
    const conversation = await runtime.kernel.submit(
      localSession.id,
      'conversation-without-local-execution',
      { text: 'Model-only conversation', images: [] },
      'local-fixture',
    )
    await runtime.waitForIdle()
    expect((await runtime.storage.call('run', conversation.id)).status).toBe('completed')
    const forbidden = await runtime.kernel.submit(
      localSession.id,
      'local-write-disabled',
      { text: '/tool write_file {"path":"remote-output.txt","text":"must be refused"}', images: [], approval: 'allow' },
      'local-fixture',
    )
    await runtime.waitForIdle()
    const refused = (await runtime.storage.call('snapshot', localSession.id)).messages
      .filter((message) => message.runId === forbidden.id)
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'write_file')
    expect(refused).toMatchObject({ type: 'tool_result', isError: true })
    if (!refused || refused.type !== 'tool_result') throw new Error('The refused managed local tool has no result')
    expect(refused.text).toContain('Local workspace execution is disabled')
    expect(await Bun.file(join(hostWorkspace, 'remote-output.txt')).exists()).toBe(false)

    const session = await runtime.storage.call('createSession', workspace.id)
    await runtime.kernel.setPermissionMode('allow')
    const readRun = await runtime.kernel.submit(
      session.id,
      'remote-shared-read',
      { text: '/tool read_file {"path":"remote-input.txt"}', images: [] },
      'local-fixture',
    )
    await runtime.waitForIdle()
    expect(await runtime.storage.call('run', readRun.id)).toMatchObject({ status: 'completed' })
    const writeRun = await runtime.kernel.submit(
      session.id,
      'remote-shared-write',
      { text: '/tool write_file {"path":"remote-output.txt","text":"written on B"}', images: [], approval: 'allow' },
      'local-fixture',
    )
    await runtime.waitForIdle()
    expect(await runtime.storage.call('run', writeRun.id)).toMatchObject({ status: 'completed' })
    const events = await runtime.storage.call('events', session.id, 0, 2_000)
    const readMessages = events.filter((event) => event.runId === readRun.id && event.type === 'message.committed')
    expect(JSON.stringify(readMessages)).toContain('content stored on B')
    expect(await readFile(join(nodeWorkspace, 'remote-output.txt'), 'utf8')).toBe('written on B')
    await expect(readFile(join(hostWorkspace, 'remote-output.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await Bun.file(join(root, 'a-workspace', 'remote-input.txt')).exists()).toBe(false)
  })
})

test('Linux performs isolated Git worktree execution; Windows fails closed when its confinement backend is unavailable', async () => {
  if (process.platform === 'win32') {
    const root = await mkdtemp(join(tmpdir(), 'hbar-windows-backend-denial-'))
    let backendAvailable: boolean
    try {
      const backend = await createWindowsExecutionBackend({ dataRoot: root })
      try {
        backendAvailable = backend.filesystem && backend.network && backend.processTree
        if (!backendAvailable) {
          await expect(
            backend.exec(root, 'git status', new AbortController().signal, {
              timeoutMs: 5_000,
              environment: {},
              confinement: null,
              protectedPaths: [],
              environmentAllowlist: [],
            }),
          ).rejects.toMatchObject({ code: 'SANDBOX_BACKEND_UNAVAILABLE' })
        }
      } finally {
        await backend.dispose?.()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
    if (!backendAvailable) return
  }
  if (process.platform !== 'linux' && process.platform !== 'win32')
    throw new Error(`Managed Git worktree verification is unsupported on ${process.platform}`)

  await withHostAndNode(true, async ({ hostWorkspace, nodeWorkspace, runtime, host, workspace }) => {
    const location = workspace.location
    if (!location || location.kind !== 'node') throw new Error('The worktree fixture did not create a node workspace')
    const capabilities = await runtime.nodeLink.call(location.nodeId, 'node.capabilities', {})
    const confinementAvailable =
      capabilities.floor.process &&
      capabilities.sandbox.filesystem === 'enforced' &&
      capabilities.sandbox.backends.length > 0
    if (!confinementAvailable) {
      const session = await runtime.storage.call('createSession', workspace.id)
      await runtime.kernel.setSessionLaunchTarget({
        actorId: 'runtime-e2e',
        idempotencyKey: 'remote-isolated-worktree-denied',
        sessionId: session.id,
        expectedRevision: 0,
        selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/remote-e2e' } },
      })
      const deniedRun = await runtime.kernel.submit(
        session.id,
        'remote-worktree-backend-unavailable',
        { text: '/tool read_file {"path":"remote-input.txt"}', images: [] },
        'local-fixture',
      )
      await runtime.waitForIdle()
      expect(await runtime.storage.call('run', deniedRun.id)).toMatchObject({ status: 'failed' })
      expect(await runtime.storage.call('nodeRunWorktree', deniedRun.id)).toBeNull()
      expect(await Bun.file(join(hostWorkspace, 'remote-output.txt')).exists()).toBe(false)
      expect(await Bun.file(join(nodeWorkspace, 'remote-output.txt')).exists()).toBe(false)
      return
    }
    const queryDevice = await host.auth.createDevice('remote Git query fixture', {
      role: 'operator',
      workspaceIds: null,
    })
    const queryClient = new HbarClient(`http://127.0.0.1:${host.server.port}`, queryDevice.token)
    await queryClient.connect()
    try {
      const branchReader = createSessionLaunchBranchesReader(queryClient)
      const initialBranches = await branchReader.list({ workspaceId: workspace.id })
      expect(initialBranches).toMatchObject({
        workspaceId: workspace.id,
        repository: { kind: 'repository', head: { kind: 'branch', name: 'main' } },
      })
      expect(initialBranches.branches.map((branch) => branch.name)).toContain('main')
      expect(runtime.kernel.options.noLocalExec).toBe(true)
      const session = await runtime.storage.call('createSession', workspace.id)
      await runtime.kernel.setSessionLaunchTarget({
        actorId: 'runtime-e2e',
        idempotencyKey: 'remote-isolated-worktree',
        sessionId: session.id,
        expectedRevision: 0,
        selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/remote-e2e' } },
      })
      await runtime.kernel.setPermissionMode('allow')
      const readRun = await runtime.kernel.submit(
        session.id,
        'remote-read',
        { text: '/tool read_file {"path":"remote-input.txt"}', images: [] },
        'local-fixture',
      )
      await runtime.waitForIdle()
      expect(await runtime.storage.call('run', readRun.id)).toMatchObject({ status: 'completed' })
      const readBinding = await runtime.storage.call('nodeRunWorktree', readRun.id)
      expect(readBinding).toMatchObject({ branch: 'feature/remote-e2e', launchTargetRevision: 1 })
      if (!readBinding) throw new Error('Remote isolated Run has no durable B worktree binding')
      const branchesAfterWorktree = await branchReader.list({ workspaceId: workspace.id })
      const branchNamesAfterWorktree = branchesAfterWorktree.branches.map((branch) => branch.name)
      expect(branchNamesAfterWorktree).toContain('main')
      expect(branchNamesAfterWorktree).toContain('feature/remote-e2e')
      const writeRun = await runtime.kernel.submit(
        session.id,
        'remote-write',
        { text: '/tool write_file {"path":"remote-output.txt","text":"written on B"}', images: [], approval: 'allow' },
        'local-fixture',
      )
      await runtime.waitForIdle()
      expect(await runtime.storage.call('run', writeRun.id)).toMatchObject({ status: 'completed' })
      const writeBinding = await runtime.storage.call('nodeRunWorktree', writeRun.id)
      expect(writeBinding).toMatchObject({ worktreeId: readBinding.worktreeId, nodePath: readBinding.nodePath })
      const events = await runtime.storage.call('events', session.id, 0, 2_000)
      const readMessages = events.filter((event) => event.runId === readRun.id && event.type === 'message.committed')
      const writeMessages = events.filter((event) => event.runId === writeRun.id && event.type === 'message.committed')
      expect(JSON.stringify(readMessages)).toContain('content stored on B')
      expect(JSON.stringify(readMessages)).not.toContain('Tool failed')
      expect(JSON.stringify(writeMessages)).not.toContain('Tool failed')
      expect(await readFile(join(readBinding.nodePath, 'remote-output.txt'), 'utf8')).toBe('written on B')
      await expect(readFile(join(nodeWorkspace, 'remote-output.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(hostWorkspace, 'remote-output.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      queryClient.disconnect()
    }
  })
})
