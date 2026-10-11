import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarClient, createDirectoryQueryAdapter, createRunCommandClient } from '@hbar/client'
import { HbarError, rpcSchemas, type RpcMethod, type RpcParams, type RpcResults } from '@hbar/contracts'
import { operationCancelResultSchema, runCommands } from '@hbar/contracts/commands/run'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'

const ROOT_PREFIX = 'hbar-run-cancellation-recovery-'
const LIFECYCLE_DIAGNOSTICS = process.env.HBAR_TEST_LIFECYCLE_DIAGNOSTICS === '1'
type LifecyclePhase =
  | 'test_enter'
  | 'before_runtime_dispose'
  | 'after_runtime_dispose'
  | 'before_client_disconnect'
  | 'after_client_disconnect'
  | 'before_host_close'
  | 'after_host_close'
  | 'before_kernel_close'
  | 'after_kernel_close'
  | 'before_fixture_cleanup'
  | 'after_fixture_cleanup'

function lifecycleFingerprint(root: string): string {
  return createHash('sha256').update(root, 'utf8').digest('hex')
}

function lifecyclePhase(rootFingerprint: string, phase: LifecyclePhase, startedAt: number, cleanup: boolean): void {
  if (!LIFECYCLE_DIAGNOSTICS) return
  try {
    process.stderr.write(
      `${JSON.stringify({
        testId: 'run-cancellation-recovery-host',
        phase,
        time: Date.now(),
        elapsedMs: Math.max(0, performance.now() - startedAt),
        rootSha256: rootFingerprint,
        cleanup,
      })}\n`,
    )
  } catch {
    // Diagnostic markers are best effort and must not alter test cleanup semantics.
  }
}

async function removeOwnedFixture(root: string, temporaryParent: string): Promise<void> {
  const actual = await realpath(root)
  if (actual !== resolve(root) || dirname(actual) !== temporaryParent || !basename(actual).startsWith(ROOT_PREFIX))
    throw new Error('Refusing cleanup outside the exact owned temporary fixture')
  await rm(actual, { recursive: true })
}

function gate() {
  let release = () => {}
  const promise = new Promise<void>((done) => {
    release = done
  })
  return { promise, release }
}

async function until(predicate: () => boolean | Promise<boolean>, label: string): Promise<void> {
  const deadline = performance.now() + 5_000
  while (!(await predicate())) {
    if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${label}`)
    await Bun.sleep(10)
  }
}

async function rejectedCode(work: () => Promise<unknown>, code: string): Promise<void> {
  let rejection: unknown
  try {
    await work()
  } catch (error) {
    rejection = error
  }
  expect(rejection).toMatchObject({ code })
}

test('real Host cancellation with a lost ACK reconciles only the original operation and preserves drafts', async () => {
  const temporaryParent = await realpath(tmpdir())
  const root = await realpath(await mkdtemp(join(temporaryParent, ROOT_PREFIX)))
  const workspacePath = join(root, 'workspace')
  const targetPath = join(workspacePath, 'must-not-execute.txt')
  const lifecycleStartedAt = performance.now()
  const rootFingerprint = lifecycleFingerprint(root)
  const ackSeen = gate()
  const releaseAck = gate()
  const failures: unknown[] = []
  let kernel: Kernel | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  let runtime: ReturnType<typeof createAppRuntime> | undefined
  let hostClosed = false
  let kernelClosed = false
  lifecyclePhase(rootFingerprint, 'test_enter', lifecycleStartedAt, false)
  try {
    await mkdir(workspacePath)
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: workspacePath,
      demo: true,
      secrets: new MemorySecrets(),
    })
    // Configure the owned fixture before creating Host command services: no hot service remount.
    await kernel.changePlugin('goal.codex', true, { autoContinue: false })
    expect((await kernel.storage.call('plugins')).find((plugin) => plugin.id === 'goal.codex')?.config).toMatchObject({
      autoContinue: false,
    })
    const workspace = (await kernel.storage.call('workspaces')).find((item) => item.path === workspacePath)
    if (!workspace) throw new Error('The owned workspace was not registered')
    const session = await kernel.createSession(workspace.id, 'Cancellation target')
    const other = await kernel.createSession(workspace.id, 'Unrelated session')
    host = await startServer(kernel, { hostname: '127.0.0.1', port: 0 })
    const connected = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    client = connected
    const info = await connected.pair(host.pairing.code, 'Cancellation recovery integration')
    const observer = createRunCommandClient(connected)
    const accepted = await observer.execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: {
          text: `/tool write_file ${JSON.stringify({ path: 'must-not-execute.txt', text: 'Never approved' })}`,
          images: [],
          approval: 'ask',
        },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await until(
      async () =>
        (await observer.execute('operation.get', { operationId: accepted.operationId })).status === 'waiting_approval',
      'the real pending tool approval',
    )
    const before = await connected.call('session.snapshot', { sessionId: session.id })
    expect(before.runs).toHaveLength(1)
    expect(
      before.approvals.some((approval) => approval.tool === 'write_file' && approval.status === 'pending'),
    ).toBeTrue()
    expect(await Bun.file(targetPath).exists()).toBeFalse()

    // Fault injection forwards each real RPC first. Only the already-executed cancel ACK is withheld.
    const calls: { commandId: string; operationId: string }[] = []
    let cancelResponses = 0
    const transport = {
      async call<M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResults[M]> {
        if (method !== 'command.execute') throw new Error('Unexpected cancellation transport RPC')
        const invocation = rpcSchemas['command.execute'].parse(params)
        if (invocation.commandId !== 'operation.cancel' && invocation.commandId !== 'operation.get')
          throw new Error('Cancellation recovery must not submit or retry work')
        const target = runCommands[invocation.commandId].input.parse(invocation.input)
        calls.push({ commandId: invocation.commandId, operationId: target.operationId })
        const result = await connected.call(method, params)
        if (invocation.commandId === 'operation.cancel') {
          const acknowledgement = operationCancelResultSchema.parse(result)
          expect(acknowledgement.operationId).toBe(accepted.operationId)
          expect(['cancelRequested', 'cancelled']).toContain(acknowledgement.status)
          cancelResponses++
          ackSeen.release()
          await releaseAck.promise
          throw new HbarError('TIMEOUT', 'Private injected transport detail must not become UI state')
        }
        return result
      },
    }
    const app = createAppRuntime({
      instanceId: crypto.randomUUID(),
      hostId: info.instanceId,
      directory: createDirectoryQueryAdapter(connected),
      run: createRunCommandClient(transport),
    })
    runtime = app
    await app.ready
    await app.view.commands.execute('app.setSession', { sessionId: session.id, workspaceId: workspace.id })
    const initialDraft = await app.view.commands.execute('draft.setText', {
      sessionId: session.id,
      text: 'Keep the original draft',
    })
    await app.view.commands.execute('draft.setText', { sessionId: other.id, text: 'Other session draft' })
    const cancel = app.view.commands.execute('operation.cancel', { operationId: accepted.operationId }).then(
      () => ({ error: null }),
      (error: unknown) => ({ error }),
    )
    await until(() => cancelResponses === 1, 'the real cancellation acknowledgement')
    await ackSeen.promise
    expect(app.view.state.runActions.getSnapshot()[accepted.operationId]).toMatchObject({
      commandId: 'operation.cancel',
      phase: 'request',
      status: 'submitting',
      requestInFlight: true,
    })
    await rejectedCode(
      () => app.view.commands.execute('operation.cancel', { operationId: accepted.operationId }),
      'BUSY',
    )
    await rejectedCode(
      () =>
        app.view.commands.execute('runAction.reconcileCancellation', {
          sessionId: session.id,
          operationId: accepted.operationId,
        }),
      'BUSY',
    )
    const edit = await app.view.commands.execute('draft.setText', {
      sessionId: session.id,
      text: 'Edited while the cancellation ACK was held',
      expectedRevision: initialDraft.revision,
    })
    const editedDraft = app.view.state.drafts.getSnapshot()[session.id]
    if (!editedDraft) throw new Error('The original session draft is missing')
    expect(editedDraft).toMatchObject({
      sessionId: session.id,
      revision: edit.revision,
      text: 'Edited while the cancellation ACK was held',
    })
    releaseAck.release()
    expect((await cancel).error).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(app.view.state.runActions.getSnapshot()[accepted.operationId]).toMatchObject({
      commandId: 'operation.cancel',
      phase: 'request',
      status: 'unknown',
      error: 'RESULT_UNKNOWN',
      requestInFlight: false,
    })
    await until(
      async () =>
        (await observer.execute('operation.get', { operationId: accepted.operationId })).status === 'cancelled',
      'the real cancelled Host operation',
    )
    await rejectedCode(
      () => app.view.commands.execute('operation.cancel', { operationId: accepted.operationId }),
      'BUSY',
    )
    expect(calls).toEqual([{ commandId: 'operation.cancel', operationId: accepted.operationId }])

    // Before the first validated read binds sessionId, a real wrong-session read must not claim success.
    await rejectedCode(
      () =>
        app.view.commands.execute('runAction.reconcileCancellation', {
          sessionId: other.id,
          operationId: accepted.operationId,
        }),
      'INVALID_OUTPUT',
    )
    expect(app.view.state.runActions.getSnapshot()[accepted.operationId]).toMatchObject({
      status: 'unknown',
      error: 'INVALID_OUTPUT',
      requestInFlight: false,
    })
    expect(app.view.state.runActions.getSnapshot()[accepted.operationId]?.sessionId).toBeUndefined()
    expect(
      await app.view.commands.execute('runAction.reconcileCancellation', {
        sessionId: session.id,
        operationId: accepted.operationId,
      }),
    ).toEqual({
      sessionId: session.id,
      operationId: accepted.operationId,
      status: 'succeeded',
      observedStatus: 'cancelled',
      error: null,
    })
    expect(app.view.state.runActions.getSnapshot()[accepted.operationId]).toMatchObject({
      commandId: 'operation.cancel',
      sessionId: session.id,
      phase: 'state',
      status: 'succeeded',
      observedStatus: 'cancelled',
      error: null,
      requestInFlight: false,
    })
    await rejectedCode(
      () =>
        app.view.commands.execute('runAction.reconcileCancellation', {
          sessionId: other.id,
          operationId: accepted.operationId,
        }),
      'STALE_TARGET',
    )
    expect(calls).toEqual([
      { commandId: 'operation.cancel', operationId: accepted.operationId },
      { commandId: 'operation.get', operationId: accepted.operationId },
      { commandId: 'operation.get', operationId: accepted.operationId },
    ])
    expect(cancelResponses).toBe(1)
    expect(app.view.state.drafts.getSnapshot()[session.id]).toBe(editedDraft)
    expect(app.view.state.drafts.getSnapshot()[other.id]?.text).toBe('Other session draft')
    expect(app.view.state.navigation.getSnapshot()).toMatchObject({ sessionId: session.id, workspaceId: workspace.id })
    const after = await connected.call('session.snapshot', { sessionId: session.id })
    expect(after.runs).toHaveLength(1)
    expect(after.runs[0]).toMatchObject({ id: accepted.operationId, status: 'cancelled' })
    expect(after.approvals.some((approval) => approval.status === 'allowed')).toBeFalse()
    expect((await connected.call('session.snapshot', { sessionId: other.id })).runs).toHaveLength(0)
    expect(await Bun.file(targetPath).exists()).toBeFalse()
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.cancelRequested'),
    ).toHaveLength(1)
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued'),
    ).toHaveLength(1)
  } catch (error) {
    failures.push(error)
  } finally {
    releaseAck.release()
    lifecyclePhase(rootFingerprint, 'before_runtime_dispose', lifecycleStartedAt, hostClosed && kernelClosed)
    try {
      runtime?.dispose()
    } catch (error) {
      failures.push(error)
    }
    lifecyclePhase(rootFingerprint, 'after_runtime_dispose', lifecycleStartedAt, hostClosed && kernelClosed)
    lifecyclePhase(rootFingerprint, 'before_client_disconnect', lifecycleStartedAt, hostClosed && kernelClosed)
    try {
      client?.disconnect()
    } catch (error) {
      failures.push(error)
    }
    lifecyclePhase(rootFingerprint, 'after_client_disconnect', lifecycleStartedAt, hostClosed && kernelClosed)
    lifecyclePhase(rootFingerprint, 'before_host_close', lifecycleStartedAt, hostClosed && kernelClosed)
    try {
      await host?.close()
      hostClosed = true
    } catch (error) {
      failures.push(error)
    }
    lifecyclePhase(rootFingerprint, 'after_host_close', lifecycleStartedAt, hostClosed && kernelClosed)
    lifecyclePhase(rootFingerprint, 'before_kernel_close', lifecycleStartedAt, hostClosed && kernelClosed)
    try {
      await kernel?.close()
      kernelClosed = true
    } catch (error) {
      failures.push(error)
    }
    lifecyclePhase(rootFingerprint, 'after_kernel_close', lifecycleStartedAt, hostClosed && kernelClosed)
    if (hostClosed && kernelClosed) {
      lifecyclePhase(rootFingerprint, 'before_fixture_cleanup', lifecycleStartedAt, false)
      try {
        await removeOwnedFixture(root, temporaryParent)
        lifecyclePhase(rootFingerprint, 'after_fixture_cleanup', lifecycleStartedAt, true)
      } catch (error) {
        failures.push(error)
      }
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Cancellation recovery integration or owned cleanup failed')
  expect(existsSync(root)).toBeFalse()
}, 30_000)
