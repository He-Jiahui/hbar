import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { emptyUsage, HbarError } from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, HarnessDriver } from '@hbar/plugin-sdk'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { LocalExecution } from '@hbar/local-tools'

const resources: { root: string; kernels: Kernel[] }[] = []
const prefix = 'hbar-session-launch-target-run-binding-'
const foreignPaths = new Map<string, string>()

afterEach(async () => {
  foreignPaths.clear()
  for (const resource of resources.splice(0)) {
    for (const kernel of resource.kernels.reverse()) await kernel.close()
    const root = resolve(resource.root)
    if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith(prefix))
      throw new Error('Refusing to remove an unowned test directory')
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

async function captureOutcome<Value>(operation: Promise<Value>) {
  try {
    return { ok: true as const, value: await operation }
  } catch (error) {
    return { ok: false as const, error }
  }
}

function waitForGateOrAbort(gate: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolveGate, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    gate.then(
      () => {
        signal.removeEventListener('abort', onAbort)
        resolveGate()
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
    if (signal.aborted) onAbort()
  })
}

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

function recordingDriver(
  observations: Map<
    string,
    {
      cwd: string
      system: string
      toolText: string
      findText: string
      searchText: string
      foreignText: string | null
      secretText: string | null
    }
  >,
) {
  return definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Launch-target recording driver',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      description: 'Records the per-session workspace supplied to DriverInput and ToolContext',
      scope: 'host' as const,
      required: true,
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input: DriverInput) {
          const result = await input.execute('read_file', { path: 'target-only.txt' }, `read-${input.session.id}`)
          const found = await input.execute('find_files', { include: ['target-only.txt'] }, `find-${input.session.id}`)
          const searched = await input.execute(
            'search_text',
            { pattern: 'only in session', literal: true, include: ['target-only.txt'] },
            `search-${input.session.id}`,
          )
          const foreignPath = foreignPaths.get(input.session.id)
          const foreign = foreignPath
            ? await input.execute('read_file', { path: foreignPath }, `foreign-${input.session.id}`)
            : undefined
          const secret = foreignPath
            ? await input.execute('read_file', { path: 'host-data-link/secret.txt' }, `secret-${input.session.id}`)
            : undefined
          observations.set(input.session.id, {
            cwd: input.workspace.path,
            system: input.request.system,
            toolText: result.text,
            findText: found.text,
            searchText: searched.text,
            foreignText: foreign?.text ?? null,
            secretText: secret?.text ?? null,
          })
          await input.commit('assistant', [{ type: 'text', text: `Read result: ${result.text}` }])
        },
        summarize: async () => ({ text: 'summary', usage: emptyUsage() }),
      })
    },
  })
}

test('first accepted Run atomically binds session target; driver/tool cwd and retry/restart remain session-scoped', async () => {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  const dataRoot = join(root, 'host-data')
  const observations = new Map<
    string,
    {
      cwd: string
      system: string
      toolText: string
      findText: string
      searchText: string
      foreignText: string | null
      secretText: string | null
    }
  >()
  const driver = recordingDriver(observations)
  await mkdir(repository)
  await git(repository, ['init', '-q', '-b', 'main'])
  await git(repository, ['config', 'user.name', 'hbar test'])
  await git(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'README.md'), 'shared\n')
  await writeFile(join(repository, 'shared-only.txt'), 'shared marker\n')
  await git(repository, ['add', 'README.md', 'shared-only.txt'])
  await git(repository, ['commit', '-q', '-m', 'initial'])
  const repositoryLink = join(root, 'repository-link')
  await symlink(repository, repositoryLink, process.platform === 'win32' ? 'junction' : 'dir')

  const open = () =>
    Kernel.create({
      home: dataRoot,
      workspace: repositoryLink,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { replacements: { 'driver.pi': driver } },
    })
  let kernel = await open()
  const kernels = [kernel]
  resources.push({ root, kernels })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  expect(workspace.path).toBe(repository)
  const sessionA = await kernel.createSession(workspace.id, 'isolated session')
  const sessionB = await kernel.createSession(workspace.id, 'shared session')
  const sessionC = await kernel.createSession(workspace.id, 'other isolated session')
  await kernel.setPermissionMode('allow')

  await kernel.setSessionLaunchTarget({
    actorId: 'actor-a',
    idempotencyKey: 'select-isolated',
    sessionId: sessionA.id,
    expectedRevision: 0,
    selection: {
      mode: 'isolated-worktree',
      branch: { kind: 'new', name: 'feature/session-a', startPoint: 'main' },
    },
  })

  let startHeldPrepare!: () => void
  let releaseHeldPrepare!: () => void
  let markLaterPrepare!: () => void
  const heldPrepareStarted = new Promise<void>((resolveStarted) => (startHeldPrepare = resolveStarted))
  const heldPrepareGate = new Promise<void>((resolveGate) => (releaseHeldPrepare = resolveGate))
  const laterPrepareStarted = new Promise<void>((resolveStarted) => (markLaterPrepare = resolveStarted))
  const originalPrepare = kernel.sessionLaunchTargets.prepare.bind(kernel.sessionLaunchTargets)
  let holdNextPrepare = true
  kernel.sessionLaunchTargets.prepare = async (sessionId, revision, signal) => {
    if (holdNextPrepare) {
      holdNextPrepare = false
      startHeldPrepare()
      await heldPrepareGate
    } else markLaterPrepare()
    return originalPrepare(sessionId, revision, signal)
  }
  const ownerPrepare = kernel.prepareSessionLaunchTarget(sessionA.id, 1)
  await heldPrepareStarted
  const queuedPrepareController = new AbortController()
  const queuedPrepare = captureOutcome(
    kernel.prepareSessionLaunchTarget(sessionA.id, 1, queuedPrepareController.signal),
  )
  queuedPrepareController.abort(new HbarError('USER_CANCELLED', 'Queued preparation cancelled in test'))
  const cancelledBSettledBeforeC = await Promise.race([
    queuedPrepare.then(() => true),
    new Promise<boolean>((resolveLater) => setTimeout(() => resolveLater(false), 250)),
  ])
  const queuedPrepareResult = await queuedPrepare
  const laterPrepare = captureOutcome(kernel.prepareSessionLaunchTarget(sessionA.id, 1))
  const laterActionEnteredBeforeRelease = await Promise.race([
    laterPrepareStarted.then(() => true),
    new Promise<boolean>((resolveLater) => setTimeout(() => resolveLater(false), 250)),
  ])
  const queuedSubmitController = new AbortController()
  const queuedSubmit = captureOutcome(
    kernel.submit(
      sessionA.id,
      'cancelled-while-queued',
      { text: 'must not queue after cancellation', images: [] },
      'local-fixture',
      undefined,
      queuedSubmitController.signal,
    ),
  )
  queuedSubmitController.abort(new HbarError('USER_CANCELLED', 'Queued Run cancelled in test'))
  const settledBeforeRelease = await Promise.race([
    queuedSubmit.then(() => true),
    new Promise<boolean>((resolveLater) => setTimeout(() => resolveLater(false), 250)),
  ])
  releaseHeldPrepare()
  try {
    await ownerPrepare
  } finally {
    kernel.sessionLaunchTargets.prepare = originalPrepare
  }
  const [laterPrepareResult, queuedSubmitResult] = await Promise.all([laterPrepare, queuedSubmit])
  expect(cancelledBSettledBeforeC).toBeTrue()
  expect(settledBeforeRelease).toBeTrue()
  expect(queuedPrepareResult).toMatchObject({ ok: false, error: { code: 'USER_CANCELLED' } })
  expect(laterActionEnteredBeforeRelease).toBeFalse()
  expect(laterPrepareResult).toMatchObject({ ok: true, value: { resolution: { status: 'ready' } } })
  expect(queuedSubmitResult).toMatchObject({ ok: false, error: { code: 'USER_CANCELLED' } })
  expect((await kernel.storage.call('sessionLaunchTargetRuntime', sessionA.id)).binding).toBeNull()

  await kernel.prepareSessionLaunchTarget(sessionA.id, 1)
  const runtimeA = await kernel.storage.call('sessionLaunchTargetRuntime', sessionA.id)
  const targetA = runtimeA.resolution?.targetPath
  if (!targetA) throw new Error('Prepared session worktree path was not persisted')
  await writeFile(join(targetA, 'target-only.txt'), 'only in session A\n')

  await kernel.setSessionLaunchTarget({
    actorId: 'actor-c',
    idempotencyKey: 'select-isolated-c',
    sessionId: sessionC.id,
    expectedRevision: 0,
    selection: {
      mode: 'isolated-worktree',
      branch: { kind: 'new', name: 'feature/session-c', startPoint: 'main' },
    },
  })
  await kernel.prepareSessionLaunchTarget(sessionC.id, 1)
  const runtimeC = await kernel.storage.call('sessionLaunchTargetRuntime', sessionC.id)
  const targetC = runtimeC.resolution?.targetPath
  if (!targetC) throw new Error('Prepared second session worktree path was not persisted')
  await writeFile(join(targetC, 'target-only.txt'), 'only in session C\n')
  await mkdir(join(dataRoot, 'settings', 'secret-fixture'), { recursive: true })
  await writeFile(join(dataRoot, 'settings', 'secret-fixture', 'secret.txt'), 'Host secret must stay hidden\n')
  await symlink(
    join(dataRoot, 'settings', 'secret-fixture'),
    join(targetA, 'host-data-link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  foreignPaths.set(sessionA.id, relative(targetA, join(targetC, 'target-only.txt')))
  expect(await kernel.sessionLaunchTargets.isBoundWorktreeExecutionRoot(targetC)).toBeFalse()
  expect(await kernel.storage.call('sessionLaunchTargetBindingForPath', targetC)).toBeNull()
  expect(await kernel.storage.call('sessionLaunchTargetBindingForPath', targetC)).toBeNull()
  const unboundProbe = new LocalExecution([dataRoot], {
    root: kernel.options.layout.worktrees,
    protectedRoot: dataRoot,
    verify: (path) => kernel.sessionLaunchTargets.isBoundWorktreeExecutionRoot(path),
  })
  try {
    let probeError: unknown
    try {
      await unboundProbe.read(targetC, 'target-only.txt')
    } catch (error) {
      probeError = error
    }
    expect(probeError).toMatchObject({ code: 'PATH_DENIED' })
  } finally {
    unboundProbe.dispose()
  }

  const runC = await kernel.submit(sessionC.id, 'run-c', { text: 'inspect C', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', runC.id)).status).toBe('completed')
  expect(observations.get(sessionC.id)?.toolText).toContain('only in session C')
  expect(await kernel.sessionLaunchTargets.isBoundWorktreeExecutionRoot(targetC)).toBeTrue()

  const sharedHead = await git(repository, ['rev-parse', 'HEAD'])
  const runA = await kernel.submit(sessionA.id, 'run-a', { text: 'inspect A', images: [] }, 'local-fixture')
  const runB = await kernel.submit(sessionB.id, 'run-b', { text: 'inspect B', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', runA.id)).status).toBe('completed')
  expect((await kernel.storage.call('run', runB.id)).status).toBe('completed')

  const observationA = observations.get(sessionA.id)
  const observationB = observations.get(sessionB.id)
  expect(observationA?.cwd).toBe(targetA)
  expect(observationA?.system).toContain(`Work in ${targetA}.`)
  expect(observationA?.toolText).toContain('only in session A')
  expect(observationA?.findText).toContain('target-only.txt')
  expect(observationA?.searchText).toContain('only in session A')
  expect(observationA?.foreignText).toContain('outside the workspace')
  expect(observationA?.secretText).toContain('outside the workspace')
  expect(observationB?.cwd).toBe(repository)
  expect(observationB?.system).toContain(`Work in ${repository}.`)
  expect(observationB?.toolText).toContain('ENOENT')
  expect(observationB?.toolText).not.toContain('only in session A')
  expect(await git(repository, ['branch', '--show-current'])).toBe('main')
  expect(await git(repository, ['rev-parse', 'HEAD'])).toBe(sharedHead)
  expect(await readFile(join(repository, 'shared-only.txt'), 'utf8')).toBe('shared marker\n')
  expect(await kernel.sessionLaunchTargets.isBoundWorktreeExecutionRoot(repository)).toBeFalse()

  const bindingA = await kernel.storage.call('sessionLaunchTargetRuntime', sessionA.id)
  const bindingB = await kernel.storage.call('sessionLaunchTargetRuntime', sessionB.id)
  expect(bindingA.binding).toMatchObject({
    targetPath: targetA,
    branch: 'feature/session-a',
    boundRunId: runA.id,
  })
  expect(bindingA.target).toMatchObject({ locked: true, resolution: { status: 'ready', branch: 'feature/session-a' } })
  expect(bindingB.binding).toMatchObject({ targetPath: repository, branch: null, boundRunId: runB.id })

  await kernel.close()
  kernel = await open()
  kernels.push(kernel)
  const retry = await kernel.submit(
    sessionA.id,
    'run-a-after-restart',
    { text: 'retry A', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', retry.id)).status).toBe('completed')
  expect(observations.get(sessionA.id)?.cwd).toBe(targetA)
  expect((await kernel.storage.call('sessionLaunchTargetRuntime', sessionA.id)).binding).toMatchObject({
    targetPath: targetA,
    branch: 'feature/session-a',
  })
  expect((await git(repository, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)).toHaveLength(3)

  const executableService = kernel.sessionLaunchTargets as unknown as {
    executeGit: (cwd: string, args: string[], signal: AbortSignal) => Promise<GitResult>
  }
  const originalExecuteGit = executableService.executeGit
  let signalVerificationStarted!: () => void
  let releaseVerification!: () => void
  let gitOperationActive = false
  const verificationStarted = new Promise<void>((resolveStarted) => (signalVerificationStarted = resolveStarted))
  const verificationGate = new Promise<void>((resolveGate) => (releaseVerification = resolveGate))
  executableService.executeGit = async (cwd, args, signal) => {
    if (args.includes('--show-toplevel')) {
      gitOperationActive = true
      signalVerificationStarted()
      try {
        await waitForGateOrAbort(verificationGate, signal)
      } finally {
        gitOperationActive = false
      }
    }
    return originalExecuteGit(cwd, args, signal)
  }
  const pendingVerification = captureOutcome(kernel.sessionLaunchTargets.workspaceForRun(sessionA.id, repository))
  await verificationStarted
  const closeStartedAt = performance.now()
  await kernel.sessionLaunchTargets.close()
  expect(performance.now() - closeStartedAt).toBeLessThan(3_000)
  expect(await pendingVerification).toMatchObject({ ok: false, error: { code: 'HOST_SHUTTING_DOWN' } })
  expect(gitOperationActive).toBeFalse()
  expect((await kernel.storage.call('sessionLaunchTargetRuntime', sessionA.id)).target).toMatchObject({
    resolution: { status: 'ready' },
  })
  releaseVerification()
})
