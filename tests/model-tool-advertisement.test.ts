import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import type { PlanService, WorkflowService } from '@hbar/plugin-sdk'

for (const compact of [false, true])
  test(`model tool advertisement changes within a Run while journal and transport agree (${compact})`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-tool-advertisement-'))
    const received: string[][] = []
    const systemMessages: string[][] = []
    const bodySchema = z.object({
      tools: z.array(z.object({ function: z.object({ name: z.string() }) })),
      messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
    })
    const item = {
      id: 'proof',
      title: 'Revised proof',
      scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    }
    const provider = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const body = bodySchema.parse(await request.json())
        received.push(body.tools.map((tool) => tool.function.name))
        systemMessages.push(
          body.messages
            .filter((message) => ['system', 'developer'].includes(message.role))
            .map((message) => z.string().parse(message.content)),
        )
        const call =
          received.length === 1
            ? {
                name: 'update_plan',
                arguments: JSON.stringify({ plan: [{ step: 'Revised proof', status: 'in_progress' }] }),
              }
            : received.length === 2
              ? {
                  name: 'workflow_focus',
                  arguments: JSON.stringify({ stepIndex: 0, item, completionPolicy: 'agent', expectedPlanRevision: 2 }),
                }
              : null
        const delta = call
          ? {
              role: 'assistant',
              tool_calls: [{ index: 0, id: `call-${received.length}`, type: 'function', function: call }],
            }
          : { role: 'assistant', content: 'Projection checked' }
        const chunk = (delta: unknown, finish_reason: string | null) =>
          `data: ${JSON.stringify({ id: 'advertise', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
        return new Response(chunk(delta, null) + chunk({}, call ? 'tool_calls' : 'stop') + 'data: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      },
    })
    const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
    try {
      await kernel.saveProvider(
        providerSchema.parse({
          id: 'advertise',
          name: 'Advertisement fixture',
          protocol: 'openai-completions',
          baseUrl: `http://127.0.0.1:${provider.port}/v1`,
          model: 'fixture-network',
        }),
        'fixture-only',
      )
      const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
      const plans = kernel.plugins.get<PlanService>('plan')
      const workflows = kernel.plugins.get<WorkflowService>('workflow')
      const plan = await plans.update(session.id, [{ step: 'Initial proof', status: 'in_progress' }])
      await workflows.focus(session.id, 0, item, 'agent', plan.revision)
      // Existing Run selection remains a hard ceiling for the new model-only projection.
      kernel.hooks.on('tools.select', (event) => ({
        ...event,
        tools: event.tools.filter((tool) =>
          [
            'get_plan',
            'update_plan',
            'get_workflow',
            'workflow_focus',
            'workflow_update',
            'read_file',
            ...(compact ? ['workflow_execute', 'workflow_checkpoint', 'workflow_expand_scope'] : []),
          ].includes(tool.name),
        ),
      }))
      await kernel.submit(
        session.id,
        'advertisement',
        { text: 'Revise the Plan and rebuild its focus', images: [] },
        'advertise',
      )
      await kernel.waitForIdle()
      const snapshot = await kernel.snapshot(session.id)
      expect(snapshot.runs[0]?.status).toBe('completed')
      expect(
        snapshot.messages
          .flatMap((message) => message.content)
          .filter((block) => block.type === 'tool_result' && block.isError),
      ).toEqual([])
      expect(received).toHaveLength(3)
      expect(received.map((names) => names.includes('workflow_focus'))).toEqual([false, true, false])
      expect(received.every((names) => !names.includes('write_file'))).toBe(true)
      expect((await workflows.get(session.id)).workflow?.focus?.title).toBe('Revised proof')
      const journalSchema = z.object({
        request: z.object({ toolNames: z.array(z.string()), system: z.string() }),
        tools: z.array(z.object({ name: z.string() })),
      })
      const journal = (await kernel.storage.call('events', session.id, 0))
        .filter((event) => event.type === 'request.started')
        .map((event) => journalSchema.parse(event.data))
      expect(journal.map((event) => event.tools.map((tool) => tool.name))).toEqual(received)
      expect(journal.map((event) => event.request.toolNames)).toEqual(received)
      expect(systemMessages.map((messages) => messages.join(''))).toEqual(journal.map((event) => event.request.system))
      expect(systemMessages.every((messages) => messages.length === 2)).toBe(true)
      expect(systemMessages.every((messages) => !messages[0]?.includes('<focus_workflow>'))).toBe(true)
      expect(systemMessages[1]?.at(-1)).toContain('Focus validity: stale')
      expect(journal.map((event) => event.request.system.split('<workflow_sequence_controls>').length - 1)).toEqual(
        compact ? [1, 0, 1] : [0, 0, 0],
      )
      expect(journal.every((event) => !event.request.system.includes('get_goal({})'))).toBe(true)
      expect(journal.every((event) => !event.request.system.includes('"write_file"'))).toBe(true)
      expect(journal[1]?.request.system).toContain('Current Agent Plan revision: 2')
      expect(journal[1]?.request.system).toContain('Focus validity: stale')
      expect(journal[1]?.request.system).toContain('Revised proof')
      expect(journal[1]?.request.system).not.toContain('Batch known-input')
      expect(journal[2]?.request.system).toContain('Focus validity: current')
    } finally {
      await kernel.close()
      await provider.stop(true)
      await rm(root, { recursive: true, force: true })
    }
  })

for (const invalid of ['forged-tool', 'oversized-instructions'] as const)
  test(`advertisement hooks reject ${invalid} before making a model request`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-invalid-advertisement-'))
    const kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    try {
      const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
      kernel.hooks.on('tools.advertise', (event) => ({
        ...event,
        ...(invalid === 'oversized-instructions'
          ? { instructions: 'x'.repeat(16001) }
          : {
              tools: [
                ...event.tools,
                {
                  name: 'forged_tool',
                  description: 'Not registered',
                  effect: 'read',
                  inputSchema: z.object({}),
                  execute: async () => ({ text: '' }),
                },
              ],
            }),
      }))
      await kernel.submit(session.id, 'invalid', { text: 'Inspect', images: [] }, 'local-fixture')
      await kernel.waitForIdle()
      expect((await kernel.snapshot(session.id)).runs[0]?.failure?.code).toBe('INVALID_TOOL_ADVERTISEMENT')
      expect(
        (await kernel.storage.call('events', session.id, 0)).some((event) => event.type === 'request.started'),
      ).toBe(false)
    } finally {
      await kernel.close()
      await rm(root, { recursive: true, force: true })
    }
  })
