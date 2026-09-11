import { expect, test } from 'bun:test'
import {
  BrowserRuntime,
  FetchBrowserBackend,
  PlaywrightBrowserBackend,
  browserConfigSchema,
} from '../plugins/browser-use/src/index.ts'
import type { BrowserBackend, BrowserBackendPage } from '../plugins/browser-use/src/index.ts'
import type { HbarAPI } from '@hbar/plugin-sdk'

function fakeApi() {
  const notifications: unknown[] = []
  const api = {
    sessions: { get: async () => ({ id: 'session-1' }) },
    notify: (event: unknown) => notifications.push(event),
    changed: () => {},
  } as unknown as HbarAPI
  return { api, notifications }
}

class FakeBrowser implements BrowserBackend {
  pages = new Map<string, BrowserBackendPage>()
  actions: string[] = []
  available() { return true }
  async navigate(contextId: string, pageId: string, url: string, _signal: AbortSignal) {
    const page = { url, title: 'Example' }
    this.pages.set(`${contextId}:${pageId}`, page)
    return page
  }
  async go(contextId: string, pageId: string, action: 'back' | 'forward' | 'reload') {
    this.actions.push(action)
    return this.pages.get(`${contextId}:${pageId}`)!
  }
  async snapshot(contextId: string, pageId: string) {
    if (!this.pages.has(`${contextId}:${pageId}`)) throw new Error('missing')
    return { text: 'snapshot text' }
  }
  async click(contextId: string, pageId: string) { this.actions.push('click'); return this.pages.get(`${contextId}:${pageId}`)! }
  async type(contextId: string, pageId: string) { this.actions.push('type'); return this.pages.get(`${contextId}:${pageId}`)! }
  async press(contextId: string, pageId: string) { this.actions.push('press'); return this.pages.get(`${contextId}:${pageId}`)! }
  async screenshot() { return { mime: 'image/png', data: 'iVBORw0KGgo=' } }
  async evaluate() { this.actions.push('evaluate'); return { ok: true } }
  async close(contextId: string, pageId?: string) {
    if (pageId) this.pages.delete(`${contextId}:${pageId}`)
  }
  async history() { return ['https://allowed.example/'] }
}

test('browser runtime enforces origin and CDP policy while keeping bounded state', async () => {
  const { api, notifications } = fakeApi()
  const backend = new FakeBrowser()
  const config = browserConfigSchema.parse({
    allow_history_access: true,
    default_origin_policy: { access: 'deny' },
    origins: { 'https://allowed.example': { access: 'allow', full_cdp_access: 'allow' } },
  })
  const runtime = new BrowserRuntime(api, config, backend)
  const page = await runtime.navigate('session-1', 'https://allowed.example/start')
  expect(page.url).toBe('https://allowed.example/start')
  expect((await runtime.snapshot('session-1')).text).toBe('snapshot text')
  await runtime.click('session-1', '#submit')
  await runtime.type('session-1', '#name', 'hbar')
  await runtime.press('session-1', 'Enter')
  await runtime.go('session-1', 'reload')
  expect(backend.actions).toContain('reload')
  expect(await runtime.evaluate('session-1', '1 + 1')).toEqual({ value: { ok: true } })
  expect((await runtime.history('session-1'))).toContain('https://allowed.example/')
  expect(notifications.length).toBeGreaterThan(0)
  try {
    await runtime.navigate('session-1', 'https://blocked.example/')
    throw new Error('expected origin denial')
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain('denied')
  }
})

test('browser runtime refuses history and full CDP by default', async () => {
  const { api } = fakeApi()
  const runtime = new BrowserRuntime(api, browserConfigSchema.parse({}), new FakeBrowser())
  await runtime.navigate('session-1', 'https://example.test/')
  expect((await runtime.status('session-1')).history).toEqual([])
  try {
    await runtime.history('session-1')
    throw new Error('expected history denial')
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain('history')
  }
  try {
    await runtime.evaluate('session-1', 'document.body')
    throw new Error('expected CDP denial')
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain('denied')
  }
})

test('fetch browser preserves per-page back, forward, and reload navigation', async () => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      return new Response(`<title>${path}</title><main>Page ${path}</main>`, {
        headers: { 'Content-Type': 'text/html' },
      })
    },
  })
  try {
    const { api } = fakeApi()
    const runtime = new BrowserRuntime(
      api,
      browserConfigSchema.parse({ allow_history_access: true, default_origin_policy: { access: 'allow' } }),
      new FetchBrowserBackend(),
    )
    const first = await runtime.navigate('session-1', `http://127.0.0.1:${server.port}/one`)
    await runtime.navigate('session-1', `http://127.0.0.1:${server.port}/two`, first.contextId, first.pageId)
    expect((await runtime.go('session-1', 'back')).url).toEndWith('/one')
    expect((await runtime.snapshot('session-1')).text).toContain('Page /one')
    expect((await runtime.go('session-1', 'forward')).url).toEndWith('/two')
    expect((await runtime.go('session-1', 'reload')).url).toEndWith('/two')
  } finally {
    await server.stop(true)
  }
})

test('browser origin policies prefer exact origins over wildcard entries', () => {
  const { api } = fakeApi()
  const runtime = new BrowserRuntime(
    api,
    browserConfigSchema.parse({
      default_origin_policy: { access: 'deny' },
      origins: {
        '*': { access: 'deny' },
        'https://*.example.test': { access: 'ask' },
        'https://app.example.test': { access: 'allow' },
      },
    }),
    new FakeBrowser(),
  )
  expect(runtime.authorizeOrigin('https://app.example.test/').requirement).toBe('allow')
  expect(runtime.authorizeOrigin('https://other.example.test/').requirement).toBe('ask')
})

test('browser operations enforce timeout even when a backend ignores cancellation', async () => {
  const { api } = fakeApi()
  let aborted = false
  class ObservingBrowser extends FakeBrowser {
    override async navigate(_contextId: string, _pageId: string, _url: string, signal: AbortSignal) {
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          aborted = true
          resolve()
        }, { once: true })
      })
      return { url: 'https://example.test/', title: 'Example' }
    }
  }
  const backend = new ObservingBrowser()
  const runtime = new BrowserRuntime(
    api,
    browserConfigSchema.parse({ timeoutMs: 10, default_origin_policy: { access: 'allow' } }),
    backend,
  )
  try {
    await runtime.navigate('session-1', 'https://example.test/')
    throw new Error('expected timeout')
  } catch (error) {
    expect((error as { code?: string }).code).toBe('BROWSER_TIMEOUT')
  }
  expect(aborted).toBeTrue()
})

test('playwright backend reports a missing browser executable explicitly', async () => {
  const backend = new PlaywrightBrowserBackend({
    headless: true,
    executablePath: 'C:/hbar/missing-playwright-browser.exe',
    timeoutMs: 10,
  })
  expect(await backend.available()).toBeFalse()
  try {
    await backend.navigate('context', 'page', 'https://example.test/', new AbortController().signal)
    throw new Error('expected unavailable backend')
  } catch (error) {
    expect((error as { code?: string }).code).toBe('BROWSER_BACKEND_UNAVAILABLE')
  }
})
