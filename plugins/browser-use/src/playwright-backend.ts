import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { HbarError } from '@hbar/contracts'
import type { BrowserBackend, BrowserBackendPage } from './index.ts'

export interface PlaywrightBrowserOptions {
  headless: boolean
  executablePath?: string
  timeoutMs: number
}

type BrowserLocator = ReturnType<Page['locator']>

function unavailable(message: string, cause?: unknown): HbarError {
  return new HbarError('BROWSER_BACKEND_UNAVAILABLE', cause instanceof Error ? `${message}: ${cause.message}` : message)
}

function key(contextId: string, pageId: string) {
  return `${contextId}:${pageId}`
}

/** Native managed-browser backend. The browser process is launched lazily. */
export class PlaywrightBrowserBackend implements BrowserBackend {
  private browser: Browser | undefined
  private launchFailure: HbarError | undefined
  private contexts = new Map<string, BrowserContext>()
  private pages = new Map<string, Page>()
  private histories = new Map<string, string[]>()

  constructor(private readonly options: PlaywrightBrowserOptions) {}

  async available() {
    if (this.launchFailure) return false
    try {
      const executable = this.options.executablePath ?? chromium.executablePath()
      return await Bun.file(executable).exists()
    } catch {
      return false
    }
  }

  private async ensureBrowser() {
    if (this.browser) return this.browser
    if (this.launchFailure) throw this.launchFailure
    if (!(await this.available())) {
      this.launchFailure = unavailable('Playwright Chromium executable is unavailable')
      throw this.launchFailure
    }
    try {
      this.browser = await chromium.launch({
        headless: this.options.headless,
        ...(this.options.executablePath ? { executablePath: this.options.executablePath } : {}),
      })
      return this.browser
    } catch (error) {
      this.launchFailure = unavailable('Playwright browser could not be launched', error)
      throw this.launchFailure
    }
  }

  private async context(contextId: string) {
    const existing = this.contexts.get(contextId)
    if (existing) return existing
    const browser = await this.ensureBrowser()
    const context = await browser.newContext({ acceptDownloads: true })
    this.contexts.set(contextId, context)
    return context
  }

  private async page(contextId: string, pageId: string) {
    const existing = this.pages.get(key(contextId, pageId))
    if (existing && !existing.isClosed()) return existing
    const page = await (await this.context(contextId)).newPage()
    page.setDefaultTimeout(this.options.timeoutMs)
    this.pages.set(key(contextId, pageId), page)
    return page
  }

  private async guarded<T>(page: Page, signal: AbortSignal, operation: () => Promise<T>) {
    signal.throwIfAborted()
    const abort = () => {
      void page.close({ runBeforeUnload: false }).catch(() => {})
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      const value = await operation()
      signal.throwIfAborted()
      return value
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }

  private async metadata(page: Page): Promise<BrowserBackendPage> {
    return { url: page.url(), title: await page.title() }
  }

  private async locate(page: Page, selector: string): Promise<BrowserLocator> {
    if (!selector.trim()) throw new HbarError('BROWSER_INVALID_SELECTOR', 'Browser selectors must not be empty')
    return page.locator(selector)
  }

  async navigate(contextId: string, pageId: string, url: string, signal: AbortSignal) {
    const page = await this.page(contextId, pageId)
    await this.guarded(page, signal, () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.options.timeoutMs }).then(() => undefined))
    const result = await this.metadata(page)
    const history = this.histories.get(contextId) ?? []
    this.histories.set(contextId, [...history.filter((entry) => entry !== result.url), result.url].slice(-100))
    return result
  }

  async go(contextId: string, pageId: string, action: 'back' | 'forward' | 'reload', signal: AbortSignal) {
    const page = await this.page(contextId, pageId)
    await this.guarded(page, signal, async () => {
      const options = { waitUntil: 'domcontentloaded' as const, timeout: this.options.timeoutMs }
      if (action === 'back') await page.goBack(options)
      else if (action === 'forward') await page.goForward(options)
      else await page.reload(options)
    })
    return this.metadata(page)
  }

  async snapshot(contextId: string, pageId: string, signal: AbortSignal) {
    const page = await this.page(contextId, pageId)
    const text = await this.guarded(page, signal, async () => {
      const body = page.locator('body')
      return body.innerText({ timeout: this.options.timeoutMs })
    })
    return { text }
  }

  async click(contextId: string, pageId: string, selector: string, signal: AbortSignal) {
    const page = await this.page(contextId, pageId)
    const locator = await this.locate(page, selector)
    await this.guarded(page, signal, () => locator.click({ timeout: this.options.timeoutMs }))
    return this.metadata(page)
  }

  async type(contextId: string, pageId: string, selector: string, text: string, signal: AbortSignal) {
    const page = await this.page(contextId, pageId)
    const locator = await this.locate(page, selector)
    await this.guarded(page, signal, () => locator.fill(text, { timeout: this.options.timeoutMs }))
    return this.metadata(page)
  }

  async press(contextId: string, pageId: string, keyValue: string, selector: string | undefined, signal: AbortSignal) {
    const page = await this.page(contextId, pageId)
    await this.guarded(page, signal, async () => {
      if (selector) {
        const locator = await this.locate(page, selector)
        await locator.press(keyValue, { timeout: this.options.timeoutMs })
      } else {
        await page.keyboard.press(keyValue)
      }
    })
    return this.metadata(page)
  }

  async screenshot(contextId: string, pageId: string, fullPage: boolean, signal: AbortSignal) {
    const page = await this.page(contextId, pageId)
    const data = await this.guarded(page, signal, () => page.screenshot({ fullPage, type: 'png' }))
    return { mime: 'image/png', data: data.toString('base64') }
  }

  async evaluate(contextId: string, pageId: string, expression: string, signal: AbortSignal) {
    const page = await this.page(contextId, pageId)
    return this.guarded(page, signal, () => page.evaluate(expression))
  }

  async close(contextId: string, pageId?: string, signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (pageId) {
      const page = this.pages.get(key(contextId, pageId))
      if (page) await page.close({ runBeforeUnload: false })
      this.pages.delete(key(contextId, pageId))
      return
    }
    for (const [pageKey, page] of this.pages) {
      if (pageKey.startsWith(`${contextId}:`)) {
        await page.close({ runBeforeUnload: false }).catch(() => {})
        this.pages.delete(pageKey)
      }
    }
    const context = this.contexts.get(contextId)
    if (context) await context.close().catch(() => {})
    this.contexts.delete(contextId)
    this.histories.delete(contextId)
  }

  async history(contextId: string) {
    return [...(this.histories.get(contextId) ?? [])]
  }

  async dispose() {
    for (const context of this.contexts.values()) await context.close().catch(() => {})
    this.pages.clear()
    this.contexts.clear()
    this.histories.clear()
    await this.browser?.close().catch(() => {})
    this.browser = undefined
  }
}

function isUnavailable(error: unknown) {
  return error instanceof HbarError && error.code === 'BROWSER_BACKEND_UNAVAILABLE'
}

/** Uses Playwright when available and keeps navigation usable without a browser binary. */
export class AutoBrowserBackend implements BrowserBackend {
  private selected = new Map<string, BrowserBackend>()

  constructor(
    private readonly primary: BrowserBackend,
    private readonly fallback: BrowserBackend,
  ) {}

  async available() {
    return (await this.primary.available()) || (await this.fallback.available())
  }

  private current(contextId: string, pageId: string) {
    return this.selected.get(key(contextId, pageId)) ?? this.primary
  }

  private remember(contextId: string, pageId: string, backend: BrowserBackend) {
    this.selected.set(key(contextId, pageId), backend)
  }

  async navigate(contextId: string, pageId: string, url: string, signal: AbortSignal) {
    const preferred = this.current(contextId, pageId)
    try {
      const result = await preferred.navigate(contextId, pageId, url, signal)
      this.remember(contextId, pageId, preferred)
      return result
    } catch (error) {
      if (preferred !== this.primary || !isUnavailable(error)) throw error
      const result = await this.fallback.navigate(contextId, pageId, url, signal)
      this.remember(contextId, pageId, this.fallback)
      return result
    }
  }

  go(contextId: string, pageId: string, action: 'back' | 'forward' | 'reload', signal: AbortSignal) {
    return this.delegate(contextId, pageId).go(contextId, pageId, action, signal)
  }

  private delegate(contextId: string, pageId: string) {
    return this.current(contextId, pageId)
  }

  snapshot(contextId: string, pageId: string, signal: AbortSignal) {
    return this.delegate(contextId, pageId).snapshot(contextId, pageId, signal)
  }
  click(contextId: string, pageId: string, selector: string, signal: AbortSignal) {
    return this.delegate(contextId, pageId).click(contextId, pageId, selector, signal)
  }
  type(contextId: string, pageId: string, selector: string, text: string, signal: AbortSignal) {
    return this.delegate(contextId, pageId).type(contextId, pageId, selector, text, signal)
  }
  press(contextId: string, pageId: string, keyValue: string, selector: string | undefined, signal: AbortSignal) {
    return this.delegate(contextId, pageId).press(contextId, pageId, keyValue, selector, signal)
  }
  screenshot(contextId: string, pageId: string, fullPage: boolean, signal: AbortSignal) {
    return this.delegate(contextId, pageId).screenshot(contextId, pageId, fullPage, signal)
  }
  evaluate(contextId: string, pageId: string, expression: string, signal: AbortSignal) {
    return this.delegate(contextId, pageId).evaluate(contextId, pageId, expression, signal)
  }
  async close(contextId: string, pageId?: string, signal?: AbortSignal) {
    await this.primary.close(contextId, pageId, signal)
    await this.fallback.close(contextId, pageId, signal)
    if (pageId) this.selected.delete(key(contextId, pageId))
    else for (const pageKey of this.selected.keys()) if (pageKey.startsWith(`${contextId}:`)) this.selected.delete(pageKey)
  }
  async history(contextId: string) {
    return [...new Set([...(await this.primary.history(contextId)), ...(await this.fallback.history(contextId))])].slice(-100)
  }
  async dispose() {
    await this.primary.dispose?.()
    await this.fallback.dispose?.()
    this.selected.clear()
  }
}
