import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { HbarClient, createRunCommandClient } from '@hbar/client'
import { providerModelSelectionId, providerSchema, resolveProviderModel, type DiagnosticEvent } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { ModelDiagnosticEvent } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'
import { startServer } from '../apps/host/src/server.ts'

const API_KEY = 'pi-summary-incomplete-fixture-key'
const PARTIAL_SUMMARY = 'pi-summary-incomplete-partial-summary'

function provider(baseUrl: string) {
  const config = providerSchema.parse({
    id: 'pi-summary-incomplete',
    name: 'Incomplete summary fixture',
    protocol: 'openai-responses',
    baseUrl,
    model: 'summary-model',
    contextWindow: 4096,
    maxOutput: 512,
    models: [{ id: 'summary-model', contextWindow: 4096, maxOutput: 512 }],
  })
  const id = providerModelSelectionId(config, 'summary-model')
  return { config, model: { ...resolveProviderModel(config, id), id } }
}

function incompleteResponse(request: Request): Response {
  expect(request.headers.get('authorization')).toBe(`Bearer ${API_KEY}`)
  const responseId = 'incomplete-summary-response'
  const item = {
    id: 'incomplete-summary-message',
    type: 'message',
    role: 'assistant',
    status: 'incomplete',
    content: [{ type: 'output_text', text: PARTIAL_SUMMARY, annotations: [] }],
  }
  const events = [
    {
      type: 'response.created',
      response: { id: responseId, status: 'in_progress' },
    },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...item, content: [] },
    },
    {
      type: 'response.content_part.added',
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: PARTIAL_SUMMARY },
    { type: 'response.output_item.done', output_index: 0, item },
    {
      type: 'response.incomplete',
      response: {
        id: responseId,
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [item],
        usage: { input_tokens: 48, output_tokens: 512, total_tokens: 560 },
      },
    },
  ]
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream', 'x-request-id': 'incomplete-summary-upstream-request' },
  })
}

async function removeFixture(root: string) {
  const resolved = await realpath(root)
  if (dirname(resolved) !== (await realpath(tmpdir())) || !basename(resolved).startsWith('hbar-pi-summary-incomplete-'))
    throw new Error('Refusing to remove an unowned summary fixture')
  await rm(resolved, { recursive: true, force: true })
}

test('PiDriver rejects a max-output-token incomplete response instead of returning its partial summary', async () => {
  let requestCount = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      requestCount += 1
      return incompleteResponse(request)
    },
  })
  try {
    const selected = provider(`http://127.0.0.1:${server.port}/v1`)
    const events: ModelDiagnosticEvent[] = []
    let failure: unknown
    try {
      await new PiDriver().summarize(
        {
          system: 'Summarize the conversation completely.',
          messages: [
            {
              id: 'summary-incomplete-input',
              sessionId: 'summary-incomplete-session',
              runId: 'summary-incomplete-run',
              seq: 1,
              createdAt: 1,
              role: 'user',
              content: [{ type: 'text', text: 'A long conversation to summarize.' }],
            },
          ],
          model: selected.model,
          context: { sessionId: 'summary-incomplete-session' },
        },
        API_KEY,
        new AbortController().signal,
        (event) => events.push(event),
      )
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'COMPACTION_INCOMPLETE' })
    expect(requestCount).toBe(1)
    const started = events.filter((event) => event.phase === 'started')
    const terminal = events.filter((event) => ['settled', 'failed', 'cancelled'].includes(event.phase))
    expect(started).toHaveLength(1)
    expect(terminal).toHaveLength(1)
    expect(terminal[0]).toMatchObject({
      phase: 'failed',
      purpose: 'compaction',
      modelRequestId: started[0]?.modelRequestId,
      stopReason: 'length',
      httpStatus: 200,
      streamSubtype: 'incomplete',
      errorCode: 'COMPACTION_INCOMPLETE',
    })
    expect(JSON.stringify(events)).not.toContain(PARTIAL_SUMMARY)
    expect(JSON.stringify(events)).not.toContain(API_KEY)
  } finally {
    await server.stop(true)
  }
})

test('public context.compact preserves the existing summary and history when Pi reports an incomplete summary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-pi-summary-incomplete-'))
  const diagnostics: DiagnosticEvent[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: incompleteResponse,
  })
  let kernel: Kernel | undefined
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  let kernelClosed = false
  try {
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      secrets: new MemorySecrets(),
      diagnostics: { emit: (event) => diagnostics.push(event) },
    })
    await kernel.saveProvider(
      {
        id: 'pi-summary-incomplete',
        name: 'Incomplete summary fixture',
        protocol: 'openai-responses',
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        model: 'summary-model',
        contextWindow: 4096,
        maxOutput: 512,
        models: [{ id: 'summary-model', contextWindow: 4096, maxOutput: 512 }],
      },
      API_KEY,
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Incomplete summary fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    for (let index = 0; index < 18; index++)
      await kernel.storage.call('commit', session.id, 'summary-incomplete-seed', index % 2 ? 'assistant' : 'user', [
        { type: 'text', text: `fixture history ${index} ${'x'.repeat(1500)}` },
      ])
    await kernel.storage.call('compact', session.id, 0, 'previous-complete-summary', 'legacy-summary-model')
    const beforeContext = await kernel.storage.call('context', session.id)
    const beforeMessages = (await kernel.snapshot(session.id)).messages
    const beforeEvents = await kernel.storage.call('events', session.id, 0)
    const beforeUsage = beforeEvents.filter((event) => event.type === 'usage.recorded')
    const beforeCompacted = beforeEvents.filter((event) => event.type === 'context.compacted')

    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'incomplete summary test')
    const modelId = provider(`http://127.0.0.1:${server.port}/v1`).model.id
    await expect(
      createRunCommandClient(client).execute('context.compact', { sessionId: session.id, modelId }),
    ).rejects.toMatchObject({ code: 'COMPACTION_INCOMPLETE' })

    expect(await kernel.storage.call('context', session.id)).toEqual(beforeContext)
    const afterSnapshot = await kernel.snapshot(session.id)
    expect(afterSnapshot.messages).toEqual(beforeMessages)
    expect(afterSnapshot.contextHistory?.records[0]).toMatchObject({
      trigger: 'manual',
      status: 'failed',
      errorCode: 'COMPACTION_INCOMPLETE',
      chunks: 0,
    })
    const afterEvents = await kernel.storage.call('events', session.id, 0)
    expect(afterEvents.filter((event) => event.type === 'context.compacted')).toEqual(beforeCompacted)
    expect(afterEvents.filter((event) => event.type === 'usage.recorded')).toEqual(beforeUsage)
    const providerTerminal = diagnostics.filter(
      (event) => event.event === 'provider.request_settled' && event.sessionId === session.id,
    )
    expect(providerTerminal).toHaveLength(1)
    expect(providerTerminal[0]).toMatchObject({
      outcome: 'failure',
      httpStatus: 200,
      streamSubtype: 'incomplete',
    })
    for (const secret of [API_KEY, PARTIAL_SUMMARY, 'fixture history'])
      expect(JSON.stringify(providerTerminal)).not.toContain(secret)
  } finally {
    client?.disconnect()
    await host?.close()
    if (kernel) {
      await kernel.close()
      kernelClosed = true
    }
    await server.stop(true)
    if (kernelClosed) await removeFixture(root)
  }
}, 15000)
