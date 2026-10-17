import { expect, test } from 'bun:test'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, type HbarAPI } from '@hbar/plugin-sdk'
import {
  ComputerRuntime,
  computerConfigSchema,
  computerPlugin,
  UnavailableComputerBackend,
} from '../plugins/computer-use/src/index'
import type { ComputerBackend } from '../plugins/computer-use/src/index'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

function gate() {
  let release: () => void = () => {
    throw new Error('Gate unavailable')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

test('actual ComputerRuntime retains timed-out physical work and coalesces disposal until both settle', async () => {
  const parent = resolve(tmpdir())
  const root = resolve(await mkdtemp(join(parent, 'computer-idle-controlled-')))
  const validate = () => {
    if (dirname(root) !== parent || !basename(root).startsWith('computer-idle-controlled-'))
      throw new Error('Unowned fixture')
  }
  validate()
  let api: HbarAPI | undefined
  const capture = definePlugin({
    manifest: computerPlugin.manifest,
    configSchema: computerConfigSchema,
    async apply(ctx, config) {
      api = ctx.hbar.api
      await computerPlugin.apply(ctx, config)
    },
  })
  const operation = gate(),
    disposing = gate()
  let entered = false,
    disposeCalls = 0
  class Controlled implements ComputerBackend {
    idleResources() {
      return 0
    }
    available() {
      entered = true
      return operation.promise.then(() => false)
    }
    screenshot = new UnavailableComputerBackend().screenshot
    click = new UnavailableComputerBackend().click
    doubleClick = new UnavailableComputerBackend().doubleClick
    type = new UnavailableComputerBackend().type
    key = new UnavailableComputerBackend().key
    scroll = new UnavailableComputerBackend().scroll
    move = new UnavailableComputerBackend().move
    launch = new UnavailableComputerBackend().launch
    dispose() {
      disposeCalls++
      return disposing.promise
    }
  }
  let kernel: Kernel | undefined
  let runtime: ComputerRuntime | undefined
  let pending: Promise<unknown> | undefined
  let failure: { error: unknown } | undefined
  try {
    kernel = await Kernel.create({
      dataRoot: join(root, 'data'),
      cacheRoot: join(root, 'cache'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { replacements: { 'computer-use.codex': capture } },
    })
    kernel.beginDrain()
    if (!api) throw new Error('Real plugin API missing')
    const workspace = (await kernel.storage.call('workspaces')).at(0)
    if (!workspace) throw new Error('Workspace missing')
    const session = await kernel.createSession(workspace.id, 'Controlled computer idle')
    expect(session.workspaceId).toBe(workspace.id)
    expect(kernel.plugins.get('computer')).toBeInstanceOf(ComputerRuntime)
    expect(kernel.plugins.get('computer-use')).toBeInstanceOf(ComputerRuntime)
    runtime = new ComputerRuntime(api, computerConfigSchema.parse({ timeoutMs: 30 }), new Controlled())
    pending = runtime.status(session.id).catch((error: unknown) => error)
    const result = await pending
    expect(result).toMatchObject({ code: 'COMPUTER_TIMEOUT' })
    expect(entered).toBe(true)
    expect(runtime.idleCheckpoint().requests).toBe(1)
    const close = runtime.dispose()
    expect(runtime.dispose()).toBe(close)
    await Promise.resolve()
    expect(disposeCalls).toBe(0)
    expect(runtime.idleCheckpoint().requests).toBeGreaterThan(0)
    operation.release()
    const deadline = Date.now() + 1_000
    while (disposeCalls === 0) {
      if (Date.now() >= deadline) throw new Error('Disposal did not enter')
      await Bun.sleep(5)
    }
    expect(disposeCalls).toBe(1)
    expect(runtime.idleCheckpoint().requests).toBe(1)
    disposing.release()
    await close
    expect(runtime.idleCheckpoint()).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 0,
    })
    class Unsupported extends Controlled {
      override idleResources() {
        return Number.NaN
      }
    }
    const unsupported = new ComputerRuntime(api, computerConfigSchema.parse({}), new Unsupported())
    expect(unsupported.idleCheckpoint()).toMatchObject({ supported: false, unconfirmed: 1 })
    await unsupported.dispose()
    class Rejecting extends UnavailableComputerBackend {
      dispose() {
        return Promise.reject(new Error('controlled-disposal'))
      }
    }
    const rejected = new ComputerRuntime(api, computerConfigSchema.parse({}), new Rejecting())
    await expect(rejected.dispose()).rejects.toThrow('controlled-disposal')
    expect(rejected.idleCheckpoint()).toMatchObject({ requests: 0, unconfirmed: 1 })
  } catch (error) {
    failure = { error }
  }
  operation.release()
  disposing.release()
  const errors: unknown[] = []
  try {
    await pending
    await runtime?.dispose()
  } catch (error) {
    errors.push(error)
  }
  try {
    await kernel?.close()
  } catch (error) {
    errors.push(error)
  }
  if (errors.length === 0) {
    try {
      validate()
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length) {
    const all = failure ? [failure.error, ...errors] : errors
    throw new AggregateError(all, 'Controlled computer fixture cleanup failed', { cause: all[0] })
  }
  if (failure) throw failure.error
}, 20_000)
