import { expect, test } from 'bun:test'
import { chromium, type Browser } from 'playwright'
import { PlaywrightBrowserBackend, type PlaywrightBrowserProvider } from '../src/playwright-backend'

function gate() {
  let release: () => void = () => {
    throw new Error('Gate not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

// Root only: owned NativeJob, >=8GiB component window, 120s external deadline.
// Complete real Browser/Context/Page objects; no global mock, user profile or network.
function fixture() {
  const launchEntered = gate(),
    launchAllowed = gate()
  const pageEntered = gate(),
    pageAllowed = gate()
  const browsers: Browser[] = []
  let contextCreates = 0,
    pageCreates = 0,
    holdPages = false
  const provider: PlaywrightBrowserProvider = {
    async launch(options) {
      const browser = await chromium.launch({ ...options, timeout: 5000 })
      browsers.push(browser)
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (options) => {
        contextCreates++
        const context = await newContext(options)
        const newPage = context.newPage.bind(context)
        context.newPage = async () => {
          pageCreates++
          if (holdPages) {
            pageEntered.release()
            await pageAllowed.promise
          }
          const page = await newPage()
          // Serialize only real navigation on each real Page so two successful
          // same-page calls do not fail from Chromium navigation interruption.
          const goto = page.goto.bind(page)
          let tail: Promise<unknown> = Promise.resolve()
          page.goto = (url, options) => {
            const next = tail.then(() => goto(url, options))
            tail = next.then(
              () => undefined,
              () => undefined,
            )
            return next
          }
          return page
        }
        return context
      }
      launchEntered.release()
      await launchAllowed.promise
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
    launchEntered,
    launchAllowed,
    pageEntered,
    pageAllowed,
    holdPages: () => {
      holdPages = true
    },
    counts: () => ({ contextCreates, pageCreates }),
    navigate(pageId: string) {
      const pending = backend.navigate('owned-context', pageId, 'about:blank', new AbortController().signal)
      accepted.push(pending)
      return pending
    },
    async cleanup(primary: { error: unknown } | undefined) {
      launchAllowed.release()
      pageAllowed.release()
      const errors: unknown[] = primary ? [primary.error] : []
      try {
        await backend.dispose()
      } catch (error) {
        errors.push(error)
      }
      await Promise.allSettled(accepted)
      for (const browser of browsers)
        if (browser.isConnected()) {
          try {
            await browser.close()
          } catch (error) {
            errors.push(error)
          }
        }
      if (browsers.some((browser) => browser.isConnected())) errors.push(new Error('Owned Browser remains connected'))
      if (errors.length) throw new AggregateError(errors, 'Concurrent Browser fixture failed', { cause: errors[0] })
    },
  }
}

test('same context concurrent different pages create one real Context and close every owned Page', async () => {
  const f = fixture()
  let primary: { error: unknown } | undefined
  try {
    const completed = Promise.all([f.navigate('first'), f.navigate('second')])
    // A launch failure rejects immediately instead of waiting for an unreachable gate.
    await Promise.race([
      f.launchEntered.promise,
      completed.then(() => {
        throw new Error('Navigation completed before launch gate')
      }),
    ])
    f.launchAllowed.release()
    await completed
    expect(f.browsers).toHaveLength(1)
    const browser = f.browsers[0]
    if (!browser) throw new Error('Owned Browser missing')
    expect(f.counts()).toEqual({ contextCreates: 1, pageCreates: 2 })
    expect(browser.contexts()).toHaveLength(1)
    expect(browser.contexts().flatMap((context) => context.pages())).toHaveLength(2)
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

test('same existing context and page concurrent navigation creates one real Page and close leaves none', async () => {
  const f = fixture()
  let primary: { error: unknown } | undefined
  try {
    f.launchAllowed.release()
    await f.navigate('warmup')
    await f.backend.close('owned-context', 'warmup')
    f.holdPages()
    const completed = Promise.all([f.navigate('shared'), f.navigate('shared')])
    await Promise.race([
      f.pageEntered.promise,
      completed.then(() => {
        throw new Error('Navigation completed before Page gate')
      }),
    ])
    f.pageAllowed.release()
    await completed
    const browser = f.browsers[0]
    if (!browser) throw new Error('Owned Browser missing')
    expect(f.browsers).toHaveLength(1)
    expect(f.counts()).toEqual({ contextCreates: 1, pageCreates: 2 }) // warmup + shared
    expect(browser.contexts()).toHaveLength(1)
    expect(browser.contexts().flatMap((context) => context.pages())).toHaveLength(1)
    await f.backend.close('owned-context', 'shared')
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
