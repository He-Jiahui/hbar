import { expect, test } from 'bun:test'
import { HbarClient, createComputerCommandClient, type ClientTransport } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { createComputerCommands } from '@hbar/kernel'
import type { ComputerUseService } from '@hbar/plugin-sdk'

const screen = { width: 12, height: 8, mime: 'image/png', data: 'iVBORw0KGgo=' }
const accepted = (action: string) => ({ action, accepted: true })

function service(overrides: Partial<ComputerUseService> = {}): ComputerUseService {
  return {
    status: async () => ({ available: true, platform: 'test', appId: null }),
    screenshot: async () => screen,
    click: async () => accepted('click'),
    doubleClick: async () => accepted('double_click'),
    type: async () => accepted('type'),
    key: async () => accepted('key'),
    scroll: async () => accepted('scroll'),
    move: async () => accepted('move'),
    wait: async () => accepted('wait'),
    launch: async () => accepted('launch'),
    ...overrides,
  }
}

test('computer command adapter publishes typed queries and every managed desktop action', async () => {
  const commands = createComputerCommands(service())
  try {
    expect(commands.list().items.map((item) => item.metadata.id)).toEqual([
      'computer.click',
      'computer.doubleClick',
      'computer.key',
      'computer.launch',
      'computer.move',
      'computer.screenshot',
      'computer.scroll',
      'computer.status',
      'computer.type',
      'computer.wait',
    ])
    expect(commands.describe('computer.click').metadata).toMatchObject({
      execution: 'host',
      kind: 'command',
      stateEffect: 'external',
      scope: 'session',
    })
    expect(await commands.execute('computer.status', { sessionId: 'session-1' })).toEqual({
      available: true,
      platform: 'test',
      appId: null,
    })
    expect(await commands.execute('computer.screenshot', { sessionId: 'session-1' })).toEqual(screen)
    const actor = { actorId: 'paired-device' }
    expect(await commands.execute('computer.click', { sessionId: 'session-1', x: 1, y: 2 }, actor)).toEqual(
      accepted('click'),
    )
    expect(await commands.execute('computer.doubleClick', { sessionId: 'session-1', x: 3, y: 4 }, actor)).toEqual(
      accepted('double_click'),
    )
    expect(await commands.execute('computer.type', { sessionId: 'session-1', text: 'hello' }, actor)).toEqual(
      accepted('type'),
    )
    expect(await commands.execute('computer.key', { sessionId: 'session-1', key: 'Enter' }, actor)).toEqual(
      accepted('key'),
    )
    expect(await commands.execute('computer.scroll', { sessionId: 'session-1', deltaY: 20 }, actor)).toEqual(
      accepted('scroll'),
    )
    expect(await commands.execute('computer.move', { sessionId: 'session-1', x: 5, y: 6 }, actor)).toEqual(
      accepted('move'),
    )
    expect(await commands.execute('computer.wait', { sessionId: 'session-1', milliseconds: 1 }, actor)).toEqual(
      accepted('wait'),
    )
    expect(await commands.execute('computer.launch', { sessionId: 'session-1', appId: 'allowed.app' }, actor)).toEqual(
      accepted('launch'),
    )
  } finally {
    commands.dispose()
  }
})

test('computer actions propagate cancellation and report an unknown result after entry', async () => {
  const entered = Promise.withResolvers<void>()
  let calls = 0
  let aborted = false
  const commands = createComputerCommands(
    service({
      click(_sessionId, _x, _y, _appId, signal) {
        calls++
        entered.resolve()
        return new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              aborted = true
              reject(signal.reason)
            },
            { once: true },
          )
        })
      },
    }),
  )
  try {
    await expect(
      commands.execute(
        'computer.click',
        { sessionId: 'session-1', x: 1, y: 2 },
        { actorId: 'paired-device', signal: AbortSignal.abort() },
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(calls).toBe(0)

    const controller = new AbortController()
    const pending = commands.execute(
      'computer.click',
      { sessionId: 'session-1', x: 1, y: 2 },
      { actorId: 'paired-device', signal: controller.signal },
    )
    await entered.promise
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await Bun.sleep(0)
    expect(aborted).toBe(true)
  } finally {
    commands.dispose()
  }
})

test('computer actions treat backend and transport timeouts as unknown results', async () => {
  const commands = createComputerCommands(
    service({
      click: async () => {
        throw new HbarError('COMPUTER_TIMEOUT', 'backend timed out')
      },
    }),
  )
  try {
    await expect(
      commands.execute('computer.click', { sessionId: 'session-1', x: 1, y: 2 }, { actorId: 'paired-device' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  } finally {
    commands.dispose()
  }

  const disconnected = {
    call: async () => {
      throw new HbarError('DISCONNECTED', 'lost response')
    },
  } as unknown as ClientTransport
  const client = createComputerCommandClient(disconnected)
  await expect(client.execute('computer.click', { sessionId: 'session-1', x: 1, y: 2 })).rejects.toMatchObject({
    code: 'RESULT_UNKNOWN',
  })
  await expect(client.execute('computer.status', { sessionId: 'session-1' })).rejects.toMatchObject({
    code: 'DISCONNECTED',
  })
})

test('computer client rejects an already aborted request before transport admission', async () => {
  const transport = new HbarClient('http://127.0.0.1:1')
  const client = createComputerCommandClient(transport)
  await expect(
    client.execute('computer.click', { sessionId: 'session-1', x: 1, y: 2 }, { signal: AbortSignal.abort() }),
  ).rejects.toMatchObject({ code: 'CANCELLED' })
})

test('computer client aborts observation after dispatch with an unknown outcome', async () => {
  const entered = Promise.withResolvers<void>()
  let effects = 0
  const transport: ClientTransport = {
    call(_method, _params, options) {
      if (options?.signal?.aborted) return Promise.reject(new HbarError('CANCELLED', 'Not dispatched'))
      effects++
      entered.resolve()
      return new Promise<never>((_resolve, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => reject(new HbarError('RESULT_UNKNOWN', 'Observation ended; inspect state')),
          { once: true },
        )
      })
    },
  }
  const controller = new AbortController()
  const client = createComputerCommandClient(transport)
  const pending = client.execute(
    'computer.click',
    { sessionId: 'session-1', x: 1, y: 2 },
    { signal: controller.signal },
  )
  await entered.promise
  controller.abort()
  await expect(pending).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(effects).toBe(1)
})
