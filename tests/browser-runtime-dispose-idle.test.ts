import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, type HbarAPI } from '@hbar/plugin-sdk'
import { BrowserRuntime, FetchBrowserBackend, browserConfigSchema } from '../plugins/browser-use/src/index'

function gate() {
  let release: () => void = () => {
    throw new Error('Gate not initialized')
  }
  const promise = new Promise<void>((done) => {
    release = done
  })
  return { promise, release: () => release() }
}
class Provider extends FetchBrowserBackend {
  entered = gate()
  finish = gate()
  fail = false
  closesFail = false
  disposals = 0
  navigationHeld = false
  readonly navigationEntered = gate()
  readonly navigationFinish = gate()
  override async navigate(_context: string, _page: string, url: string, _signal: AbortSignal) {
    if (this.navigationHeld) {
      this.navigationEntered.release()
      await this.navigationFinish.promise
    }
    return { url, title: 'Controlled provider' }
  }
  override async close(context: string, page?: string, signal?: AbortSignal) {
    if (this.closesFail) throw new Error('Known provider close rejected')
    await super.close(context, page, signal)
  }
  async dispose() {
    this.disposals++
    this.entered.release()
    await this.finish.promise
    if (this.fail) throw new Error('Provider disposal outcome unavailable')
  }
}
async function fixture() {
  const root = resolve(await mkdtemp(join(tmpdir(), 'hbar-browser-runtime-dispose-')))
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-browser-runtime-dispose-'))
    throw new Error('Unowned fixture root')
  let api: HbarAPI | undefined
  const observer = definePlugin({
    manifest: {
      id: 'browser.dispose.fixture',
      name: 'Browser fixture',
      description: 'Capture the real public API',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
    },
    apply(context) {
      api = context.hbar.api
    },
  })
  let kernel: Kernel | undefined
  let runtime: BrowserRuntime | undefined
  const backend = new Provider()
  try {
    kernel = await Kernel.create({
      dataRoot: join(root, 'data'),
      cacheRoot: join(root, 'cache'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { plugins: [observer] },
    })
    kernel.beginDrain()
    if (!api) throw new Error('Real Kernel public API was not captured')
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Real fixture workspace missing')
    const session = await kernel.createSession(workspace.id, 'Browser dispose fixture')
    runtime = new BrowserRuntime(
      api,
      browserConfigSchema.parse({ timeoutMs: 50, default_origin_policy: { access: 'allow' } }),
      backend,
    )
    return {
      runtime,
      backend,
      session,
      async cleanup(primary: unknown, pending: readonly Promise<unknown>[]) {
        backend.fail = false
        backend.closesFail = false
        backend.finish.release()
        backend.navigationFinish.release()
        await Promise.allSettled(pending)
        const errors: unknown[] = primary === undefined ? [] : [primary]
        try {
          await runtime?.dispose()
        } catch (error) {
          errors.push(error)
        }
        try {
          await kernel?.close()
        } catch (error) {
          errors.push(error)
        }
        if (!errors.length) await rm(root, { recursive: true, force: true })
        if (errors.length)
          throw new AggregateError(errors, 'Browser runtime disposal fixture failed', { cause: errors[0] })
      },
    }
  } catch (error) {
    backend.finish.release()
    const errors: unknown[] = [error]
    try {
      await runtime?.dispose()
    } catch (cleanupError) {
      errors.push(cleanupError)
    }
    try {
      await kernel?.close()
    } catch (cleanupError) {
      errors.push(cleanupError)
    }
    throw new AggregateError(errors, 'Fixture construction failed; root retained', { cause: error })
  }
}
test('real Kernel API BrowserRuntime retains a pending zero-handle disposal and unknown failure until explicit success', async () => {
  const f = await fixture(),
    accepted: Promise<unknown>[] = []
  let failure: unknown
  try {
    f.backend.fail = true
    const first = f.runtime.dispose(),
      joined = f.runtime.dispose()
    const outcome = first.then(
      () => 'resolved',
      () => 'rejected',
    )
    accepted.push(first, joined)
    await f.backend.entered.promise
    expect(f.backend.idleResources()).toBe(0)
    expect(f.runtime.idleCheckpoint().requests).toBeGreaterThan(0)
    expect(f.backend.disposals).toBe(1)
    f.backend.finish.release()
    expect(await outcome).toBe('rejected')
    await Promise.allSettled([joined])
    expect(f.runtime.idleCheckpoint()).toMatchObject({ requests: 0, unconfirmed: 1 })
    f.backend.fail = false
    await f.runtime.dispose()
    expect(f.runtime.idleCheckpoint()).toMatchObject({ requests: 0, resources: 0, unconfirmed: 0 })
  } catch (error) {
    failure = error
  }
  await f.cleanup(failure, accepted)
}, 20_000)

test('timed-out actual provider work is joined before coalesced disposal and new bounded admission resumes only afterward', async () => {
  const f = await fixture(),
    accepted: Promise<unknown>[] = []
  let failure: unknown
  try {
    f.backend.navigationHeld = true
    const navigation = f.runtime.navigate(f.session.id, 'https://example.invalid/')
    accepted.push(navigation)
    const outcome = navigation.then(
      () => 'resolved',
      (error) => {
        expect(error).toMatchObject({ code: 'BROWSER_TIMEOUT' })
        return 'timed-out'
      },
    )
    await f.backend.navigationEntered.promise
    expect(await outcome).toBe('timed-out') // actual configured timer; no sleep/global fake clock
    expect(f.runtime.idleCheckpoint().requests).toBeGreaterThan(0)
    const first = f.runtime.dispose(),
      joined = f.runtime.dispose()
    accepted.push(first, joined)
    expect(f.backend.disposals).toBe(0)
    await expect(f.runtime.status(f.session.id)).rejects.toMatchObject({ code: 'BROWSER_DISPOSING' })
    expect(f.runtime.idleCheckpoint().requests).toBeGreaterThan(0)
    f.backend.navigationFinish.release()
    await f.backend.entered.promise
    expect(f.backend.disposals).toBe(1)
    f.backend.finish.release()
    await Promise.all([first, joined])
    expect(f.runtime.idleCheckpoint()).toMatchObject({ requests: 0, resources: 0, unconfirmed: 0 })
    f.backend.navigationHeld = false
    await f.runtime.navigate(f.session.id, 'https://example.invalid/after-dispose')
    await f.runtime.dispose()
  } catch (error) {
    failure = error
  }
  await f.cleanup(failure, accepted)
}, 20_000)

test('real Kernel API failed Browser disposal preserves close then navigation then disposal retry', async () => {
  const f = await fixture(),
    accepted: Promise<unknown>[] = []
  let failure: unknown
  try {
    await f.runtime.navigate(f.session.id, 'https://example.invalid/')
    f.backend.closesFail = true
    await expect(f.runtime.dispose()).rejects.toThrow('Known provider close rejected')
    expect(f.runtime.idleCheckpoint().unconfirmed).toBe(1)
    f.backend.closesFail = false
    await f.runtime.close(f.session.id)
    await f.runtime.navigate(f.session.id, 'https://example.invalid/again')
    expect(f.runtime.idleCheckpoint().unconfirmed).toBe(1)
    f.backend.finish.release()
    await f.runtime.dispose()
    expect(f.runtime.idleCheckpoint()).toMatchObject({ requests: 0, resources: 0, unconfirmed: 0 })
  } catch (error) {
    failure = error
  }
  await f.cleanup(failure, accepted)
}, 20_000)
