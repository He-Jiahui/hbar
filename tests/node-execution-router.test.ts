import { expect, test } from 'bun:test'
import type { z } from 'zod'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import {
  ExecutionRouter,
  nodeExecutionRelativePath,
  resolveNodeExecutionPath,
  type NodeExecutionScope,
  type NodeExecutionPort,
} from '@hbar/node-link'
import {
  nodeWorkspaceLocator,
  nodeWorkspaceMethods,
  NODE_LIMITS,
  type NodeCallAuthority,
  type NodeWorkspaceMethod,
} from '@hbar/contracts/node'
import { workspaceSearchInputSchema, workspaceFindInputSchema } from '@hbar/contracts/workspace-query'
import type { ResolvedSandboxProfile } from '@hbar/contracts/sandbox'
import type { NodeExecutionBackend } from '@hbar/node-core'
import { resolveSandboxProfile, sandboxSnapshotContent } from '@hbar/sandbox'
import { LocalExecution } from '@hbar/local-tools'
import type { ExecutionProvider } from '@hbar/plugin-sdk'
import { withNodeExecutionLink, type NodeExecutionLinkFixture } from './fixtures/node-execution-link'

function fixture(f: NodeExecutionLinkFixture, options: { localEnabled?: boolean } = {}) {
  const workspace = {
    path: nodeWorkspaceLocator(f.node.id, 'engine'),
    location: { kind: 'node' as const, nodeId: f.node.id, rootId: 'engine', nodePath: f.workspace },
  }
  const authority: NodeCallAuthority = {
    sessionId: 'session',
    runId: 'run',
    callId: 'call',
    sandbox: null,
    admission: { kind: 'allow' },
  }
  const signal = new AbortController().signal
  let scope: NodeExecutionScope | undefined = { workspace, authority, signal }
  const snapshots = new Map<string, ResolvedSandboxProfile>()
  const router = new ExecutionRouter({
    local: new LocalExecution(),
    node: f.port,
    current: () => scope,
    ...options,
    loadSnapshot: async (ref) => {
      const profile = snapshots.get(ref.digest)
      if (!profile) throw new HbarError('SANDBOX_SNAPSHOT_NOT_FOUND', 'Missing fixture snapshot')
      return profile
    },
  })
  return {
    router,
    workspace: workspace.path,
    authority,
    snapshots,
    setScope: (value: NodeExecutionScope | undefined) => {
      scope = value
    },
    nextCall: (callId: string, extra: Partial<NodeCallAuthority> = {}, nextSignal = signal) => {
      scope = { workspace, authority: { ...authority, ...extra, callId }, signal: nextSignal }
      return scope.authority
    },
    metadataOnly: () => {
      scope = { workspace, signal }
    },
  }
}
async function failure(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error('Expected a refusal')
    },
    (error: unknown) => error,
  )
}
async function until(check: () => boolean) {
  const end = Date.now() + 5_000
  while (!check()) {
    if (Date.now() > end) throw new Error('Expected node execution state was not reached')
    await Bun.sleep(5)
  }
}

test('router reads, queries, writes, reconciles versions and restores large files on B while A has a different workspace', async () => {
  await withNodeExecutionLink(async (f) => {
    await writeFile(join(f.localWorkspace, 'main.txt'), 'A file')
    await writeFile(join(f.workspace, 'main.txt'), 'B file')
    const s = fixture(f)
    try {
      expect(await s.router.read(s.workspace, join(f.workspace, 'main.txt'))).toBe('B file')
      expect(await s.router.list(s.workspace, '.')).toMatchObject([
        { path: '.git', directory: true },
        { path: 'main.txt', directory: false },
      ])
      expect((await s.router.canonicalize(s.workspace, ['.', 'main.txt'], AbortSignal.timeout(5_000))).root).toBe(
        f.workspace,
      )
      const found = await s.router.workspaceQuery.find(
        s.workspace,
        workspaceFindInputSchema.parse({ include: ['*.txt'] }),
        AbortSignal.timeout(5_000),
      )
      expect(found.paths).toEqual(['main.txt'])
      const search = await s.router.workspaceQuery.search(
        s.workspace,
        workspaceSearchInputSchema.parse({ pattern: 'B file', literal: true }),
        AbortSignal.timeout(5_000),
      )
      expect(search.matches.map((item) => item.path)).toEqual(['main.txt'])
      expect(
        (await s.router.workspaceQuery.readRange(s.workspace, 'main.txt', 1, 1, AbortSignal.timeout(5_000))).text,
      ).toContain('B file')
      const text = '\uFEFF' + '🌍'.repeat(300_000)
      s.nextCall('provider/call.1')
      const options = { expectedRevision: createHash('sha256').update('B file').digest('hex') }
      const versions = await s.router.write(s.workspace, 'main.txt', text, options)
      expect(versions).toMatchObject({ before: 'B file', after: text, path: 'main.txt', created: false })
      expect(await readFile(join(f.workspace, 'main.txt'), 'utf8')).toBe(text)
      expect(await s.router.read(s.workspace, 'main.txt')).toBe(text)
      await writeFile(join(f.workspace, 'main.txt'), 'B user edit')
      expect(await s.router.write(s.workspace, 'main.txt', text, options)).toEqual(versions)
      expect(await readFile(join(f.workspace, 'main.txt'), 'utf8')).toBe('B user edit')
      await writeFile(join(f.workspace, 'main.txt'), text)
      s.nextCall('restore/call.2')
      await s.router.restoreFiles(
        s.workspace,
        [{ path: 'main.txt', before: 'B file', after: text }],
        AbortSignal.timeout(5_000),
      )
      expect(await readFile(join(f.workspace, 'main.txt'), 'utf8')).toBe('B file')
      expect(await readFile(join(f.localWorkspace, 'main.txt'), 'utf8')).toBe('A file')
      expect((await f.state.call('audit.list', {})).map((item) => item.tool)).toEqual(['write_file', 'restore_files'])
      expect(f.requests.filter((item) => item.method === 'fs.write').length).toBeGreaterThan(1)
      expect(f.requests.filter((item) => item.method === 'fs.restore.chunk').length).toBeGreaterThan(1)
      s.nextCall('too-large')
      expect(
        await failure(s.router.write(s.workspace, 'main.txt', 'x'.repeat(NODE_LIMITS.fileBytes + 1))),
      ).toMatchObject({ code: 'FILE_LIMIT' })
      expect(await f.node.receipt('run:too-large')).toEqual({ state: 'absent' })
      expect(await readFile(join(f.workspace, 'main.txt'), 'utf8')).toBe('B file')
    } finally {
      await s.router.dispose()
    }
  })
}, 30_000)

test('owner metadata can precede admission but node effects require the original Host scope and never enter A local services', async () => {
  await withNodeExecutionLink(async (f) => {
    const s = fixture(f, { localEnabled: false })
    try {
      s.metadataOnly()
      expect(await s.router.canonicalize(s.workspace, ['missing/file.txt'], AbortSignal.timeout(5_000))).toMatchObject({
        root: f.workspace,
      })
      expect(await failure(s.router.read(s.workspace, 'file.txt'))).toMatchObject({
        code: 'RUNTIME_EXECUTION_REQUIRED',
      })
      expect(await failure(s.router.read(f.localWorkspace, 'file.txt'))).toMatchObject({ code: 'WORKSPACE_SCOPE' })
      s.setScope(undefined)
      expect(await failure(s.router.read(s.workspace, 'file.txt'))).toMatchObject({
        code: 'RUNTIME_EXECUTION_REQUIRED',
      })
      expect(await failure(s.router.read(f.localWorkspace, 'file.txt'))).toMatchObject({
        code: 'LOCAL_EXECUTION_DISABLED',
      })
      const denied = await s.router.exec(s.workspace, 'echo never', new AbortController().signal)
      expect(denied).toMatchObject({
        isError: true,
        details: { code: 'RUNTIME_EXECUTION_REQUIRED', executionStarted: false },
      })
      expect(f.requests.some((item) => item.method === 'fs.readBytes' || item.method === 'exec.start')).toBe(false)
    } finally {
      await s.router.dispose()
    }
  })
})

test('managed child roots use B registered canonicalization metadata without global node capabilities', async () => {
  const nodeId = 'managed-node'
  const worktreeId = 'a'.repeat(32)
  const rootId = `wt_${worktreeId}`
  const nodePath = '/srv/engine/.hbar/worktrees/a'
  const workspace = {
    path: nodeWorkspaceLocator(nodeId, rootId),
    location: { kind: 'node' as const, nodeId, rootId, nodePath },
  }
  const signal = new AbortController().signal
  const authority: NodeCallAuthority = {
    sessionId: 'session',
    runId: 'run',
    callId: 'worktree-call',
    sandbox: null,
    admission: { kind: 'allow' },
  }
  const requests: string[] = []
  const node: NodeExecutionPort = {
    async call<Method extends NodeWorkspaceMethod>(
      _nodeId: string,
      method: Method,
      _input: z.input<(typeof nodeWorkspaceMethods)[Method]['input']>,
    ): Promise<z.output<(typeof nodeWorkspaceMethods)[Method]['output']>> {
      requests.push(method)
      if (method === 'node.capabilities') throw new Error('Child metadata must not query global capabilities')
      let result: unknown
      if (method === 'fs.canonicalize')
        result = { root: nodePath, paths: [nodePath], dialect: 'posix', caseInsensitive: false }
      else if (method === 'fs.list') result = []
      else throw new Error(`Unexpected child-root node method: ${method}`)
      return nodeWorkspaceMethods[method].output.parse(result) as z.output<
        (typeof nodeWorkspaceMethods)[Method]['output']
      >
    },
  }
  const router = new ExecutionRouter({
    local: new LocalExecution(),
    node,
    current: () => ({ workspace, authority, signal }),
    loadSnapshot: async () => {
      throw new Error('Unexpected sandbox snapshot read')
    },
  })
  try {
    expect(await router.canonicalize(workspace.path, ['.'], signal)).toMatchObject({
      root: nodePath,
      dialect: 'posix',
    })
    expect(await router.list(workspace.path, '.')).toEqual([])
    expect(requests).toEqual(['fs.canonicalize', 'fs.canonicalize', 'fs.canonicalize', 'fs.list'])
  } finally {
    await router.dispose()
  }
})

test('A waits for B-local write consent, retries the identical final chunk once, and reads the durable result', async () => {
  await withNodeExecutionLink(async (f) => {
    const snapshot = await f.state.call('floor.snapshot', {})
    await f.node.updatePolicy({ ...f.node.policy, localConfirm: 'write' }, snapshot.revision)
    const s = fixture(f)
    s.nextCall('write-confirmation')
    const write = s.router.write(s.workspace, 'confirmed.txt', 'operator approved')
    let end = Date.now() + 5_000
    let pendingEntries = await f.node.listLocalConfirmations()
    while (pendingEntries.entries.length === 0) {
      if (Date.now() > end) throw new Error('Expected a queued B-local write confirmation')
      await Bun.sleep(5)
      pendingEntries = await f.node.listLocalConfirmations()
    }
    const pending = pendingEntries.entries[0]
    if (!pending) throw new Error('Expected a queued B-local write confirmation')
    await f.node.resolveLocalConfirmation(
      { deviceId: 'bootstrap-local', role: 'operator' },
      { confirmationId: pending.id, decision: 'approve' },
    )
    const receipt = await write
    expect(receipt.after).toBe('operator approved')
    expect(await readFile(join(f.workspace, 'confirmed.txt'), 'utf8')).toBe('operator approved')
    const writes = f.requests.filter((request) => request.method === 'fs.write')
    expect(writes).toHaveLength(2)
    expect(writes[0]?.input).toEqual(writes[1]?.input)
    expect(f.requests.some((request) => request.method === 'node.confirmation.status')).toBe(true)
  })
})

test('A retries the exact admitted shell request once after B-local process consent', async () => {
  let processStarts = 0
  await withNodeExecutionLink(
    async (f) => {
      await mkdir(join(f.workspace, '.git/hooks'), { recursive: true })
      const snapshot = await f.state.call('floor.snapshot', {})
      await f.node.updatePolicy({ ...f.node.policy, localConfirm: 'process' }, snapshot.revision)
      const s = fixture(f)
      s.nextCall('process-confirmation')
      const execution = s.router.exec(s.workspace, 'echo approved', AbortSignal.timeout(10_000))
      let end = Date.now() + 5_000
      let pendingEntries = await f.node.listLocalConfirmations()
      while (pendingEntries.entries.length === 0) {
        if (Date.now() > end) throw new Error('Expected a queued B-local process confirmation')
        await Bun.sleep(5)
        pendingEntries = await f.node.listLocalConfirmations()
      }
      const pending = pendingEntries.entries[0]
      if (!pending) throw new Error('Expected a queued B-local process confirmation')
      await f.node.resolveLocalConfirmation(
        { deviceId: 'bootstrap-local', role: 'operator' },
        { confirmationId: pending.id, decision: 'approve' },
      )
      const result = await execution
      expect(result).toMatchObject({ isError: false, text: 'echo approved' })
      expect(processStarts).toBe(1)
      const starts = f.requests.filter((request) => request.method === 'exec.start')
      expect(starts).toHaveLength(2)
      expect(starts[1]?.input).toEqual(starts[0]?.input)
      expect(f.requests.some((request) => request.method === 'node.confirmation.status')).toBe(true)
    },
    {
      backend: {
        name: 'bwrap',
        filesystem: true,
        network: true,
        processTree: true,
        exec: async (_root, command) => {
          processStarts++
          return { text: command, details: { code: 0, exitCode: 0, truncated: false } }
        },
      },
    },
  )
})

test('node path translation uses the owner dialect and rejects traversal and other absolute roots on either platform', () => {
  const location = { kind: 'node' as const, nodeId: 'node', rootId: 'engine', nodePath: '/srv/project' }
  const linux = { location, platform: 'linux' as const }
  const windows = { location: { ...location, nodePath: 'Z:\\project' }, platform: 'win32' as const }
  expect(nodeExecutionRelativePath(linux, '/srv/project/src/main.ts')).toBe('src/main.ts')
  expect(nodeExecutionRelativePath(windows, 'Z:\\project\\src\\main.ts')).toBe('src/main.ts')
  expect(nodeExecutionRelativePath(windows, 'src\\main.ts')).toBe('src/main.ts')
  for (const path of ['../private', 'src/../private', 'src\\..\\private', 'hbar-node://other/root']) {
    expect(() => nodeExecutionRelativePath(linux, path)).toThrow()
    expect(() => nodeExecutionRelativePath(windows, path)).toThrow()
  }
  expect(() => nodeExecutionRelativePath(linux, '/srv/project-other/file')).toThrow()
  expect(() => nodeExecutionRelativePath(windows, 'Y:\\private\\file')).toThrow()
  expect(() => nodeExecutionRelativePath(windows, 'Z:relative')).toThrow()
  expect(() => nodeExecutionRelativePath(windows, 'Z:\\PROJECT\\private')).toThrow()
  expect(() => nodeExecutionRelativePath(linux, '/srv/PROJECT/private')).toThrow()
})

test('mounted folder aliases route file paths to their pinned B roots', () => {
  const target = {
    location: { kind: 'node' as const, nodeId: 'node', rootId: 'engine', nodePath: '/srv/project' },
    platform: 'linux' as const,
    signal: new AbortController().signal,
    authority: {
      sessionId: 'session',
      runId: 'run',
      callId: 'call',
      sandbox: null,
      admission: { kind: 'allow' as const },
      workspaceMounts: {
        schemaVersion: 1 as const,
        workspaceId: 'workspace',
        revision: 1,
        digest: 'a'.repeat(64),
        nodeId: 'node',
        primaryRootId: 'engine',
        roots: [
          { rootId: 'engine', expectedRoot: '/srv/project', alias: 'src' },
          { rootId: 'docs', expectedRoot: '/srv/docs', alias: 'docs' },
        ],
      },
    },
  }
  expect(resolveNodeExecutionPath(target, 'docs/readme.md')).toMatchObject({
    path: 'readme.md',
    target: { location: { rootId: 'docs', nodePath: '/srv/docs' } },
  })
  expect(resolveNodeExecutionPath(target, 'src/main.ts')).toMatchObject({
    path: 'main.ts',
    target: { location: { rootId: 'engine', nodePath: '/srv/project' } },
  })
  expect(resolveNodeExecutionPath(target, '/srv/docs/readme.md')).toMatchObject({
    path: 'readme.md',
    target: { location: { rootId: 'docs', nodePath: '/srv/docs' } },
  })
  expect(() => resolveNodeExecutionPath(target, 'docs/../private')).toThrow()
  expect(() => resolveNodeExecutionPath(target, '/srv/private/secret')).toThrow()
})

test('managed primary aliases stay on the B-owned child while secondary roots remain mounted', () => {
  const id = 'a'.repeat(32)
  const target = {
    location: {
      kind: 'node' as const,
      nodeId: 'node',
      rootId: `wt_${id}`,
      nodePath: `/srv/project/.hbar-worktrees/${id}`,
    },
    platform: 'linux' as const,
    signal: new AbortController().signal,
    authority: {
      sessionId: 'session',
      runId: 'run',
      callId: 'call',
      sandbox: null,
      admission: { kind: 'allow' as const },
      managedWorktree: { worktreeId: id, targetRevision: 1 },
      workspaceMounts: {
        schemaVersion: 1 as const,
        workspaceId: 'workspace',
        revision: 1,
        digest: 'a'.repeat(64),
        nodeId: 'node',
        primaryRootId: 'engine',
        roots: [
          { rootId: 'engine', expectedRoot: '/srv/project', alias: 'src' },
          { rootId: 'docs', expectedRoot: '/srv/docs', alias: 'docs' },
        ],
      },
    },
  }
  expect(resolveNodeExecutionPath(target, 'src/main.ts')).toMatchObject({
    target: { location: { rootId: `wt_${id}` } },
    path: 'main.ts',
  })
  expect(resolveNodeExecutionPath(target, 'main.ts')).toMatchObject({
    target: { location: { rootId: `wt_${id}` } },
    path: 'main.ts',
  })
  expect(resolveNodeExecutionPath(target, 'docs/readme.md')).toMatchObject({
    target: { location: { rootId: 'docs' } },
    path: 'readme.md',
  })
  expect(resolveNodeExecutionPath(target, `/srv/project/.hbar-worktrees/${id}/main.ts`).path).toBe('main.ts')
  expect(() => resolveNodeExecutionPath(target, '/srv/project/private.txt')).toThrow()
})

test("a changed Host scope during metadata exchange cannot alter this call's captured authority", async () => {
  let switchScope: (() => void) | undefined
  await withNodeExecutionLink(
    async (f) => {
      await writeFile(join(f.workspace, 'file.txt'), 'bound')
      const s = fixture(f)
      s.nextCall('original')
      switchScope = () => {
        s.nextCall('forged', { sessionId: 'forged-session', runId: 'forged-run' })
      }
      try {
        expect(await s.router.read(s.workspace, 'file.txt')).toBe('bound')
        const input = f.requests.find((item) => item.method === 'fs.readBytes')?.input
        expect(nodeWorkspaceMethods['fs.readBytes'].input.parse(input).authority).toMatchObject({
          sessionId: 'session',
          runId: 'run',
          callId: 'original',
        })
      } finally {
        switchScope = undefined
        await s.router.dispose()
      }
    },
    {
      transform: (method, _input, output) => {
        if (method === 'node.capabilities') switchScope?.()
        return output
      },
    },
  )
})

test('router sends a verified pinned snapshot and B reevaluates admission before file effects', async () => {
  await withNodeExecutionLink(async (f) => {
    await writeFile(join(f.workspace, 'file.txt'), 'before')
    const s = fixture(f),
      profile = await resolveSandboxProfile(':read-only', async () => null)
    const ref = { profileId: profile.profileId, digest: sandboxSnapshotContent(profile).digest }
    s.snapshots.set(ref.digest, profile)
    try {
      s.nextCall('read', { sandbox: ref })
      expect(await s.router.read(s.workspace, 'file.txt')).toBe('before')
      s.nextCall('write', { sandbox: ref })
      expect(await failure(s.router.write(s.workspace, 'file.txt', 'not admitted'))).toMatchObject({
        code: 'NODE_DENIED',
      })
      expect(await f.node.receipt('run:write')).toEqual({ state: 'absent' })
      expect(await readFile(join(f.workspace, 'file.txt'), 'utf8')).toBe('before')
      s.nextCall('approved', { sandbox: ref, admission: { kind: 'approved', approvalId: 'approval' } })
      expect(await s.router.write(s.workspace, 'file.txt', 'approved')).toMatchObject({
        before: 'before',
        after: 'approved',
      })
      s.snapshots.set(ref.digest, { ...profile, network: { enabled: true } })
      expect(await failure(s.router.read(s.workspace, 'file.txt'))).toMatchObject({ code: 'SANDBOX_SNAPSHOT_MISMATCH' })
      const puts = f.requests.filter((item) => item.method === 'sandbox.put')
      expect(puts).toHaveLength(3)
      for (const entry of puts) expect(nodeWorkspaceMethods['sandbox.put'].input.parse(entry.input).ref).toEqual(ref)
    } finally {
      await s.router.dispose()
    }
  })
})

test('offline roots and missing confinement return known unstarted process results, with no local execution fallback', async () => {
  await withNodeExecutionLink(async (f) => {
    const s = fixture(f)
    try {
      const refused = await s.router.exec(s.workspace, 'echo protected', new AbortController().signal, {
        environment: { PATH: 'A path', TOKEN: 'A token' },
      })
      expect(refused).toMatchObject({
        isError: true,
        details: { code: 'NODE_CONFINEMENT_UNAVAILABLE', executionStarted: false },
      })
      const start = f.requests.find((item) => item.method === 'exec.start')
      expect(JSON.stringify(start?.input)).not.toContain('A token')
      expect(JSON.stringify(start?.input)).not.toContain('environment')
      await f.registry.revoke('execution-box')
      s.nextCall('after-revoke')
      expect(await s.router.exec(s.workspace, 'echo never', new AbortController().signal)).toMatchObject({
        isError: true,
        details: { code: 'NODE_OFFLINE', executionStarted: false },
      })
      expect(f.requests.filter((item) => item.method === 'exec.start')).toHaveLength(1)
    } finally {
      await s.router.dispose()
    }
  })
})

test('node process receipts deduplicate one stable opaque call ID and contain only B snapshot environment', async () => {
  const executed: Array<{
    command: string
    environment: Readonly<Record<string, string>>
    network: boolean | undefined
  }> = []
  const backend: NodeExecutionBackend = {
    name: 'bwrap',
    filesystem: true,
    network: true,
    processTree: true,
    exec: async (_workspace, command, _signal, options) => {
      executed.push({ command, environment: options.environment, network: options.confinement?.networkEnabled })
      await Bun.sleep(160)
      options.onOutput?.(`${'Z'.repeat(300_000)}\nNODELINK_TAIL_OK\n`)
      return { text: 'receipt-backed result', details: { code: 0 } }
    },
  }
  await withNodeExecutionLink(
    async (f) => {
      const s = fixture(f),
        base = await resolveSandboxProfile(':read-only', async () => null)
      const profile: ResolvedSandboxProfile = {
        ...base,
        environment: { set: { LANG: 'snapshot-language' } },
        osConfinement: { enabled: true, mode: 'elevated' },
      }
      const ref = { profileId: profile.profileId, digest: sandboxSnapshotContent(profile).digest }
      s.snapshots.set(ref.digest, profile)
      try {
        s.nextCall('unapproved', { sandbox: ref })
        expect(await s.router.exec(s.workspace, 'echo fixture', new AbortController().signal)).toMatchObject({
          isError: true,
          details: { code: 'NODE_DENIED', executionStarted: false },
        })
        const admitted = s.nextCall('provider/call.1', {
          sandbox: ref,
          admission: { kind: 'approved', approvalId: 'real-admission-proof' },
        })
        if (!admitted) throw new Error('Expected the approved execution authority')
        const output: Array<Parameters<NonNullable<NodeExecutionScope['reportOutput']>>[0]> = []
        s.setScope({
          workspace: {
            path: s.workspace,
            location: { kind: 'node', nodeId: f.node.id, rootId: 'engine', nodePath: f.workspace },
          },
          authority: admitted,
          signal: new AbortController().signal,
          reportOutput: async (chunk) => {
            output.push(chunk)
          },
        })
        const options = {
          timeoutMs: 1_000,
          environment: { LANG: 'A language', TOKEN: 'A token' },
          nodeAuthority: admitted,
        }
        expect(await s.router.exec(s.workspace, 'echo fixture', new AbortController().signal, options)).toMatchObject({
          text: 'receipt-backed result',
          isError: false,
        })
        const liveTail = output.map(({ text }) => text).join('')
        expect(liveTail).toContain('NODELINK_TAIL_OK')
        expect(output.some((chunk) => chunk.reset && chunk.reason === 'retention')).toBe(true)
        expect(await s.router.exec(s.workspace, 'echo fixture', new AbortController().signal, options)).toMatchObject({
          text: 'receipt-backed result',
        })
        expect(executed).toEqual([
          { command: 'echo fixture', environment: { LANG: 'snapshot-language' }, network: false },
        ])
        expect(
          await s.router.exec(s.workspace, 'different command', new AbortController().signal, options),
        ).toMatchObject({ isError: true, details: { code: 'EFFECT_UNKNOWN' } })
        expect(executed).toHaveLength(1)
        expect(
          await s.router.exec(s.workspace, 'echo fixture', new AbortController().signal, {
            ...options,
            nodeAuthority: { ...s.authority, callId: 'forged' },
          }),
        ).toMatchObject({ isError: true, details: { code: 'WORKSPACE_SCOPE', executionStarted: false } })
        const starts = f.requests
          .filter((item) => item.method === 'exec.start')
          .map((item) => nodeWorkspaceMethods['exec.start'].input.parse(item.input))
        expect(
          starts
            .filter((item) => item.callId === 'provider/call.1')
            .every((item) => item.operationId === 'run:provider/call.1' && item.sandbox?.digest === ref.digest),
        ).toBe(true)
        expect(JSON.stringify(starts)).not.toContain('A token')
      } finally {
        await s.router.dispose()
      }
    },
    { backend },
  )
})

test('aborting an active remote call waits for its terminal receipt and router disposal cancels its remaining processes', async () => {
  let executed = 0
  const backend: NodeExecutionBackend = {
    name: 'bwrap',
    filesystem: true,
    network: true,
    processTree: true,
    exec: async (_workspace, _command, signal) => {
      executed++
      await new Promise<void>((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason)
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      return { text: 'not reached' }
    },
  }
  await withNodeExecutionLink(
    async (f) => {
      const s = fixture(f),
        controller = new AbortController()
      try {
        s.nextCall('cancelled', {}, controller.signal)
        const pending = s.router.exec(s.workspace, 'hold', controller.signal)
        await until(() => f.node.running.length === 1 && executed === 1)
        controller.abort(new HbarError('CANCELLED', 'Fixture cancellation'))
        expect(await pending).toMatchObject({ isError: true, details: { code: 'CANCELLED', executionStarted: true } })
        expect(f.node.running).toEqual([])
        s.nextCall('dispose')
        const closingCall = s.router.exec(s.workspace, 'hold', new AbortController().signal)
        await until(() => f.node.running.length === 1 && executed === 2)
        await s.router.dispose()
        expect(await closingCall).toMatchObject({ isError: true, details: { code: 'CANCELLED' } })
        expect(f.node.running).toEqual([])
        expect(await f.node.receipt('run:dispose')).toMatchObject({ state: 'settled' })
      } finally {
        await s.router.dispose()
      }
    },
    { backend },
  )
})

test('router rejects corrupt node file bytes and stale root bindings instead of mixing versions or following a new root', async () => {
  await withNodeExecutionLink(
    async (f) => {
      await writeFile(join(f.workspace, 'file.txt'), 'unchanged')
      const s = fixture(f)
      try {
        expect(await failure(s.router.read(s.workspace, 'file.txt'))).toMatchObject({ code: 'NODE_TRANSFER_DIGEST' })
        const replacement = join(f.workspace, 'replacement')
        await mkdir(replacement)
        await f.node.setPolicy({
          ...f.node.policy,
          roots: [{ rootId: 'engine', name: 'replacement', path: replacement, access: 'write' }],
        })
        expect(await failure(s.router.read(s.workspace, 'file.txt'))).toMatchObject({ code: 'NODE_ROOT_CHANGED' })
        expect(f.requests.filter((item) => item.method === 'fs.readBytes')).toHaveLength(1)
        expect(await readFile(join(f.workspace, 'file.txt'), 'utf8')).toBe('unchanged')
      } finally {
        await s.router.dispose()
      }
    },
    {
      transform: (method, _input, output) =>
        method === 'fs.readBytes'
          ? {
              ...nodeWorkspaceMethods['fs.readBytes'].output.parse(output),
              data: Buffer.from('corrupted').toString('base64'),
            }
          : output,
    },
  )
})

test('losing the actual node link leaves an unknown result and a lost receipt instead of resending the process', async () => {
  let executed = 0
  const backend: NodeExecutionBackend = {
    name: 'bwrap',
    filesystem: true,
    network: true,
    processTree: true,
    exec: async (_workspace, _command, signal) => {
      executed++
      await new Promise<void>((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason)
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      return { text: 'not reached' }
    },
  }
  await withNodeExecutionLink(
    async (f) => {
      await f.node.setPolicy({ ...f.node.policy, onLinkLost: { action: 'terminate', graceMs: 5 } })
      const s = fixture(f)
      try {
        const pending = s.router.exec(s.workspace, 'hold', new AbortController().signal)
        await until(() => f.node.running.length === 1 && executed === 1)
        f.client.close()
        expect(await pending).toMatchObject({
          isError: true,
          details: { code: 'EFFECT_UNKNOWN', executionStarted: true },
        })
        await until(() => f.node.running.length === 0)
        expect(await f.node.receipt('run:call')).toMatchObject({ state: 'lost', reason: 'link-lost' })
        expect(
          await f.node.start({
            ...s.authority,
            operationId: 'run:call',
            rootId: 'engine',
            expectedRoot: f.workspace,
            cwd: '.',
            command: 'hold',
            timeoutMs: 120_000,
          }),
        ).toMatchObject({ state: 'lost' })
        expect(executed).toBe(1)
        expect(f.requests.filter((item) => item.method === 'exec.start')).toHaveLength(1)
      } finally {
        await s.router.dispose()
      }
    },
    { backend },
  )
})

test('router disposal propagates cancellation to the local execution provider before releasing its resources', async () => {
  const ready = Promise.withResolvers<void>()
  let stopped = false,
    disposed = false,
    networkCalls = 0
  const local: ExecutionProvider = {
    list: async () => [],
    read: async () => '',
    readBytes: async () => new Uint8Array(),
    write: async (_workspace, path, text) => ({ path, before: '', after: text, revision: 'a'.repeat(64) }),
    exec: async (_workspace, _command, signal) => {
      ready.resolve()
      try {
        await new Promise<void>((_resolve, reject) => {
          if (signal.aborted) reject(signal.reason)
          else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
        return { text: 'not reached' }
      } finally {
        stopped = true
      }
    },
    dispose: () => {
      expect(stopped).toBe(true)
      disposed = true
    },
  }
  const node: NodeExecutionPort = {
    call: async () => {
      networkCalls++
      throw new Error('No node call is expected')
    },
  }
  const router = new ExecutionRouter({
    local,
    node,
    current: () => undefined,
    loadSnapshot: async () => {
      throw new Error('No snapshot is expected')
    },
  })
  const pending = router.exec('/local', 'hold', new AbortController().signal).catch((error: unknown) => error)
  await ready.promise
  await router.dispose()
  expect(await pending).toMatchObject({ code: 'EXECUTION_CLOSED' })
  expect(disposed).toBe(true)
  expect(networkCalls).toBe(0)
})
