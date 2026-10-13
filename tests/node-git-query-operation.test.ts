import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { nodeGitQueryMethods, type NodeGitQueryMethod } from '@hbar/contracts/node-git-query'
import { nodeFloorSchema } from '@hbar/contracts/node'
import { resolvedSandboxProfileSchema } from '@hbar/contracts/sandbox'
import { GitRuntime, gitConfigSchema } from '../plugins/git/src/index'
import { WorkspaceNodeService } from '../packages/node-core/src/service'
import type { NodeExecutionBackend, NodeExecutionBackendOptions } from '../packages/node-core/src/execution-backend'
import { LocalExecution } from '../plugins/local-tools/src/index'
import { NodeStateStorage } from '../packages/storage/src/node-state'
import { NodeLocalConfirmationStorage } from '../packages/storage/src/node-local-confirmations'
import { NodeTerminalService, type NodeTerminalBackend } from '../packages/node-core/src/terminal-service'
import { sandboxSnapshotContent } from '@hbar/sandbox'

const paths: string[] = []
const teardowns: Array<() => Promise<void>> = []

async function git(cwd: string, ...args: string[]) {
  const child = Bun.spawn(['git', ...args], { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(stderr || stdout || `git exited with ${code}`)
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-manual-git-query-'))
  paths.push(root)
  await git(root, 'init', '--initial-branch=main')
  await git(root, 'config', 'user.name', 'Git Query Test')
  await git(root, 'config', 'user.email', 'query@example.invalid')
  await writeFile(join(root, 'tracked.txt'), 'before\n')
  await git(root, 'add', '--', 'tracked.txt')
  await git(root, 'commit', '-m', 'initial')
  return root
}

async function productionFixture(
  localConfirm: 'none' | 'process' = 'none',
  maxConcurrentProcesses = 8,
  holdArgv?: (signal: AbortSignal) => Promise<{ stdout: string; stderr: string; exitCode: number; truncated: boolean }>,
  onLinkLost?: { action: 'terminate' | 'continue'; graceMs: number },
  enableTerminal = false,
) {
  const root = await repository()
  const dataRoot = await mkdtemp(join(tmpdir(), 'hbar-manual-git-query-data-'))
  paths.push(dataRoot)
  const state = new NodeStateStorage(join(dataRoot, 'state.sqlite'))
  await state.call('ready', {})
  const floor = nodeFloorSchema.parse({
    roots: [{ rootId: 'repo', name: 'repo', path: root, access: 'write' }],
    process: true,
    network: false,
    backend: 'auto',
    osConfinement: 'required',
    localConfirm,
    maxConcurrentProcesses,
    ...(enableTerminal ? { terminal: true } : {}),
    ...(onLinkLost ? { onLinkLost } : {}),
    environmentAllowlist: ['PATH'],
  })
  await state.call('floor.set', floor)
  const argvCalls: string[][] = []
  const execCalls: string[] = []
  const confinementCalls: NodeExecutionBackendOptions[] = []
  const backend: NodeExecutionBackend = {
    name: 'bwrap',
    filesystem: true,
    network: true,
    processTree: true,
    exec: async (_cwd, command) => {
      execCalls.push(command)
      return { text: command, details: { code: 0 } }
    },
    async execArgv(cwd, argv, signal, options) {
      argvCalls.push([...argv])
      confinementCalls.push(options)
      signal.throwIfAborted()
      if (holdArgv) return await holdArgv(signal)
      const env: Record<string, string> = {}
      if (process.env.PATH) env.PATH = process.env.PATH
      Object.assign(env, options.environment)
      const child = Bun.spawn([...argv], {
        cwd,
        env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
      })
      const abort = () => child.kill('SIGKILL')
      signal.addEventListener('abort', abort, { once: true })
      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ])
        return { stdout, stderr, exitCode, truncated: false }
      } finally {
        signal.removeEventListener('abort', abort)
      }
    },
  }
  const node = await WorkspaceNodeService.open('node-query', dataRoot, state, new LocalExecution([dataRoot]), backend)
  node.installLocalConfirmations(new NodeLocalConfirmationStorage(state))
  node.installGitQueries(
    (registeredRoot, runner) =>
      new GitRuntime(registeredRoot, gitConfigSchema.parse({ maxOutputBytes: 48 * 1024 }), runner),
  )
  teardowns.push(async () => {
    await node.dispose()
    await state.close()
  })
  const input = (operationId: string, method: NodeGitQueryMethod = 'git.query.launchBranchSnapshot') => ({
    authority: {
      kind: 'manual-query' as const,
      operationId,
      deviceId: 'host-authenticated-device',
      workspaceId: 'workspace-17',
      sessionId: null,
      nodeId: 'node-query',
      rootId: 'repo',
      expectedRoot: root,
    },
    cwd: '.',
    ...(method === 'git.query.diff' ? { cached: false, paths: [] } : {}),
  })
  return { root, dataRoot, state, node, backend, argvCalls, execCalls, confinementCalls, input }
}

afterEach(async () => {
  await Promise.all(teardowns.splice(0).map((action) => action()))
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('manual B Git query operation service', () => {
  it('runs named read queries through B admission with read-only, network-off confinement and honest audit identity', async () => {
    const f = await productionFixture()
    const signal = new AbortController().signal
    const snapshot = await f.node.gitQuery('git.query.launchBranchSnapshot', f.input('manual-query:snapshot'), signal)
    expect(snapshot).toMatchObject({
      repository: { kind: 'repository', head: { kind: 'branch', name: 'main' } },
    })
    const audit = await f.state.call('audit.list', {})
    expect(audit).toMatchObject([
      {
        source: 'manual-query',
        operationId: 'manual-query:snapshot',
        deviceId: 'host-authenticated-device',
        workspaceId: 'workspace-17',
        sessionId: null,
        rootId: 'repo',
        expectedRoot: f.root,
        tool: 'git.query.launchBranchSnapshot',
        decision: 'allow',
      },
    ])
    expect(audit[0]).not.toHaveProperty('runId')
    expect(audit[0]).not.toHaveProperty('callId')
    expect(f.argvCalls.length).toBeGreaterThan(2)
    for (const options of f.confinementCalls) {
      expect(options.confinement?.networkEnabled).toBe(false)
      expect(options.confinement?.writableRoots).toEqual([])
      expect(options.protectedPaths.length).toBeGreaterThan(0)
    }
  })

  it('does not run configured external diff or textconv helpers from a read query', async () => {
    const f = await productionFixture()
    await writeFile(join(f.root, 'tracked.txt'), 'after\n')
    const marker = join(f.dataRoot, 'external-diff-ran')
    const external = process.platform === 'win32' ? `cmd /c echo ran>${marker}` : `sh -c 'echo ran > ${marker}'`
    await git(f.root, 'config', 'diff.external', external)
    const query = f.node.gitQuery(
      'git.query.diff',
      f.input('manual-query:diff', 'git.query.diff'),
      new AbortController().signal,
    )
    const result = nodeGitQueryMethods['git.query.diff'].output.parse(await query)
    expect(result.diff).toContain('+after')
    expect(await Bun.file(marker).exists()).toBe(false)

    await git(f.root, 'config', 'diff.evil.textconv', external)
    const error = await queryFailure(
      f.node.gitQuery(
        'git.query.diff',
        f.input('manual-query:textconv', 'git.query.diff'),
        new AbortController().signal,
      ),
    )
    expect(error).toMatchObject({ code: 'GIT_TEXTCONV_DENIED' })
    expect(await Bun.file(marker).exists()).toBe(false)
  })

  it('waits for B-local consent and then runs only the exact retried manual query', async () => {
    const f = await productionFixture('process')
    const request = f.input('manual-query:consent')
    const first = await queryFailure(
      f.node.gitQuery('git.query.launchBranchSnapshot', request, new AbortController().signal),
    )
    expect(first).toMatchObject({ code: 'NODE_LOCAL_CONFIRMATION_PENDING' })
    expect(f.argvCalls).toEqual([])
    expect(await f.state.call('audit.list', {})).toMatchObject([
      { source: 'manual-query', decision: 'ask', operationId: request.authority.operationId },
    ])
    const waiting = (await f.node.listLocalConfirmations()).entries[0]
    expect(waiting?.identity).toMatchObject({
      source: 'manual-query',
      operationId: request.authority.operationId,
      ownerDeviceId: request.authority.deviceId,
      workspaceId: request.authority.workspaceId,
      sessionId: null,
      nodeId: request.authority.nodeId,
      rootId: request.authority.rootId,
    })
    await f.node.resolveLocalConfirmation(
      { deviceId: 'bootstrap-local', role: 'operator' },
      { confirmationId: waiting!.id, decision: 'approve' },
    )
    const result = await f.node.gitQuery('git.query.launchBranchSnapshot', request, new AbortController().signal)
    expect(result).toMatchObject({ repository: { kind: 'repository' } })
    expect(f.argvCalls.length).toBeGreaterThan(0)
    expect((await f.node.listLocalConfirmations(true)).entries[0]?.state).toBe('consumed')
  })

  it('rejects any query method outside the static read allowlist', async () => {
    const f = await productionFixture()
    const invalid = await queryFailure(
      (f.node.gitQuery as (method: string, input: unknown, signal: AbortSignal) => Promise<unknown>)(
        'git.commit',
        f.input('manual-query:mutation'),
        new AbortController().signal,
      ),
    )
    expect(invalid).toBeInstanceOf(HbarError)
    expect(f.argvCalls).toEqual([])
    expect(Object.keys(nodeGitQueryMethods)).toContain('git.query.launchBranchSnapshot')
  })

  it('shares one floor process slot between terminal, exec and manual Git, then releases it after PTY close', async () => {
    const f = await productionFixture('none', 1, undefined, undefined, true)
    const profile = resolvedSandboxProfileSchema.parse({
      version: 1,
      profileId: 'terminal-read',
      chain: [{ id: 'terminal-read', revision: 0 }],
      escalation: 'deny',
      filesystem: { default: 'read', grants: [] },
      commands: { rules: [{ pattern: 'echo *', decision: 'allow' }] },
      network: { enabled: false },
      tools: { rules: [] },
      environment: { set: {} },
    })
    const content = sandboxSnapshotContent(profile)
    const snapshot = { profileId: profile.profileId, digest: content.digest }
    f.node.putSnapshot(snapshot, profile)
    let closed = false
    const terminalBackend: NodeTerminalBackend = {
      backend: 'bwrap',
      available: true,
      async open() {
        return {
          write() {},
          resize() {},
          async close() {
            closed = true
          },
        }
      },
    }
    const terminal = new NodeTerminalService(
      f.node.id,
      f.dataRoot,
      () => f.node.policy,
      terminalBackend,
      () => f.node.isPaused,
      undefined,
      f.node,
    )
    const terminalOperationId = 'manual-terminal:slot'
    terminal.putSnapshot(snapshot, profile)
    const info = await terminal.open({
      operationId: terminalOperationId,
      scope: { nodeId: f.node.id, rootId: 'repo', sessionId: 'session-17', ownerDeviceId: 'device-17' },
      sandbox: snapshot,
      cwd: '.',
      cols: 80,
      rows: 24,
    })
    expect(f.node.running).toContain(terminalOperationId)

    const execId = 'exec-run:exec-call'
    const blockedExec = await queryFailure(
      f.node.start({
        sessionId: 'session-17',
        runId: 'exec-run',
        callId: 'exec-call',
        sandbox: snapshot,
        admission: { kind: 'allow' },
        rootId: 'repo',
        expectedRoot: f.root,
        cwd: '.',
        operationId: execId,
        command: 'echo should-not-run',
        timeoutMs: 2_000,
      }),
    )
    expect(blockedExec).toMatchObject({ code: 'NODE_BUSY' })

    const queryError = await queryFailure(
      f.node.gitQuery('git.query.launchBranchSnapshot', f.input('manual-query:slot'), new AbortController().signal),
    )
    expect(queryError).toMatchObject({ code: 'NODE_BUSY' })
    expect(f.argvCalls).toEqual([])

    expect(await terminal.close({ terminalId: info.terminalId, scope: info.scope })).toEqual({ closed: true })
    expect(closed).toBe(true)
    expect(f.node.running).toEqual([])
    const execIdAfterClose = 'exec-run-after:exec-call-after'
    const exec = await f.node.start({
      sessionId: 'session-17',
      runId: 'exec-run-after',
      callId: 'exec-call-after',
      sandbox: snapshot,
      admission: { kind: 'allow' },
      rootId: 'repo',
      expectedRoot: f.root,
      cwd: '.',
      operationId: execIdAfterClose,
      command: 'echo started-after-close',
      timeoutMs: 2_000,
    })
    expect(['started', 'settled']).toContain(exec.state)
    const deadline = Date.now() + 2_000
    while ((await f.node.receipt(execIdAfterClose)).state !== 'settled' && Date.now() < deadline) await Bun.sleep(5)
    expect(f.execCalls).toContain('echo started-after-close')
    const capacityDeadline = Date.now() + 2_000
    while (f.node.running.length > 0 && Date.now() < capacityDeadline) await Bun.sleep(5)
    expect(f.node.running).toEqual([])
    const query = await f.node.gitQuery(
      'git.query.launchBranchSnapshot',
      f.input('manual-query:after-terminal'),
      new AbortController().signal,
    )
    expect(query).toMatchObject({ repository: { kind: 'repository' } })
  })

  it('tracks active manual queries so cancel, pause and link loss await their process release', async () => {
    for (const action of ['cancel', 'pause', 'link-loss'] as const) {
      let markEntered!: () => void
      const entered = new Promise<void>((resolve) => {
        markEntered = resolve
      })
      let released = false
      const f = await productionFixture(
        'none',
        8,
        async (signal) => {
          markEntered()
          await new Promise<void>((resolve) => {
            const onAbort = () =>
              setTimeout(() => {
                released = true
                resolve()
              }, 30)
            if (signal.aborted) onAbort()
            else signal.addEventListener('abort', onAbort, { once: true })
          })
          signal.throwIfAborted()
          return { stdout: '', stderr: '', exitCode: 1, truncated: false }
        },
        { action: 'terminate', graceMs: 5 },
      )
      const operationId = `manual-query:${action}`
      const query = f.node
        .gitQuery('git.query.launchBranchSnapshot', f.input(operationId), new AbortController().signal)
        .then(
          () => new Error('query should have been cancelled'),
          (error: unknown) => error,
        )
      await entered
      expect(f.node.running).toContain(operationId)

      if (action === 'cancel') {
        const cancellation = f.node.cancel(operationId)
        await Bun.sleep(5)
        expect(released).toBe(false)
        expect(await cancellation).toMatchObject({ state: 'absent' })
      } else if (action === 'pause') {
        const pausing = f.node.pause(true)
        await Bun.sleep(5)
        expect(released).toBe(false)
        await pausing
        expect(f.node.isPaused).toBe(true)
      } else {
        f.node.linkLost()
        const deadline = Date.now() + 2_000
        while (!released && Date.now() < deadline) await Bun.sleep(5)
        expect(released).toBe(true)
      }

      await query
      expect(released).toBe(true)
      expect(f.node.running).not.toContain(operationId)
    }
  })
})

async function queryFailure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected Git query refusal')
}
