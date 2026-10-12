import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { nodeFloorSchema, type NodeCallAuthority, type NodeExecStart, type NodeReceipt } from '@hbar/contracts/node'
import { NodeStateStorage } from '@hbar/storage/node-state'
import type { NodeStatePort } from '@hbar/contracts/node-state'
import { LocalExecution } from '@hbar/local-tools'
import {
  WorkspaceNodeService,
  createNodeIdentity,
  nodeFingerprint,
  nodeIdFromPublicKey,
  nodeChallenge,
  nodeAuthTranscript,
  signNode,
  verifyNode,
  validateNodeIdentity,
  type NodeExecutionBackend,
  type NodeExecutionBackendOptions,
  WorkspaceNodeProtocol,
} from '@hbar/node-core'
import { resolveSandboxProfile, sandboxSnapshotContent } from '@hbar/sandbox'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const action of cleanup.splice(0)) await action()
})
const authority: NodeCallAuthority = {
  sessionId: 'session',
  runId: 'run',
  callId: 'call',
  sandbox: null,
  admission: { kind: 'allow' },
}
async function fixture(
  options: {
    confined?: boolean
    floor?: Record<string, unknown>
    hold?: boolean
    beforeLaunch?: () => Promise<void>
    beforeOperationGet?: () => Promise<void>
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-node-'))
  const workspace = join(root, 'workspace'),
    data = join(root, 'data')
  await mkdir(workspace)
  await mkdir(join(workspace, '.git/hooks'), { recursive: true })
  await mkdir(data)
  await writeFile(join(workspace, 'file.txt'), 'old')
  const state = new NodeStateStorage(join(data, 'node.sqlite'))
  await state.call('ready', {})
  const floor = nodeFloorSchema.parse({
    roots: [{ rootId: 'engine', name: 'engine', path: workspace, access: 'write' }],
    network: true,
    osConfinement: 'off',
    ...options.floor,
  })
  await state.call('floor.set', floor)
  const calls: string[] = []
  const executions: Array<{
    confinement: NodeExecutionBackendOptions['confinement']
    protectedPaths: readonly string[]
    readOnlyPaths?: readonly string[]
  }> = []
  const confined = options.confined ?? true
  const backend: NodeExecutionBackend = {
    name: confined ? 'bwrap' : 'none',
    filesystem: confined,
    network: confined,
    processTree: true,
    exec: async (_workspace, command, signal, input) => {
      calls.push(command)
      executions.push(input)
      expect(input.timeoutMs).toBeLessThanOrEqual(floor.maxTimeoutMs)
      if (options.hold)
        await new Promise<void>((_resolve, reject) => {
          if (signal.aborted) reject(signal.reason)
          else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      return { text: command, details: { code: 0, truncated: false } }
    },
  }
  const execution = new LocalExecution([data, join(workspace, '.git/hooks')])
  const identity = createNodeIdentity()
  let delayOperationRead = options.beforeOperationGet !== undefined
  const statePort: NodeStatePort = {
    call: async (method, input) => {
      if (method === 'operation.get' && delayOperationRead) {
        delayOperationRead = false
        await options.beforeOperationGet?.()
      }
      const result = await state.call(method, input)
      if (method === 'operation.start') await options.beforeLaunch?.()
      return result
    },
    close: () => state.close(),
  }
  const node = await WorkspaceNodeService.open(
    nodeIdFromPublicKey(identity.publicKey),
    data,
    statePort,
    execution,
    backend,
  )
  cleanup.push(async () => {
    await node.dispose()
    await state.close()
    await rm(root, { recursive: true, force: true })
  })
  const request = (key = 'run:call'): NodeExecStart => ({
    ...authority,
    rootId: 'engine',
    cwd: '.',
    operationId: key,
    command: 'echo safe',
    timeoutMs: 2_000,
  })
  return { root, workspace, data, state, node, backend, calls, executions, request }
}
async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Node state did not settle')
    await Bun.sleep(5)
  }
}
async function settlement(node: WorkspaceNodeService, id: string): Promise<NodeReceipt> {
  await until(async () => (await node.receipt(id)).state !== 'started')
  return node.receipt(id)
}
async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected refusal')
}

test('node floor wins over admitted commands, and audit records the refusal without effects', async () => {
  const f = await fixture({ floor: { process: false } })
  expect(await f.node.start(f.request())).toMatchObject({
    state: 'settled',
    result: { isError: true, details: { code: 'NODE_DENIED', executionStarted: false } },
  })
  expect(f.calls).toEqual([])
  expect(await f.state.call('audit.list', {})).toMatchObject([{ tool: 'shell', decision: 'deny', code: 'NODE_DENIED' }])
})
test('required filesystem or disabled network refuses a backend that cannot enforce it', async () => {
  const f = await fixture({ confined: false, floor: { osConfinement: 'required' } })
  expect(await f.node.start(f.request())).toMatchObject({
    state: 'settled',
    result: { details: { code: 'NODE_CONFINEMENT_UNAVAILABLE', executionStarted: false } },
  })
  await f.node.setPolicy({ ...f.node.policy, osConfinement: 'off', network: false })
  expect(await f.node.start(f.request('run:network'))).toMatchObject({
    state: 'settled',
    result: { details: { code: 'NODE_CONFINEMENT_UNAVAILABLE' } },
  })
  expect(f.calls).toEqual([])
})

test('turning confinement off cannot expose node identities or other protected paths to raw processes', async () => {
  const f = await fixture({ confined: false, floor: { osConfinement: 'off', network: true } })
  expect(await f.node.start(f.request())).toMatchObject({
    state: 'settled',
    result: { details: { code: 'NODE_CONFINEMENT_UNAVAILABLE', executionStarted: false } },
  })
  expect(f.calls).toEqual([])
})
test('snapshot tampering is refused, node reevaluation keeps ask/deny stricter than admission', async () => {
  const f = await fixture({ confined: true })
  const profile = await resolveSandboxProfile(':read-only', async () => null)
  const ref = { profileId: profile.profileId, digest: sandboxSnapshotContent(profile).digest }
  expect(() => f.node.putSnapshot(ref, { ...profile, network: { enabled: true } })).toThrow('content address')
  f.node.putSnapshot(ref, profile)
  expect(await f.node.start({ ...f.request(), sandbox: ref })).toMatchObject({
    state: 'settled',
    result: { details: { code: 'NODE_DENIED' } },
  })
  expect(f.calls).toEqual([])
})

test('process start passes the canonical snapshot intersection with node floors to the OS backend', async () => {
  const f = await fixture()
  await mkdir(join(f.workspace, '.git/hooks'), { recursive: true })
  await mkdir(join(f.workspace, '.hbar'), { recursive: true })
  const nodePrivate = join(f.workspace, 'node-private')
  await mkdir(nodePrivate)
  await f.node.setPolicy({ ...f.node.policy, protectedPaths: [nodePrivate] })
  const profile = await resolveSandboxProfile(':workspace-write', async () => null)
  const admittedProfile = { ...profile, commands: { rules: [{ pattern: 'echo safe', decision: 'allow' as const }] } }
  const ref = { profileId: admittedProfile.profileId, digest: sandboxSnapshotContent(admittedProfile).digest }
  f.node.putSnapshot(ref, admittedProfile)
  expect(await f.node.start({ ...f.request(), sandbox: ref })).toMatchObject({ state: 'started' })
  await settlement(f.node, 'run:call')
  expect(f.executions[0]).toMatchObject({
    confinement: {
      readableRoots: [f.workspace],
      writableRoots: [f.workspace],
    },
    readOnlyPaths: [join(f.workspace, '.git'), join(f.workspace, '.hbar')],
  })
  for (const protectedPath of [
    f.data,
    join(f.workspace, '.git/hooks'),
    nodePrivate,
    join(homedir(), '.ssh'),
    join(homedir(), '.aws'),
    join(homedir(), '.config/gh'),
  ])
    expect(f.executions[0]?.protectedPaths).toContain(protectedPath)
})

test('unsupported snapshot permission mapping is audited and refused before operation start', async () => {
  const f = await fixture()
  const profile = await resolveSandboxProfile(':read-only', async () => null)
  const unsupported = {
    ...profile,
    commands: { rules: [{ pattern: 'echo safe', decision: 'allow' as const }] },
    filesystem: { ...profile.filesystem, grants: [{ path: '**/*.secret', access: 'none' as const }] },
  }
  const ref = { profileId: profile.profileId, digest: sandboxSnapshotContent(unsupported).digest }
  f.node.putSnapshot(ref, unsupported)
  expect(await f.node.start({ ...f.request(), sandbox: ref })).toMatchObject({
    state: 'settled',
    result: { isError: true, details: { code: 'NODE_PERMISSION_UNSUPPORTED', executionStarted: false } },
  })
  expect(f.calls).toEqual([])
  expect(await f.state.call('audit.list', {})).toMatchObject([
    { tool: 'shell', decision: 'deny', code: 'NODE_PERMISSION_UNSUPPORTED' },
  ])
})
test('relative paths, readonly roots, protected directories and symlinks cannot escape the node floor', async () => {
  const f = await fixture()
  await mkdir(join(f.workspace, '.git/hooks'), { recursive: true })
  await writeFile(join(f.workspace, '.git/hooks', 'secret'), 'secret')
  for (const path of ['../data/node.sqlite', '.git/hooks/secret'])
    expect(await failure(f.node.read('engine', path, authority))).toBeInstanceOf(Error)
  const link = join(f.workspace, 'escape')
  await symlink(f.data, link, process.platform === 'win32' ? 'junction' : 'dir')
  try {
    expect(await failure(f.node.read('engine', 'escape/node.sqlite', authority))).toMatchObject({ code: 'NODE_DENIED' })
  } finally {
    await unlink(link)
  }
  await f.node.setPolicy({ ...f.node.policy, roots: f.node.policy.roots.map((root) => ({ ...root, access: 'read' })) })
  expect(await failure(f.node.write('engine', 'file.txt', 'changed', 'run:write', authority))).toMatchObject({
    code: 'NODE_DENIED',
  })
  expect(await Bun.file(join(f.workspace, 'file.txt')).text()).toBe('old')
})

test('node policy updates validate before CAS and publish the committed revision', async () => {
  const f = await fixture()
  const initial = await f.state.call('floor.snapshot', {})
  if (!initial.floor) throw new Error('Fixture floor was not initialized')
  await expect(f.node.updatePolicy({ ...initial.floor, maxTimeoutMs: -1 }, initial.revision)).rejects.toThrow()
  expect(await f.state.call('floor.snapshot', {})).toEqual(initial)
  const recovered = await f.node.updatePolicy({ ...initial.floor, network: false }, initial.revision)
  expect(recovered).toEqual({ floor: { ...initial.floor, network: false }, revision: initial.revision + 1 })
  expect(f.node.policy).toEqual(recovered.floor)
})

test('the node protects credential and hooks case aliases even if their configured spelling is absent', async () => {
  const f = await fixture()
  await mkdir(join(f.workspace, '.GIT/HOOKS'), { recursive: true })
  await mkdir(join(f.workspace, 'Credentials'))
  await writeFile(join(f.workspace, '.GIT/HOOKS/secret'), 'hook')
  await writeFile(join(f.workspace, 'Credentials/key'), 'key')
  await f.node.setPolicy({ ...f.node.policy, protectedPaths: [join(f.workspace, 'credentials')] })
  for (const path of ['.GIT/HOOKS/secret', 'Credentials/key']) {
    expect(await failure(f.node.read('engine', path, authority))).toMatchObject({ code: 'NODE_DENIED' })
    expect(await failure(f.node.write('engine', path, 'changed', 'run:' + path, authority))).toMatchObject({
      code: 'NODE_DENIED',
    })
  }
  expect(new TextDecoder().decode(await f.node.read('engine', 'file.txt', authority))).toBe('old')
})
test('concurrent duplicate keys execute once and conflicting parameter reuse cannot execute again', async () => {
  const f = await fixture()
  await Promise.all(Array.from({ length: 8 }, () => f.node.start(f.request())))
  expect(await settlement(f.node, 'run:call')).toMatchObject({ state: 'settled', result: { text: 'echo safe' } })
  expect(f.calls).toEqual(['echo safe'])
  expect(await failure(f.node.start({ ...f.request(), command: 'different' }))).toMatchObject({
    code: 'IDEMPOTENCY_CONFLICT',
  })
})
test('admission reservations bound concurrent starts and cancellation releases real running capacity', async () => {
  const f = await fixture({ hold: true, floor: { maxConcurrentProcesses: 1 } })
  const starts = await Promise.allSettled([f.node.start(f.request()), f.node.start(f.request('run:other'))])
  expect(starts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(starts.filter((result) => result.status === 'rejected')).toHaveLength(1)
  expect(f.calls).toHaveLength(1)
  const id = f.node.running[0]
  if (!id) throw new Error('No running operation')
  expect(await f.node.cancel(id)).toMatchObject({ state: 'settled', result: { details: { code: 'CANCELLED' } } })
  expect(f.node.running).toEqual([])
})

function launchGate() {
  const entered = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>()
  return {
    entered: entered.promise,
    release: () => gate.resolve(),
    beforeLaunch: async () => {
      entered.resolve()
      await gate.promise
    },
  }
}

test('a disconnected pre-accept exec.start cannot start after a reconnect observed absent', async () => {
  const gate = launchGate()
  const f = await fixture({ beforeOperationGet: gate.beforeLaunch })
  const protocol = new WorkspaceNodeProtocol(f.node)
  const oldConnection = new AbortController()
  const oldStart = protocol.invoke('exec.start', f.request('run:delayed-admission'), oldConnection.signal)
  await gate.entered

  oldConnection.abort(new Error('old node peer closed'))
  expect(await f.state.call('operation.get', { operationId: 'run:delayed-admission' })).toBeNull()
  gate.release()
  const oldResult = await oldStart.catch((error: unknown) => error)
  expect(oldResult).toMatchObject({ message: 'old node peer closed' })
  expect(await f.state.call('operation.get', { operationId: 'run:delayed-admission' })).toBeNull()

  const replacement = await protocol.invoke(
    'exec.start',
    f.request('run:delayed-admission'),
    new AbortController().signal,
  )
  expect(replacement).toMatchObject({ state: 'started' })
  expect(await settlement(f.node, 'run:delayed-admission')).toMatchObject({
    state: 'settled',
    result: { details: { executionStarted: true } },
  })
  expect(f.calls).toEqual(['echo safe'])
  protocol.dispose()
})

test('cancel waits for a durable start reservation before confirming process settlement', async () => {
  const gate = launchGate(),
    f = await fixture({ hold: true, beforeLaunch: gate.beforeLaunch })
  const starting = f.node.start(f.request())
  await gate.entered
  let cancellationReturned = false
  const cancelling = f.node.cancel('run:call').then((receipt) => {
    cancellationReturned = true
    return receipt
  })
  try {
    await Bun.sleep(15)
    expect(cancellationReturned).toBe(false)
  } finally {
    gate.release()
    await starting
  }
  expect(await cancelling).toMatchObject({
    state: 'settled',
    result: { details: { code: 'CANCELLED', executionStarted: false } },
  })
  expect(f.node.running).toEqual([])
  expect(f.calls).toHaveLength(0)
})

test('dispose waits for in-progress admission and never launches a process after its owner has closed', async () => {
  const gate = launchGate(),
    f = await fixture({ beforeLaunch: gate.beforeLaunch })
  const starting = f.node.start(f.request())
  await gate.entered
  let disposed = false
  const disposing = f.node.dispose().then(() => {
    disposed = true
  })
  try {
    await Bun.sleep(15)
    expect(disposed).toBe(false)
  } finally {
    gate.release()
  }
  expect(await starting).toMatchObject({
    state: 'settled',
    result: { details: { code: 'NODE_OFFLINE', executionStarted: false } },
  })
  await disposing
  expect(f.calls).toEqual([])
  expect(f.node.running).toEqual([])
})

test('pause and link-loss grace expiry fence a pending durable start before process launch', async () => {
  for (const action of ['pause', 'link-lost'] as const) {
    const gate = launchGate(),
      f = await fixture({ beforeLaunch: gate.beforeLaunch, floor: { onLinkLost: { action: 'terminate', graceMs: 5 } } })
    const starting = f.node.start(f.request())
    await gate.entered
    try {
      if (action === 'pause') await f.node.pause()
      else {
        f.node.linkLost()
        await Bun.sleep(15)
      }
    } finally {
      gate.release()
    }
    expect(await starting).toMatchObject({
      state: 'settled',
      result: {
        details: {
          code: action === 'pause' ? 'NODE_PAUSED' : 'NODE_OFFLINE',
          executionStarted: false,
        },
      },
    })
    expect(f.calls).toEqual([])
    if (action === 'pause') await f.node.pause(false)
    else f.node.linkRestored()
    await f.node.start(f.request('run:restored'))
    expect(await settlement(f.node, 'run:restored')).toMatchObject({ state: 'settled', result: { isError: false } })
    expect(f.calls).toEqual(['echo safe'])
  }
})
test('link-loss grace ends execution and retains an unknown receipt that cannot be replayed', async () => {
  const f = await fixture({ hold: true, floor: { onLinkLost: { action: 'terminate', graceMs: 10 } } })
  await f.node.start(f.request())
  f.node.linkLost()
  await until(async () => (await f.node.receipt('run:call')).state === 'lost' && f.node.running.length === 0)
  expect(await f.node.start(f.request())).toMatchObject({ state: 'lost', reason: 'link-lost' })
  expect(f.calls).toHaveLength(1)
})
test('durable file versions deduplicate writes and do not overwrite an intervening edit', async () => {
  const f = await fixture()
  const revision = createHash('sha256').update('old').digest('hex')
  const first = await f.node.write('engine', 'file.txt', 'new', 'run:write', authority, revision)
  expect(first).toMatchObject({ before: 'old', after: 'new' })
  await writeFile(join(f.workspace, 'file.txt'), 'user edit')
  expect(await f.node.write('engine', 'file.txt', 'new', 'run:write', authority, revision)).toEqual(first)
  expect(await Bun.file(join(f.workspace, 'file.txt')).text()).toBe('user edit')
  expect(
    await failure(f.node.write('engine', 'file.txt', 'different', 'run:write', authority, revision)),
  ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
})
test('a started receipt survives a worker restart as lost; accepted but unstarted work remains known', async () => {
  const f = await fixture()
  await f.state.call('operation.accept', {
    operationId: 'run:started',
    argumentsDigest: 'a'.repeat(64),
    kind: 'exec',
    authority,
  })
  await f.state.call('operation.start', { operationId: 'run:started' })
  await f.state.call('operation.accept', {
    operationId: 'run:accepted',
    argumentsDigest: 'b'.repeat(64),
    kind: 'exec',
    authority,
  })
  await f.state.close()
  const state = new NodeStateStorage(join(f.data, 'node.sqlite'))
  try {
    await state.call('ready', {})
    expect((await state.call('operation.get', { operationId: 'run:started' }))?.receipt).toMatchObject({
      state: 'lost',
      reason: 'restart',
    })
    expect((await state.call('operation.get', { operationId: 'run:accepted' }))?.receipt).toMatchObject({
      state: 'settled',
      result: { details: { executionStarted: false, code: 'NODE_NOT_STARTED' } },
    })
  } finally {
    await state.close()
  }
})

test('retained process output is bounded in UTF-8 bytes without corrupting Unicode', async () => {
  const f = await fixture()
  f.backend.exec = async () => ({ text: '界'.repeat(100_000), details: { code: 0, truncated: false } })
  await f.node.start(f.request())
  const receipt = await settlement(f.node, 'run:call')
  if (receipt.state !== 'settled') throw new Error('Expected settled output')
  expect(Buffer.byteLength(receipt.result.text)).toBeLessThanOrEqual(64 * 1024)
  expect(receipt.result.text).not.toContain('�')
  expect(receipt.result.details.truncated).toBe(true)
})
test('Ed25519 authentication pins both identities, both fresh challenges and the direction', () => {
  const a = createNodeIdentity(),
    b = createNodeIdentity()
  expect(validateNodeIdentity(a)).toEqual(a)
  expect(nodeFingerprint(a.publicKey)).toMatch(/^SHA256:/)
  expect(nodeIdFromPublicKey(a.publicKey)).toMatch(/^node-[a-f0-9]{40}$/)
  const ac = nodeChallenge(),
    bc = nodeChallenge()
  const transcript = nodeAuthTranscript(a.publicKey, b.publicKey, ac, bc, 'conversation')
  const signature = signNode(a, transcript)
  expect(verifyNode(a.publicKey, transcript, signature)).toBe(true)
  expect(verifyNode(b.publicKey, transcript, signature)).toBe(false)
  expect(
    verifyNode(
      a.publicKey,
      nodeAuthTranscript(a.publicKey, b.publicKey, ac, nodeChallenge(), 'conversation'),
      signature,
    ),
  ).toBe(false)
  expect(verifyNode(a.publicKey, nodeAuthTranscript(a.publicKey, b.publicKey, ac, bc, 'workspace'), signature)).toBe(
    false,
  )
  expect(() => validateNodeIdentity({ ...a, privateKey: b.privateKey })).toThrow('do not match')
})
