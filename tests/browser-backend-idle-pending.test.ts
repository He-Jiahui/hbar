import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { FetchBrowserBackend } from '../plugins/browser-use/src/index'
import { AutoBrowserBackend } from '../plugins/browser-use/src/playwright-backend'

function gate() {
  let release: () => void = () => {
    throw new Error('Gate not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

// Typed provider seam only. No Chromium, network, native handle or native exit proof.
// Real Auto selection/cleanup code, not the counter implementation, is exercised.
class ControlledProvider extends FetchBrowserBackend {
  readonly entered = gate()
  readonly finish = gate()
  readonly disposing = gate()
  readonly disposed = gate()
  navigation: 'success' | 'unavailable' | 'rejected' = 'success'
  override async navigate(_contextId: string, _pageId: string, url: string, _signal: AbortSignal) {
    this.entered.release()
    await this.finish.promise
    if (this.navigation === 'unavailable')
      throw new HbarError('BROWSER_BACKEND_UNAVAILABLE', 'Controlled unavailable provider')
    if (this.navigation === 'rejected') throw new Error('Controlled provider rejection')
    return { url, title: 'Controlled provider result' }
  }
  async dispose() {
    this.disposing.release()
    await this.disposed.promise
  }
}

async function cleanup(
  primary: ControlledProvider,
  fallback: ControlledProvider,
  backend: AutoBrowserBackend,
  pending: readonly Promise<unknown>[],
  primaryFailure: unknown,
) {
  primary.finish.release()
  fallback.finish.release()
  primary.disposed.release()
  fallback.disposed.release()
  const errors: unknown[] = primaryFailure === undefined ? [] : [primaryFailure]
  await Promise.allSettled(pending)
  try {
    await backend.dispose()
  } catch (error) {
    errors.push(error)
  }
  if (errors.length)
    throw new AggregateError(errors, 'Browser provider fixture or disposal failed', { cause: errors[0] })
}

test('Auto retains pending selection independently of provider handles and caller abort', async () => {
  const primary = new ControlledProvider(),
    fallback = new ControlledProvider()
  const backend = new AutoBrowserBackend(primary, fallback)
  const abort = new AbortController()
  const pending = backend.navigate('context', 'page', 'https://example.invalid/', abort.signal)
  let failure: unknown
  try {
    await primary.entered.promise
    expect(primary.idleResources()).toBe(0)
    expect(fallback.idleResources()).toBe(0)
    expect(backend.idleResources()).toBeGreaterThan(0)
    abort.abort()
    expect(backend.idleResources()).toBeGreaterThan(0)
    primary.finish.release()
    expect((await pending).url).toBe('https://example.invalid/')
    expect(backend.idleResources()).toBeGreaterThan(0) // actual Auto selected entry
    await backend.close('context')
    expect(backend.idleResources()).toBe(0)
  } catch (error) {
    failure = error
  }
  await cleanup(primary, fallback, backend, [pending], failure)
}, 20_000)

test('Auto fallback selection stays occupied between primary rejection and fallback receipt', async () => {
  const primary = new ControlledProvider(),
    fallback = new ControlledProvider()
  primary.navigation = 'unavailable'
  const backend = new AutoBrowserBackend(primary, fallback)
  const pending = backend.navigate('context', 'page', 'https://example.invalid/', new AbortController().signal)
  let failure: unknown
  try {
    await primary.entered.promise
    primary.finish.release()
    await fallback.entered.promise
    expect(backend.idleResources()).toBeGreaterThan(0)
    fallback.finish.release()
    await pending
    expect(backend.idleResources()).toBeGreaterThan(0)
    await backend.close('context')
    expect(backend.idleResources()).toBe(0)
  } catch (error) {
    failure = error
  }
  await cleanup(primary, fallback, backend, [pending], failure)
}, 20_000)

test('Auto retains actual disposal Promise before any selected handle exists', async () => {
  const primary = new ControlledProvider(),
    fallback = new ControlledProvider()
  const backend = new AutoBrowserBackend(primary, fallback)
  const pending = backend.dispose()
  let failure: unknown
  try {
    await primary.disposing.promise
    expect(backend.idleResources()).toBeGreaterThan(0)
    primary.disposed.release()
    await fallback.disposing.promise
    expect(backend.idleResources()).toBeGreaterThan(0)
    fallback.disposed.release()
    await pending
    expect(backend.idleResources()).toBe(0)
  } catch (error) {
    failure = error
  }
  await cleanup(primary, fallback, backend, [pending], failure)
}, 20_000)

test('Auto releases rejected selection only after actual provider Promise settles', async () => {
  const primary = new ControlledProvider(),
    fallback = new ControlledProvider()
  primary.navigation = 'rejected'
  const backend = new AutoBrowserBackend(primary, fallback)
  const pending = backend.navigate('context', 'page', 'https://example.invalid/', new AbortController().signal)
  const outcome = pending.then(
    () => 'resolved',
    () => 'rejected',
  )
  let failure: unknown
  try {
    await primary.entered.promise
    expect(backend.idleResources()).toBeGreaterThan(0)
    primary.finish.release()
    expect(await outcome).toBe('rejected')
    expect(backend.idleResources()).toBe(0)
  } catch (error) {
    failure = error
  }
  await cleanup(primary, fallback, backend, [pending], failure)
}, 20_000)
