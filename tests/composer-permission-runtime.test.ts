import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient, type CommandExecutor } from '@hbar/commands'
import {
  composerPermissionCommands,
  createComposerPermission,
  type ComposerPermissionChoice,
} from '../packages/app-runtime/src/composer-permission'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState } from '../packages/app-runtime/src/types'

function deferred() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function fixture({ unavailable = false, readTimeoutMs = 500 }: { unavailable?: boolean; readTimeoutMs?: number } = {}) {
  const registry = new CommandRegistry()
  const navigation = createState<NavigationState>(
    { workspaceId: 'w', sessionId: 'a', status: 'idle', error: null },
    () => {},
  )
  let value: unknown = { mode: 'ask' }
  let failure: Error | null = null
  let gate: ReturnType<typeof deferred> | null = null
  let locked = false
  let runActive = false
  const calls: { id: string; input: unknown; signal: AbortSignal | undefined }[] = []
  const configuration: CommandExecutor = {
    async execute(id, input, options) {
      calls.push({ id, input, signal: options?.signal })
      if (id !== 'permission.get') throw new Error(`Unexpected write/read ${id}`)
      const captured = structuredClone(value)
      const wait = gate
      gate = null
      await wait?.promise
      if (failure) throw failure
      return captured
    },
  }
  const permission = createComposerPermission(registry, {
    configuration: unavailable ? undefined : configuration,
    navigation: navigation.reader,
    isSubmissionLocked: () => locked,
    isRunActive: () => runActive,
    onSubscriberError: () => {},
    readTimeoutMs,
  })
  const commands = createCommandClient(composerPermissionCommands, registry)
  const current = (sessionId = 'a') => permission.reader.getSnapshot().entries[sessionId]
  return {
    permission,
    commands,
    calls,
    current,
    choice: (choice: ComposerPermissionChoice, confirmAllow?: true) =>
      commands.execute('composerPermission.setChoice', {
        sessionId: navigation.reader.getSnapshot().sessionId ?? '',
        choice,
        expectedRevision: current(navigation.reader.getSnapshot().sessionId ?? '')?.revision ?? 0,
        ...(confirmAllow ? { confirmAllow } : {}),
      }),
    select: (sessionId: string) => navigation.replace({ ...navigation.reader.getSnapshot(), sessionId }),
    mode: (mode: unknown) => {
      value = { mode }
    },
    failure: (reason: Error | null) => {
      failure = reason
    },
    locked: (value: boolean) => {
      locked = value
    },
    runActive: (value: boolean) => {
      runActive = value
    },
    block: () => {
      gate = deferred()
      return gate
    },
    dispose: () => {
      permission.dispose()
      navigation.dispose()
    },
  }
}

test('permission default reads are coalesced and use only the public read command', async () => {
  const f = fixture()
  const block = f.block()
  const first = f.commands.execute('composerPermission.refresh', {})
  const second = f.commands.execute('composerPermission.refresh', {})
  await Bun.sleep(1)
  expect(f.permission.reader.getSnapshot().hostDefault.status).toBe('loading')
  expect(f.calls).toHaveLength(1)
  block.release()
  expect(await first).toEqual({ mode: 'ask' })
  expect(await second).toEqual({ mode: 'ask' })
  expect(f.calls.map((call) => call.id)).toEqual(['permission.get'])
  expect(f.permission.reader.getSnapshot().entries).toEqual({})
  f.dispose()
})

test('inherit captures the fresh Host default for one send and resets only after acceptance', async () => {
  const f = fixture()
  await f.commands.execute('composerPermission.refresh', {})
  f.mode('deny')
  const captured = await f.permission.prepareSubmission('a', 0)
  expect(captured).toMatchObject({ sessionId: 'a', revision: 0, choice: 'inherit', approval: 'deny' })
  expect(captured.token.length).toBeGreaterThan(0)
  expect(f.current()).toMatchObject({ status: 'prepared', locked: true })
  f.mode('allow')
  await f.commands.execute('composerPermission.refresh', {})
  expect(captured.approval).toBe('deny')
  expect(f.permission.getPreparedSubmission('a')).toBe(captured)
  expect(f.permission.settleSubmission(captured, 'accepted')).toBe(true)
  expect(f.current()).toMatchObject({ choice: 'inherit', status: 'idle', locked: false, revision: 1 })
  expect(f.permission.getPreparedSubmission('a')).toBeNull()
  expect(f.permission.settleSubmission(captured, 'failed')).toBe(false)
  f.dispose()
})

test.each(['ask', 'deny'] as const)(
  'explicit %s is a next-send override, without reading or writing global configuration',
  async (choice) => {
    const f = fixture({ unavailable: true })
    await f.choice(choice)
    const captured = await f.permission.prepareSubmission('a', 1)
    expect(captured.approval).toBe(choice)
    expect(f.calls).toHaveLength(0)
    f.permission.settleSubmission(captured, 'failed', 'RUN_REJECTED')
    expect(f.current()).toMatchObject({ choice, revision: 1, locked: false, status: 'failed', error: 'RUN_REJECTED' })
    const retry = await f.permission.prepareSubmission('a', 1)
    expect(retry.approval).toBe(choice)
    expect(retry.token).not.toBe(captured.token)
    f.permission.settleSubmission(retry, 'accepted')
    expect(f.current()?.choice).toBe('inherit')
    f.dispose()
  },
)

test('allow requires explicit confirmation of the current session and draft revision', async () => {
  const f = fixture()
  await expect(f.choice('allow')).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' })
  expect(f.current()).toBeUndefined()
  await f.choice('allow', true)
  await expect(
    f.commands.execute('composerPermission.setChoice', {
      sessionId: 'a',
      choice: 'deny',
      expectedRevision: 0,
    }),
  ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  f.select('b')
  await expect(
    f.commands.execute('composerPermission.setChoice', {
      sessionId: 'a',
      choice: 'allow',
      expectedRevision: 1,
      confirmAllow: true,
    }),
  ).rejects.toMatchObject({ code: 'STALE_TARGET' })
  expect(f.current('b')).toBeUndefined()
  f.select('a')
  const capture = await f.permission.prepareSubmission('a', 1)
  expect(capture.approval).toBe('allow')
  f.dispose()
})

test('a current Run blocks legacy execution-choice changes without changing the draft', async () => {
  const f = fixture()
  f.runActive(true)
  await expect(f.choice('deny')).rejects.toMatchObject({ code: 'RUN_ACTIVE' })
  expect(f.current()).toBeUndefined()
  f.runActive(false)
  await f.choice('deny')
  expect(f.current()).toMatchObject({ choice: 'deny', revision: 1 })
  f.dispose()
})

test('preparation coalesces and unknown Run retains original approval and token across defaults and session switches', async () => {
  const f = fixture()
  const block = f.block()
  f.mode('allow')
  const first = f.permission.prepareSubmission('a', 0)
  const second = f.permission.prepareSubmission('a', 0)
  expect(first).toBe(second)
  await expect(f.choice('deny')).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
  block.release()
  const captured = await first
  f.permission.settleSubmission(captured, 'unknown', 'RESULT_UNKNOWN')
  expect(f.current()).toMatchObject({ choice: 'inherit', status: 'unknown', locked: true })
  f.mode('deny')
  f.select('b')
  await f.choice('ask')
  f.select('a')
  expect(await f.permission.prepareSubmission('a', 0)).toBe(captured)
  expect(f.calls).toHaveLength(1)
  expect(captured.approval).toBe('allow')
  expect(f.permission.settleSubmission({ ...captured, token: 'unrelated' }, 'accepted')).toBe(false)
  expect(f.current()?.locked).toBe(true)
  f.permission.settleSubmission(captured, 'accepted')
  expect(f.current('b')).toMatchObject({ choice: 'ask', revision: 1, locked: false })
  f.dispose()
})

test.each([
  { name: 'unavailable capability', unavailable: true, error: 'CAPABILITY_UNAVAILABLE' },
  { name: 'invalid response', mode: 'bypass', error: 'INVALID_OUTPUT' },
  { name: 'disconnected', failure: new CommandError('DISCONNECTED', 'Lost connection'), error: 'DISCONNECTED' },
])('inherit read failure ($name) blocks submission without fallback and permits local retry', async (scenario) => {
  const f = fixture({ unavailable: scenario.unavailable ?? false })
  if (scenario.mode) f.mode(scenario.mode)
  if (scenario.failure) f.failure(scenario.failure)
  await expect(f.permission.prepareSubmission('a', 0)).rejects.toMatchObject({ code: scenario.error })
  expect(f.current()).toMatchObject({ choice: 'inherit', locked: false, status: 'failed', error: scenario.error })
  expect(f.permission.getPreparedSubmission('a')).toBeNull()
  expect(f.permission.reader.getSnapshot().hostDefault).toMatchObject({ status: 'error', mode: null })
  if (!scenario.unavailable) {
    f.mode('ask')
    f.failure(null)
    expect((await f.permission.prepareSubmission('a', 0)).approval).toBe('ask')
  }
  f.dispose()
})

test('an uncooperative read times out, aborts, and cannot later overwrite a successful retry', async () => {
  const f = fixture({ readTimeoutMs: 10 })
  const block = f.block()
  const preparation = f.permission.prepareSubmission('a', 0)
  await expect(preparation).rejects.toMatchObject({ code: 'TIMEOUT' })
  expect(f.calls[0]?.signal?.aborted).toBe(true)
  f.mode('deny')
  const recovered = await f.permission.prepareSubmission('a', 0)
  block.release()
  await Bun.sleep(1)
  expect(recovered.approval).toBe('deny')
  expect(f.permission.reader.getSnapshot().hostDefault.mode).toBe('deny')
  f.dispose()
})

test.each([false, true])(
  'switching during preparation invalidates the original action (return to original: %s)',
  async (returnToOriginal) => {
    const f = fixture()
    const block = f.block()
    const preparation = f.permission.prepareSubmission('a', 0)
    f.select('b')
    if (returnToOriginal) f.select('a')
    block.release()
    await expect(preparation).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(f.current()).toMatchObject({ locked: false, status: 'failed' })
    expect(f.current('b')).toBeUndefined()
    f.dispose()
  },
)

test('external submission ownership (including detached Plan) blocks changes without consuming permission draft', async () => {
  const f = fixture()
  await f.choice('allow', true)
  f.locked(true)
  await expect(f.choice('ask')).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
  await expect(f.permission.prepareSubmission('a', 1)).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
  expect(f.current()).toMatchObject({ choice: 'allow', revision: 1, locked: false })
  expect(f.calls).toHaveLength(0)
  f.locked(false)
  expect((await f.permission.prepareSubmission('a', 1)).approval).toBe('allow')
  f.dispose()
})

test('cancellation and disposal release preparation without publishing late state', async () => {
  const f = fixture()
  const abort = new AbortController()
  const block = f.block()
  const preparation = f.permission.prepareSubmission('a', 0, abort.signal)
  abort.abort()
  block.release()
  await expect(preparation).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(f.current()?.locked).toBe(false)
  const secondBlock = f.block()
  const second = f.permission.prepareSubmission('a', 0)
  await Bun.sleep(1)
  f.dispose()
  const disposedSnapshot = f.permission.reader.getSnapshot()
  secondBlock.release()
  await expect(second).rejects.toMatchObject({ code: 'DISPOSED' })
  expect(f.permission.reader.getSnapshot()).toBe(disposedSnapshot)
})

test('cancelled preparation stops waiting immediately without cancelling another default reader', async () => {
  const f = fixture()
  const block = f.block()
  const refresh = f.commands.execute('composerPermission.refresh', {})
  const abort = new AbortController()
  const preparation = f.permission.prepareSubmission('a', 0, abort.signal)
  await Bun.sleep(1)
  abort.abort()
  await expect(preparation).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(f.current()).toMatchObject({ locked: false, status: 'failed', choice: 'inherit' })
  expect(f.calls[0]?.signal?.aborted).toBe(false)
  block.release()
  expect(await refresh).toEqual({ mode: 'ask' })
  expect(f.permission.getPreparedSubmission('a')).toBeNull()
  f.dispose()
})

test('100 session drafts are bounded; the 101st fails without replacing earlier choices', async () => {
  const f = fixture()
  for (let index = 0; index < 100; index++) {
    f.select(`session-${index}`)
    await f.choice('deny')
  }
  f.select('session-overflow')
  await expect(f.choice('ask')).rejects.toMatchObject({ code: 'BUSY' })
  expect(Object.keys(f.permission.reader.getSnapshot().entries)).toHaveLength(100)
  expect(f.current('session-0')?.choice).toBe('deny')
  f.dispose()
})
