import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import {
  HbarClient,
  createSettingsCommandClient,
  createWorkspaceSessionCommandClient,
  createRunCommandClient,
} from '@hbar/client'
import { providerSchema } from '@hbar/contracts'
import { AUTONOMY_DECISION_MODE_SETTING, automaticPlanExitDecisionSchema } from '@hbar/contracts/autonomy'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('a real authenticated Pi Run automatically exits Plan mode, records its source actor, and retains deny permission', async () => {
  const prefix = 'hbar-managed-automatic-plan-exit-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const steps: number[] = []
  const provider = Bun.serve({
    port: 0,
    async fetch(request) {
      const payload = z.object({ messages: z.array(z.object({ role: z.string() })) }).parse(await request.json())
      const step = payload.messages.filter((message) => message.role === 'tool').length
      steps.push(step)
      const delta =
        step < 2
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: crypto.randomUUID(),
                  type: 'function',
                  function: {
                    name: step === 0 ? 'exit_plan_mode' : 'write_file',
                    arguments: JSON.stringify(
                      step === 0
                        ? { plan: '# Implement the requested change\n\n- Verify it.' }
                        : { path: 'forbidden.txt', text: 'must not be written' },
                    ),
                  },
                },
              ],
            }
          : { content: 'The original task is complete within its permission.' }
      const chunk = (choices: unknown[], usage?: unknown) =>
        `data: ${JSON.stringify({
          id: crypto.randomUUID(),
          object: 'chat.completion.chunk',
          model: 'fixture-model',
          created: Math.floor(Date.now() / 1000),
          choices,
          ...(usage ? { usage } : {}),
        })}\n\n`
      return new Response(
        chunk([{ index: 0, delta, finish_reason: null }]) +
          chunk([{ index: 0, delta: {}, finish_reason: step < 2 ? 'tool_calls' : 'stop' }]) +
          chunk([], { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 }) +
          'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  let runtime: ProcessHostRuntime | undefined
  let server: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  let runId: string | undefined
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      unattended: true,
    })
    const current = runtime
    await current.kernel.saveProvider(
      providerSchema.parse({
        id: 'automatic-plan',
        name: 'Local Plan',
        protocol: 'openai-completions',
        model: 'fixture-model',
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
      }),
      'fixture-only',
    )
    server = await startServer(current.kernel, { port: 0, runtime: current, controller: current.controller })
    const device = await server.auth.createDevice('Automatic Plan owner')
    client = new HbarClient(`http://127.0.0.1:${server.server.port}`, device.token)
    await client.connect()
    const settings = createSettingsCommandClient(client)
    const before = await settings.execute('settings.get', { scope: { kind: 'global' } })
    await settings.execute(
      'settings.apply',
      {
        schemaVersion: before.schemaVersion,
        scope: before.scope,
        baselineRevisions: before.revisions,
        changes: [
          { op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: true },
          { op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'recommended' },
        ],
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    const workspace = (await current.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing automatic Plan workspace')
    const session = await createWorkspaceSessionCommandClient(client).execute(
      'session.create',
      { workspaceId: workspace.id },
      { idempotencyKey: crypto.randomUUID() },
    )
    await current.kernel.plugins.get('budget').set(session.id, 100_000)
    const accepted = await createRunCommandClient(client).execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'automatic-plan',
        input: { text: 'Prepare and implement the requested plan', images: [], mode: 'plan', approval: 'deny' },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    runId = accepted.operationId
    const deadline = Date.now() + 30_000
    for (;;) {
      const run = await current.storage.call('run', runId)
      if (run.status === 'completed') break
      if (run.status === 'failed' || Date.now() > deadline)
        throw new Error(`Automatic Plan failed: ${JSON.stringify(run)}`)
      await Bun.sleep(20)
    }
    await current.waitForIdle()
    expect(steps).toEqual([0, 1, 2])
    expect(await Bun.file(join(root, 'forbidden.txt')).exists()).toBe(false)
    expect((await current.storage.call('run', runId)).input).toMatchObject({ mode: 'plan', approval: 'deny' })
    expect(await current.kernel.plugins.get('mode').get(session.id)).toMatchObject({ mode: 'default' })
    const events = await current.storage.call('events', session.id, 0, 2000)
    const exits = events.filter((event) => event.type === 'plan_exit.resolved')
    expect(exits).toHaveLength(1)
    const audit = z
      .object({
        automatic: automaticPlanExitDecisionSchema,
        approval: z.object({ status: z.literal('allowed'), decidedBy: z.string() }),
      })
      .parse(exits[0]?.data)
    expect(audit.automatic.policy.policy.mode).toBe('recommended')
    const principal = await current.storage.call('runExecutionPrincipal', runId)
    if (!principal) throw new Error('The authenticated Run lost its source principal')
    expect(audit.approval.decidedBy).toBe(principal.actorId)
    expect((await current.kernel.snapshot(session.id)).runs).toHaveLength(1)
    expect(current.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0, physicalTools: 0 })
    runId = undefined
  } finally {
    if (runtime && runId) await runtime.kernel.cancel(runId)
    client?.disconnect()
    await server?.close()
    await runtime?.close()
    await provider.stop(true)
    await removeOwnedTestDirectory(root, prefix)
  }
}, 120_000)
