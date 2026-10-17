import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HbarClient,
  createSettingsCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { providerSchema } from '@hbar/contracts'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function until(check: () => Promise<boolean>, describe: () => Promise<unknown>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Human wait capacity stalled: ${JSON.stringify(await describe())}`)
    await Bun.sleep(20)
  }
}

test('sixteen real HTTP questionnaires release capacity, remain readable, and settle answered and cancelled Runs', async () => {
  const sourceCount = 16
  const prefix = 'hbar-managed-human-wait-capacity-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const gates = new Map<string, ReturnType<typeof Promise.withResolvers<void>>>(
    Array.from({ length: 4 }, (_, index) => [`gated-target-${index}`, Promise.withResolvers<void>()] as const),
  )
  let resumedSources = 0
  const provider = Bun.serve({
    port: 0,
    async fetch(request) {
      const body: unknown = await request.json()
      const payload = JSON.stringify(body)
      const gate = payload.match(/gated-target-\d+/)?.[0]
      if (gate) await gates.get(gate)?.promise
      if (payload.includes('question-source') && payload.includes('"role":"tool"')) resumedSources++
      const question = payload.includes('question-source') && !payload.includes('"role":"tool"')
      const delta = question
        ? {
            tool_calls: [
              {
                index: 0,
                id: crypto.randomUUID(),
                type: 'function',
                function: {
                  name: 'request_user_input',
                  arguments: JSON.stringify({
                    questions: [{ id: 'fact', header: 'Fact', question: 'Supply the fact', purpose: 'fact' }],
                  }),
                },
              },
            ],
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
          chunk({ choices: [{ index: 0, delta: {}, finish_reason: question ? 'tool_calls' : 'stop' }] }) +
          chunk({ choices: [], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } }) +
          'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  let runtime: ProcessHostRuntime | undefined
  let server: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  const accepted: Array<{ sessionId: string; runId: string }> = []
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      unattended: true,
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    const current = runtime
    await current.kernel.saveProvider(
      providerSchema.parse({
        id: 'capacity-source',
        name: 'Local capacity',
        protocol: 'openai-completions',
        model: 'fixture-model',
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
        inputPrice: 2,
        outputPrice: 3,
      }),
      'fixture-only',
    )
    server = await startServer(current.kernel, { port: 0, runtime: current, controller: current.controller })
    const device = await server.auth.createDevice('Human wait capacity owner')
    client = new HbarClient(`http://127.0.0.1:${server.server.port}`, device.token)
    await client.connect()
    const settings = createSettingsCommandClient(client)
    const runs = createRunCommandClient(client)
    const sessions = createWorkspaceSessionCommandClient(client)
    const before = await settings.execute('settings.get', { scope: { kind: 'global' } })
    await settings.execute(
      'settings.apply',
      {
        schemaVersion: before.schemaVersion,
        scope: before.scope,
        baselineRevisions: before.revisions,
        changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: true }],
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    const workspace = (await current.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing human wait fixture workspace')
    const describe = async () => ({
      capacity: current.coordinator.executionCapacity(),
      coordination: current.coordinator.snapshot(),
      runs: await Promise.all(accepted.map((item) => current.storage.call('run', item.runId))),
    })
    const submit = async (text: string) => {
      const session = await sessions.execute(
        'session.create',
        { workspaceId: workspace.id },
        { idempotencyKey: crypto.randomUUID() },
      )
      await current.kernel.plugins.get('budget').set(session.id, 100_000)
      const result = await runs.execute(
        'run.submit',
        {
          sessionId: session.id,
          modelId: 'capacity-source',
          input: { text, images: [], approval: 'deny', mode: 'plan' },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const item = { sessionId: session.id, runId: result.operationId }
      accepted.push(item)
      return item
    }
    for (let index = 0; index < sourceCount; index++) await submit(`question-source ${index}`)
    await until(async () => current.coordinator.executionCapacity().suspendedExecutions === sourceCount, describe)
    expect(current.coordinator.executionCapacity().activeExecutions).toBe(0)
    expect(current.coordinator.snapshot().sessions).toBe(sourceCount)
    for (const item of accepted) {
      const snapshot = await current.kernel.snapshot(item.sessionId)
      expect(snapshot.userInputs).toHaveLength(1)
      expect(snapshot.runs.find((run) => run.id === item.runId)?.status).toBe('running')
    }
    const target = await submit('target-task')
    await until(async () => (await current.storage.call('run', target.runId)).status === 'completed', describe)
    const first = accepted[0],
      cancelled = accepted[1]
    if (!first || !cancelled) throw new Error('Missing waiting source')
    const pending = (await current.kernel.snapshot(first.sessionId)).userInputs[0]
    if (!pending) throw new Error('Missing pending questionnaire')
    for (let index = 0; index < 4; index++) await submit(`gated-target-${index}`)
    await until(async () => current.coordinator.executionCapacity().activeExecutions === 4, describe)
    expect(await current.kernel.resolveUserInput(pending.requestId, { fact: { answers: ['human fact'] } })).toBe(true)
    await until(async () => current.coordinator.executionCapacity().queuedExecutions === 1, describe)
    expect(resumedSources).toBe(0)
    expect(current.coordinator.snapshot().physicalTools).toBe(sourceCount)
    await runs.execute('operation.cancel', { operationId: cancelled.runId }, { idempotencyKey: crypto.randomUUID() })
    await until(async () => current.coordinator.execution(cancelled.runId) === null, describe)
    expect((await current.storage.call('run', cancelled.runId)).status).toBe('cancelled')
    expect(current.coordinator.executionCapacity()).toMatchObject({ activeExecutions: 4, queuedExecutions: 1 })
    gates.get('gated-target-0')?.resolve()
    await until(async () => (await current.storage.call('run', first.runId)).status === 'completed', describe)
    expect(resumedSources).toBe(1)
    for (const item of accepted.slice(2, sourceCount)) {
      await runs.execute('operation.cancel', { operationId: item.runId }, { idempotencyKey: crypto.randomUUID() })
    }
    for (const gate of gates.values()) gate.resolve()
    await current.waitForIdle()
    expect((await current.kernel.plugins.get('budget').get(cancelled.sessionId))?.usedTokens).toBeGreaterThan(0)
    expect(current.coordinator.executionCapacity()).toMatchObject({
      activeExecutions: 0,
      suspendedExecutions: 0,
      queuedExecutions: 0,
    })
    expect(current.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
  } finally {
    for (const gate of gates.values()) gate.resolve()
    if (runtime) for (const item of accepted) await runtime.kernel.cancel(item.runId).catch(() => {})
    client?.disconnect()
    await server?.close()
    await runtime?.close()
    await provider.stop(true)
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
