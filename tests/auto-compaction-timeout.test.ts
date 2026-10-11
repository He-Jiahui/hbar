import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'
import type { DiagnosticEvent } from '@hbar/contracts'
import {
  AUTO_COMPACTION_TIMEOUT_MS,
  createBoundedCompactionSignal,
  resolveCompactionTimeoutMs,
} from '../packages/kernel/src/compaction-timeout'

async function removeOwnedFixture(root: string) {
  const owned = await realpath(root)
  const parent = await realpath(process.env.TEMP ?? 'C:/Windows/Temp')
  if (dirname(owned) !== parent || !basename(owned).startsWith('hbar-auto-compaction-timeout-')) {
    throw new Error('Refusing to remove an unowned fixture')
  }
  await rm(owned, { recursive: true, force: true })
}

test('automatic compaction bounds a hanging HTTP 200 summary and preserves raw context', async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? 'C:/Windows/Temp', 'hbar-auto-compaction-timeout-'))
  let aborted = false
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      request.signal.addEventListener('abort', () => {
        aborted = true
      })
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"id":"hanging","choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
            ),
          )
        },
        cancel() {
          aborted = true
        },
      })
      return new Response(body, {
        headers: { 'content-type': 'text/event-stream', 'x-request-id': 'auto-timeout-fixture' },
      })
    },
  })
  const diagnostics: DiagnosticEvent[] = []
  let cancelOnResponse: (() => void) | undefined
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Automatic compaction timeout fixture',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      description: 'Tests automatic compaction timeout',
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        supportsCanonicalSteering: true,
        supportsSteeringAdmissionClosure: true,
        async run(input) {
          await input.beforeRequest(input.request, 'initial-step')
          await input.commit('assistant', [{ type: 'tool_call', callId: 'hanging-call', name: 'read', args: {} }])
          await input.commit('tool', [
            {
              type: 'tool_result',
              callId: 'hanging-call',
              name: 'read',
              text: 'x'.repeat(40_000),
              isError: false,
            },
          ])
          await input.beforeRequest(input.request, 'after-large-tool')
        },
        summarize: (request, apiKey, signal, onDiagnostic) =>
          new PiDriver().summarize(request, apiKey, signal, onDiagnostic),
      })
    },
  })
  let kernel: Kernel | undefined
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      secrets: new MemorySecrets(),
      diagnostics: {
        emit(event) {
          diagnostics.push(event)
          if (event.event === 'provider.response' && event.httpStatus === 200) cancelOnResponse?.()
        },
      },
      compactionTimeoutMs: 200,
      profile: { replacements: { 'driver.pi': driver } },
    })
    await kernel.saveProvider(
      {
        id: 'auto-timeout',
        name: 'Auto timeout fixture',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        model: 'fixture',
        contextWindow: 1024,
        maxOutput: 128,
      },
      'fixture-key',
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Workspace fixture missing')
    const session = await kernel.createSession(workspace.id)
    const originalContext = await kernel.storage.call('context', session.id)
    const run = await kernel.submit(
      session.id,
      'auto-timeout',
      { text: 'trigger automatic compaction', images: [] },
      'auto-timeout',
    )
    await kernel.waitForIdle()
    const stored = await kernel.storage.call('run', run.id)
    expect(stored.status).toBe('failed')
    expect(stored.failure?.code).toBe('COMPACTION_TIMEOUT')
    expect(stored.failure?.category).toBe('timeout')
    const snapshot = await kernel.snapshot(session.id)
    expect(
      snapshot.messages.flatMap((message) => message.content).find((block) => block.type === 'tool_result'),
    ).toMatchObject({
      text: 'x'.repeat(40_000),
      isError: false,
    })
    const uncompressedContext = await kernel.storage.call('context', session.id)
    expect(uncompressedContext).toMatchObject({
      summary: originalContext.summary,
      throughSeq: originalContext.throughSeq,
    })
    expect(snapshot.contextHistory?.records[0]).toMatchObject({
      trigger: 'automatic',
      status: 'failed',
      errorCode: 'COMPACTION_TIMEOUT',
      chunks: 0,
    })
    expect(aborted).toBe(true)
    const own = diagnostics.filter((event) => event.runId === run.id)
    const start = own.find((event) => event.event === 'provider.request_started')
    const terminal = own.find((event) => event.event === 'provider.request_settled')
    expect(start?.modelRequestId).toBeTruthy()
    expect(terminal?.modelRequestId).toBe(start?.modelRequestId)
    expect(terminal?.attemptId).toBe(start?.attemptId)
    expect(own.some((event) => event.event === 'provider.response' && event.httpStatus === 200)).toBe(true)
    expect(own.some((event) => event.event === 'provider.request_settled' && event.outcome === 'skipped')).toBe(true)
    expect(
      own.some((event) => event.event === 'context.compaction_failed' && event.errorCode === 'COMPACTION_TIMEOUT'),
    ).toBe(true)
    expect(own.find((event) => event.event === 'context.compaction_failed')?.durationMs).toBeLessThan(2_000)
    const serialized = JSON.stringify(own)
    expect(serialized).not.toContain('fixture-key')
    expect(serialized).not.toContain('x'.repeat(64))

    const beforeParent = diagnostics.length
    const parent = new AbortController()
    const parentReason = new HbarError('USER_CANCELLED', 'parent cancellation')
    cancelOnResponse = () => parent.abort(parentReason)
    let parentFailure: unknown
    try {
      await kernel.compact(session.id, 'auto-timeout', parent.signal)
    } catch (error) {
      parentFailure = error
    }
    cancelOnResponse = undefined
    expect(parentFailure).toBe(parentReason)
    const parentEvents = diagnostics.slice(beforeParent)
    expect(parentEvents.some((event) => event.event === 'provider.response' && event.httpStatus === 200)).toBe(true)
    expect(
      parentEvents.some((event) => event.event === 'context.compaction_stage' && event.phase === 'summary_started'),
    ).toBe(true)
    expect((await kernel.snapshot(session.id)).contextHistory?.records[0]).toMatchObject({
      trigger: 'manual',
      status: 'cancelled',
      errorCode: 'USER_CANCELLED',
    })
    let manualTimeout: unknown
    try {
      await kernel.compact(session.id, 'auto-timeout')
    } catch (error) {
      manualTimeout = error
    }
    expect(manualTimeout).toMatchObject({ code: 'COMPACTION_TIMEOUT' })
    expect((await kernel.snapshot(session.id)).contextHistory?.records[0]).toMatchObject({
      trigger: 'manual',
      status: 'failed',
      errorCode: 'COMPACTION_TIMEOUT',
    })
    expect(await kernel.storage.call('context', session.id)).toEqual(uncompressedContext)
    // Upload is rejected while maintenance is held, so success proves it was released.
    const attachment = await kernel.upload('post-timeout.txt', 'text/plain', new TextEncoder().encode('ready'))
    expect(attachment.size).toBe(5)
  } finally {
    streamController?.error(new Error('fixture cleanup'))
    if (kernel) await kernel.close()
    await server.stop(true)
    await removeOwnedFixture(root)
  }
})

test('compaction limits reject invalid values and keep the production ceiling', () => {
  expect(resolveCompactionTimeoutMs(undefined)).toBe(300_000)
  expect(AUTO_COMPACTION_TIMEOUT_MS).toBe(300_000)
  expect(resolveCompactionTimeoutMs(1)).toBe(1)
  expect(resolveCompactionTimeoutMs(300_000)).toBe(300_000)
  for (const value of [0, -1, 1.5, 300_001, NaN, Infinity]) {
    expect(() => resolveCompactionTimeoutMs(value)).toThrow(HbarError)
  }
})

test('a disposed successful compaction cannot abort later or inherit a later parent cancellation', async () => {
  const parent = new AbortController()
  const deadline = createBoundedCompactionSignal(parent.signal, 10)
  deadline.dispose()
  deadline.dispose()
  parent.abort(new HbarError('USER_CANCELLED', 'later parent cancellation'))
  await Bun.sleep(30)
  expect(deadline.signal.aborted).toBe(false)
  expect(deadline.timedOut()).toBe(false)
})

test('an already cancelled parent keeps its exact reason beyond the deadline', async () => {
  const parent = new AbortController()
  const reason = new HbarError('USER_CANCELLED', 'already cancelled')
  parent.abort(reason)
  const deadline = createBoundedCompactionSignal(parent.signal, 10)
  try {
    await Bun.sleep(30)
    expect(deadline.signal.reason).toBe(reason)
    expect(deadline.timedOut()).toBe(false)
  } finally {
    deadline.dispose()
  }
})

test('parent cancellation before the deadline is preserved after a slow cleanup', async () => {
  const parent = new AbortController()
  const reason = new HbarError('USER_CANCELLED', 'cancelled during summary')
  const deadline = createBoundedCompactionSignal(parent.signal, 10)
  try {
    parent.abort(reason)
    await Bun.sleep(30)
    expect(deadline.signal.reason).toBe(reason)
    expect(deadline.timedOut()).toBe(false)
  } finally {
    deadline.dispose()
  }
})
