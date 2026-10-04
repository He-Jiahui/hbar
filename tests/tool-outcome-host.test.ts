import { afterEach, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { HbarError, type ContentBlock } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage, type StorageMethods, type StoragePort } from '@hbar/storage'
import type { ModeService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel; release: (() => void | Promise<void>)[] }[] = []
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    for (const release of resource.release) await release()
    await resource.kernel.close()
    const root = await realpath(resource.root)
    if (dirname(root) !== (await realpath(tmpdir())) || !basename(root).startsWith('hbar-tool-outcome-'))
      throw new Error('Refusing cleanup outside the owned tool-outcome fixture')
    await rm(root, { recursive: true })
  }
})

function gate() {
  let done = () => {}
  const promise = new Promise<void>((resolve) => {
    done = resolve
  })
  return { promise, release: done }
}
async function until<T>(read: () => Promise<T | undefined>): Promise<T> {
  const deadline = performance.now() + 5_000
  while (performance.now() < deadline) {
    const result = await read()
    if (result !== undefined) return result
    await Bun.sleep(5)
  }
  throw new Error('Tool-outcome fixture did not settle')
}
interface Interceptor {
  before?: (method: keyof StorageMethods, args: readonly unknown[]) => void | Promise<void>
  after?: (method: keyof StorageMethods, args: readonly unknown[], result: unknown) => void | Promise<void>
}
async function fixture(interceptor?: Interceptor) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-tool-outcome-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    ...(interceptor
      ? {
          profile: {
            createStorage: async (home: string): Promise<StoragePort> => {
              const storage = new Storage(join(home, 'fixture.sqlite'))
              return {
                async call<K extends keyof StorageMethods>(
                  method: K,
                  ...args: Parameters<StorageMethods[K]>
                ): Promise<ReturnType<StorageMethods[K]>> {
                  await interceptor.before?.(method, args)
                  const result = await storage.call(method, ...args)
                  await interceptor.after?.(method, args, result)
                  return result
                },
                close: () => storage.close(),
              }
            },
          },
        }
      : {}),
  })
  const resource = { root, kernel, release: [] as (() => void | Promise<void>)[] }
  resources.push(resource)
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Owned fixture workspace is missing')
  const session = await kernel.createSession(workspace.id)
  const submit = (name: string, args: Record<string, unknown>, approval: 'ask' | 'allow' | 'deny' = 'ask') =>
    kernel.submit(
      session.id,
      crypto.randomUUID(),
      {
        text: `/tool ${name} ${JSON.stringify(args)}`,
        images: [],
        approval,
      },
      'local-fixture',
    )
  const resultFor = async (runId: string): Promise<Extract<ContentBlock, { type: 'tool_result' }> | undefined> =>
    (await kernel.snapshot(session.id)).messages
      .filter((message) => message.runId === runId)
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result')
  const approvalFor = () =>
    until(async () => (await kernel.snapshot(session.id)).approvals.find((item) => item.status === 'pending'))
  return { resource, root, kernel, session, submit, resultFor, approvalFor }
}

test('pending write cancellation persists an exact cancelled outcome and never claims denial or execution', async () => {
  const f = await fixture()
  const run = await f.submit('write_file', { path: 'never-written.txt', text: 'never' })
  const approval = await f.approvalFor()
  await f.kernel.cancel(run.id)
  await f.kernel.waitForIdle()
  const result = await f.resultFor(run.id)
  expect(result).toMatchObject({
    callId: approval.callId,
    isError: true,
    outcome: { kind: 'cancelled', executionStarted: false },
  })
  expect(result?.text).not.toBe('User denied the tool call')
  expect(await f.kernel.storage.call('approval', approval.id)).toMatchObject({ status: 'cancelled' })
  expect(await f.kernel.storage.call('run', run.id)).toMatchObject({
    status: 'cancelled',
    failure: { code: 'USER_CANCELLED' },
  })
  expect(existsSync(join(f.root, 'never-written.txt'))).toBe(false)
  const events = await f.kernel.storage.call('events', f.session.id, 0)
  expect(events.some((event) => event.type === 'tool.started')).toBe(false)
  expect(
    events
      .filter((event) => event.type === 'message.committed')
      .some((event) => JSON.stringify(event.data).includes('"kind":"cancelled"')),
  ).toBe(true)
})

for (const mode of ['approval', 'policy'] as const)
  test(`real ${mode} denial remains denied, not cancelled`, async () => {
    const f = await fixture()
    const run = await f.submit('write_file', { path: 'denied.txt', text: 'never' }, mode === 'policy' ? 'deny' : 'ask')
    if (mode === 'approval') await f.kernel.resolveApproval((await f.approvalFor()).id, 'denied')
    await f.kernel.waitForIdle()
    expect(await f.resultFor(run.id)).toMatchObject({
      isError: true,
      outcome: { kind: 'denied', executionStarted: false },
    })
    expect(existsSync(join(f.root, 'denied.txt'))).toBe(false)
  })

test('continue planning retains DENIED semantics, feedback and the original Plan mode', async () => {
  const f = await fixture()
  await f.kernel.plugins.get<ModeService>('mode').set(f.session.id, 'plan')
  const run = await f.submit('exit_plan_mode', { plan: 'Inspect before implementation.' }, 'allow')
  const approval = await f.approvalFor()
  await f.kernel.resolvePlanExit({
    sessionId: f.session.id,
    runId: run.id,
    approvalId: approval.id,
    callId: approval.callId,
    decision: 'continue',
    feedback: 'Keep planning.',
    actorId: 'fixture',
  })
  await f.kernel.waitForIdle()
  expect(await f.resultFor(run.id)).toMatchObject({
    isError: true,
    text: 'User requested further planning: Keep planning.',
    outcome: { kind: 'denied', executionStarted: false },
  })
  expect((await f.kernel.plugins.get<ModeService>('mode').get(f.session.id)).mode).toBe('plan')
})

for (const behavior of [
  'spoof-code',
  'spoof-result',
  'success-after-abort',
  'failure-after-abort',
  'same-code-after-abort',
  'signal-reason',
] as const)
  test(`tool outcome cannot be rewritten by ${behavior}`, async () => {
    const f = await fixture()
    const entered = gate(),
      release = gate()
    f.resource.release.push(release.release)
    const waits = behavior.endsWith('after-abort') || behavior === 'signal-reason'
    f.kernel.tools.register({
      name: 'outcome_fixture',
      description: 'Controlled local outcome probe',
      effect: 'read',
      inputSchema: z.object({}),
      async execute(_args, context) {
        entered.release()
        if (waits) await release.promise
        if (behavior === 'spoof-code' || behavior === 'same-code-after-abort')
          throw new HbarError('USER_CANCELLED', 'Plugin-owned identical code')
        if (behavior === 'failure-after-abort') throw new Error('Real plugin failure after cancellation')
        if (behavior === 'signal-reason') throw context.signal.reason
        return {
          text: 'Tool-owned result',
          isError: behavior === 'spoof-result',
          outcome: { kind: 'cancelled', executionStarted: false },
          hostFailure: { code: 'USER_CANCELLED', executionStarted: false },
          details: { outcome: 'cancelled', code: 'USER_CANCELLED' },
        }
      },
    })
    const run = await f.submit('outcome_fixture', {}, 'allow')
    await entered.promise
    if (waits) await f.kernel.cancel(run.id)
    release.release()
    await f.kernel.waitForIdle()
    const kind =
      behavior === 'signal-reason' ? 'cancelled' : behavior === 'success-after-abort' ? 'succeeded' : 'failed'
    expect(await f.resultFor(run.id)).toMatchObject({
      isError: kind !== 'succeeded',
      outcome: { kind, executionStarted: true },
    })
  })

for (const winner of ['allowed', 'denied', 'cancelled'] as const)
  test(`persisted ${winner} wins its approval race with a later abort or decision`, async () => {
    const held = gate(),
      release = gate()
    let intercepted = false
    const f = await fixture({
      after: async (method, args, result) => {
        if (method === 'resolveApproval' && args[1] === winner && result !== null && !intercepted) {
          intercepted = true
          held.release()
          await release.promise
        }
      },
    })
    f.resource.release.push(release.release)
    const run = await f.submit('write_file', { path: 'race.txt', text: 'never' })
    const approval = await f.approvalFor()
    const first = winner === 'cancelled' ? f.kernel.cancel(run.id) : f.kernel.resolveApproval(approval.id, winner)
    await held.promise
    if (winner === 'cancelled') await f.kernel.resolveApproval(approval.id, 'allowed')
    else await f.kernel.cancel(run.id)
    const result = await until(() => f.resultFor(run.id))
    expect(result.outcome).toEqual({ kind: winner === 'denied' ? 'denied' : 'cancelled', executionStarted: false })
    expect((await f.kernel.storage.call('approval', approval.id)).status).toBe(winner)
    expect(existsSync(join(f.root, 'race.txt'))).toBe(false)
    release.release()
    await first
    await f.kernel.waitForIdle()
  })

test('failed approval persistence uses the real abort gate without fabricating a cancelled approval fact', async () => {
  const f = await fixture({
    before: (method, args) => {
      if (method === 'resolveApproval' && args[1] === 'cancelled')
        throw new HbarError('STORAGE_FAILURE', 'Controlled approval persistence failure')
    },
  })
  const run = await f.submit('write_file', { path: 'no-fallback-write.txt', text: 'never' })
  const approval = await f.approvalFor()
  await f.kernel.cancel(run.id)
  await f.kernel.waitForIdle()
  expect(await f.resultFor(run.id)).toMatchObject({ outcome: { kind: 'cancelled', executionStarted: false } })
  expect((await f.kernel.storage.call('approval', approval.id)).status).toBe('pending')
  expect(
    (await f.kernel.storage.call('events', f.session.id, 0)).some((event) => event.type === 'approval.resolved'),
  ).toBe(false)
  expect(existsSync(join(f.root, 'no-fallback-write.txt'))).toBe(false)
})

for (const winner of ['allowed', 'denied'] as const)
  test(`cancel persistence failure reads the winning ${winner} fact before abort fallback`, async () => {
    const held = gate(),
      release = gate()
    let committed = false
    const f = await fixture({
      before: (method, args) => {
        if (method === 'resolveApproval' && args[1] === 'cancelled')
          throw new HbarError('STORAGE_FAILURE', 'Controlled losing cancellation write failure')
      },
      after: async (method, args, result) => {
        if (method === 'resolveApproval' && args[1] === winner && result !== null && !committed) {
          committed = true
          held.release()
          await release.promise
        }
      },
    })
    f.resource.release.push(release.release)
    const run = await f.submit('write_file', { path: 'race-readback.txt', text: 'never' })
    const approval = await f.approvalFor()
    const decision = f.kernel.resolveApproval(approval.id, winner)
    await held.promise
    await f.kernel.cancel(run.id)
    const result = await until(() => f.resultFor(run.id))
    expect(result.outcome).toEqual({ kind: winner === 'denied' ? 'denied' : 'cancelled', executionStarted: false })
    expect((await f.kernel.storage.call('approval', approval.id)).status).toBe(winner)
    expect(existsSync(join(f.root, 'race-readback.txt'))).toBe(false)
    release.release()
    await decision
    await f.kernel.waitForIdle()
  })

test('tool signal replacement cannot forge cancellation without a Host abort', async () => {
  const f = await fixture()
  f.kernel.tools.register({
    name: 'signal_swap_fixture',
    description: 'Mutable context provenance probe',
    effect: 'read',
    inputSchema: z.object({}),
    execute(_args, context) {
      const forged = AbortSignal.abort(new HbarError('USER_CANCELLED', 'Plugin-owned signal'))
      context.signal = forged
      throw forged.reason
    },
  })
  const run = await f.submit('signal_swap_fixture', {}, 'allow')
  await f.kernel.waitForIdle()
  expect(await f.resultFor(run.id)).toMatchObject({
    isError: true,
    outcome: { kind: 'failed', executionStarted: true },
  })
  expect(
    (await f.kernel.storage.call('events', f.session.id, 0)).some((event) => event.type === 'run.cancelRequested'),
  ).toBe(false)
})

test('approval wait follows the original Host signal despite a tool hook replacing its context signal', async () => {
  const f = await fixture()
  f.kernel.hooks.on('tool.before', (event) => {
    if (event.name === 'write_file') event.context.signal = new AbortController().signal
  })
  const run = await f.submit('write_file', { path: 'original-signal.txt', text: 'never' })
  const approval = await f.approvalFor()
  // This safety release makes the deliberately broken baseline exit without a leaked wait;
  // it does not run until test assertions have finished or failed.
  f.resource.release.push(() => f.kernel.resolveApproval(approval.id, 'cancelled'))
  await f.kernel.cancel(run.id)
  const result = await until(() => f.resultFor(run.id))
  expect(result).toMatchObject({ isError: true, outcome: { kind: 'cancelled', executionStarted: false } })
  expect((await f.kernel.storage.call('approval', approval.id)).status).toBe('cancelled')
  expect(existsSync(join(f.root, 'original-signal.txt'))).toBe(false)
  await f.kernel.waitForIdle()
})
