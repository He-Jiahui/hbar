import { z } from 'zod'
import {
  HbarError,
  browserPageSchema,
  browserScreenshotSchema,
  browserSnapshotSchema,
  browserUseConfigSchema,
} from '@hbar/contracts'
import type {
  BrowserPage,
  BrowserSnapshot,
  BrowserUseConfig as ContractBrowserConfig,
} from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { BrowserUseService, HbarAPI, ToolDefinition } from '@hbar/plugin-sdk'

const MAX_CONTEXTS = 8
const MAX_PAGES = 16
const MAX_SNAPSHOT = 256_000
const MAX_SCREENSHOT = 2_000_000

export const browserConfigSchema = browserUseConfigSchema.extend({
  maxContexts: z.number().int().positive().max(MAX_CONTEXTS).default(4),
  maxPagesPerContext: z.number().int().positive().max(MAX_PAGES).default(8),
  maxSnapshotChars: z.number().int().positive().max(MAX_SNAPSHOT).default(MAX_SNAPSHOT),
  maxScreenshotBytes: z.number().int().positive().max(MAX_SCREENSHOT).default(MAX_SCREENSHOT),
  timeoutMs: z.number().int().positive().max(120_000).default(30_000),
})
export type BrowserConfig = z.infer<typeof browserConfigSchema>

export interface BrowserBackendPage {
  url: string
  title: string
}

export interface BrowserBackend {
  available(): boolean | Promise<boolean>
  navigate(contextId: string, pageId: string, url: string, signal: AbortSignal): Promise<BrowserBackendPage>
  snapshot(contextId: string, pageId: string, signal: AbortSignal): Promise<{ text: string }>
  click(contextId: string, pageId: string, selector: string, signal: AbortSignal): Promise<BrowserBackendPage>
  type(contextId: string, pageId: string, selector: string, text: string, signal: AbortSignal): Promise<BrowserBackendPage>
  press(contextId: string, pageId: string, key: string, selector: string | undefined, signal: AbortSignal): Promise<BrowserBackendPage>
  screenshot(contextId: string, pageId: string, fullPage: boolean, signal: AbortSignal): Promise<{ mime: string; data: string }>
  evaluate(contextId: string, pageId: string, expression: string, signal: AbortSignal): Promise<unknown>
  close(contextId: string, pageId?: string, signal?: AbortSignal): Promise<void>
  history(contextId: string): Promise<string[]>
}

function unavailable(operation: string): never {
  throw new HbarError('BROWSER_BACKEND_UNAVAILABLE', `${operation} requires an installed browser backend`)
}

function textFromHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

async function responseText(response: Response, limit: number) {
  if (!response.body) return { text: await response.text(), truncated: false }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let truncated = false
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      text += decoder.decode(next.value, { stream: true })
      if (text.length > limit) {
        text = text.slice(0, limit)
        truncated = true
        await reader.cancel()
        break
      }
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  return { text, truncated }
}

/** A useful no-dependency backend for navigation and text snapshots. */
export class FetchBrowserBackend implements BrowserBackend {
  private pages = new Map<string, { url: string; title: string; text: string }>()
  private histories = new Map<string, string[]>()
  available() {
    return true
  }
  async navigate(contextId: string, pageId: string, url: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const response = await fetch(url, { signal, redirect: 'follow' })
    const body = await responseText(response, MAX_SNAPSHOT)
    signal.throwIfAborted()
    const html = body.text
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
    const page = { url: response.url || url, title, text: textFromHtml(html) }
    this.pages.set(`${contextId}:${pageId}`, page)
    const history = this.histories.get(contextId) ?? []
    this.histories.set(contextId, [...history.filter((entry) => entry !== page.url), page.url].slice(-100))
    return { url: page.url, title: page.title }
  }
  async snapshot(contextId: string, pageId: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const page = this.pages.get(`${contextId}:${pageId}`)
    if (!page) throw new HbarError('BROWSER_PAGE_NOT_FOUND', 'Navigate a page before requesting a snapshot')
    return { text: page.text }
  }
  click() { return unavailable('Click') }
  type() { return unavailable('Typing') }
  press() { return unavailable('Key presses') }
  screenshot() { return unavailable('Screenshots') }
  evaluate() { return unavailable('Evaluation') }
  async close(contextId: string, pageId?: string) {
    if (pageId) this.pages.delete(`${contextId}:${pageId}`)
    else for (const key of this.pages.keys()) if (key.startsWith(`${contextId}:`)) this.pages.delete(key)
    if (!pageId) this.histories.delete(contextId)
  }
  async history(contextId: string) {
    return [...(this.histories.get(contextId) ?? [])]
  }
}

let backendFactory: () => BrowserBackend = () => new FetchBrowserBackend()
export function setBrowserBackendFactory(factory: () => BrowserBackend) {
  backendFactory = factory
}

type OriginCapability = 'access' | 'downloads' | 'uploads' | 'full_cdp_access'

function validUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new HbarError('BROWSER_INVALID_URL', 'Browser URLs must be valid absolute URLs')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new HbarError('BROWSER_INVALID_URL', 'Only credential-free HTTP(S) URLs are allowed')
  return url
}

function originMatches(pattern: string, origin: string) {
  if (pattern === '*' || pattern === origin) return true
  try {
    const expected = new URL(pattern)
    const actual = new URL(origin)
    if (expected.protocol !== actual.protocol) return false
    const host = expected.hostname
    return host.startsWith('*.')
      ? (actual.hostname === host.slice(2) || actual.hostname.endsWith(`.${host.slice(2)}`))
      : expected.hostname === actual.hostname && expected.port === actual.port
  } catch {
    return false
  }
}

function policyValue(config: BrowserConfig, origin: string, capability: OriginCapability) {
  const matching = Object.entries(config.origins).find(([pattern]) => originMatches(pattern, origin))?.[1]
  const fallback = config.default_origin_policy as ContractBrowserConfig['default_origin_policy']
  return matching?.[capability] ?? fallback[capability] ?? (capability === 'full_cdp_access' ? 'deny' : 'ask')
}

interface PageState extends BrowserPage {
  sessionId: string
}

export class BrowserRuntime implements BrowserUseService {
  private contexts = new Map<string, Map<string, Map<string, PageState>>>()
  constructor(
    private readonly api: HbarAPI,
    private readonly config: BrowserConfig,
    private readonly backend: BrowserBackend = backendFactory(),
  ) {}

  private async session(sessionId: string) {
    await this.api.sessions.get(sessionId)
  }

  private async context(sessionId: string, requested?: string) {
    await this.session(sessionId)
    const sessions = this.contexts.get(sessionId) ?? new Map<string, Map<string, PageState>>()
    this.contexts.set(sessionId, sessions)
    const contextId = requested ?? `browser-${crypto.randomUUID()}`
    let pages = sessions.get(contextId)
    if (!pages) {
      if (sessions.size >= this.config.maxContexts) throw new HbarError('BROWSER_CONTEXT_LIMIT', 'Browser context limit reached')
      pages = new Map()
      sessions.set(contextId, pages)
    }
    return { sessions, contextId, pages }
  }

  private page(sessionId: string, contextId: string | undefined, pageId: string | undefined) {
    const sessions = this.contexts.get(sessionId)
    const pages = contextId ? sessions?.get(contextId) : sessions ? [...sessions.values()].at(-1) : undefined
    if (!pages) throw new HbarError('BROWSER_PAGE_NOT_FOUND', 'Browser context not found')
    const state = pageId ? pages.get(pageId) : [...pages.values()].at(-1)
    if (!state) throw new HbarError('BROWSER_PAGE_NOT_FOUND', 'Browser page not found')
    return { contextId: state.contextId, pages, state }
  }

  authorizeOrigin(value: string, capability: OriginCapability = 'access') {
    const url = validUrl(value)
    const requirement = policyValue(this.config, url.origin, capability)
    if (requirement === 'deny') throw new HbarError('BROWSER_ORIGIN_DENIED', `${capability} is denied for ${url.origin}`)
    return { url, requirement }
  }

  async status(sessionId: string) {
    await this.session(sessionId)
    const sessions = this.contexts.get(sessionId) ?? new Map<string, Map<string, PageState>>()
    const contexts = [...sessions.values()].flatMap((pages) => [...pages.values()].map(({ sessionId: _sessionId, ...page }) => page))
    const history = [...new Set((await Promise.all([...sessions.keys()].map((id) => this.backend.history(id)))).flat())].slice(-100)
    return { available: await this.backend.available(), contexts, history }
  }

  async navigate(sessionId: string, value: string, requestedContext?: string, requestedPage?: string, signal = new AbortController().signal) {
    const { url } = this.authorizeOrigin(value)
    const { sessions, contextId, pages } = await this.context(sessionId, requestedContext)
    if (requestedPage && !pages.has(requestedPage)) throw new HbarError('BROWSER_PAGE_NOT_FOUND', 'Browser page not found')
    if (!requestedPage && pages.size >= this.config.maxPagesPerContext) throw new HbarError('BROWSER_PAGE_LIMIT', 'Browser page limit reached')
    const pageId = requestedPage ?? `page-${crypto.randomUUID()}`
    const result = await this.backend.navigate(contextId, pageId, url.href, signal)
    this.authorizeOrigin(result.url)
    const page = browserPageSchema.parse({ contextId, pageId, url: result.url, title: result.title })
    pages.set(pageId, { ...page, sessionId })
    sessions.set(contextId, pages)
    this.api.notify({ method: 'browser.changed', params: { sessionId, contextId } })
    this.api.changed('browser')
    return page
  }

  async snapshot(sessionId: string, contextId?: string, pageId?: string, signal = new AbortController().signal): Promise<BrowserSnapshot> {
    const located = this.page(sessionId, contextId, pageId)
    const result = await this.backend.snapshot(located.contextId, located.state.pageId, signal)
    const text = result.text.slice(0, this.config.maxSnapshotChars)
    return browserSnapshotSchema.parse({ page: located.state, text, truncated: result.text.length > text.length })
  }

  async click(sessionId: string, selector: string, contextId?: string, pageId?: string, signal = new AbortController().signal) {
    const located = this.page(sessionId, contextId, pageId)
    const result = await this.backend.click(located.contextId, located.state.pageId, selector, signal)
    return this.updatePage(located, result)
  }

  async type(sessionId: string, selector: string, text: string, contextId?: string, pageId?: string, signal = new AbortController().signal) {
    const located = this.page(sessionId, contextId, pageId)
    const result = await this.backend.type(located.contextId, located.state.pageId, selector, text, signal)
    return this.updatePage(located, result)
  }

  async press(sessionId: string, key: string, selector?: string, contextId?: string, pageId?: string, signal = new AbortController().signal) {
    const located = this.page(sessionId, contextId, pageId)
    const result = await this.backend.press(located.contextId, located.state.pageId, key, selector, signal)
    return this.updatePage(located, result)
  }

  private updatePage(located: ReturnType<BrowserRuntime['page']>, result: BrowserBackendPage) {
    const page = browserPageSchema.parse({ contextId: located.contextId, pageId: located.state.pageId, url: result.url, title: result.title })
    located.pages.set(page.pageId, { ...page, sessionId: located.state.sessionId })
    this.api.notify({ method: 'browser.changed', params: { sessionId: located.state.sessionId, contextId: located.contextId } })
    this.api.changed('browser')
    return page
  }

  async screenshot(sessionId: string, fullPage = false, contextId?: string, pageId?: string, signal = new AbortController().signal) {
    const located = this.page(sessionId, contextId, pageId)
    const result = await this.backend.screenshot(located.contextId, located.state.pageId, fullPage, signal)
    const bytes = Buffer.byteLength(result.data, 'base64')
    if (bytes > this.config.maxScreenshotBytes) throw new HbarError('BROWSER_SCREENSHOT_LIMIT', 'Browser screenshot exceeds the configured limit')
    return browserScreenshotSchema.parse({ page: located.state, mime: result.mime, data: result.data, truncated: false })
  }

  async evaluate(sessionId: string, expression: string, contextId?: string, pageId?: string, signal = new AbortController().signal) {
    const located = this.page(sessionId, contextId, pageId)
    this.authorizeOrigin(located.state.url, 'full_cdp_access')
    const value = await this.backend.evaluate(located.contextId, located.state.pageId, expression, signal)
    if (JSON.stringify(value).length > this.config.maxSnapshotChars) throw new HbarError('BROWSER_RESULT_LIMIT', 'Browser evaluation result is too large')
    return { value }
  }

  async close(sessionId: string, contextId?: string, pageId?: string, signal = new AbortController().signal) {
    await this.session(sessionId)
    if (!contextId) {
      for (const id of this.contexts.get(sessionId)?.keys() ?? []) await this.backend.close(id, undefined, signal)
      const closed = this.contexts.delete(sessionId)
      if (closed) this.api.changed('browser')
      return { closed }
    }
    const sessions = this.contexts.get(sessionId)
    const pages = sessions?.get(contextId)
    if (!pages) return { closed: false }
    await this.backend.close(contextId, pageId, signal)
    if (pageId) pages.delete(pageId)
    else sessions?.delete(contextId)
    if (sessions && sessions.size === 0) this.contexts.delete(sessionId)
    this.api.notify({ method: 'browser.changed', params: { sessionId, contextId } })
    this.api.changed('browser')
    return { closed: true }
  }

  async history(sessionId: string, contextId?: string) {
    await this.session(sessionId)
    if (!this.config.allow_history_access) throw new HbarError('BROWSER_HISTORY_DENIED', 'Browser history access is disabled')
    const sessions = this.contexts.get(sessionId)
    const ids = contextId ? [contextId] : [...(sessions?.keys() ?? [])]
    return [...new Set((await Promise.all(ids.map((id) => this.backend.history(id)))).flat())].slice(-100)
  }

  async dispose() {
    for (const [sessionId, sessions] of this.contexts) {
      for (const contextId of sessions.keys()) await this.backend.close(contextId).catch(() => {})
      this.contexts.delete(sessionId)
    }
  }
}

const contextArgs = z.object({ context_id: z.string().min(1).max(160).optional(), page_id: z.string().min(1).max(160).optional() })
function result(value: unknown) {
  return { text: JSON.stringify(value), details: value }
}

export function browserTools(runtime: BrowserRuntime): ToolDefinition[] {
  return [
    { name: 'browser_status', description: 'List active browser contexts and pages.', inputSchema: z.object({}), effect: 'network', execute: async (_args, c) => result(await runtime.status(c.session.id)) },
    { name: 'browser_navigate', description: 'Navigate a browser page to an approved HTTP(S) origin.', inputSchema: z.object({ url: z.string().url().max(4_000), ...contextArgs.shape }), effect: 'network', execute: async (args, c) => { const p = z.object({ url: z.string(), ...contextArgs.shape }).parse(args); return result(await runtime.navigate(c.session.id, p.url, p.context_id, p.page_id, c.signal)) } },
    { name: 'browser_snapshot', description: 'Read a bounded text snapshot of the current page.', inputSchema: contextArgs, effect: 'network', execute: async (args, c) => { const p = contextArgs.parse(args); return result(await runtime.snapshot(c.session.id, p.context_id, p.page_id, c.signal)) } },
    { name: 'browser_click', description: 'Click a selector in the current browser page.', inputSchema: z.object({ selector: z.string().min(1).max(4_000), ...contextArgs.shape }), effect: 'network', execute: async (args, c) => { const p = z.object({ selector: z.string(), ...contextArgs.shape }).parse(args); return result(await runtime.click(c.session.id, p.selector, p.context_id, p.page_id, c.signal)) } },
    { name: 'browser_type', description: 'Type bounded text into a selector in the current browser page.', inputSchema: z.object({ selector: z.string().min(1).max(4_000), text: z.string().max(16_000), ...contextArgs.shape }), effect: 'network', execute: async (args, c) => { const p = z.object({ selector: z.string(), text: z.string(), ...contextArgs.shape }).parse(args); return result(await runtime.type(c.session.id, p.selector, p.text, p.context_id, p.page_id, c.signal)) } },
    { name: 'browser_press_key', description: 'Press a key in the current browser page.', inputSchema: z.object({ key: z.string().min(1).max(100), selector: z.string().max(4_000).optional(), ...contextArgs.shape }), effect: 'network', execute: async (args, c) => { const p = z.object({ key: z.string(), selector: z.string().optional(), ...contextArgs.shape }).parse(args); return result(await runtime.press(c.session.id, p.key, p.selector, p.context_id, p.page_id, c.signal)) } },
    { name: 'browser_press', description: 'Alias for browser_press_key.', inputSchema: z.object({ key: z.string().min(1).max(100), selector: z.string().max(4_000).optional(), ...contextArgs.shape }), effect: 'network', execute: async (args, c) => { const p = z.object({ key: z.string(), selector: z.string().optional(), ...contextArgs.shape }).parse(args); return result(await runtime.press(c.session.id, p.key, p.selector, p.context_id, p.page_id, c.signal)) } },
    { name: 'browser_screenshot', description: 'Capture the current browser page as an image.', inputSchema: z.object({ full_page: z.boolean().default(false), ...contextArgs.shape }), effect: 'network', execute: async (args, c) => { const p = z.object({ full_page: z.boolean().default(false), ...contextArgs.shape }).parse(args); const shot = await runtime.screenshot(c.session.id, p.full_page, p.context_id, p.page_id, c.signal); return { text: `Browser screenshot ${shot.page.url}`, content: [{ type: 'image' as const, data: shot.data, mimeType: shot.mime }], details: shot } } },
    { name: 'browser_evaluate', description: 'Evaluate an expression only when full CDP access is allowed for the page origin.', inputSchema: z.object({ expression: z.string().min(1).max(16_000), ...contextArgs.shape }), effect: 'network', execute: async (args, c) => { const p = z.object({ expression: z.string(), ...contextArgs.shape }).parse(args); return result(await runtime.evaluate(c.session.id, p.expression, p.context_id, p.page_id, c.signal)) } },
    { name: 'browser_close', description: 'Close a browser page or context.', inputSchema: contextArgs, effect: 'network', execute: async (args, c) => { const p = contextArgs.parse(args); return result(await runtime.close(c.session.id, p.context_id, p.page_id, c.signal)) } },
    { name: 'browser_history', description: 'Read browser history only when allow_history_access is enabled.', inputSchema: z.object({ context_id: z.string().min(1).max(160).optional() }), effect: 'network', execute: async (args, c) => { const p = z.object({ context_id: z.string().optional() }).parse(args); return result(await runtime.history(c.session.id, p.context_id)) } },
  ]
}

export const browserPlugin = definePlugin({
  manifest: {
    id: 'browser-use.codex',
    packageName: '@hbar/browser-use',
    name: 'Codex browser-use',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Origin-policy governed browser navigation, snapshots, interaction, and CDP access',
    scope: 'host',
    required: false,
    provides: { browser: '1.0.0', 'browser-use': '1.0.0' },
    permissions: ['network'],
  },
  configSchema: browserConfigSchema,
  async apply(ctx, rawConfig) {
    const runtime = new BrowserRuntime(ctx.hbar.api, browserConfigSchema.parse(rawConfig))
    provide<BrowserUseService>(ctx, 'browser', runtime)
    provide<BrowserUseService>(ctx, 'browser-use', runtime)
    ctx.effect(() => () => {
      void runtime.dispose()
    })
    for (const tool of browserTools(runtime)) ctx.hbar.api.tools.register(tool)
  },
})

export default browserPlugin
