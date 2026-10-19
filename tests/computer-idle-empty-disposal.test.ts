import { expect, test } from 'bun:test'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, type HbarAPI } from '@hbar/plugin-sdk'
import {
  ComputerRuntime,
  computerConfigSchema,
  computerPlugin,
  UnavailableComputerBackend,
} from '../plugins/computer-use/src/index'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

test('fresh empty runtime cannot report zero while actual backend disposal is pending', async () => {
  const parent = resolve(tmpdir())
  const root = resolve(await mkdtemp(join(parent, 'computer-empty-dispose-')))
  const validate = (): void => {
    if (dirname(root) !== parent || !basename(root).startsWith('computer-empty-dispose-'))
      throw new Error('Unowned fixture')
  }
  validate()
  let release: () => void = () => {
    throw new Error('Disposal gate unavailable')
  }
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate
  })
  let entered = false
  class Held extends UnavailableComputerBackend {
    override idleResources() {
      return 0
    }
    dispose() {
      entered = true
      return gate
    }
  }
  class Rejected extends UnavailableComputerBackend {
    override idleResources() {
      return 0
    }
    dispose() {
      return Promise.reject(new Error('Controlled empty disposal failure'))
    }
  }
  let api: HbarAPI | undefined
  const capture = definePlugin({
    manifest: computerPlugin.manifest,
    configSchema: computerConfigSchema,
    async apply(ctx, config) {
      api = ctx.hbar.api
      await computerPlugin.apply(ctx, config)
    },
  })
  let kernel: Kernel | undefined
  let closing: Promise<void> | undefined
  let failure: { readonly error: unknown } | undefined
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
    expect(kernel.plugins.get('computer')).toBeInstanceOf(ComputerRuntime)
    const runtime = new ComputerRuntime(api, computerConfigSchema.parse({}), new Held())
    expect(runtime.idleCheckpoint()).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 0,
    })
    closing = runtime.dispose()
    const deadline = Date.now() + 1_000
    while (!entered) {
      if (Date.now() >= deadline) throw new Error('Backend disposal never entered')
      await Bun.sleep(5)
    }
    // No status/action has run: only the actual pending disposal can hold this count.
    expect(runtime.idleCheckpoint().requests).toBeGreaterThan(0)
    expect(runtime.idleCheckpoint().resources).toBe(0)
    release()
    await closing
    expect(runtime.idleCheckpoint()).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 0,
    })
    const rejected = new ComputerRuntime(api, computerConfigSchema.parse({}), new Rejected())
    await expect(rejected.dispose()).rejects.toThrow('Controlled empty disposal failure')
    expect(rejected.idleCheckpoint()).toMatchObject({ requests: 0, unconfirmed: 1 })
  } catch (error) {
    failure = { error }
  }
  release()
  const cleanupErrors: unknown[] = []
  try {
    await closing
  } catch (error) {
    cleanupErrors.push(error)
  }
  try {
    await kernel?.close()
  } catch (error) {
    cleanupErrors.push(error)
  }
  if (cleanupErrors.length === 0) {
    try {
      validate()
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length) {
    const errors = failure ? [failure.error, ...cleanupErrors] : cleanupErrors
    throw new AggregateError(errors, 'Empty disposal fixture cleanup failed', { cause: errors[0] })
  }
  if (failure) throw failure.error
}, 20_000)
