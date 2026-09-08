import { expect, test } from 'bun:test'
import { ComputerRuntime, computerConfigSchema } from '../plugins/computer-use/src/index.ts'
import type { ComputerBackend } from '../plugins/computer-use/src/index.ts'
import type { HbarAPI } from '@hbar/plugin-sdk'

function fakeApi() {
  const notifications: unknown[] = []
  return {
    api: {
      sessions: { get: async () => ({ id: 'session-1' }) },
      notify: (event: unknown) => notifications.push(event),
      changed: () => {},
    } as unknown as HbarAPI,
    notifications,
  }
}

class FakeComputer implements ComputerBackend {
  actions: string[] = []
  available() { return true }
  async screenshot() { return { width: 12, height: 8, mime: 'image/png', data: 'iVBORw0KGgo=' } }
  async click() { this.actions.push('click') }
  async doubleClick() { this.actions.push('double_click') }
  async type() { this.actions.push('type') }
  async key() { this.actions.push('key') }
  async scroll() { this.actions.push('scroll') }
  async move() { this.actions.push('move') }
  async launch() { this.actions.push('launch') }
}

test('computer runtime gates desktop actions by the Codex app policy', async () => {
  const { api, notifications } = fakeApi()
  const backend = new FakeComputer()
  const runtime = new ComputerRuntime(
    api,
    computerConfigSchema.parse({ default_app_access: 'deny', windows: { aumids: { 'allowed.app': 'allow' }, exes: [] } }),
    backend,
  )
  expect((await runtime.status('session-1')).available).toBeTrue()
  expect((await runtime.screenshot('session-1', 'allowed.app')).width).toBe(12)
  await runtime.click('session-1', 1, 2, 'allowed.app')
  await runtime.doubleClick('session-1', 1, 2, 'allowed.app')
  await runtime.type('session-1', 'hello', 'allowed.app')
  await runtime.key('session-1', 'Enter', 'allowed.app')
  await runtime.scroll('session-1', 0, 20, 'allowed.app')
  await runtime.move('session-1', 4, 6, 'allowed.app')
  await runtime.launch('session-1', 'allowed.app')
  expect(backend.actions).toEqual(['click', 'double_click', 'type', 'key', 'scroll', 'move', 'launch'])
  expect(notifications.length).toBeGreaterThan(0)
  try {
    await runtime.click('session-1', 1, 2, 'blocked.app')
    throw new Error('expected app policy denial')
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain('denied')
  }
})

test('computer wait observes cancellation without leaving a successful action', async () => {
  const { api } = fakeApi()
  const runtime = new ComputerRuntime(api, computerConfigSchema.parse({}), new FakeComputer())
  const controller = new AbortController()
  const waiting = runtime.wait('session-1', 60_000, undefined, controller.signal)
  controller.abort(new Error('stop'))
  try {
    await waiting
    throw new Error('expected wait cancellation')
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain('stop')
  }
})

test('computer actions enforce the configured timeout when a backend ignores cancellation', async () => {
  const { api } = fakeApi()
  let aborted = false
  const backend = new FakeComputer() as unknown as ComputerBackend
  backend.click = async (_x: number, _y: number, _appId: string | undefined, signal: AbortSignal) => {
    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => {
        aborted = true
        resolve()
      }, { once: true })
    })
  }
  const runtime = new ComputerRuntime(
    api,
    computerConfigSchema.parse({ timeoutMs: 10, default_app_access: 'allow' }),
    backend,
  )
  try {
    await runtime.click('session-1', 1, 2)
    throw new Error('expected timeout')
  } catch (error) {
    expect((error as { code?: string }).code).toBe('COMPUTER_TIMEOUT')
  }
  expect(aborted).toBeTrue()
})
