import { expect, test } from 'bun:test'
import { diagnosticEventSchema, type DiagnosticEvent } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createKernelExecutionDiagnostics } from '../packages/kernel/src/execution-diagnostics'

async function removeOwnedFixture(root: string): Promise<void> {
  const resolved = await realpath(root)
  if (
    dirname(resolved) !== (await realpath(tmpdir())) ||
    !basename(resolved).startsWith('hbar-stream-kernel-forwarding-')
  )
    throw new Error('Refusing to remove an unowned stream fixture')
  await rm(resolved, { recursive: true, force: true })
}

test('Kernel stream facts preserve fractional times and reject fields outside their individual contracts', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createKernelExecutionDiagnostics({ sink: { emit: (event) => events.push(event) } })
  diagnostics.providerRequestSettled(
    {
      sessionId: 'stream-forward-session',
      runId: 'stream-forward-run',
      modelRequestId: 'stream-forward-request',
      streamSubtype: 'provider_error',
      streamErrorClass: 'upstream',
      streamEventCount: 3,
      streamTextChars: 12,
      streamThinkingChars: 7,
      streamFirstEventMs: 0.125,
      streamLastEventMs: 12.875,
    },
    'failure',
    15,
  )
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    streamSubtype: 'provider_error',
    streamErrorClass: 'upstream',
    streamEventCount: 3,
    streamTextChars: 12,
    streamThinkingChars: 7,
    streamFirstEventMs: 0.125,
    streamLastEventMs: 12.875,
  })
  expect(diagnosticEventSchema.safeParse(events[0]).success).toBe(true)
  diagnostics.providerRequestSettled(
    {
      sessionId: 'stream-forward-session',
      runId: 'stream-forward-run',
      modelRequestId: 'stream-forward-next',
      streamSubtype: 'aborted',
      streamEventCount: 1_000_001,
      streamTextChars: 2 ** 31,
      streamThinkingChars: -1,
      streamFirstEventMs: Number.NaN,
      streamLastEventMs: 0,
    },
    'skipped',
    1,
  )
  expect(events).toHaveLength(2)
  expect(events[1]).toMatchObject({ streamSubtype: 'aborted', streamLastEventMs: 0 })
  for (const key of ['streamEventCount', 'streamTextChars', 'streamThinkingChars', 'streamFirstEventMs'])
    expect(events[1]).not.toHaveProperty(key)
})

test('real Kernel manual summary failure retains bounded provider stream facts and uncompressed history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-stream-kernel-forwarding-'))
  const events: DiagnosticEvent[] = []
  let requests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests += 1
      return new Response(
        'data: {"type":"response.failed","response":{"status":"failed","error":{"code":"upstream_error","message":"private-stream-kernel-error"}}}\n\n',
        { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'private-stream-kernel-request' } },
      )
    },
  })
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
        id: 'stream-fixture',
        name: 'Stream forwarding fixture',
        protocol: 'openai-responses',
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        model: 'selected',
        contextWindow: 4096,
        maxOutput: 512,
        models: [{ id: 'selected' }],
      },
      'private-stream-kernel-key',
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Stream forwarding fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    for (let index = 0; index < 18; index++)
      await kernel.storage.call('commit', session.id, 'fixture-seed', index % 2 ? 'assistant' : 'user', [
        { type: 'text', text: `private-stream-kernel-prompt-${index} ${'x'.repeat(1500)}` },
      ])
    const before = await kernel.storage.call('context', session.id)
    const beforeMessages = (await kernel.snapshot(session.id)).messages
    let failure: unknown
    try {
      await kernel.compact(session.id, 'stream-fixture/selected', AbortSignal.timeout(5000))
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect(requests).toBe(3)
    const own = events.filter((event) => event.sessionId === session.id)
    const starts = own.filter((event) => event.event === 'provider.request_started')
    const terminal = own.filter((event) => event.event === 'provider.request_settled')
    expect(starts).toHaveLength(3)
    expect(terminal).toHaveLength(3)
    const chunkAttemptId = starts[0]?.attemptId
    expect(chunkAttemptId).toBeTruthy()
    expect(starts.every((event) => event.attemptId === chunkAttemptId)).toBe(true)
    expect(new Set(starts.map((event) => event.modelRequestId)).size).toBe(3)
    for (const [index, settled] of terminal.entries()) {
      expect(settled).toMatchObject({
        httpStatus: 200,
        method: 'context.compaction',
        outcome: 'failure',
        modelRequestId: starts[index]?.modelRequestId,
        attemptId: chunkAttemptId,
        streamSubtype: 'provider_error',
        streamErrorClass: 'upstream',
        streamTextChars: 0,
        streamThinkingChars: 0,
      })
      expect(settled.streamEventCount).toBeGreaterThan(0)
      expect(settled.streamFirstEventMs).toBeGreaterThanOrEqual(0)
      expect(settled.streamLastEventMs).toBeGreaterThanOrEqual(settled.streamFirstEventMs ?? Number.POSITIVE_INFINITY)
      expect(diagnosticEventSchema.safeParse(settled).success).toBe(true)
    }
    expect(await kernel.storage.call('context', session.id)).toEqual(before)
    const snapshot = await kernel.snapshot(session.id)
    expect(snapshot.messages).toEqual(beforeMessages)
    expect(snapshot.contextHistory?.records[0]).toMatchObject({
      trigger: 'manual',
      status: 'failed',
      errorCode: 'COMPACTION_FAILED',
      chunks: 0,
    })
    for (const secret of [
      'private-stream-kernel-error',
      'private-stream-kernel-request',
      'private-stream-kernel-key',
      'private-stream-kernel-prompt',
    ])
      expect(JSON.stringify(own)).not.toContain(secret)
  } finally {
    if (kernel) {
      await kernel.close()
      safelyClosed = true
    }
    await server.stop(true)
    if (safelyClosed) await removeOwnedFixture(root)
  }
}, 15000)
