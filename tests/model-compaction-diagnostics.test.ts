import { describe, expect, test } from 'bun:test'
import { diagnosticEvent } from '@hbar/contracts'
import type { DiagnosticEvent } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'

describe('model and compaction diagnostics contract', () => {
  test('retains slash model selection separately from provider id', () => {
    const event = diagnosticEvent({
      component: 'kernel',
      level: 'info',
      event: 'model.started',
      providerId: 'niuma_openai',
      modelSelectionId: 'niuma_openai/gpt-6.1-sol',
      model: 'gpt-6.1-sol',
      protocol: 'openai-responses',
      outcome: 'success',
    })
    expect(event.providerId).toBe('niuma_openai')
    expect(event.modelSelectionId).toBe('niuma_openai/gpt-6.1-sol')
  })

  test('accepts bounded compaction stage metadata without payload fields', () => {
    const event = diagnosticEvent({
      component: 'kernel',
      level: 'debug',
      event: 'context.compaction_stage',
      phase: 'summary_started',
      inputEstimatedTokens: 144_000,
      inputLimit: 144_000,
      summaryMaxOutput: 8_192,
      chunkIndex: 1,
      chunkCount: 2,
      thresholdRatio: 0.8,
      outcome: 'success',
    })
    expect(event.inputEstimatedTokens).toBe(144_000)
    expect(event.chunkCount).toBe(2)
    expect('prompt' in event).toBe(false)
  })
})

const responseRequest = z.object({ model: z.string(), messages: z.array(z.unknown()) })

async function removeOwnedCompactionFixture(root: string): Promise<void> {
  const actual = await realpath(root)
  if (dirname(actual) !== (await realpath(tmpdir())) || !basename(actual).startsWith('hbar-compaction-diagnostic-'))
    throw new Error('Refusing to remove an unowned compaction fixture')
  await rm(actual, { recursive: true })
}

for (const failsAfterFirstChunk of [false, true]) {
  test(`real Kernel compaction journals each provider attempt and preserves history on failure=${failsAfterFirstChunk}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-compaction-diagnostic-'))
    const events: DiagnosticEvent[] = []
    let calls = 0
    const provider = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        expect(request.headers.get('authorization')).toBe('Bearer private-key-canary')
        const body = responseRequest.parse(await request.json())
        expect(body.model).toBe('selected')
        calls++
        if (failsAfterFirstChunk && calls === 2)
          return Response.json(
            { error: { message: 'private-error-canary' } },
            { status: 400, headers: { 'x-request-id': `private-request-canary-${calls}` } },
          )
        const message = {
          id: `summary-${calls}`,
          object: 'chat.completion.chunk',
          created: 1,
          model: body.model,
          choices: [
            { index: 0, delta: { role: 'assistant', content: 'Concise fixture summary.' }, finish_reason: null },
          ],
        }
        const done = { ...message, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
        return new Response(`data: ${JSON.stringify(message)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`, {
          headers: {
            'content-type': 'text/event-stream',
            'x-request-id': `private-request-canary-${calls}`,
            'x-private-canary': 'private-header-canary',
          },
        })
      },
    })
    let kernel: Kernel | undefined
    let safelyClosed = false
    try {
      kernel = await Kernel.create({
        home: join(root, 'data'),
        workspace: root,
        secrets: new MemorySecrets(),
        diagnostics: {
          emit: (event) => {
            events.push(event)
          },
        },
      })
      await kernel.saveProvider(
        {
          id: 'catalog',
          name: 'Diagnostic catalog',
          protocol: 'openai-completions',
          baseUrl: `http://127.0.0.1:${provider.port}/v1`,
          model: 'primary',
          contextWindow: 4096,
          maxOutput: 512,
          models: [{ id: 'primary' }, { id: 'selected' }],
        },
        'private-key-canary',
      )
      const workspace = (await kernel.storage.call('workspaces'))[0]
      if (!workspace) throw new Error('Diagnostic fixture workspace missing')
      const session = await kernel.createSession(workspace.id)
      for (let index = 0; index < 18; index++)
        await kernel.storage.call('commit', session.id, 'fixture-seed', index % 2 ? 'assistant' : 'user', [
          { type: 'text', text: `private-prompt-canary ${index} ${'x'.repeat(1500)}` },
        ])
      const originalContext = await kernel.storage.call('context', session.id)
      const originalHistory = (await kernel.snapshot(session.id)).messages
      expect(originalHistory).toHaveLength(18)
      let failure: unknown
      try {
        await kernel.compact(session.id, 'catalog/selected')
      } catch (error) {
        failure = error
      }
      expect(Boolean(failure)).toBe(failsAfterFirstChunk)
      expect(calls).toBeGreaterThan(1)
      const own = events.filter((event) => event.sessionId === session.id)
      const starts = own.filter((event) => event.event === 'provider.request_started')
      const terminals = own.filter((event) => event.event === 'provider.request_settled')
      const responses = own.filter((event) => event.event === 'provider.response')
      expect(starts).toHaveLength(calls)
      expect(terminals).toHaveLength(calls)
      expect(responses).toHaveLength(calls)
      for (const start of starts) {
        expect(start).toMatchObject({
          providerId: 'catalog',
          modelSelectionId: 'catalog/selected',
          method: 'context.compaction',
        })
        expect(start.modelRequestId).toBeTruthy()
        expect(start.attemptId).toBeTruthy()
        expect(start.stepId).toBeUndefined()
        expect(terminals.filter((event) => event.modelRequestId === start.modelRequestId)).toHaveLength(1)
        const response = responses.find((event) => event.modelRequestId === start.modelRequestId)
        expect(response?.attemptId).toBe(start.attemptId)
        expect(response?.httpStatus).toBe(failsAfterFirstChunk && start.chunkIndex === 1 ? 400 : 200)
        expect(response?.upstreamRequestIdSha256).toBe(
          new Bun.CryptoHasher('sha256').update(`private-request-canary-${(start.chunkIndex ?? 0) + 1}`).digest('hex'),
        )
      }
      const summaryStarts = own.filter(
        (event) => event.event === 'context.compaction_stage' && event.phase === 'summary_started',
      )
      expect(summaryStarts).toHaveLength(calls)
      for (const [index, event] of summaryStarts.entries()) {
        expect(event.chunkIndex).toBe(index)
        expect(event.chunkCount).toBe(index)
        expect(event.inputEstimatedTokens).toBeGreaterThan(0)
        expect(event.inputEstimatedTokens).toBeLessThanOrEqual(event.inputLimit ?? 0)
        expect(event.summaryMaxOutput).toBeGreaterThan(0)
        expect(starts.some((start) => start.attemptId === event.attemptId)).toBeTrue()
      }
      const completed = own.filter(
        (event) => event.event === 'context.compaction_stage' && event.phase === 'summary_completed',
      )
      expect(completed).toHaveLength(failsAfterFirstChunk ? 1 : calls)
      const context = await kernel.storage.call('context', session.id)
      if (failsAfterFirstChunk) {
        expect(terminals.at(-1)?.outcome).toBe('failure')
        expect(terminals.at(-1)).toMatchObject({
          httpStatus: 400,
          failureKind: 'http',
          failurePhase: 'response',
          errorCode: 'PROVIDER_HTTP_ERROR',
        })
        expect(own.some((event) => event.phase === 'summary_failed')).toBeTrue()
        expect(own.some((event) => event.phase === 'persist_completed')).toBeFalse()
        expect(context).toEqual(originalContext)
      } else {
        expect(terminals.every((event) => event.outcome === 'success')).toBeTrue()
        expect(own.find((event) => event.phase === 'persist_completed')?.chunkCount).toBe(calls)
        expect(context.summary).toContain('Concise fixture summary.')
      }
      expect((await kernel.snapshot(session.id)).messages).toEqual(originalHistory)
      const serialized = JSON.stringify(own)
      expect(serialized).not.toContain('private-key-canary')
      expect(serialized).not.toContain('private-prompt-canary')
      expect(serialized).not.toContain('private-error-canary')
      expect(serialized).not.toContain('private-request-canary')
      expect(serialized).not.toContain('private-header-canary')
    } finally {
      try {
        if (kernel) {
          await kernel.close()
          safelyClosed = true
        }
      } finally {
        await provider.stop(true)
        if (safelyClosed) await removeOwnedCompactionFixture(root)
      }
    }
  })
}

test('real Kernel compaction preserves context when transport connection is refused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-compaction-diagnostic-transport-'))
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('unused') })
  const baseUrl = `http://127.0.0.1:${probe.port}/v1`
  await probe.stop(true)
  const events: DiagnosticEvent[] = []
  let kernel: Kernel | undefined
  let safelyClosed = false
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      secrets: new MemorySecrets(),
      diagnostics: { emit: (event) => events.push(event) },
    })
    await kernel.saveProvider(
      {
        id: 'catalog',
        name: 'Transport fixture',
        protocol: 'openai-completions',
        baseUrl,
        model: 'selected',
        contextWindow: 4096,
        maxOutput: 512,
        models: [{ id: 'selected' }],
      },
      'private-key-canary',
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Transport fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    for (let index = 0; index < 18; index++)
      await kernel.storage.call('commit', session.id, 'fixture-seed', index % 2 ? 'assistant' : 'user', [
        { type: 'text', text: `private-prompt-canary ${index} ${'x'.repeat(1500)}` },
      ])
    const originalContext = await kernel.storage.call('context', session.id)
    const originalHistory = (await kernel.snapshot(session.id)).messages
    let failure: unknown
    try {
      await kernel.compact(session.id, 'catalog/selected', AbortSignal.timeout(5_000))
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    const own = events.filter((event) => event.sessionId === session.id)
    const start = own.find((event) => event.event === 'provider.request_started')
    const transport = own.find((event) => event.event === 'provider.transport_failure')
    const terminal = own.find((event) => event.event === 'provider.request_settled')
    expect(start).toMatchObject({
      providerId: 'catalog',
      modelSelectionId: 'catalog/selected',
      method: 'context.compaction',
    })
    expect(start?.modelRequestId).toBeTruthy()
    expect(start?.attemptId).toBeTruthy()
    expect(transport).toMatchObject({
      modelRequestId: start?.modelRequestId,
      attemptId: start?.attemptId,
      phase: 'transport_failure',
      level: 'error',
      outcome: 'failure',
      transportKind: 'connection',
      transportCode: 'ConnectionRefused',
    })
    expect(terminal).toMatchObject({
      modelRequestId: start?.modelRequestId,
      attemptId: start?.attemptId,
      outcome: 'failure',
      failureKind: 'transport',
      failurePhase: 'fetch',
      transportKind: 'connection',
      transportCode: 'ConnectionRefused',
      errorCode: 'PROVIDER_CONNECTION_FAILED',
    })
    expect(own.some((event) => event.event === 'provider.response')).toBeFalse()
    expect(await kernel.storage.call('context', session.id)).toEqual(originalContext)
    expect((await kernel.snapshot(session.id)).messages).toEqual(originalHistory)
    const serialized = JSON.stringify(own)
    expect(serialized).not.toContain('private-key-canary')
    expect(serialized).not.toContain('private-prompt-canary')
    expect(serialized).not.toContain(baseUrl)
  } finally {
    try {
      if (kernel) {
        await kernel.close()
        safelyClosed = true
      }
    } finally {
      if (safelyClosed) await removeOwnedCompactionFixture(root)
    }
  }
})
