import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarError } from '@hbar/contracts'
import type { DiagnosticEvent } from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver } from '@hbar/plugin-sdk'
import { expect, test } from 'bun:test'

const cancelledStepDriver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'Cancelled step fixture',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    description: 'Exercise cancelled model-step settlement in the real Kernel',
    provides: { driver: '1.0.0' },
    permissions: [],
  },
  apply(ctx) {
    provide<HarnessDriver>(ctx, 'driver', {
      async run(input) {
        const stepId = 'cancelled-step'
        await input.emit('step.started', { step: 1 }, stepId)
        await input.beforeRequest(input.request, stepId)
        input.onModelDiagnostic?.({
          phase: 'cancelled',
          purpose: 'model',
          providerId: 'cancel-fixture',
          modelSelectionId: input.request.model.id,
          modelRequestId: stepId,
          model: input.request.model.model,
          protocol: 'mock',
          stopReason: 'aborted',
        })
        await input.emit('step.ended', {}, stepId)
        await input.stepEnded(stepId)
        throw new HbarError('USER_CANCELLED', 'Cancelled in the local model lifecycle fixture')
      },
      async summarize() {
        throw new Error('Cancelled steps must not start compaction')
      },
    })
  },
})

test('Pi HTTP reset settles the durable failed step as failure and preserves the primary Run error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-failed-step-settlement-'))
  const events: DiagnosticEvent[] = []
  let requests = 0
  let kernel: Kernel | undefined
  const server = createServer((request, response) => {
    requests += 1
    request.resume()
    request.on('end', () => {
      if (requests === 1) {
        void kernel?.storage
          .call('commit', sessionId, runId, 'assistant', [{ type: 'text', text: 'x'.repeat(20_000) }])
          .then(() => request.socket.destroy())
          .catch((error: unknown) => request.socket.destroy(error instanceof Error ? error : undefined))
      } else {
        response.writeHead(502, { 'content-type': 'application/json' })
        response.end('{"error":{"message":"summary fixture failure"}}')
      }
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('HTTP reset fixture did not bind a TCP port')
  let sessionId = ''
  let runId = ''
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      secrets: new MemorySecrets(),
      diagnostics: { emit: (event) => events.push(event) },
    })
    await kernel.saveProvider(
      {
        id: 'reset-fixture',
        name: 'Socket reset fixture',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        model: 'reset-model',
        contextWindow: 4096,
        maxOutput: 512,
        models: [{ id: 'reset-model' }],
      },
      'fixture-secret',
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('HTTP reset fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    sessionId = session.id
    const run = await kernel.submit(
      session.id,
      'reset-step',
      { text: 'Run the reset fixture.', images: [] },
      'reset-fixture/reset-model',
    )
    runId = run.id
    await kernel.waitForIdle()

    const settledRun = await kernel.storage.call('run', run.id)
    expect(settledRun.status).toBe('failed')
    const own = events.filter((event) => event.runId === run.id)
    const providerTerminal = own.find((event) => event.event === 'provider.request_settled')
    const modelFailure = own.find((event) => event.event === 'model.failed')
    const modelSettlement = own.find((event) => event.event === 'model.settled')
    expect(requests).toBe(1)
    expect(providerTerminal).toMatchObject({
      outcome: 'failure',
      transportKind: 'connection',
      transportCode: 'ECONNRESET',
      failureKind: 'transport',
      failurePhase: 'fetch',
    })
    expect(modelFailure).toMatchObject({ outcome: 'failure', errorCode: 'PROVIDER_CONNECTION_FAILED' })
    expect(modelSettlement).toMatchObject({ outcome: 'failure' })
    expect(own.filter((event) => event.event === 'model.settled')).toHaveLength(1)
    expect(own.filter((event) => event.event === 'model.failed')).toHaveLength(1)
    expect(own.some((event) => event.event === 'context.compaction_started')).toBe(false)
    expect(settledRun.failure?.code).toBe('PROVIDER_CONNECTION_FAILED')
    const history = await kernel.storage.call('events', session.id, 0, 2000)
    expect(history.filter((event) => event.runId === run.id && event.type === 'step.ended')).toHaveLength(1)
    expect(own.find((event) => event.event === 'run.settled')).toMatchObject({ outcome: 'failure' })
  } finally {
    await kernel?.close()
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
    await rm(root, { recursive: true, force: true })
  }
})

test('real Kernel settles a cancelled durable model step as skipped without compaction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-cancelled-step-settlement-'))
  const events: DiagnosticEvent[] = []
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    diagnostics: { emit: (event) => events.push(event) },
    profile: { replacements: { 'driver.pi': cancelledStepDriver } },
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Cancelled step fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    const run = await kernel.submit(
      session.id,
      'cancelled-step',
      { text: 'Cancel the fixture step.', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
    expect((await kernel.storage.call('run', run.id)).status).toBe('cancelled')
    const own = events.filter((event) => event.runId === run.id)
    expect(own.find((event) => event.event === 'model.settled')).toMatchObject({
      stepId: 'cancelled-step',
      outcome: 'skipped',
    })
    expect(own.find((event) => event.event === 'provider.request_settled')).toMatchObject({ outcome: 'skipped' })
    expect(own.some((event) => event.event === 'context.compaction_started')).toBe(false)
    const history = await kernel.storage.call('events', session.id, 0, 2000)
    expect(history.filter((event) => event.runId === run.id && event.type === 'step.ended')).toHaveLength(1)
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
