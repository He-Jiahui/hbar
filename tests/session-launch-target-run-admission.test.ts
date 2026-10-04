import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets, SessionLaunchTargetService, createRunCommands } from '@hbar/kernel'
import { resolvePathLayout } from '@hbar/storage'
import type { SessionLaunchTargetBindingInput, StorageMethods } from '@hbar/storage'

const prefix = 'hbar-session-launch-target-run-admission-'
const resources: { root: string; kernel: Kernel; commands: ReturnType<typeof createRunCommands> }[] = []

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    resource.commands.dispose()
    await resource.kernel.close()
    const root = resolve(resource.root)
    if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith(prefix))
      throw new Error('Refusing to remove an unowned run-admission fixture')
    await rm(root, { recursive: true, force: true })
  }
})

async function git(cwd: string, args: string[]) {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    windowsHide: true,
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`${args.join(' ')} failed: ${stderr || stdout}`)
  return stdout.trim()
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  await mkdir(repository)
  await git(repository, ['init', '-q', '-b', 'main'])
  await git(repository, ['config', 'user.name', 'hbar test'])
  await git(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'README.md'), 'shared workspace\n')
  await git(repository, ['add', 'README.md'])
  await git(repository, ['commit', '-q', '-m', 'initial'])
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: repository,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const commands = createRunCommands(kernel)
  resources.push({ root, kernel, commands })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Fixture workspace was not registered')
  return { kernel, commands, workspace, root }
}

const input = { text: 'accept only a prepared target', images: [] }

function countPreparation(kernel: Kernel) {
  const service = kernel.sessionLaunchTargets
  const original = service.prepare.bind(service)
  let calls = 0
  service.prepare = async (sessionId, revision, signal) => {
    calls++
    return original(sessionId, revision, signal)
  }
  return {
    get calls() {
      return calls
    },
    restore() {
      service.prepare = original
    },
  }
}

async function expectErrorCode(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown
  try {
    await promise
  } catch (error) {
    caught = error
  }
  expect(caught).toMatchObject({ code })
}

async function enqueue(
  kernel: Kernel,
  sessionId: string,
  requestId: string,
  binding?: SessionLaunchTargetBindingInput,
) {
  return kernel.storage.call('enqueue', sessionId, requestId, input, 'local-fixture', undefined, binding)
}

test('expected shared-current binding requires its exact ready resolution in the enqueue transaction', async () => {
  const { kernel, workspace } = await fixture()
  const session = await kernel.createSession(workspace.id, 'prepared shared target')
  await kernel.prepareSessionLaunchTarget(session.id, 0)
  const candidate = await kernel.sessionLaunchTargets.bindForRun(session.id, undefined, 0)
  expect(candidate).toMatchObject({
    sessionId: session.id,
    expectedRevision: 0,
    selection: { mode: 'shared-current' },
    targetPath: workspace.path,
    branch: null,
    head: null,
    requirePreparedTarget: true,
  })

  await kernel.storage.call('updateSessionLaunchTargetPreparation', {
    sessionId: session.id,
    revision: 0,
    targetPath: workspace.path,
    state: 'reconciling',
    errorCode: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
    errorMessage: 'Injected same-revision admission race',
  })

  await expectErrorCode(
    enqueue(kernel, session.id, 'stale-ready-resolution', candidate),
    'SESSION_LAUNCH_TARGET_UNRESOLVED',
  )
  expect(await kernel.storage.call('runByRequest', session.id, 'stale-ready-resolution')).toBeNull()
  expect((await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued')).toEqual(
    [],
  )
  expect((await kernel.storage.call('sessionLaunchTargetRuntime', session.id)).binding).toBeNull()
})

test('a queued sibling in the same checkout blocks shared switching from a registered subdirectory', async () => {
  const { kernel, workspace } = await fixture()
  const tipOid = await git(workspace.path, ['rev-parse', 'HEAD'])
  await git(workspace.path, ['branch', 'feature/shared-target'])
  const first = await kernel.createSession(workspace.id, 'queued shared work')
  await kernel.prepareSessionLaunchTarget(first.id, 0)
  await enqueue(
    kernel,
    first.id,
    'queued-blocker',
    await kernel.sessionLaunchTargets.bindForRun(first.id, undefined, 0),
  )
  const directory = join(workspace.path, 'nested')
  await mkdir(directory)
  const nested = await kernel.createWorkspace(directory)
  const second = await kernel.createSession(nested.id, 'shared branch choice')
  await kernel.setSessionLaunchTarget({
    actorId: 'shared-test',
    idempotencyKey: 'shared-from-nested',
    sessionId: second.id,
    expectedRevision: 0,
    selection: { mode: 'shared-branch', branch: { ref: 'refs/heads/feature/shared-target', tipOid } },
  })
  expect(await git(workspace.path, ['branch', '--show-current'])).toBe('main')
  await expectErrorCode(kernel.prepareSessionLaunchTarget(second.id, 1), 'BUSY')
  expect(await git(workspace.path, ['branch', '--show-current'])).toBe('main')
  expect((await kernel.storage.call('sessionLaunchTargetRuntime', second.id)).binding).toBeNull()
  expect(await kernel.storage.call('activeSharedCheckoutPaths')).toEqual([workspace.path])
})

test('shared checkout lock keeps a sibling switch behind Run bind+enqueue', async () => {
  const { kernel, workspace } = await fixture()
  await kernel.setPermissionMode('allow')
  const tipOid = await git(workspace.path, ['rev-parse', 'HEAD'])
  await git(workspace.path, ['branch', 'feature/after-admission'])
  const first = await kernel.createSession(workspace.id, 'admitting run')
  const second = await kernel.createSession(workspace.id, 'concurrent shared switch')
  await kernel.prepareSessionLaunchTarget(first.id, 0)
  await kernel.setSessionLaunchTarget({
    actorId: 'shared-test',
    idempotencyKey: 'race-shared-choice',
    sessionId: second.id,
    expectedRevision: 0,
    selection: { mode: 'shared-branch', branch: { ref: 'refs/heads/feature/after-admission', tipOid } },
  })
  let releaseEnqueue!: () => void
  let enteredEnqueue!: () => void
  let releaseRun!: () => void
  const enqueueGate = new Promise<void>((resolveGate) => {
    releaseEnqueue = resolveGate
  })
  const enqueueEntered = new Promise<void>((resolveGate) => {
    enteredEnqueue = resolveGate
  })
  const runGate = new Promise<void>((resolveGate) => {
    releaseRun = resolveGate
  })
  const stopHoldingRun = kernel.hooks.on('run.start', async ({ sessionId }) => {
    if (sessionId === first.id) await runGate
  })
  const original = kernel.storage.call.bind(kernel.storage)
  kernel.storage.call = async <Method extends keyof StorageMethods>(
    method: Method,
    ...args: Parameters<StorageMethods[Method]>
  ): Promise<ReturnType<StorageMethods[Method]>> => {
    if (method === 'enqueue' && args[0] === first.id) {
      enteredEnqueue()
      await enqueueGate
    }
    return original(method, ...args)
  }
  let submitted: ReturnType<Kernel['submit']> | undefined
  let preparing: Promise<unknown> | undefined
  try {
    submitted = kernel.submit(first.id, 'shared-admission-race', input, 'local-fixture', undefined, undefined, 0)
    await enqueueEntered
    preparing = expectErrorCode(kernel.prepareSessionLaunchTarget(second.id, 1), 'BUSY')
    releaseEnqueue()
    await submitted
    await preparing
    expect(await git(workspace.path, ['branch', '--show-current'])).toBe('main')
    expect((await kernel.storage.call('sessionLaunchTargetRuntime', first.id)).binding?.selection).toEqual({
      mode: 'shared-current',
    })
    expect((await kernel.storage.call('sessionLaunchTargetRuntime', second.id)).binding).toBeNull()
  } finally {
    releaseEnqueue()
    releaseRun()
    await stopHoldingRun()
    kernel.storage.call = original
    await submitted?.catch(() => undefined)
    await preparing?.catch(() => undefined)
    await kernel.waitForIdle()
  }
})

test('expected bind does not repair a same-revision readiness downgrade after its initial snapshot', async () => {
  const { kernel, workspace } = await fixture()
  const session = await kernel.createSession(workspace.id, 'verification race')
  await kernel.prepareSessionLaunchTarget(session.id, 0)
  const preparationCalls = countPreparation(kernel)
  const originalCall = kernel.storage.call.bind(kernel.storage)
  let firstRuntimeRead = true
  let injectedDowngrade = false
  let serviceUpdateCalls = 0
  let beginCalls = 0
  kernel.storage.call = async <Method extends keyof StorageMethods>(
    method: Method,
    ...args: Parameters<StorageMethods[Method]>
  ): Promise<ReturnType<StorageMethods[Method]>> => {
    if (method === 'updateSessionLaunchTargetPreparation') serviceUpdateCalls++
    if (method === 'beginSessionLaunchTargetPreparation') beginCalls++
    const result = await originalCall(method, ...args)
    if (method === 'sessionLaunchTargetRuntime' && firstRuntimeRead) {
      firstRuntimeRead = false
      injectedDowngrade = true
      await originalCall('updateSessionLaunchTargetPreparation', {
        sessionId: session.id,
        revision: 0,
        targetPath: workspace.path,
        state: 'reconciling',
        errorCode: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
        errorMessage: 'Injected readiness downgrade during verification',
      })
    }
    return result
  }
  try {
    await expectErrorCode(
      kernel.sessionLaunchTargets.bindForRun(session.id, undefined, 0),
      'SESSION_LAUNCH_TARGET_UNRESOLVED',
    )
    expect(preparationCalls.calls).toBe(0)
    expect(beginCalls).toBe(0)
    expect(injectedDowngrade).toBe(true)
    expect(serviceUpdateCalls).toBe(0)
    const runtime = await originalCall('sessionLaunchTargetRuntime', session.id)
    expect(runtime.resolution?.state).toBe('reconciling')
    expect(runtime.binding).toBeNull()
    expect((await originalCall('events', session.id, 0)).filter((event) => event.type === 'run.queued')).toEqual([])
  } finally {
    preparationCalls.restore()
    kernel.storage.call = originalCall
  }
})

test('expected isolated-ready target binds the verified worktree on first Run without preparing again', async () => {
  const { kernel, commands, workspace } = await fixture()
  let preparationCalls: ReturnType<typeof countPreparation> | undefined
  try {
    await kernel.setPermissionMode('allow')
    const session = await kernel.createSession(workspace.id, 'expected isolated target')
    await kernel.setSessionLaunchTarget({
      actorId: 'run-admission-test',
      idempotencyKey: 'select-isolated-ready-target',
      sessionId: session.id,
      expectedRevision: 0,
      selection: { mode: 'isolated-worktree', branch: { kind: 'derived', baseRef: 'refs/heads/main' } },
    })
    await kernel.prepareSessionLaunchTarget(session.id, 1)
    preparationCalls = countPreparation(kernel)
    const prepared = (await kernel.storage.call('sessionLaunchTargetRuntime', session.id)).resolution
    if (!prepared || prepared.state !== 'ready') throw new Error('Expected the isolated target to be ready')

    const accepted = await commands.execute(
      'run.submit',
      { sessionId: session.id, modelId: 'local-fixture', input, expectedLaunchTargetRevision: 1 },
      { actorId: 'run-admission-test', idempotencyKey: 'first-isolated-ready-run' },
    )
    await kernel.waitForIdle()

    const runtime = await kernel.storage.call('sessionLaunchTargetRuntime', session.id)
    expect(preparationCalls.calls).toBe(0)
    expect(runtime.binding).toMatchObject({
      expectedRevision: 1,
      targetPath: prepared.targetPath,
      branch: prepared.branch,
      head: prepared.resolvedHead,
      boundRunId: accepted.operationId,
    })
    expect(runtime.binding).not.toHaveProperty('requirePreparedTarget')
    expect((await kernel.storage.call('run', accepted.operationId)).status).toBe('completed')
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued'),
    ).toHaveLength(1)
  } finally {
    preparationCalls?.restore()
  }
})

test('expected isolated-ready bind rejects a physically changed HEAD without repairing or accepting a Run', async () => {
  const { kernel, commands, workspace } = await fixture()
  let preparationCalls: ReturnType<typeof countPreparation> | undefined
  try {
    const session = await kernel.createSession(workspace.id, 'changed isolated target')
    await kernel.setSessionLaunchTarget({
      actorId: 'run-admission-test',
      idempotencyKey: 'select-isolated-target-to-change',
      sessionId: session.id,
      expectedRevision: 0,
      selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/expected-head-change' } },
    })
    await kernel.prepareSessionLaunchTarget(session.id, 1)
    preparationCalls = countPreparation(kernel)
    const prepared = (await kernel.storage.call('sessionLaunchTargetRuntime', session.id)).resolution
    if (!prepared || prepared.state !== 'ready') throw new Error('Expected the isolated target to be ready')
    await writeFile(join(prepared.targetPath, 'head-change.txt'), 'external worktree change\n')
    await git(prepared.targetPath, ['add', 'head-change.txt'])
    await git(prepared.targetPath, ['commit', '-q', '-m', 'external worktree change'])
    const changedHead = await git(prepared.targetPath, ['rev-parse', 'HEAD'])
    expect(changedHead).not.toBe(prepared.resolvedHead)

    await expectErrorCode(
      commands.execute(
        'run.submit',
        { sessionId: session.id, modelId: 'local-fixture', input, expectedLaunchTargetRevision: 1 },
        { actorId: 'run-admission-test', idempotencyKey: 'reject-changed-isolated-head' },
      ),
      'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
    )

    const runtime = await kernel.storage.call('sessionLaunchTargetRuntime', session.id)
    expect(preparationCalls.calls).toBe(0)
    expect(runtime.binding).toBeNull()
    expect(runtime.resolution).toMatchObject({ state: 'ready', resolvedHead: prepared.resolvedHead })
    expect(await git(prepared.targetPath, ['rev-parse', 'HEAD'])).toBe(changedHead)
    expect(await kernel.storage.call('runByRequest', session.id, 'reject-changed-isolated-head')).toBeNull()
    expect((await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued')).toEqual(
      [],
    )
  } finally {
    preparationCalls?.restore()
  }
})

test('Host close aborts expected-ready Git verification without aborting the caller signal', async () => {
  const { kernel, workspace, root } = await fixture()
  const session = await kernel.createSession(workspace.id, 'shutdown during expected verification')
  await kernel.setSessionLaunchTarget({
    actorId: 'run-admission-test',
    idempotencyKey: 'select-ready-isolated-target',
    sessionId: session.id,
    expectedRevision: 0,
    selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/shutdown-verification' } },
  })
  await kernel.prepareSessionLaunchTarget(session.id, 1)

  let markGitEntered!: () => void
  const gitEntered = new Promise<void>((resolveEntered) => (markGitEntered = resolveEntered))
  let markGitAborted!: () => void
  const gitAborted = new Promise<void>((resolveAborted) => (markGitAborted = resolveAborted))
  const layout = await resolvePathLayout({ home: join(root, 'data') })
  const service = new SessionLaunchTargetService(kernel.storage, layout, async (_cwd, _args, signal) => {
    markGitEntered()
    return await new Promise<never>((_resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort)
        markGitAborted()
        reject(signal.reason)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
  })
  const caller = new AbortController()
  const binding = service.bindForRun(session.id, caller.signal, 1)
  try {
    await gitEntered
    await service.close()
    await gitAborted
    await expectErrorCode(binding, 'HOST_SHUTTING_DOWN')
    expect(caller.signal.aborted).toBe(false)
  } finally {
    await service.close()
  }
})

test('private preparation flag is stripped from persisted binding and legacy shared enqueue stays compatible', async () => {
  const { kernel, workspace } = await fixture()
  const prepared = await kernel.createSession(workspace.id, 'prepared shared target')
  await kernel.prepareSessionLaunchTarget(prepared.id, 0)
  const candidate = await kernel.sessionLaunchTargets.bindForRun(prepared.id, undefined, 0)
  const run = await enqueue(kernel, prepared.id, 'strict-ready-shared', candidate)
  expect(run.status).toBe('queued')
  const binding = await kernel.storage.call('sessionLaunchTargetRuntime', prepared.id)
  expect(binding.binding).toMatchObject({ expectedRevision: 0, targetPath: workspace.path, boundRunId: run.id })
  expect(binding.binding).not.toHaveProperty('requirePreparedTarget')

  const legacy = await kernel.createSession(workspace.id, 'legacy shared target')
  const legacyRun = await enqueue(kernel, legacy.id, 'legacy-without-preparation')
  expect(legacyRun.status).toBe('queued')
  const legacyRuntime = await kernel.storage.call('sessionLaunchTargetRuntime', legacy.id)
  expect(legacyRuntime.resolution).toBeNull()
  expect(legacyRuntime.binding).toMatchObject({
    expectedRevision: 0,
    targetPath: workspace.path,
    boundRunId: legacyRun.id,
  })
  expect(legacyRuntime.binding).not.toHaveProperty('requirePreparedTarget')
})

test('storage rejects a malformed private preparation admission flag at runtime', async () => {
  const { kernel, workspace } = await fixture()
  const session = await kernel.createSession(workspace.id, 'malformed admission target')
  await kernel.prepareSessionLaunchTarget(session.id, 0)
  const candidate = await kernel.sessionLaunchTargets.bindForRun(session.id, undefined, 0)
  const malformed = { ...candidate, requirePreparedTarget: false }

  // Model an untrusted Worker/RPC payload that bypassed the static TypeScript contract.
  await expectErrorCode(
    enqueue(kernel, session.id, 'malformed-private-flag', malformed as unknown as SessionLaunchTargetBindingInput),
    'INVALID_INPUT',
  )
  expect(await kernel.storage.call('runByRequest', session.id, 'malformed-private-flag')).toBeNull()
  expect((await kernel.storage.call('sessionLaunchTargetRuntime', session.id)).binding).toBeNull()
})

test('run command rejects stale and unprepared captured targets before Git or Run admission', async () => {
  const { kernel, commands, workspace } = await fixture()
  const preparationCalls = countPreparation(kernel)
  try {
    const stale = await kernel.createSession(workspace.id, 'stale captured target')
    await expectErrorCode(
      commands.execute(
        'run.submit',
        {
          sessionId: stale.id,
          modelId: 'local-fixture',
          input,
          expectedLaunchTargetRevision: 1,
        },
        { actorId: 'run-admission-test', idempotencyKey: 'stale-revision' },
      ),
      'COMMAND_CONFLICT',
    )

    const unresolved = await kernel.createSession(workspace.id, 'unprepared captured target')
    await kernel.setSessionLaunchTarget({
      actorId: 'run-admission-test',
      idempotencyKey: 'choose-unprepared-worktree',
      sessionId: unresolved.id,
      expectedRevision: 0,
      selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/unprepared-admission' } },
    })
    const request = {
      sessionId: unresolved.id,
      modelId: 'local-fixture',
      input,
      expectedLaunchTargetRevision: 1,
    }
    const options = { actorId: 'run-admission-test', idempotencyKey: 'unprepared-revision' }
    await expectErrorCode(commands.execute('run.submit', request, options), 'SESSION_LAUNCH_TARGET_UNRESOLVED')
    await expectErrorCode(commands.execute('run.submit', request, options), 'SESSION_LAUNCH_TARGET_UNRESOLVED')

    expect(preparationCalls.calls).toBe(0)
    expect(await git(workspace.path, ['branch', '--list', 'feature/unprepared-admission'])).toBe('')
    expect((await git(workspace.path, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)).toHaveLength(1)
    expect((await kernel.storage.call('events', stale.id, 0)).filter((event) => event.type === 'run.queued')).toEqual(
      [],
    )
    expect(
      (await kernel.storage.call('events', unresolved.id, 0)).filter((event) => event.type === 'run.queued'),
    ).toEqual([])
    expect((await kernel.storage.call('sessionLaunchTargetRuntime', unresolved.id)).resolution).toBeNull()
    expect((await kernel.storage.call('sessionLaunchTargetRuntime', unresolved.id)).binding).toBeNull()
  } finally {
    preparationCalls.restore()
  }
})

test('run admission rechecks a prepared revision after the lock wait and rejects a changed selection', async () => {
  const { kernel, commands, workspace } = await fixture()
  let markPrecheck!: () => void
  let releasePrecheck!: () => void
  const precheckReached = new Promise<void>((resolveReached) => (markPrecheck = resolveReached))
  const precheckGate = new Promise<void>((resolveGate) => (releasePrecheck = resolveGate))
  let preparationSpy: ReturnType<typeof countPreparation> | undefined
  try {
    const session = await kernel.createSession(workspace.id, 'revision race')
    await kernel.prepareSessionLaunchTarget(session.id, 0)
    preparationSpy = countPreparation(kernel)
    const originalGet = kernel.getSessionLaunchTarget.bind(kernel)
    let holdNextRead = true
    kernel.getSessionLaunchTarget = async (targetSessionId) => {
      const target = await originalGet(targetSessionId)
      if (targetSessionId === session.id && holdNextRead) {
        holdNextRead = false
        markPrecheck()
        await precheckGate
      }
      return target
    }

    const submitted = commands.execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input,
        expectedLaunchTargetRevision: 0,
      },
      { actorId: 'run-admission-test', idempotencyKey: 'revision-race' },
    )
    await precheckReached
    await kernel.setSessionLaunchTarget({
      actorId: 'run-admission-test',
      idempotencyKey: 'change-after-fast-precheck',
      sessionId: session.id,
      expectedRevision: 0,
      selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/changed-after-precheck' } },
    })
    releasePrecheck()

    await expectErrorCode(submitted, 'COMMAND_CONFLICT')
    expect(preparationSpy.calls).toBe(0)
    expect((await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued')).toEqual(
      [],
    )
    expect((await kernel.storage.call('sessionLaunchTargetRuntime', session.id)).binding).toBeNull()
  } finally {
    releasePrecheck()
    preparationSpy?.restore()
  }
})

test('expected revision is part of the idempotency fingerprint and legacy submissions still bind', async () => {
  const { kernel, commands, workspace } = await fixture()
  await kernel.setPermissionMode('allow')
  const prepared = await kernel.createSession(workspace.id, 'prepared captured target')
  await kernel.prepareSessionLaunchTarget(prepared.id, 0)
  const accepted = await commands.execute(
    'run.submit',
    {
      sessionId: prepared.id,
      modelId: 'local-fixture',
      input,
      expectedLaunchTargetRevision: 0,
    },
    { actorId: 'run-admission-test', idempotencyKey: 'same-run-key' },
  )
  await kernel.waitForIdle()
  await expectErrorCode(
    commands.execute(
      'run.submit',
      {
        sessionId: prepared.id,
        modelId: 'local-fixture',
        input,
        expectedLaunchTargetRevision: 1,
      },
      { actorId: 'run-admission-test', idempotencyKey: 'same-run-key' },
    ),
    'IDEMPOTENCY_CONFLICT',
  )
  expect((await kernel.storage.call('sessionLaunchTargetRuntime', prepared.id)).binding).toMatchObject({
    expectedRevision: 0,
    boundRunId: accepted.operationId,
  })
  expect(
    (await kernel.storage.call('events', prepared.id, 0)).filter((event) => event.type === 'run.queued'),
  ).toHaveLength(1)

  const legacy = await kernel.createSession(workspace.id, 'legacy first run')
  const legacyAccepted = await commands.execute(
    'run.submit',
    { sessionId: legacy.id, modelId: 'local-fixture', input },
    { actorId: 'run-admission-test', idempotencyKey: 'legacy-run-key' },
  )
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', legacyAccepted.operationId)).status).toBe('completed')
  const legacyBinding = (await kernel.storage.call('sessionLaunchTargetRuntime', legacy.id)).binding
  expect(legacyBinding).toMatchObject({ expectedRevision: 0, boundRunId: legacyAccepted.operationId })
  expect(legacyBinding).not.toHaveProperty('requirePreparedTarget')
})
