import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'

for (const compact of [false, true])
  for (const mode of ['observed', 'guarded-batch', 'failed-batch', 'late-write', 'recovery-batch'] as const)
    test(`focused provider completion: ${mode}, compact=${compact}`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'hbar-focus-transport-'))
      const requests: string[][] = []
      const bodySchema = z.object({ tools: z.array(z.object({ function: z.object({ name: z.string() }) })) })
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
          requests.push(bodySchema.parse(await request.json()).tools.map((tool) => tool.function.name))
          const calls: { name: string; args: Record<string, unknown> }[] =
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
          if (mode === 'recovery-batch') {
            if (requests.length === 1) calls.splice(0, calls.length, { name: 'read_file', args: { path: 'proof.txt' } })
            else if (requests.length === 2)
              calls.unshift(
                {
                  name: 'workflow_expand_scope',
                  args: {
                    itemId: 'proof',
                    expectedRevision: 2,
                    reason: 'Correct the authorized proof scope',
                    scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['read_file', 'write_file'] },
                  },
                },
                { name: 'write_file', args: { path: 'proof.txt', text: 'verified focus' } },
                { name: 'read_file', args: { path: 'proof.txt' } },
              )
          } else if (mode !== 'observed' && requests.length === 1) {
            calls.push(
              {
                name: 'workflow_checkpoint',
                args: {
                  itemId: 'proof',
                  outcome: 'complete',
                  summary: 'Request completion only if read-back passes',
                  expectedFocusRevision: 1,
                  expectedPlanRevision: 1,
                },
              },
              ...(mode === 'late-write'
                ? [{ name: 'write_file', args: { path: 'proof.txt', text: 'corrupted after checkpoint' } }]
                : []),
              { name: 'update_goal', args: { status: 'complete' } },
            )
          } else if (mode !== 'observed') calls.splice(0)
          // A stopped sequence requires observing the rejected late write before completing the Goal.
          const afterLateWrite = compact && mode === 'late-write' && requests.length === 2
          if (afterLateWrite) calls.push({ name: 'update_goal', args: { status: 'complete' } })
          const submitted =
            compact && calls.length && !afterLateWrite
              ? [
                  {
                    name: 'workflow_execute',
                    args: { calls: calls.map((call) => ({ name: call.name, arguments: call.args })) },
                  },
                ]
              : calls
          const chunk = (delta: unknown, finish_reason: string | null) =>
            `data: ${JSON.stringify({ id: 'focus', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
          const delta = submitted.length
            ? {
                role: 'assistant',
                tool_calls: submitted.map((call, index) => ({
                  index,
                  id: `${requests.length}-${index}`,
                  type: 'function',
                  function: { name: call.name, arguments: JSON.stringify(call.args) },
                })),
              }
            : { role: 'assistant', content: 'Unexpected extra request' }
          return new Response(
            chunk(delta, null) + chunk({}, submitted.length ? 'tool_calls' : 'stop') + 'data: [DONE]\n\n',
            {
              headers: { 'Content-Type': 'text/event-stream' },
            },
          )
        },
      })
      const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
      try {
        await kernel.changePlugin('goal.codex', true, { autoContinue: false })
        if (!compact)
          kernel.hooks.on('tools.select', (event) => ({
            ...event,
            tools: event.tools.filter((tool) => tool.name !== 'workflow_execute'),
          }))
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
            scope:
              mode === 'recovery-batch'
                ? { readPaths: ['elsewhere'], writePaths: [], tools: ['read_file'] }
                : { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['read_file', 'write_file'] },
            acceptanceChecks: [
              {
                id: 'content',
                description: 'Proof is correct',
                verifier: {
                  kind: 'tool',
                  toolName: 'read_file',
                  result: {
                    kind: 'textContains',
                    value: mode === 'failed-batch' ? 'required different proof' : 'verified focus',
                  },
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
        const errors = snapshot.messages
          .flatMap((message) => message.content)
          .filter((block) => block.type === 'tool_result' && block.isError)
        expect(errors).toHaveLength(
          mode === 'failed-batch' ? (compact ? 1 : 2) : mode === 'late-write' || mode === 'recovery-batch' ? 1 : 0,
        )
        expect(requests).toHaveLength(
          mode === 'observed' ||
            mode === 'failed-batch' ||
            mode === 'recovery-batch' ||
            (compact && mode === 'late-write')
            ? 2
            : 1,
        )
        if (compact) {
          expect(requests[0]).toContain('workflow_execute')
          expect(requests[0]).not.toContain('workflow_checkpoint')
        } else
          expect(
            requests.every(
              (names) =>
                names.includes('workflow_checkpoint') &&
                names.includes('workflow_expand_scope') &&
                !names.includes('workflow_update'),
            ),
          ).toBe(true)
        expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('verified focus')
        expect((await goals.get(session.id)).goal?.status).toBe(mode === 'failed-batch' ? 'active' : 'complete')
        expect((await workflows.get(session.id)).workflow?.status === 'completed').toBe(mode !== 'failed-batch')
      } finally {
        await kernel.close()
        await server.stop(true)
        await rm(root, { recursive: true, force: true })
      }
    })
