import { expect, test } from 'bun:test'
import { BrowserRuntime, browserConfigSchema } from '../plugins/browser-use/src/index.ts'
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
  async navigate(contextId: string, pageId: string, url: string) {
    const page = { url, title: 'Example' }
    this.pages.set(`${contextId}:${pageId}`, page)
    return page
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
