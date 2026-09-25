import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient, type CommandExecutor } from '@hbar/commands'
import type { Session } from '@hbar/contracts/directory'
import { createState } from '../packages/app-runtime/src/state'
import {
  createSessionMessageForkNavigation,
  messageForkActionKey,
  sessionMessageForkCommands,
} from '../packages/app-runtime/src/session-message-fork-navigation'
import type { NavigationState } from '../packages/app-runtime/src/types'
import type { SessionTabRef, WorkspaceTabsState } from '../packages/app-runtime/src/workspace-tabs-runtime'

const sourceKey = '11111111-1111-4111-8111-111111111111'
const nextKey = '22222222-2222-4222-8222-222222222222'
const source: Session = {
  id: 'source',
  workspaceId: 'workspace',
  title: 'Source',
  parentId: null,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}
const child: Session = { ...source, id: 'child', title: 'Child', parentId: source.id }
const tab = (id: string, instanceKey = crypto.randomUUID()): SessionTabRef => ({
  kind: 'session',
  id,
  sessionId: id,
  workspaceId: source.workspaceId,
  instanceKey,
})
const target = { sessionId: source.id, messageId: 'message-1', sourceTabInstanceKey: sourceKey }
function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
function fixture(config?: {
  count?: number
  fork?: (key: string) => Promise<unknown>
  receipt?: (key: string) => Promise<unknown>
  eligibility?: (ids: readonly string[]) => Promise<unknown>
  select?: () => Promise<void>
}) {
  let disposed = false
  let writes = 0
  let reads = 0
  const writeKeys: string[] = []
  const receiptKeys: string[] = []
  const reservations = new Set<string>()
  const tabs = createState<WorkspaceTabsState>(
    {
      items: [
        tab(source.id, sourceKey),
        ...Array.from({ length: (config?.count ?? 1) - 1 }, (_, index) => tab(`other-${index}`)),
      ],
      activeId: source.id,
      revision: 1,
      restoreStatus: 'ready',
      restoreError: null,
      persistError: null,
    },
    () => {},
  )
  const navigation = createState<NavigationState>(
    {
      workspaceId: source.workspaceId,
      sessionId: source.id,
      status: 'idle',
      error: null,
    },
    () => {},
  )
  const host: CommandExecutor = {
    execute(name, input, options) {
      const request = input as { sessionId: string; messageId?: string; messageIds?: string[]; idempotencyKey?: string }
      if (name === 'session.forkableMessages') {
        reads++
        return (
          config?.eligibility?.(request.messageIds ?? []) ??
          Promise.resolve({
            sessionId: request.sessionId,
            items: (request.messageIds ?? []).map((messageId) => ({ messageId, eligible: true, reason: 'ready' })),
          })
        )
      }
      if (name === 'session.forkFromMessage') {
        writes++
        writeKeys.push(options?.idempotencyKey ?? '')
        return config?.fork?.(options?.idempotencyKey ?? '') ?? Promise.resolve(child)
      }
      if (name === 'session.forkFromMessageReceipt') {
        receiptKeys.push(request.idempotencyKey ?? '')
        return config?.receipt?.(request.idempotencyKey ?? '') ?? Promise.resolve(child)
      }
      throw new Error(`Unexpected Host command ${name}`)
    },
  }
  const directory: CommandExecutor = {
    execute(name, input) {
      if (name !== 'session.get') throw new Error(`Unexpected directory command ${name}`)
      const requested = input as { sessionId: string }
      return Promise.resolve(requested.sessionId === source.id ? source : null)
    },
  }
  const local = new CommandRegistry({ execution: 'client' })
  const selects: string[] = []
  const feature = createSessionMessageForkNavigation(local, {
    workspaces: host,
    directory,
    tabs: {
      reader: tabs.reader,
      hooks: {
        reserveCreation(key) {
          if (tabs.reader.getSnapshot().items.length + reservations.size >= 32)
            throw new CommandError('TAB_LIMIT', '32 tabs already open')
          reservations.add(key)
        },
        commitCreation(key, session) {
          if (!reservations.has(key)) throw new CommandError('INVALID_OUTPUT', 'Reservation missing')
          reservations.delete(key)
          const snapshot = tabs.reader.getSnapshot()
          if (!snapshot.items.some((item) => item.id === session.id))
            tabs.replace({ ...snapshot, items: [...snapshot.items, tab(session.id)], revision: snapshot.revision + 1 })
        },
        settleCreation(key, uncertain) {
          if (!uncertain) reservations.delete(key)
        },
      },
    },
    navigation: navigation.reader,
    async selectSession(sessionId, workspaceId) {
      selects.push(sessionId)
      await config?.select?.()
      const current = navigation.reader.getSnapshot()
      navigation.replace({ ...current, sessionId, workspaceId, status: 'idle' })
      tabs.replace({ ...tabs.reader.getSnapshot(), activeId: sessionId })
    },
    isDisposed: () => disposed,
    onSubscriberError: () => {},
  })
  const commands = createCommandClient(sessionMessageForkCommands, local)
  return {
    commands,
    feature,
    tabs,
    navigation,
    reservations,
    selects,
    writeKeys,
    receiptKeys,
    get writes() {
      return writes
    },
    get reads() {
      return reads
    },
    dispose() {
      disposed = true
      feature.dispose()
      local.dispose()
      tabs.dispose()
      navigation.dispose()
    },
  }
}

test('completed target reserves one slot and opens the verified child; duplicate action never writes again', async () => {
  const setup = fixture()
  try {
    expect(await setup.commands.execute('messageFork.submit', target)).toEqual({
      childSessionId: child.id,
      navigated: true,
    })
    expect(setup.writes).toBe(1)
    expect(setup.writeKeys[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(setup.reservations.size).toBe(0)
    expect(setup.tabs.reader.getSnapshot().items.map((item) => item.id)).toEqual([source.id, child.id])
    expect(setup.selects).toEqual([child.id])
    expect(setup.feature.reader.getSnapshot().actions[messageForkActionKey(target)]?.status).toBe('created')
    await expect(setup.commands.execute('messageFork.submit', target)).rejects.toMatchObject({ code: 'BUSY' })
    expect(setup.writes).toBe(1)
  } finally {
    setup.dispose()
  }
})

test('32-tab preflight fails before any Host read or write, and a pending target rejects a second submit', async () => {
  const full = fixture({ count: 32 })
  try {
    await expect(full.commands.execute('messageFork.submit', target)).rejects.toMatchObject({ code: 'TAB_LIMIT' })
    expect(full.writes).toBe(0)
    expect(full.reads).toBe(0)
    expect(full.feature.reader.getSnapshot().actions[messageForkActionKey(target)]).toMatchObject({
      status: 'failed',
      error: 'TAB_LIMIT',
    })
  } finally {
    full.dispose()
  }
  const pending = deferred<unknown>()
  const setup = fixture({ fork: () => pending.promise })
  try {
    const first = setup.commands.execute('messageFork.submit', target)
    while (setup.writes === 0) await Bun.sleep(1)
    await expect(setup.commands.execute('messageFork.submit', target)).rejects.toMatchObject({ code: 'BUSY' })
    pending.resolve(child)
    await first
    expect(setup.writes).toBe(1)
  } finally {
    setup.dispose()
  }
})

test('lost reply holds the exact key; read-only null stays unknown, later receipt creates once without a write', async () => {
  let receipt: unknown = null
  const setup = fixture({
    fork: () => Promise.reject(new CommandError('RESULT_UNKNOWN', 'Reply lost')),
    receipt: () => Promise.resolve(receipt),
  })
  try {
    await expect(setup.commands.execute('messageFork.submit', target)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(setup.reservations.size).toBe(1)
    const key = setup.writeKeys[0]!
    expect(
      await setup.commands.execute('messageFork.reconcile', { sessionId: source.id, messageId: target.messageId }),
    ).toEqual({
      status: 'unknown',
      childSessionId: null,
      navigated: false,
    })
    expect(setup.reservations.has(key)).toBe(true)
    expect(setup.receiptKeys).toEqual([key])
    await expect(setup.commands.execute('messageFork.submit', target)).rejects.toMatchObject({ code: 'BUSY' })
    receipt = child
    expect(
      await setup.commands.execute('messageFork.reconcile', { sessionId: source.id, messageId: target.messageId }),
    ).toEqual({
      status: 'created',
      childSessionId: child.id,
      navigated: true,
    })
    expect(setup.receiptKeys).toEqual([key, key])
    expect(setup.reservations.size).toBe(0)
    expect(setup.writes).toBe(1)
  } finally {
    setup.dispose()
  }
})

test('late success or confirmed receipt after source reopens never steals a newer navigation target', async () => {
  const pending = deferred<unknown>()
  const setup = fixture({ fork: () => pending.promise })
  try {
    const first = setup.commands.execute('messageFork.submit', target)
    while (setup.writes === 0) await Bun.sleep(1)
    setup.navigation.replace({ workspaceId: source.workspaceId, sessionId: 'other', status: 'idle', error: null })
    setup.tabs.replace({ ...setup.tabs.reader.getSnapshot(), activeId: 'other' })
    pending.resolve(child)
    expect(await first).toEqual({ childSessionId: child.id, navigated: false })
    expect(setup.selects).toEqual([])
    expect(setup.tabs.reader.getSnapshot().items.some((item) => item.id === child.id)).toBe(true)
  } finally {
    setup.dispose()
  }

  let receipt: unknown = null
  const reopened = fixture({
    fork: () => Promise.reject(new CommandError('RESULT_UNKNOWN', 'Reply lost')),
    receipt: () => Promise.resolve(receipt),
  })
  try {
    await expect(reopened.commands.execute('messageFork.submit', target)).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    const originalKey = reopened.writeKeys[0]!
    reopened.tabs.replace({
      ...reopened.tabs.reader.getSnapshot(),
      items: [tab(source.id, nextKey)],
      activeId: source.id,
    })
    reopened.navigation.replace({ workspaceId: source.workspaceId, sessionId: source.id, status: 'idle', error: null })
    receipt = child
    expect(
      await reopened.commands.execute('messageFork.reconcile', { sessionId: source.id, messageId: target.messageId }),
    ).toEqual({
      status: 'created',
      childSessionId: child.id,
      navigated: false,
    })
    expect(reopened.receiptKeys).toEqual([originalKey])
    expect(reopened.tabs.reader.getSnapshot().activeId).toBe(source.id)
    expect(reopened.tabs.reader.getSnapshot().items.some((item) => item.id === child.id)).toBe(true)
    expect(reopened.reservations.size).toBe(0)
    expect(reopened.writes).toBe(1)
  } finally {
    reopened.dispose()
  }
})

test('navigation failure after confirmed child is created status, not a false failed Fork', async () => {
  const setup = fixture({ select: () => Promise.reject(new Error('Router unavailable')) })
  try {
    expect(await setup.commands.execute('messageFork.submit', target)).toEqual({
      childSessionId: child.id,
      navigated: false,
    })
    expect(setup.feature.reader.getSnapshot().actions[messageForkActionKey(target)]).toMatchObject({
      status: 'created',
      childSessionId: child.id,
      error: null,
    })
    expect(setup.tabs.reader.getSnapshot().items.some((item) => item.id === child.id)).toBe(true)
  } finally {
    setup.dispose()
  }
})

test('invalid Host child identity remains uncertain with original key; read-only reconciliation cannot forge success', async () => {
  const setup = fixture({
    fork: () => Promise.resolve({ ...child, parentId: 'wrong-source' }),
    receipt: () => Promise.resolve({ ...child, parentId: 'wrong-source' }),
  })
  try {
    await expect(setup.commands.execute('messageFork.submit', target)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    const entry = setup.feature.reader.getSnapshot().actions[messageForkActionKey(target)]
    expect(entry).toMatchObject({ status: 'unknown', error: 'INVALID_OUTPUT', childSessionId: null })
    expect(setup.reservations.has(entry!.idempotencyKey)).toBe(true)
    await expect(
      setup.commands.execute('messageFork.reconcile', { sessionId: source.id, messageId: target.messageId }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(setup.writes).toBe(1)
    expect(setup.tabs.reader.getSnapshot().items).toHaveLength(1)
  } finally {
    setup.dispose()
  }
})

test('reconciliation is single-flight and never turns a missing receipt into a new write', async () => {
  const pending = deferred<unknown>()
  const setup = fixture({
    fork: () => Promise.reject(new CommandError('RESULT_UNKNOWN', 'Reply lost')),
    receipt: () => pending.promise,
  })
  try {
    await expect(setup.commands.execute('messageFork.submit', target)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    const input = { sessionId: source.id, messageId: target.messageId }
    const first = setup.commands.execute('messageFork.reconcile', input)
    await expect(setup.commands.execute('messageFork.reconcile', input)).rejects.toMatchObject({ code: 'BUSY' })
    pending.resolve(null)
    expect((await first).status).toBe('unknown')
    expect(setup.writes).toBe(1)
    expect(setup.reservations.size).toBe(1)
  } finally {
    setup.dispose()
  }
})

test('definitive Host rejection frees capacity and can explicitly retry with a fresh key', async () => {
  let fail = true
  const setup = fixture({
    fork: () =>
      fail ? Promise.reject(new CommandError('INVALID_TARGET', 'Source message changed')) : Promise.resolve(child),
  })
  try {
    await expect(setup.commands.execute('messageFork.submit', target)).rejects.toMatchObject({ code: 'INVALID_TARGET' })
    const firstKey = setup.writeKeys[0]
    expect(setup.reservations.size).toBe(0)
    expect(setup.feature.reader.getSnapshot().actions[messageForkActionKey(target)]).toMatchObject({
      status: 'failed',
      error: 'INVALID_TARGET',
    })
    fail = false
    expect(await setup.commands.execute('messageFork.submit', target)).toEqual({
      childSessionId: child.id,
      navigated: true,
    })
    expect(setup.writeKeys[1]).not.toBe(firstKey)
  } finally {
    setup.dispose()
  }
})

test('eligibility cache merges bounded pages by cursor, rejects stale responses and never confuses sessions', async () => {
  const delayed = deferred<unknown>()
  const setup = fixture({
    eligibility: (ids) =>
      ids[0] === 'old'
        ? delayed.promise
        : Promise.resolve({
            sessionId: source.id,
            items: ids.map((messageId) => ({ messageId, eligible: true, reason: 'ready' })),
          }),
  })
  try {
    const old = setup.commands.execute('messageFork.refreshEligibility', {
      sessionId: source.id,
      cursor: 1,
      messageIds: ['old'],
    })
    await setup.commands.execute('messageFork.refreshEligibility', {
      sessionId: source.id,
      cursor: 2,
      messageIds: ['new'],
    })
    delayed.resolve({ sessionId: source.id, items: [{ messageId: 'old', eligible: true, reason: 'ready' }] })
    await expect(old).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    expect(setup.feature.reader.getSnapshot().eligibility).toMatchObject({
      sessionId: source.id,
      cursor: 2,
      items: { new: { eligible: true, reason: 'ready' } },
    })
    expect(setup.feature.reader.getSnapshot().eligibility.items.old).toBeUndefined()
    setup.navigation.replace({ workspaceId: source.workspaceId, sessionId: 'other', status: 'idle', error: null })
    await expect(
      setup.commands.execute('messageFork.refreshEligibility', {
        sessionId: source.id,
        cursor: 3,
        messageIds: ['new'],
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  } finally {
    setup.dispose()
  }
})

test('eligibility cache retains at most the timeline capacity across six independent 200-ID pages', async () => {
  const setup = fixture()
  try {
    for (let page = 0; page < 6; page++) {
      const ids = Array.from({ length: 200 }, (_, index) => `message-${page * 200 + index}`)
      expect(
        (
          await setup.commands.execute('messageFork.refreshEligibility', {
            sessionId: source.id,
            cursor: 3,
            messageIds: ids,
          })
        ).count,
      ).toBe(200)
    }
    expect(Object.keys(setup.feature.reader.getSnapshot().eligibility.items)).toHaveLength(1_000)
    expect(setup.feature.reader.getSnapshot().eligibility.items['message-0']).toBeUndefined()
    expect(setup.feature.reader.getSnapshot().eligibility.items['message-1199']).toMatchObject({ eligible: true })
  } finally {
    setup.dispose()
  }
})
