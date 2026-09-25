import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient, type CommandExecutor } from '@hbar/commands'
import { createComposerPlanMode, composerPlanModeCommands } from '../packages/app-runtime/src/composer-plan-mode'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState } from '../packages/app-runtime/src/types'

function deferred() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function fixture() {
  const local = new CommandRegistry()
  const navigation = createState<NavigationState>(
    { workspaceId: 'w', sessionId: 'a', status: 'idle', error: null },
    () => {},
  )
  const values = new Map<string, 'default' | 'plan'>([
    ['a', 'default'],
    ['b', 'plan'],
  ])
  const calls: { name: string; sessionId: string; key?: string }[] = []
  let readGate: ReturnType<typeof deferred> | null = null
  let writeGate: ReturnType<typeof deferred> | null = null
  let fail: 'before' | 'after' | 'known' | null = null
  let readFailure = false
  let locked = false
  const listeners = new Set<(sessionId: string) => void>()
  const connectionListeners = new Set<(connected: boolean) => void>()
  const configuration: CommandExecutor = {
    async execute(name, raw, options) {
      const input = raw as { sessionId: string; mode?: 'default' | 'plan' }
      calls.push({
        name,
        sessionId: input.sessionId,
        ...(options?.idempotencyKey ? { key: options.idempotencyKey } : {}),
      })
      if (name === 'mode.get') {
        const captured = values.get(input.sessionId)
        const gate = readGate
        readGate = null
        await gate?.promise
        if (readFailure) throw new CommandError('DISCONNECTED', 'Host read failed')
        return { mode: captured }
      }
      if (name !== 'mode.set' || !input.mode) throw new Error('Unexpected Host command')
      const gate = writeGate
      writeGate = null
      await gate?.promise
      if (fail === 'before') throw new CommandError('DISCONNECTED', 'lost before delivery')
      if (fail === 'known') throw new CommandError('FORBIDDEN', 'Host denied')
      values.set(input.sessionId, input.mode)
      for (const listener of listeners) listener(input.sessionId)
      if (fail === 'after') throw new CommandError('RESULT_UNKNOWN', 'lost response')
      return { mode: input.mode }
    },
  }
  const mode = createComposerPlanMode(local, {
    configuration,
    navigation: navigation.reader,
    isSubmissionLocked: () => locked,
    onSubscriberError: () => {},
    events: {
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      onConnection(listener) {
        connectionListeners.add(listener)
        return () => {
          connectionListeners.delete(listener)
        }
      },
    },
  })
  const commands = createCommandClient(composerPlanModeCommands, local)
  return {
    mode,
    commands,
    calls,
    values,
    entry: (id = 'a') => mode.reader.getSnapshot().entries[id],
    select: (id: string) => navigation.replace({ ...navigation.reader.getSnapshot(), sessionId: id }),
    set: (value: 'default' | 'plan', id = 'a') =>
      commands.execute('composerPlanMode.setMode', {
        sessionId: id,
        mode: value,
        expectedRevision: mode.reader.getSnapshot().entries[id]?.revision ?? 0,
      }),
    fail: (value: typeof fail) => {
      fail = value
    },
    failRead: (value: boolean) => {
      readFailure = value
    },
    lock: (value: boolean) => {
      locked = value
    },
    notify: (sessionId: string, value: 'default' | 'plan') => {
      values.set(sessionId, value)
      for (const listener of listeners) listener(sessionId)
    },
    connection: (connected: boolean) => {
      for (const listener of connectionListeners) listener(connected)
    },
    blockRead: () => {
      readGate = deferred()
      return readGate
    },
    blockWrite: () => {
      writeGate = deferred()
      return writeGate
    },
    dispose: () => {
      mode.dispose()
      navigation.dispose()
    },
  }
}

test('durable Plan captures across consecutive sends and only an explicit exit changes Host mode', async () => {
  const f = fixture()
  await f.commands.execute('composerPlanMode.refresh', { sessionId: 'a' }).catch(() => undefined)
  expect(f.mode.capture('a')).toBe('default')
  await f.set('plan')
  expect(f.mode.capture('a')).toBe('plan')
  expect(f.mode.capture('a')).toBe('plan')
  await f.set('default')
  expect(f.mode.capture('a')).toBe('default')
  expect(f.calls.filter((call) => call.name === 'mode.set')).toHaveLength(2)
  f.dispose()
})

test('lost reply masks old mode, freezes writes and sending, read-only reconciliation confirms Host fact', async () => {
  const f = fixture()
  await f.commands.execute('composerPlanMode.refresh', { sessionId: 'a' }).catch(() => undefined)
  f.fail('after')
  await expect(f.set('plan')).rejects.toHaveProperty('code', 'RESULT_UNKNOWN')
  expect(f.entry()).toMatchObject({ status: 'unknown', mode: null })
  expect(() => f.mode.capture('a')).toThrow()
  await expect(f.set('default')).rejects.toHaveProperty('code', 'BUSY')
  const writes = f.calls.filter((call) => call.name === 'mode.set')
  await f.commands.execute('composerPlanMode.reconcile', { sessionId: 'a' })
  expect(f.entry()).toMatchObject({ status: 'ready', mode: 'plan' })
  expect(f.calls.filter((call) => call.name === 'mode.set')).toEqual(writes)
  f.dispose()
})

test('unknown before delivery remains unknown when read returns baseline; no second write', async () => {
  const f = fixture()
  await f.commands.execute('composerPlanMode.refresh', { sessionId: 'a' }).catch(() => undefined)
  f.fail('before')
  await expect(f.set('plan')).rejects.toHaveProperty('code', 'DISCONNECTED')
  await expect(f.commands.execute('composerPlanMode.reconcile', { sessionId: 'a' })).rejects.toHaveProperty(
    'code',
    'RESULT_UNKNOWN',
  )
  expect(f.entry()).toMatchObject({ status: 'unknown', mode: null })
  expect(f.calls.filter((call) => call.name === 'mode.set')).toHaveLength(1)
  f.dispose()
})

test('known rejection, submission lock and stale revision never claim Plan success', async () => {
  const f = fixture()
  await f.commands.execute('composerPlanMode.refresh', { sessionId: 'a' }).catch(() => undefined)
  f.lock(true)
  await expect(f.set('plan')).rejects.toHaveProperty('code', 'BUSY')
  f.lock(false)
  f.fail('known')
  await expect(f.set('plan')).rejects.toHaveProperty('code', 'FORBIDDEN')
  expect(f.entry()).toMatchObject({ status: 'failed', mode: null })
  await f.commands.execute('composerPlanMode.refresh', { sessionId: 'a' })
  await expect(
    f.commands.execute('composerPlanMode.setMode', {
      sessionId: 'a',
      mode: 'plan',
      expectedRevision: 0,
    }),
  ).rejects.toHaveProperty('code', 'VERSION_CONFLICT')
  f.dispose()
})

test('switch and late read/write never project the old session onto the new target', async () => {
  const f = fixture()
  const gate = f.blockRead()
  const old = f.commands.execute('composerPlanMode.refresh', { sessionId: 'a' }).catch(() => undefined)
  await Bun.sleep(1)
  f.select('b')
  gate.release()
  await old
  await Bun.sleep(1)
  expect(f.entry('a')?.mode).toBe('default')
  expect(f.entry('b')?.mode).toBe('plan')
  expect(f.mode.capture('b')).toBe('plan')
  expect(() => f.mode.capture('a')).toThrow()
  f.dispose()
})

test('paired-client mode.changed invalidates immediately and converges after an event during read', async () => {
  const f = fixture()
  await Bun.sleep(1)
  expect(f.mode.capture('a')).toBe('default')
  const gate = f.blockRead()
  const stale = f.commands.execute('composerPlanMode.refresh', { sessionId: 'a' }).catch(() => undefined)
  await Bun.sleep(1)
  f.notify('a', 'plan')
  expect(f.entry()).toMatchObject({ status: 'loading', mode: null })
  expect(() => f.mode.capture('a')).toThrow()
  gate.release()
  await stale
  for (let attempt = 0; attempt < 20 && f.entry()?.mode !== 'plan'; attempt++) await Bun.sleep(1)
  expect(f.entry()).toMatchObject({ status: 'ready', mode: 'plan' })
  f.dispose()
})

test('fresh capture after silent reconnect reads Host mode rather than stale local ready', async () => {
  const f = fixture()
  await Bun.sleep(1)
  expect(f.mode.capture('a')).toBe('default')
  f.values.set('a', 'plan') // a notification lost while this client was disconnected
  expect(f.mode.capture('a')).toBe('default')
  expect(await f.mode.captureFresh('a')).toBe('plan')
  expect(f.mode.capture('a')).toBe('plan')
  f.dispose()
})

test('disconnect masks selected mode and reconnect re-reads Host truth without navigation', async () => {
  const f = fixture()
  await Bun.sleep(1)
  expect(f.mode.capture('a')).toBe('default')
  f.connection(false)
  expect(f.entry()).toMatchObject({ mode: null, status: 'failed', error: 'DISCONNECTED' })
  f.values.set('a', 'plan') // changed during the disconnected interval: no mode.changed notification
  f.connection(true)
  for (let attempt = 0; attempt < 20 && f.entry()?.mode !== 'plan'; attempt++) await Bun.sleep(1)
  expect(f.entry()).toMatchObject({ mode: 'plan', status: 'ready' })
  f.dispose()
})

test('fresh mode read failure masks old ready state and prevents a send', async () => {
  const f = fixture()
  await Bun.sleep(1)
  expect(f.mode.capture('a')).toBe('default')
  f.failRead(true)
  await expect(f.mode.captureFresh('a')).rejects.toHaveProperty('code', 'DISCONNECTED')
  expect(f.entry()).toMatchObject({ mode: null, status: 'failed', error: 'DISCONNECTED' })
  expect(() => f.mode.capture('a')).toThrow()
  f.dispose()
})
