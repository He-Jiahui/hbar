import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { providerSchema } from '@hbar/contracts'
import type { ModelRequest } from '@hbar/plugin-sdk'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { ManagedProcess, RuntimeArtifactStore, runtimeIdleProbeSchema } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { DRIVER_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-driver-contract'
import { RuntimeDriverAdapter } from '../apps/host/src/runtime-driver-adapter'

function gate() {
  let release: () => void = () => {
    throw new Error('Gate not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

test('single real PiDriver counts held loopback summaries, settles them and drains without accepting a replacement', async () => {
  const root = resolve(await mkdtemp(join(tmpdir(), 'hbar-driver-summary-idle-')))
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-driver-summary-idle-'))
    throw new Error('Unowned Driver fixture path')
  const entered = [gate(), gate()],
    finish = [gate(), gate()]
  const handlerWork: Promise<void>[] = []
  const requestErrors: unknown[] = []
  let providerRequests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      try {
        const index = providerRequests++
        const accepted = entered[index],
          completed = finish[index]
        if (!accepted || !completed) throw new Error('Unexpected extra loopback provider request')
        expect(new URL(request.url).pathname).toBe('/v1/chat/completions')
        expect(request.headers.get('authorization')).toBe('Bearer owned-loopback-dummy-key')
        const body: unknown = await request.json()
        expect(body).toMatchObject({ model: 'owned-summary', stream: true })
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const work = (async () => {
              const encode = (delta: unknown, finishReason: string | null) =>
                new TextEncoder().encode(
                  `data: ${JSON.stringify({
                    id: `owned-summary-${index}`,
                    object: 'chat.completion.chunk',
                    created: 1,
                    model: 'owned-summary',
                    choices: [{ index: 0, delta, finish_reason: finishReason }],
                    ...(finishReason ? { usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } } : {}),
                  })}\n\n`,
                )
              controller.enqueue(encode({ role: 'assistant', content: 'Owned summary.' }, null))
              accepted.release()
              await completed.promise
              controller.enqueue(encode({}, 'stop'))
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
              controller.close()
            })()
            handlerWork.push(work)
            void work.catch((error) => {
              requestErrors.push(error)
              try {
                controller.error(error)
              } catch {
                /* already closed */
              }
            })
          },
        })
        return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
      } catch (error) {
        requestErrors.push(error)
        return new Response('Owned provider fixture failure', { status: 500 })
      }
    },
  })
  let managed: ManagedProcess | undefined, adapter: RuntimeDriverAdapter | undefined
  const accepted: Promise<unknown>[] = []
  let primary: unknown
  let primaryFailed = false
  try {
    const descriptor: RuntimeUnitDescriptor = {
      id: 'driver.pi',
      kind: 'driver',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: DRIVER_RUNTIME_FINGERPRINT,
      storageSchema: STORAGE_SCHEMA_VERSION,
    }
    const store = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
    const artifact = await store.build({ descriptor, entrypoint: 'apps/host/src/runtime-driver-process.ts' })
    managed = new ManagedProcess({
      descriptor,
      artifactId: artifact.id,
      modulePath: await store.modulePath(artifact.id),
      generation: 1,
      parent: { unitId: 'kernel', generation: 1, incarnation: 'summary-idle-component' },
      onPeer: (peer) => {
        adapter = new RuntimeDriverAdapter(peer)
      },
      onExit: async () => {
        adapter?.dispose()
      },
    })
    await managed.prepare()
    await managed.activate()
    if (!adapter) throw new Error('Real Driver adapter was not attached')
    const actual = adapter
    const input: ModelRequest = {
      system: 'Summarize the owned fixture history.',
      model: providerSchema.parse({
        id: 'owned-loopback',
        name: 'Owned loopback',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        model: 'owned-summary',
        contextWindow: 4096,
        maxOutput: 128,
      }),
      messages: [
        {
          id: 'summary-history',
          sessionId: 'owned-session',
          runId: 'owned-run',
          role: 'user',
          seq: 1,
          createdAt: 1,
          content: [{ type: 'text', text: 'Bounded owned history.' }],
        },
      ],
      context: { sessionId: 'owned-session', runId: 'owned-run', purpose: 'execution' },
    }
    for (let index = 0; index < 2; index++) {
      const summary = actual.summarize(input, 'owned-loopback-dummy-key', new AbortController().signal)
      void summary.catch(() => undefined)
      accepted.push(summary)
      const enteredGate = entered[index],
        finishGate = finish[index]
      if (!enteredGate || !finishGate) throw new Error('Expected bounded summary gate')
      await Promise.race([
        enteredGate.promise,
        summary.then(() => {
          throw new Error('Summary settled before held SSE acceptance')
        }),
      ])
      const first = await managed.call('runtime.idle', undefined, runtimeIdleProbeSchema)
      const second = await managed.call('runtime.idle', undefined, runtimeIdleProbeSchema)
      expect(first).toMatchObject({ eligible: false, requests: 1, runs: 0 })
      expect(second).toMatchObject({ eligible: false, requests: 1, runs: 0 })
      if (index === 1) {
        expect(await managed.drain()).toMatchObject({ requests: 1, runs: 0 })
        let rejected = false
        let rejection: unknown
        try {
          await actual.summarize(input, 'owned-loopback-dummy-key', new AbortController().signal)
        } catch (error) {
          rejected = true
          rejection = error
        }
        expect(rejected).toBe(true)
        expect(rejection).toMatchObject({ code: 'DRIVER_NOT_SERVING' })
        expect(providerRequests).toBe(2)
      }
      finishGate.release()
      expect((await summary).text).toContain('Owned summary.')
      const idle = await managed.call('runtime.idle', undefined, runtimeIdleProbeSchema)
      expect(idle).toMatchObject({ requests: 0, runs: 0, resources: 0 })
      if (index === 0) expect(idle.eligible).toBe(true)
    }
    expect(providerRequests).toBe(2)
    expect(requestErrors).toEqual([])
  } catch (error) {
    primaryFailed = true
    primary = error
  }
  for (const completed of finish) completed.release()
  const errors: unknown[] = primaryFailed ? [primary] : []
  for (const result of await Promise.allSettled(accepted)) if (result.status === 'rejected') errors.push(result.reason)
  for (const result of await Promise.allSettled(handlerWork))
    if (result.status === 'rejected') errors.push(result.reason)
  try {
    await managed?.dispose()
  } catch (error) {
    errors.push(error)
  }
  adapter?.dispose()
  try {
    await server.stop(true)
  } catch (error) {
    errors.push(error)
  }
  errors.push(...requestErrors)
  if (!errors.length) await rm(root, { recursive: true, force: true })
  if (errors.length)
    throw new AggregateError(errors, 'Driver summary component or owned cleanup failed', { cause: errors[0] })
}, 20_000)
