import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { IpcPeer, RuntimeValuePort, procedure, runtimeReadySchema } from '@hbar/runtime'
import { RUNTIME_KERNEL_HOST_METHODS } from '@hbar/kernel/runtime-port'
import { Storage, createPathLayout, ensurePathLayout, storageRpcCallSchema } from '@hbar/storage'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

async function bounded<Value>(pending: Promise<Value>, timeoutMs = 3_000): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Nested Storage progress deadline exceeded')), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Nested Storage observation deadline exceeded')
    await Bun.sleep(2)
  }
}
const resultSchema = z.strictObject({
  fulfilled: z.number().int(),
  rejected: z.number().int(),
  values: z.array(z.number()),
  outgoingPeak: z.number().int(),
  incomingPeak: z.number().int(),
  queuedPeak: z.number().int(),
})
const stateSchema = z.object({
  inFlight: z.number(),
  incoming: z.number(),
  queued: z.number(),
  incomingQueued: z.number(),
})

for (const mode of ['complete', 'cancel', 'legacy-blocked']) {
  test(`30 real child plugin callbacks retain bounded leaf Storage progress: ${mode}`, async () => {
    const prefix = 'hbar-nested-storage-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    const owner: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
    const remote: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: crypto.randomUUID() }
    const controls = [...RUNTIME_KERNEL_HOST_METHODS, 'kernel.plugins.callback'].filter(
      (method) => mode !== 'legacy-blocked' || method !== 'kernel.storage',
    )
    let storage: Storage | undefined
    let child: Bun.Subprocess<'ignore', 'ignore', 'pipe'> | undefined
    let peer: IpcPeer | undefined
    let values: RuntimeValuePort | undefined
    let stderr: Promise<string> | undefined
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let admitted = 0,
      callbacks = 0,
      leafCalls = 0,
      hostIncomingPeak = 0,
      hostOutgoingPeak = 0
    let failed = false
    let primary: unknown
    try {
      const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
      await ensurePathLayout(layout)
      storage = new Storage(layout.database, layout)
      await storage.call('ready')
      await storage.call('createWorkspace', root, 'nested fixture')
      const database = storage
      child = Bun.spawn([process.execPath, fileURLToPath(import.meta.resolve('@hbar/runtime/entry'))], {
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'pipe',
        windowsHide: true,
        serialization: 'json',
        env: {
          ...process.env,
          HBAR_RUNTIME_SELF: JSON.stringify(remote),
          HBAR_RUNTIME_PARENT: JSON.stringify(owner),
          HBAR_RUNTIME_MODULE: fileURLToPath(new URL('./fixtures/runtime-nested-storage-service.ts', import.meta.url)),
          HBAR_RUNTIME_PREPARATION: 'candidate',
          HBAR_RUNTIME_CONTROL_METHODS: JSON.stringify(controls),
        },
        ipc(value: unknown) {
          peer?.receive(value)
        },
      })
      const processChild = child
      stderr = new Response(child.stderr).text()
      peer = new IpcPeer({
        owner,
        remote,
        controlMethods: controls,
        transport: { send: (frame) => processChild.send(frame) },
      })
      const active = peer
      const sample = () => {
        const state = active.snapshot()
        hostIncomingPeak = Math.max(hostIncomingPeak, state.incoming)
        hostOutgoingPeak = Math.max(hostOutgoingPeak, state.inFlight)
      }
      void child.exited.then(() => active.close()).catch(() => active.close())
      values = new RuntimeValuePort(active, { prefix: 'kernel.plugins' })
      values.register('invoke', async ([index, callback]) => {
        admitted++
        sample()
        if (admitted === 24) release()
        await gate
        if (typeof callback !== 'function') throw new Error('Fixture callback missing')
        callbacks++
        const result: unknown = await Reflect.apply(callback, undefined, [])
        expect(result).toBe(index)
        return z.number().parse(result)
      })
      active.register(
        'kernel.storage',
        procedure(storageRpcCallSchema, z.unknown(), async (input, call) => {
          leafCalls++
          sample()
          if (mode === 'cancel') {
            if (!call.signal.aborted)
              await new Promise<void>((resolve) =>
                call.signal.addEventListener('abort', () => resolve(), { once: true }),
              )
            call.signal.throwIfAborted()
          }
          return database.executeRpc(input)
        }),
      )
      await active.call(
        'runtime.prepare',
        {
          descriptor: {
            id: 'kernel',
            kind: 'kernel',
            isolation: 'process',
            dependencies: [],
            required: true,
            reloadable: true,
            contractFingerprint: 'a'.repeat(64),
            storageSchema: 1,
          },
          configuration: {},
        },
        runtimeReadySchema,
        { timeoutMs: 2_000 },
      )
      await active.call('runtime.activate', { role: 'default' }, z.undefined())
      await active.call('fixture.begin', undefined, z.undefined())
      await until(() => admitted >= 24 && callbacks >= 24)
      if (mode === 'legacy-blocked') {
        await Bun.sleep(30)
        const state = stateSchema.parse(await active.call('fixture.state', undefined, z.unknown()))
        expect(admitted).toBe(24)
        expect(leafCalls).toBe(0)
        expect(state).toMatchObject({ inFlight: 24 })
        expect(state.queued).toBeGreaterThanOrEqual(24)
        await active.notify('fixture.cancel', undefined)
      } else if (mode === 'cancel') {
        await until(() => leafCalls > 0)
        await active.notify('fixture.cancel', undefined)
      }
      const result = await bounded(active.call('fixture.result', undefined, resultSchema))
      if (mode === 'complete') {
        expect(result.fulfilled).toBe(30)
        expect(result.rejected).toBe(0)
        expect(result.values.sort((left, right) => left - right)).toEqual(
          Array.from({ length: 30 }, (_, index) => index),
        )
        expect(leafCalls).toBe(30)
      } else {
        expect(result.fulfilled).toBe(0)
        expect(result.rejected).toBe(30)
      }
      expect(result.outgoingPeak).toBeLessThanOrEqual(32)
      expect(result.incomingPeak).toBeLessThanOrEqual(32)
      expect(result.outgoingPeak + result.incomingPeak).toBeLessThanOrEqual(64)
      expect(result.queuedPeak).toBeLessThanOrEqual(128)
      expect(hostIncomingPeak).toBeLessThanOrEqual(32)
      expect(hostOutgoingPeak).toBeLessThanOrEqual(32)
      await until(() => active.snapshot().inFlight === 0 && active.snapshot().incoming === 0)
      const settled = stateSchema.parse(await active.call('fixture.state', undefined, z.unknown()))
      expect(settled).toMatchObject({ inFlight: 0, queued: 0, incomingQueued: 0 })
      // fixture.state itself occupies exactly one incoming child request until its reply is sent.
      expect(settled.incoming).toBe(1)
      await active.call('runtime.dispose', undefined, z.undefined())
      await active.call('runtime.exit', undefined, z.undefined())
      expect(await bounded(child.exited)).toBe(0)
      expect(await stderr).not.toContain('[hbar runtime timeout] ')
    } catch (error) {
      failed = true
      primary = error
    }
    const cleanupErrors: unknown[] = []
    release()
    if (peer) {
      if (child?.exitCode === null) {
        try {
          await bounded(peer.notify('fixture.cancel', undefined), 1_000)
        } catch (error) {
          cleanupErrors.push(error)
        }
        try {
          await bounded(peer.call('runtime.dispose', undefined, z.undefined()), 1_000)
        } catch (error) {
          cleanupErrors.push(error)
        }
        try {
          await bounded(peer.call('runtime.exit', undefined, z.undefined()), 1_000)
        } catch (error) {
          cleanupErrors.push(error)
        }
        try {
          await bounded(child.exited, 1_000)
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      try {
        values?.dispose()
        peer.close()
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (child) {
      try {
        if (child.exitCode === null) child.kill()
        await child.exited
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    try {
      await stderr
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await storage?.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      const absolute = resolve(root)
      if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith(prefix))
        throw new Error('Refusing to remove an unowned nested Storage fixture')
      if (child?.exitCode === null) throw new Error('Retaining fixture while child exit remains unknown')
      await rm(absolute, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
    if (failed) throw primary
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Nested Storage fixture cleanup failed')
  }, 15_000)
}
