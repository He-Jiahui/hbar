import { expect, test } from 'bun:test'
import { createBrowserCommandClient } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { createBrowserCommands } from '@hbar/kernel'
import type { BrowserUseService } from '@hbar/plugin-sdk'
import type { ClientTransport } from '@hbar/client'

const page = {
  contextId: 'browser-context',
  pageId: 'browser-page',
  url: 'https://example.test/',
  title: 'Example',
}

function service(overrides: Partial<BrowserUseService> = {}): BrowserUseService {
  return {
    status: async () => ({ available: true, contexts: [page], history: [page.url] }),
    navigate: async () => page,
    snapshot: async () => ({ page, text: 'snapshot', truncated: false }),
    click: async () => page,
    type: async () => page,
    press: async () => page,
    screenshot: async () => ({ page, mime: 'image/png', data: 'iVBORw0KGgo=', truncated: false }),
    evaluate: async () => ({ value: 2 }),
    close: async () => ({ closed: true }),
    history: async () => [page.url],
    ...overrides,
  }
}

test('browser command adapter publishes typed queries and external actions', async () => {
  const commands = createBrowserCommands(service())
  try {
    expect(commands.list().items.map((item) => item.metadata.id)).toEqual([
      'browser.click',
      'browser.close',
      'browser.evaluate',
      'browser.history',
      'browser.navigate',
      'browser.press',
      'browser.screenshot',
      'browser.snapshot',
      'browser.status',
      'browser.type',
    ])
    expect(commands.describe('browser.navigate').metadata).toMatchObject({
      execution: 'host',
      kind: 'command',
      stateEffect: 'external',
      scope: 'session',
    })
    expect(await commands.execute('browser.status', { sessionId: 'session-1' })).toEqual({
      available: true,
      contexts: [page],
      history: [page.url],
    })
    expect(
      await commands.execute(
        'browser.navigate',
        { sessionId: 'session-1', url: page.url },
        { actorId: 'paired-device' },
      ),
    ).toEqual(page)
    expect(await commands.execute('browser.snapshot', { sessionId: 'session-1' })).toMatchObject({
      page,
      text: 'snapshot',
    })
    expect(await commands.execute('browser.history', { sessionId: 'session-1' })).toEqual([page.url])
    expect(await commands.execute('browser.close', { sessionId: 'session-1' })).toEqual({ closed: true })
  } finally {
    commands.dispose()
  }
})

test('browser external actions propagate cancellation and report an unknown result after entry', async () => {
  const entered = Promise.withResolvers<void>()
  let calls = 0
  let aborted = false
  const commands = createBrowserCommands(
    service({
      navigate(_sessionId, _url, _contextId, _pageId, signal) {
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
        'browser.navigate',
        { sessionId: 'session-1', url: page.url },
        { actorId: 'paired-device', signal: AbortSignal.abort() },
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(calls).toBe(0)

    const controller = new AbortController()
    const pending = commands.execute(
      'browser.navigate',
      { sessionId: 'session-1', url: page.url },
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

test('browser external actions treat backend and transport timeouts as unknown results', async () => {
  const commands = createBrowserCommands(
    service({
      navigate: async () => {
        throw new HbarError('BROWSER_TIMEOUT', 'backend timed out')
      },
    }),
  )
  try {
    await expect(
      commands.execute('browser.navigate', { sessionId: 'session-1', url: page.url }, { actorId: 'paired-device' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  } finally {
    commands.dispose()
  }

  const disconnected = {
    call: async () => {
      throw new HbarError('DISCONNECTED', 'lost response')
    },
  } as unknown as ClientTransport
  const client = createBrowserCommandClient(disconnected)
  await expect(client.execute('browser.navigate', { sessionId: 'session-1', url: page.url })).rejects.toMatchObject({
    code: 'RESULT_UNKNOWN',
  })
  await expect(client.execute('browser.status', { sessionId: 'session-1' })).rejects.toMatchObject({
    code: 'DISCONNECTED',
  })
})
