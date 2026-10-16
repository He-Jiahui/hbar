import { expect, test } from 'bun:test'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { providerSchema, userInputAutomaticDecisionSchema, type Run } from '@hbar/contracts'
import { delegatedInputEnvelopeSchema } from '@hbar/contracts/delegated-user-input'
import { AUTONOMY_DECISION_MODE_SETTING, AUTONOMY_DECISION_TARGET_SETTING } from '@hbar/contracts/autonomy'
import { MemorySecrets, SettingsService } from '@hbar/kernel'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const bodySchema = z
  .object({
    messages: z.array(
      z
        .object({
          role: z.string(),
          name: z.string().optional(),
          content: z.unknown().optional(),
          tool_call_id: z.string().optional(),
          tool_calls: z.array(z.object({ id: z.string(), function: z.object({ name: z.string() }) })).optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
const inboxSchema = z.object({ items: z.array(delegatedInputEnvelopeSchema) })
function streamReply(tools: Array<{ name: string; arguments: unknown }> = []): Response {
  const delta = tools.length
    ? {
        tool_calls: tools.map((tool, index) => ({
          index,
          id: crypto.randomUUID(),
          type: 'function',
          function: { name: tool.name, arguments: JSON.stringify(tool.arguments) },
        })),
      }
    : { content: 'The task is complete.' }
  const chunk = (value: unknown) =>
    `data: ${JSON.stringify({
      id: crypto.randomUUID(),
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'fixture-model',
      ...Object(value),
    })}\n\n`
  return new Response(
    chunk({ choices: [{ index: 0, delta, finish_reason: null }] }) +
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: tools.length ? 'tool_calls' : 'stop' }] }) +
      chunk({ choices: [], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } }) +
      'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

test('four real HTTP sources release backend capacity for delegated target Runs and settle through their original leases', async () => {
  const prefix = 'hbar-managed-delegated-input-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const sourceGate = Promise.withResolvers<void>()
  let initialSources = 0,
    targetRequests = 0
  let sourceCapacityBeforeQuestion = 0,
    suspendedDuringTarget = 0
  const provider = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = bodySchema.parse(await request.json())
      const source = JSON.stringify(body.messages).includes('delegate-source-')
      const tools = body.messages.filter((message) => message.role === 'tool')
      if (source) {
        if (!tools.length) {
          initialSources++
          if (initialSources === 4) {
            sourceCapacityBeforeQuestion = runtime?.coordinator.executionCapacity().activeExecutions ?? 0
            sourceGate.resolve()
          }
          await sourceGate.promise
          return streamReply([
            {
              name: 'request_user_input',
              arguments: {
                questions: [
                  {
                    id: 'scope',
                    header: 'Scope',
                    question: 'Choose an implementation scope',
                    purpose: 'decision',
                    options: [
                      { label: 'App', description: 'The application' },
                      { label: 'API', description: 'The service' },
                    ],
                  },
                ],
              },
            },
          ])
        }
        return streamReply()
      }
      targetRequests++
      suspendedDuringTarget = Math.max(
        suspendedDuringTarget,
        runtime?.coordinator.executionCapacity().suspendedExecutions ?? 0,
      )
      const last = tools.at(-1)
      if (targetRequests > 80) throw new Error('The delegated provider exceeded its bounded test request budget')
      const names = new Map(
        body.messages.flatMap((message) => message.tool_calls ?? []).map((tool) => [tool.id, tool.function.name]),
      )
      const lastName = last?.name ?? names.get(last?.tool_call_id ?? '')
      if (lastName === 'hbar_decisions_inbox' && typeof last?.content === 'string') {
        const page = inboxSchema.parse(JSON.parse(last.content) as unknown)
        return streamReply(
          page.items.map((grant) => ({
            name: 'hbar_decision_reply',
            arguments: {
              sessionId: grant.sessionId,
              requestId: grant.requestId,
              delegationId: grant.delegationId,
              expectedRevision: grant.revision,
              reply: { kind: 'answered', response: { answers: { scope: { answers: ['API'] } } } },
            },
          })),
        )
      }
      return streamReply([{ name: 'hbar_decisions_inbox', arguments: {} }])
    },
  })
  let runtime: ProcessHostRuntime | undefined
  const accepted: Run[] = []
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      unattended: true,
      secrets: new MemorySecrets(),
    })
    const current = runtime
    await current.kernel.saveProvider(
      providerSchema.parse({
        id: 'delegation-source',
        name: 'Local delegation',
        protocol: 'openai-completions',
        model: 'fixture-model',
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
      }),
      'fixture-only',
    )
    const workspace = (await current.storage.call('workspaces'))[0]!
    const targetPath = join(root, 'target-workspace')
    await mkdir(targetPath)
    const targetWorkspace = await current.storage.call('createWorkspace', targetPath, 'Target workspace')
    await current.storage.call(
      'putDevice',
      { id: 'delegation-owner', name: 'Fixture', role: 'operator', workspaceIds: null, createdAt: 1, lastSeenAt: 1 },
      'fixture-token',
    )
    const sessions = []
    for (let index = 0; index < 5; index++)
      sessions.push(
        await current.storage.call('createSessionCommand', {
          workspaceId: index === 4 ? targetWorkspace.id : workspace.id,
          actorId: 'delegation-owner',
          idempotencyKey: `decision-session-${index}`,
        }),
      )
    const target = sessions[4]!
    const settings = new SettingsService(current.storage)
    expect(current.coordinator.executionCapacity().capacity).toBe(4)
    for (const session of sessions.slice(0, 4)) {
      const scope = { kind: 'session' as const, targetId: session.id }
      const before = await settings.get(scope)
      await settings.apply({
        schemaVersion: before.schemaVersion,
        scope,
        baselineRevisions: before.revisions,
        actorId: 'delegation-owner',
        idempotencyKey: session.id,
        changes: [
          { op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'delegate' },
          { op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_TARGET_SETTING }], value: target.id },
        ],
      })
      accepted.push(
        await current.kernel.submit(
          session.id,
          session.id,
          { text: `delegate-source-${accepted.length}`, images: [], approval: 'deny' },
          'delegation-source',
        ),
      )
    }
    const deadline = performance.now() + 30_000
    while (true) {
      const states = await Promise.all(accepted.map((run) => current.storage.call('run', run.id)))
      if (states.every((run) => run.status === 'completed')) break
      if (
        states.some((run) => ['failed', 'cancelled', 'interrupted'].includes(run.status)) ||
        performance.now() > deadline
      )
        throw new Error(
          `Managed delegation stalled: ${JSON.stringify({
            states: states.map((run) => ({ status: run.status, error: run.error })),
            target: (await current.kernel.snapshot(target.id)).runs.map((run) => ({
              status: run.status,
              error: run.error,
            })),
            capacity: current.coordinator.executionCapacity(),
          })}`,
        )
      await Bun.sleep(30)
    }
    await current.waitForIdle()
    expect(initialSources).toBe(4)
    expect(sourceCapacityBeforeQuestion).toBe(4)
    expect(suspendedDuringTarget).toBeGreaterThan(0)
    expect(targetRequests).toBeGreaterThan(0)
    for (const run of accepted) {
      const events = await current.storage.call('events', run.sessionId, 0, 256)
      const audits = events.filter((event) => event.type === 'user_input.autoDecided')
      expect(audits).toHaveLength(1)
      const audit = userInputAutomaticDecisionSchema.parse(audits[0]!.data)
      expect(audit).toMatchObject({
        source: 'delegate',
        response: { answers: { scope: { answers: ['API'] } } },
        delegation: { targetSessionId: target.id },
      })
      expect(audit.delegation?.targetRunId).toBeTruthy()
      expect((await current.storage.call('runExecutionPrincipal', run.id))?.actorId).toBe('delegation-owner')
      expect((await current.kernel.snapshot(run.sessionId)).userInputs).toEqual([])
    }
    expect(current.coordinator.executionCapacity()).toMatchObject({
      activeExecutions: 0,
      suspendedExecutions: 0,
      queuedExecutions: 0,
    })
    expect(current.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    sourceGate.resolve()
    if (runtime) for (const run of accepted) await runtime.kernel.cancel(run.id).catch(() => {})
    await runtime?.close()
    await provider.stop(true)
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
