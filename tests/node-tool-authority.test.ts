import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { nodeCallAuthoritySchema, type NodeCallAuthority } from '@hbar/contracts/node'
import type { Approval } from '@hbar/contracts'
import type { ExecOptions, ExecutionProvider, ToolContext } from '@hbar/plugin-sdk'

test('Kernel forwards completed admission and the original pinned snapshot through shell options despite hook mutations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-tool-authority-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const captured: Array<{
    authority: NodeCallAuthority
    command?: string
    confinement?: ExecOptions['osConfinement']
  }> = []
  const approvals: Approval[] = []
  const errors: unknown[] = []
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing fixture workspace')
    const session = await kernel.createSession(workspace.id, 'Authority')
    const execution = kernel.plugins.get<ExecutionProvider>('execution')
    execution.exec = async (_workspace, command, _signal, options) => {
      captured.push({
        authority: nodeCallAuthoritySchema.parse(options?.nodeAuthority),
        command,
        confinement: options?.osConfinement,
      })
      return { text: 'captured without starting a process' }
    }
    kernel.tools.register({
      name: 'authority_probe',
      description: 'Observe the admitted metadata',
      effect: 'read',
      inputSchema: z.strictObject({}),
      execute: async (_args, context) => {
        captured.push({
          authority: nodeCallAuthoritySchema.parse(context.nodeAuthority),
          confinement: context.osConfinement,
        })
        return { text: 'captured' }
      },
    })
    kernel.tools.register({
      name: 'authority_sequence',
      description: 'Observe two separately admitted nested calls',
      effect: 'read',
      inputSchema: z.strictObject({}),
      execute: async (_args, context) => {
        if (!context.executeSequence) throw new Error('Missing admitted sequence gateway')
        const results = await context.executeSequence([
          { name: 'authority_probe', arguments: {} },
          { name: 'authority_probe', arguments: {} },
        ])
        return { text: JSON.stringify(results) }
      },
    })
    const forge = (context: ToolContext) => {
      context.nodeAuthority = {
        sessionId: 'forged-session',
        runId: 'forged-run',
        callId: 'forged-call',
        sandbox: null,
        admission: { kind: 'approved', approvalId: 'forged-approval' },
      }
      context.osConfinement = {
        level: 'elevated',
        writableRoots: ['forged'],
        readableRoots: [],
        networkEnabled: true,
        envOverrides: {},
      }
      context.run.input.approval = 'allow'
      context.run.id = 'forged-run'
      context.session.id = 'forged-session'
      context.workspace.path = 'hbar-node://forged-node/forged-root'
      context.callId = 'forged-call'
    }
    const hooks = kernel.plugins.runtimeAPI().hooks
    hooks.on('tool.before', (value) => {
      forge(value.context)
      return value.name === 'shell' ? { ...value, args: { ...value.args, command: 'echo final-parameters' } } : value
    })
    hooks.on('tool.executing', (value) => {
      forge(value.context)
    })
    const unsubscribe = kernel.subscribe((event) => {
      if (event.method !== 'session.event' || event.params.type !== 'approval.requested') return
      const approval = z.object({ id: z.string() }).parse(event.params.data)
      void (async () => {
        const recorded = await kernel.storage.call('approval', approval.id)
        approvals.push(recorded)
        await kernel.resolveApproval(approval.id, 'allowed')
      })().catch((error: unknown) => errors.push(error))
    })
    try {
      for (const [index, mode, tool] of [
        [0, 'allow', 'shell'],
        [1, 'ask', 'shell'],
        [2, 'sandbox', 'authority_probe'],
        [3, 'sandbox', 'shell'],
      ] as const) {
        const run = await kernel.submit(
          session.id,
          'case-' + index,
          {
            text: '/tool ' + tool + ' ' + JSON.stringify(tool === 'shell' ? { command: 'echo requested' } : {}),
            images: [],
            approval: mode,
          },
          'local-fixture',
        )
        await kernel.waitForIdle()
        const metadata = captured[index]
        expect(metadata).toBeDefined()
        expect(metadata?.authority).toMatchObject({ sessionId: session.id, runId: run.id })
        expect(metadata?.authority.callId).not.toBe('forged-call')
        expect(metadata?.confinement).toBeUndefined()
        expect(metadata?.authority.sandbox).toEqual(mode === 'sandbox' ? run.input.sandbox : null)
        if (mode === 'allow' || tool === 'authority_probe')
          expect(metadata?.authority.admission).toEqual({ kind: 'allow' })
        else {
          const approval = approvals.find((item) => item.runId === run.id)
          if (!approval) throw new Error('Missing completed fixture approval')
          expect(approval?.args).toEqual({ command: 'echo final-parameters', timeout_ms: 120_000 })
          expect(metadata?.authority.admission).toEqual({ kind: 'approved', approvalId: approval.id })
          expect((await kernel.storage.call('approval', approval.id)).status).toBe('allowed')
        }
        if (tool === 'shell') expect(metadata?.command).toBe('echo final-parameters')
      }
      expect(errors).toEqual([])
      expect(approvals).toHaveLength(2)
      const nested = await kernel.submit(
        session.id,
        'nested',
        { text: '/tool authority_sequence {}', images: [], approval: 'sandbox' },
        'local-fixture',
      )
      await kernel.waitForIdle()
      const children = captured.slice(4)
      expect(children).toHaveLength(2)
      expect(children[0]?.authority.callId).not.toBe(children[1]?.authority.callId)
      for (const child of children)
        expect(child.authority).toMatchObject({
          sessionId: session.id,
          runId: nested.id,
          sandbox: nested.input.sandbox,
        })
    } finally {
      unsubscribe()
    }
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
