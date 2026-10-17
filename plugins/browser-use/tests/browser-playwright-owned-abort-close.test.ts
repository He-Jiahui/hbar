import { expect, test } from 'bun:test'
import { createServer, type ServerResponse } from 'node:http'
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

test('owned real abort-close remains counted after navigation rejects until the actual Page.close receipt', async () => {
  const requestEntered = gate(),
    closeEntered = gate(),
    closeAllowed = gate(),
    closeReplied = gate()
  const browsers: Browser[] = []
  const responses: ServerResponse[] = []
  const receipts: string[] = []
  let primary: unknown
  let closes = 0
  const server = createServer((_request, response) => {
    responses.push(response)
    requestEntered.release() // actual localhost navigation reached this owned server
  })
  const provider: PlaywrightBrowserProvider = {
    async launch(options) {
      const browser = await chromium.launch(options)
      browsers.push(browser)
      const realBrowserClose = browser.close.bind(browser)
      browser.close = async (closeOptions) => {
        receipts.push('browser-close-start')
        await realBrowserClose(closeOptions)
      }
      const realContext = browser.newContext.bind(browser)
      browser.newContext = async (contextOptions) => {
        const context = await realContext(contextOptions)
        const realPage = context.newPage.bind(context)
        context.newPage = async () => {
          const page = await realPage()
          const realClose = page.close.bind(page)
          page.close = async (closeOptions) => {
            closes++
            closeEntered.release()
            await closeAllowed.promise
            await realClose(closeOptions)
            receipts.push('page-close-completed')
            closeReplied.release()
          }
          return page // complete real Page, no partial object/cast
        }
        return context // complete real BrowserContext
      }
      return browser // complete real Browser
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
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Owned localhost listener has no TCP address')
    const abort = new AbortController()
    const navigation = backend.navigate(
      'owned-abort',
      'owned-page',
      `http://127.0.0.1:${address.port}/held`,
      abort.signal,
    )
    accepted.push(navigation)
    const outcome = navigation.then(
      () => 'resolved',
      () => 'rejected',
    )
    await Promise.race([
      requestEntered.promise,
      outcome.then((result) => {
        throw new Error(`Native navigation ${result} before owned HTTP request acceptance`)
      }),
    ])
    abort.abort(new Error('Owned test navigation cancelled'))
    await Promise.race([
      closeEntered.promise,
      outcome.then((result) => {
        throw new Error(`Native navigation ${result} before derived close acceptance`)
      }),
    ])
    for (const response of responses) response.end('<!doctype html><title>Owned complete reply</title>')
    expect(await outcome).toBe('rejected')
    // Original operation has settled; the derived real close is still held.
    // After actual browser.dispose drains its registered handles below, its own
    // Promise must still wait for this pending derived cleanup.
    expect(closes).toBe(1)
    expect(backend.idleResources()).toBeGreaterThan(0)
    let disposed = false
    const disposal = backend.dispose().then(() => {
      disposed = true
    })
    void disposal.catch(() => undefined) // observe immediately; awaited below and preserved by cleanup
    accepted.push(disposal)
    expect(disposed).toBe(false)
    expect(browsers.every((browser) => browser.isConnected())).toBe(true)
    closeAllowed.release()
    await closeReplied.promise
    await disposal
    const pageClosed = receipts.indexOf('page-close-completed')
    const browserClosing = receipts.indexOf('browser-close-start')
    expect(pageClosed).toBeGreaterThanOrEqual(0)
    expect(browserClosing).toBeGreaterThanOrEqual(0)
    expect(pageClosed).toBeLessThan(browserClosing)
    expect(browsers.every((browser) => !browser.isConnected())).toBe(true)
    expect(backend.idleResources()).toBe(0)
  } catch (error) {
    primary = error
  }
  closeAllowed.release()
  for (const response of responses) if (!response.writableEnded) response.end()
  const errors: unknown[] = primary === undefined ? [] : [primary]
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
  if (server.listening) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Owned abort-close or cleanup failed', { cause: errors[0] })
}, 20_000)
