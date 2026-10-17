import { expect, test } from 'bun:test'
import { chromium, type Browser } from 'playwright'
import { PlaywrightBrowserBackend, type PlaywrightBrowserProvider } from '../src/playwright-backend'

// Root's owned NativeJob only: >=8GiB, 20s per case, 120s external stage.
// All Browser/Context/Page objects are complete native Playwright instances.
function fixture(rejectFirst: 'context' | 'page') {
  const browsers: Browser[] = []
  let contextsCreated = 0,
    pagesCreated = 0,
    knownRejections = 0
  const provider: PlaywrightBrowserProvider = {
    async launch(options) {
      const browser = await chromium.launch({ ...options, timeout: 5000 })
      browsers.push(browser)
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (options) => {
        const context = await newContext(options)
        contextsCreated++
        if (rejectFirst === 'context' && knownRejections === 0) {
          // A complete real native object was created. Confirm its close before
          // rejecting preparation, so the seam itself cannot orphan a handle.
          await context.close()
          knownRejections++
          throw new Error('CONTROLLED_CONTEXT_PREPARATION_REJECTED')
        }
        const newPage = context.newPage.bind(context)
        context.newPage = async () => {
          const page = await newPage()
          pagesCreated++
          if (rejectFirst === 'page' && knownRejections === 0) {
            await page.close({ runBeforeUnload: false })
            knownRejections++
            throw new Error('CONTROLLED_PAGE_PREPARATION_REJECTED')
          }
          return page
        }
        return context
      }
      return browser
    },
  }
  const backend = new PlaywrightBrowserBackend(
    {
      headless: true,
      timeoutMs: 5000,
      ...(process.env.HBAR_OWNED_BROWSER_EXECUTABLE
        ? { executablePath: process.env.HBAR_OWNED_BROWSER_EXECUTABLE }
        : {}),
    },
    provider,
  )
  const accepted: Promise<unknown>[] = []
  return {
    backend,
    browsers,
    counts: () => ({ contextsCreated, pagesCreated, knownRejections }),
    navigate() {
      const pending = backend.navigate('owned-context', 'owned-page', 'about:blank', new AbortController().signal)
      accepted.push(pending)
      return pending
    },
    async cleanup(primary: { error: unknown } | undefined) {
      const errors: unknown[] = primary ? [primary.error] : []
      await Promise.allSettled(accepted)
      try {
        await backend.dispose()
      } catch (error) {
        errors.push(error)
      }
      for (const browser of browsers)
        if (browser.isConnected()) {
          try {
            await browser.close()
          } catch (error) {
            errors.push(error)
          }
        }
      if (browsers.some((browser) => browser.isConnected())) errors.push(new Error('Owned Browser remains connected'))
      if (errors.length) throw new AggregateError(errors, 'Browser creation retry fixture failed', { cause: errors[0] })
    },
  }
}

test('known rejected real Context preparation is cleared and public navigation explicitly retries once', async () => {
  const f = fixture('context')
  let primary: { error: unknown } | undefined
  try {
    await expect(f.navigate()).rejects.toThrow('CONTROLLED_CONTEXT_PREPARATION_REJECTED')
    expect(f.browsers).toHaveLength(1)
    const browser = f.browsers[0]
    if (!browser) throw new Error('Owned Browser missing')
    expect(f.counts()).toEqual({ contextsCreated: 1, pagesCreated: 0, knownRejections: 1 })
    expect(browser.contexts()).toHaveLength(0)
    const result = await f.navigate()
    expect(result.url).toBe('about:blank')
    expect(f.counts()).toEqual({ contextsCreated: 2, pagesCreated: 1, knownRejections: 1 })
    expect(browser.contexts()).toHaveLength(1)
    expect(browser.contexts().flatMap((context) => context.pages())).toHaveLength(1)
    // A later successful call reuses the retained objects, not the old rejection.
    await f.navigate()
    expect(f.browsers).toHaveLength(1)
    expect(f.counts()).toEqual({ contextsCreated: 2, pagesCreated: 1, knownRejections: 1 })
    await f.backend.close('owned-context')
    expect(browser.contexts()).toHaveLength(0)
    await f.backend.dispose()
    expect(browser.isConnected()).toBe(false)
    expect(f.backend.idleResources()).toBe(0)
  } catch (error) {
    primary = { error }
  }
  await f.cleanup(primary)
}, 20_000)

test('known rejected real Page preparation is cleared without recreating its retained Context', async () => {
  const f = fixture('page')
  let primary: { error: unknown } | undefined
  try {
    await expect(f.navigate()).rejects.toThrow('CONTROLLED_PAGE_PREPARATION_REJECTED')
    expect(f.browsers).toHaveLength(1)
    const browser = f.browsers[0]
    if (!browser) throw new Error('Owned Browser missing')
    expect(f.counts()).toEqual({ contextsCreated: 1, pagesCreated: 1, knownRejections: 1 })
    expect(browser.contexts()).toHaveLength(1)
    expect(browser.contexts().flatMap((context) => context.pages())).toHaveLength(0)
    const result = await f.navigate()
    expect(result.url).toBe('about:blank')
    expect(f.counts()).toEqual({ contextsCreated: 1, pagesCreated: 2, knownRejections: 1 })
    expect(browser.contexts().flatMap((context) => context.pages())).toHaveLength(1)
    await f.navigate()
    expect(f.browsers).toHaveLength(1)
    expect(f.counts()).toEqual({ contextsCreated: 1, pagesCreated: 2, knownRejections: 1 })
    await f.backend.close('owned-context', 'owned-page')
    expect(browser.contexts().flatMap((context) => context.pages())).toHaveLength(0)
    await f.backend.close('owned-context')
    expect(browser.contexts()).toHaveLength(0)
    await f.backend.dispose()
    expect(browser.isConnected()).toBe(false)
    expect(f.backend.idleResources()).toBe(0)
  } catch (error) {
    primary = { error }
  }
  await f.cleanup(primary)
}, 20_000)
