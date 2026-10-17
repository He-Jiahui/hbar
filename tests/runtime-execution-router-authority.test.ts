import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, type ExecutionProvider, type RuntimePluginIdleRegistry } from '@hbar/plugin-sdk'
import { runtimeExecutionRouterPlugin } from '../apps/host/src/runtime-execution-router'

test('the actual execution plugin reader forwards owner-native authority without clearing descendant uncertainty', async () => {
  const tempParent = resolve(tmpdir())
  const root = resolve(await mkdtemp(join(tempParent, 'hbar-router-authority-')))
  const validateOwnedRoot = (): void => {
    if (dirname(root) !== tempParent || !basename(root).startsWith('hbar-router-authority-'))
      throw new Error('Refusing unowned execution router fixture path')
  }
  validateOwnedRoot()
  let reader: Parameters<RuntimePluginIdleRegistry['register']>[0] | undefined
  const plugin = runtimeExecutionRouterPlugin({
    dataRoot: join(root, 'data'),
    workspaceDirectory: join(root, 'worktrees'),
    localEnabled: true,
    mounts: { get: () => undefined, verify: () => Promise.resolve() },
    verifyWorktree: () => Promise.resolve(false),
    invokeHost: () => Promise.reject(new Error('Unexpected remote execution')),
    loadSnapshot: () => Promise.reject(new Error('Unexpected sandbox snapshot')),
  })
  const observed = definePlugin({
    manifest: plugin.manifest,
    async apply(ctx, config) {
      const previous = ctx.hbar.api.runtimeIdle
      ctx.hbar.api.runtimeIdle = {
        register(read) {
          reader = read
          return () => {
            reader = undefined
          }
        },
      }
      try {
        await plugin.apply(ctx, config)
      } finally {
        if (previous === undefined) delete ctx.hbar.api.runtimeIdle
        else ctx.hbar.api.runtimeIdle = previous
      }
    },
  })
  let kernel: Kernel | undefined
  let failure: { readonly error: unknown } | undefined
  try {
    kernel = await Kernel.create({
      dataRoot: join(root, 'data'),
      cacheRoot: join(root, 'cache'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { replacements: { 'execution.local': observed } },
    })
    kernel.beginDrain()
    const execution = kernel.plugins.get<ExecutionProvider>('execution')
    const result = await execution.exec(root, 'echo authority-probe', AbortSignal.timeout(5_000), { timeoutMs: 5_000 })
    expect(result.isError).not.toBe(true)
    const read = reader
    if (!read) throw new Error('Execution plugin idle reader was not registered')
    const deadline = Date.now() + 2_000
    while (read().background !== 0 || read().resources !== 0) {
      if (Date.now() >= deadline) throw new Error('Physical shell work did not settle')
      await Bun.sleep(5)
    }
    const owner = { unitId: 'execution.local', generation: 1, incarnation: 'fixture-owner' }
    expect(read().unconfirmed).toBe(1)
    expect(read({ owner, nativeActive: 1 })).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 0,
    })
    expect(read({ owner, nativeActive: 2 }).unconfirmed).toBe(1)
    expect(read().unconfirmed).toBe(1)
  } catch (error) {
    failure = { error }
  }
  const cleanupErrors: unknown[] = []
  try {
    await kernel?.close()
  } catch (error) {
    cleanupErrors.push(error)
  }
  // A failed close retains possibly live storage and the original business cause.
  if (cleanupErrors.length === 0) {
    try {
      validateOwnedRoot()
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length > 0) {
    const errors = failure ? [failure.error, ...cleanupErrors] : cleanupErrors
    throw new AggregateError(errors, 'Execution router fixture cleanup failed', { cause: errors[0] })
  }
  if (failure) throw failure.error
}, 20_000)
