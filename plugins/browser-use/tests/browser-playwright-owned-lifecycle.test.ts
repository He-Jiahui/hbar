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

// Run only in Root's owned NativeJob + real binary + 8GiB component window.
// Missing binary is a real failure, never a skipped/fallback/fake Browser case.
function fixture(mode: 'ordinary' | 'late-launch' | 'failed-close') {
  const launchEntered = gate(),
    launchAllowed = gate(),
    closeEntered = gate(),
    closeAllowed = gate()
  const browsers: Browser[] = []
  let launches = 0,
    closes = 0,
    failClose = mode === 'failed-close'
  const provider: PlaywrightBrowserProvider = {
    async launch(options) {
      launches++
      const browser = await chromium.launch(options)
      browsers.push(browser)
      const realClose = browser.close.bind(browser)
      browser.close = async (closeOptions) => {
        closes++
        if (failClose) {
          failClose = false
          throw new Error('Controlled known close rejection before native dispatch')
        }
        closeEntered.release()
        if (mode === 'late-launch') await closeAllowed.promise
        await realClose(closeOptions)
      }
      launchEntered.release()
      if (mode === 'late-launch') await launchAllowed.promise
      return browser // actual complete Browser, no partial object or unsafe cast
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
  return {
    backend,
    browsers,
    launchEntered,
    launchAllowed,
    closeEntered,
    closeAllowed,
    counts: () => ({ launches, closes }),
    async cleanup(primary: unknown, accepted: readonly Promise<unknown>[]) {
      launchAllowed.release()
      closeAllowed.release()
      const errors: unknown[] = primary === undefined ? [] : [primary]
      await Promise.allSettled(accepted)
      try {
        await backend.dispose()
      } catch (error) {
        errors.push(error)
      }
      // Each object is owned by this provider only; never enumerate/kill user processes.
      for (const browser of browsers)
        if (browser.isConnected()) {
          try {
            await browser.close()
          } catch (error) {
            errors.push(error)
          }
        }
      if (browsers.some((browser) => browser.isConnected()))
        errors.push(new Error('Owned native Browser remains connected'))
      if (errors.length) throw new AggregateError(errors, 'Owned browser lifecycle failure', { cause: errors[0] })
    },
  }
}

test('owned real concurrent first navigation uses one actual browser launch', async () => {
  const f = fixture('ordinary'),
    accepted: Promise<unknown>[] = []
  let failure: unknown
  try {
    // Local about:blank-equivalent data URL avoids network and user browser state.
    const first = f.backend.navigate('one', 'one', 'about:blank', new AbortController().signal)
    const second = f.backend.navigate('two', 'two', 'about:blank', new AbortController().signal)
    accepted.push(first, second)
    await Promise.all(accepted)
    expect(f.counts().launches).toBe(1)
    expect(f.browsers).toHaveLength(1)
    expect(f.browsers.every((browser) => browser.isConnected())).toBe(true)
    await f.backend.dispose()
    expect(f.browsers.every((browser) => !browser.isConnected())).toBe(true)
    expect(f.counts().closes).toBe(1)
    expect(f.backend.idleResources()).toBe(0)
  } catch (error) {
    failure = error
  }
  await f.cleanup(failure, accepted)
}, 20_000)

test('owned late real launch is joined and actually closed before disposal completes', async () => {
  const f = fixture('late-launch'),
    accepted: Promise<unknown>[] = []
  let failure: unknown,
    disposed = false
  const navigation = f.backend.navigate('one', 'one', 'about:blank', new AbortController().signal)
  void navigation.catch(() => undefined)
  accepted.push(navigation)
  try {
    await Promise.race([
      f.launchEntered.promise,
      navigation.then(
        () => {
          throw new Error('Native navigation completed before held launch acceptance')
        },
        (error: unknown) => {
          throw error
        },
      ),
    ])
    const disposing = f.backend.dispose().then(() => {
      disposed = true
    })
    void disposing.catch(() => undefined) // observe immediately; actual rejection remains awaited
    accepted.push(disposing)
    expect(disposed).toBe(false)
    expect(f.backend.idleResources()).toBeGreaterThan(0)
    expect(f.browsers.every((browser) => browser.isConnected())).toBe(true)
    f.launchAllowed.release()
    await Promise.race([
      f.closeEntered.promise,
      disposing.then(
        () => {
          throw new Error('Native disposal completed before real close acceptance')
        },
        (error: unknown) => {
          throw error
        },
      ),
    ])
    expect(disposed).toBe(false)
    expect(f.backend.idleResources()).toBeGreaterThan(0)
    f.closeAllowed.release()
    await disposing
    await Promise.allSettled([navigation])
    expect(f.browsers.every((browser) => !browser.isConnected())).toBe(true)
    expect(f.counts()).toEqual({ launches: 1, closes: 1 })
    expect(f.backend.idleResources()).toBe(0)
  } catch (error) {
    failure = error
  }
  await f.cleanup(failure, accepted)
}, 20_000)

test('owned known failed close keeps the actual connected handle for explicit retry', async () => {
  const f = fixture('failed-close'),
    accepted: Promise<unknown>[] = []
  let failure: unknown
  try {
    const navigation = f.backend.navigate('one', 'one', 'about:blank', new AbortController().signal)
    accepted.push(navigation)
    await navigation
    await expect(f.backend.dispose()).rejects.toThrow('Controlled known close rejection')
    expect(f.browsers.every((browser) => browser.isConnected())).toBe(true)
    expect(f.backend.idleResources()).toBeGreaterThan(0)
    await f.backend.dispose()
    expect(f.browsers.every((browser) => !browser.isConnected())).toBe(true)
    expect(f.counts()).toEqual({ launches: 1, closes: 2 })
    expect(f.backend.idleResources()).toBe(0)
  } catch (error) {
    failure = error
  }
  await f.cleanup(failure, accepted)
}, 20_000)
