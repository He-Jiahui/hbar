import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'

test('focused tools verify and finish over the provider transport without revision retries or final inference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-focus-transport-'))
  const requests: string[][] = []
  const bodySchema = z.object({ tools: z.array(z.object({ function: z.object({ name: z.string() }) })) })
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests.push(bodySchema.parse(await request.json()).tools.map((tool) => tool.function.name))
      const calls =
        requests.length === 1
          ? [
              { name: 'write_file', args: { path: 'proof.txt', text: 'verified focus' } },
              { name: 'read_file', args: { path: 'proof.txt' } },
            ]
          : requests.length === 2
            ? [
                {
                  name: 'workflow_checkpoint',
                  args: {
                    itemId: 'proof',
                    outcome: 'complete',
                    summary: 'Read-back passed',
                    expectedFocusRevision: 1,
                    expectedPlanRevision: 1,
                  },
                },
                { name: 'update_goal', args: { status: 'complete' } },
              ]
            : []
      const chunk = (delta: unknown, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: 'focus', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      const delta = calls.length
        ? {
            role: 'assistant',
            tool_calls: calls.map((call, index) => ({
              index,
              id: `${requests.length}-${index}`,
              type: 'function',
              function: { name: call.name, arguments: JSON.stringify(call.args) },
            })),
          }
        : { role: 'assistant', content: 'Unexpected extra request' }
      return new Response(chunk(delta, null) + chunk({}, calls.length ? 'tool_calls' : 'stop') + 'data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    },
  })
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
  try {
    await kernel.changePlugin('goal.codex', true, { autoContinue: false })
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'focus',
        name: 'Focus fixture',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        model: 'fixture-network',
      }),
      'fixture-only',
    )
    await kernel.setPermissionMode('allow')
    const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
    const goals = kernel.plugins.get<GoalService>('goal')
    const plans = kernel.plugins.get<PlanService>('plan')
    const workflows = kernel.plugins.get<WorkflowService>('workflow')
    await goals.create(session.id, 'Produce verified proof')
    const plan = await plans.update(session.id, [{ step: 'Produce verified proof', status: 'in_progress' }])
    await workflows.focus(
      session.id,
      0,
      {
        id: 'proof',
        title: 'Produce verified proof',
        scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['read_file', 'write_file'] },
        acceptanceChecks: [
          {
            id: 'content',
            description: 'Proof is correct',
            verifier: {
              kind: 'tool',
              toolName: 'read_file',
              result: { kind: 'textContains', value: 'verified focus' },
            },
          },
        ],
      },
      'agent',
      plan.revision,
    )
    await kernel.submit(session.id, 'focus-transport', { text: 'Verify and complete', images: [] }, 'focus')
    await kernel.waitForIdle()
    const snapshot = await kernel.snapshot(session.id)
    expect(snapshot.runs[0]?.status).toBe('completed')
    expect(
      snapshot.messages
        .flatMap((message) => message.content)
        .filter((block) => block.type === 'tool_result' && block.isError),
    ).toEqual([])
    expect(requests).toHaveLength(2)
    expect(
      requests.every(
        (names) =>
          names.includes('workflow_checkpoint') &&
          names.includes('workflow_expand_scope') &&
          !names.includes('workflow_update'),
      ),
    ).toBe(true)
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('verified focus')
    expect((await goals.get(session.id)).goal?.status).toBe('complete')
    expect((await workflows.get(session.id)).workflow?.status).toBe('completed')
  } finally {
    await kernel.close()
    await server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
})
