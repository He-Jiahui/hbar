import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Kernel,
  MemorySecrets,
  type ToolCallPreparationPort,
  type ToolCallBinding,
  type ToolMutationAdmissionPort,
  type ToolMutationAdmissionContext,
} from '@hbar/kernel'
import { HbarError, type ApprovalMode } from '@hbar/contracts'
import { describeRuntimeHook, restoreRuntimeHook } from '@hbar/plugin-sdk/runtime-plugin'
import type { ToolDefinition } from '@hbar/plugin-sdk'
import { definePlugin, provide, type PolicyProvider } from '@hbar/plugin-sdk'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'
import { bindToolCall } from '../packages/kernel/src/tool-call-binding'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const input = z.strictObject({
  action: z.enum(['read', 'write', 'process']),
  path: z.string().default('proof.txt'),
  command: z.string().default('echo approved'),
})

async function fixture(
  prepare?: ToolCallPreparationPort['prepare'],
  timeoutMs = 1_000,
  mutationAdmission?: ToolMutationAdmissionPort,
  policy?: PolicyProvider,
) {
  const prefix = 'hbar-tool-call-binding-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let executions = 0
  let staticExecutions = 0
  const port: ToolCallPreparationPort = {
    async prepare(name, args, context) {
      if (name !== 'bound_operation') return undefined
      if (prepare) return prepare(name, args, context)
      const parsed = input.parse(args)
      return {
        admission: {
          effect: parsed.action,
          timeoutMs,
          workspaceAccess: {
            kind: 'paths',
            arguments: [{ field: 'path', access: parsed.action === 'read' ? 'read' : 'write' }],
          },
          ...(parsed.action === 'process' ? { commandArgument: 'command' } : {}),
        },
        arguments: parsed,
        async execute(finalArgs, toolContext) {
          executions++
          const selected = input.parse(finalArgs)
          if (selected.action === 'write') {
            await writeFile(join(toolContext.workspace.path, selected.path), toolContext.run.id)
          }
          return { text: `bound:${selected.action}` }
        },
      }
    },
  }
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    toolCalls: port,
    mutationAdmission,
    ...(policy
      ? {
          profile: {
            replacements: {
              'policy.approval': definePlugin({
                manifest: {
                  id: 'policy.approval',
                  name: 'Bound permission fixture',
                  description: 'Inspect both command entry points',
                  version: '1.0.0',
                  apiVersion: '^1.0.0',
                  scope: 'host',
                  required: true,
                  permissions: [],
                  provides: { policy: '1.0.0' },
                },
                apply: (ctx) => provide(ctx, 'policy', policy),
              }),
            },
          },
        }
      : {}),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Binding fixture has no workspace')
  const session = await kernel.createSession(workspace.id)
  const original: ToolDefinition = {
    name: 'bound_operation',
    description: 'Resolve one final operation',
    effect: 'read',
    inputSchema: input,
    async execute() {
      staticExecutions++
      return { text: 'unprepared' }
    },
  }
  kernel.tools.register(original)
  return {
    root,
    kernel,
    session,
    original,
    get executions() {
      return executions
    },
    get staticExecutions() {
      return staticExecutions
    },
    async run(action: string, approval: ApprovalMode = 'allow', mode: 'default' | 'plan' = 'default') {
      const run = await kernel.submit(
        session.id,
        crypto.randomUUID(),
        {
          text: `/tool bound_operation ${JSON.stringify({ action })}`,
          images: [],
          approval,
          mode,
        },
        'local-fixture',
      )
      await kernel.waitForIdle()
      const snapshot = await kernel.snapshot(session.id)
      const results = snapshot.messages
        .flatMap((message) => message.content)
        .filter((block) => block.type === 'tool_result')
      return { run, snapshot, results }
    },
    async close() {
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('mutation reconciliation checks the final transformed effect before approval, durable intent or file writes', async () => {
  const admissions: ToolMutationAdmissionContext[] = []
  const f = await fixture(undefined, 1_000, {
    async assertAllowed(context) {
      admissions.push(context)
      throw new HbarError('COMMAND_RESULT_UNCONFIRMED', 'Confirm the original write first')
    },
  })
  try {
    f.kernel.hooks.on('tool.before', (event) =>
      event.name === 'bound_operation' ? { ...event, args: { ...event.args, action: 'write' } } : event,
    )
    const { run, snapshot, results } = await f.run('read', 'ask')
    expect(admissions).toHaveLength(1)
    expect(admissions[0]).toMatchObject({
      sessionId: f.session.id,
      runId: run.id,
      tool: 'bound_operation',
      effect: 'write',
    })
    expect(admissions[0]?.callId).toBeString()
    expect(results.at(-1)?.text).toContain('Confirm the original write first')
    expect(snapshot.approvals).toHaveLength(0)
    expect(f.executions).toBe(0)
    expect(await Bun.file(join(f.root, 'proof.txt')).exists()).toBe(false)
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.started'),
    ).toHaveLength(0)
  } finally {
    await f.close()
  }
})

test('read-only inspection remains available without admitting a mutation', async () => {
  const f = await fixture(undefined, 1_000, {
    async assertAllowed() {
      throw new Error('A read must not enter mutation admission')
    },
  })
  try {
    const { results } = await f.run('read')
    expect(results.at(-1)).toMatchObject({ text: 'bound:read' })
    expect(f.executions).toBe(1)
  } finally {
    await f.close()
  }
})

test('a reconciled mutation still requires ordinary permission and approval', async () => {
  let admissions = 0
  const f = await fixture(undefined, 1_000, {
    async assertAllowed() {
      admissions++
    },
  })
  const resolutions: Promise<unknown>[] = []
  const unsubscribe = f.kernel.subscribe((event) => {
    if (event.method !== 'session.event' || event.params.type !== 'approval.requested') return
    const approval = z.object({ id: z.string() }).parse(event.params.data)
    resolutions.push(f.kernel.resolveApproval(approval.id, 'allowed'))
  })
  try {
    const denied = await f.run('write', 'deny')
    expect(denied.results.at(-1)?.isError).toBe(true)
    expect(f.executions).toBe(0)
    await f.run('write', 'ask')
    await Promise.all(resolutions)
    expect(admissions).toBe(2)
    expect(resolutions).toHaveLength(1)
    expect(f.executions).toBe(1)
  } finally {
    unsubscribe()
    await Promise.all(resolutions)
    await f.close()
  }
})

test('cancellation during mutation reconciliation never records intent or executes a bound tool', async () => {
  let entered: () => void = () => {
    throw new Error('Mutation admission has not started')
  }
  const entering = new Promise<void>((resolve) => {
    entered = resolve
  })
  const f = await fixture(undefined, 1_000, {
    async assertAllowed(context) {
      entered()
      await new Promise<void>((resolve) => context.signal.addEventListener('abort', () => resolve(), { once: true }))
    },
  })
  try {
    const run = await f.kernel.submit(
      f.session.id,
      'cancel-mutation-gate',
      {
        text: '/tool bound_operation {"action":"write"}',
        images: [],
        approval: 'allow',
      },
      'local-fixture',
    )
    await entering
    await f.kernel.cancel(run.id)
    await f.kernel.waitForIdle()
    expect((await f.kernel.snapshot(f.session.id)).runs[0]?.status).toBe('cancelled')
    expect(f.executions).toBe(0)
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.started'),
    ).toHaveLength(0)
  } finally {
    await f.close()
  }
})

test('resolved writes use ordinary policy and approval before the bound executor and durable intent', async () => {
  const f = await fixture()
  const approvals: string[] = []
  const pending: Promise<unknown>[] = []
  const unsubscribe = f.kernel.subscribe((event) => {
    if (event.method !== 'session.event' || event.params.type !== 'approval.requested') return
    const approval = z.object({ id: z.string() }).parse(event.params.data)
    approvals.push(approval.id)
    pending.push(f.kernel.resolveApproval(approval.id, 'allowed'))
  })
  try {
    const { run } = await f.run('write', 'ask')
    await Promise.all(pending)
    expect(approvals).toHaveLength(1)
    expect(f.executions).toBe(1)
    expect(f.staticExecutions).toBe(0)
    expect(await readFile(join(f.root, 'proof.txt'), 'utf8')).toBe(run.id)
    const events = await f.kernel.storage.call('events', f.session.id, 0)
    const approvalIndex = events.findIndex((event) => event.type === 'approval.resolved')
    const intentIndex = events.findIndex((event) => event.type === 'tool.started')
    expect(approvalIndex).toBeGreaterThan(-1)
    expect(intentIndex).toBeGreaterThan(approvalIndex)
    expect(events[intentIndex]?.data).toMatchObject({ args: { action: 'write', path: 'proof.txt' } })
    expect(f.kernel.tools.get('bound_operation')?.effect).toBe('read')
  } finally {
    unsubscribe()
    await Promise.all(pending)
    await f.close()
  }
})

test('Plan and deny permissions inspect the resolved effect despite the generic read declaration', async () => {
  for (const gate of ['plan', 'deny'] as const) {
    const f = await fixture()
    try {
      const { snapshot, results } = await f.run(
        'write',
        gate === 'deny' ? 'deny' : 'allow',
        gate === 'plan' ? 'plan' : 'default',
      )
      expect(f.executions).toBe(0)
      expect(f.staticExecutions).toBe(0)
      expect(snapshot.approvals).toHaveLength(0)
      expect(results.some((block) => block.isError)).toBe(true)
      expect(await Bun.file(join(f.root, 'proof.txt')).exists()).toBe(false)
      expect(
        (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.started'),
      ).toHaveLength(0)
    } finally {
      await f.close()
    }
  }
})

test('a late transforming Hook is resolved before sandbox paths and effects are evaluated', async () => {
  const f = await fixture()
  try {
    f.kernel.hooks.on('tool.before', (event) =>
      event.name === 'bound_operation' ? { ...event, args: { action: 'write', path: '../outside.txt' } } : event,
    )
    const saved = await f.kernel.sandboxProfiles.save(
      {
        id: 'strict-binding',
        expectedRevision: null,
        name: 'Strict fixture',
        description: '',
        extends: ':read-only',
        escalation: 'deny',
        filesystem: { default: null, grants: [] },
        commands: { rules: [] },
        network: { enabled: null },
        tools: { rules: [] },
      },
      { actorId: 'fixture', idempotencyKey: 'save-binding' },
    )
    const sandbox = await f.kernel.sandboxProfiles.createSnapshot(saved.id)
    await f.kernel.submit(
      f.session.id,
      'binding-sandbox',
      {
        text: '/tool bound_operation {"action":"read"}',
        images: [],
        approval: 'sandbox',
        sandbox,
      },
      'local-fixture',
    )
    await f.kernel.waitForIdle()
    const snapshot = await f.kernel.snapshot(f.session.id)
    expect(f.executions).toBe(0)
    expect(snapshot.approvals).toHaveLength(0)
    expect(
      snapshot.messages
        .flatMap((message) => message.content)
        .some((block) => block.type === 'tool_result' && block.isError),
    ).toBe(true)
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.started'),
    ).toHaveLength(0)
  } finally {
    await f.close()
  }
})

test('preparation cannot replace Host identity and a cancelled preparation never records intent', async () => {
  let entered: () => void = () => {
    throw new Error('Preparation observer is not installed')
  }
  const preparing = new Promise<void>((resolve) => {
    entered = resolve
  })
  const f = await fixture(async (_name, args, context) => {
    context.session.id = 'forged-session'
    context.workspace.path = 'unowned'
    context.run.input.approval = 'allow'
    const prepared: ToolCallBinding = {
      admission: { effect: 'write', workspaceAccess: { kind: 'none' }, timeoutMs: 1_000 },
      arguments: { ...args },
      execute: async () => {
        throw new Error('Cancelled preparation executed')
      },
    }
    entered()
    await new Promise<void>((resolve) => context.signal.addEventListener('abort', () => resolve(), { once: true }))
    return prepared
  })
  try {
    const run = await f.kernel.submit(
      f.session.id,
      'binding-cancel',
      {
        text: '/tool bound_operation {"action":"write"}',
        images: [],
        approval: 'allow',
      },
      'local-fixture',
    )
    await preparing
    await f.kernel.cancel(run.id)
    await f.kernel.waitForIdle()
    expect((await f.kernel.snapshot(f.session.id)).runs[0]?.status).toBe('cancelled')
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.started'),
    ).toHaveLength(0)
  } finally {
    await f.close()
  }
})

test('resolved metadata survives managed Hook descriptions and cannot replace the registered executor', async () => {
  const f = await fixture()
  try {
    f.kernel.hooks.on('tool.admitting', (event) => {
      if (event.name !== 'bound_operation') return event
      const wire = describeRuntimeHook('tool.admitting', event)
      const restored = restoreRuntimeHook('tool.admitting', wire, [event.tool])
      expect(restored.tool.effect).toBe('write')
      expect(restored.tool.workspaceAccess).toEqual({ kind: 'paths', arguments: [{ field: 'path', access: 'write' }] })
      expect(Object.isFrozen(event.tool)).toBe(true)
      event.args.action = 'read'
      return { ...event, tool: f.original, args: { action: 'read' } }
    })
    const { run } = await f.run('write')
    expect(f.executions).toBe(1)
    expect(f.staticExecutions).toBe(0)
    expect(await readFile(join(f.root, 'proof.txt'), 'utf8')).toBe(run.id)
  } finally {
    await f.close()
  }
})

test('Workflow checks resolved arguments against the focused file scope before any bound write', async () => {
  const f = await fixture()
  try {
    await f.kernel.changePlugin('goal.codex', true, { autoContinue: false })
    await f.kernel.plugins.get<GoalService>('goal').create(f.session.id, 'Write the authorized proof')
    const plan = await f.kernel.plugins
      .get<PlanService>('plan')
      .update(f.session.id, [{ step: 'Proof', status: 'in_progress' }])
    await f.kernel.plugins.get<WorkflowService>('workflow').focus(
      f.session.id,
      0,
      {
        id: 'proof',
        title: 'Proof',
        scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['bound_operation'] },
        acceptanceChecks: [{ id: 'proof', description: 'Review proof', verifier: { kind: 'user' } }],
      },
      'user',
      plan.revision,
    )
    f.kernel.hooks.on('tool.before', (event) =>
      event.name === 'bound_operation' ? { ...event, args: { ...event.args, path: 'outside.txt' } } : event,
    )
    const { results } = await f.run('write')
    expect(results.some((block) => block.isError && block.text.includes('outside'))).toBe(true)
    expect(f.executions).toBe(0)
    expect(await Bun.file(join(f.root, 'outside.txt')).exists()).toBe(false)
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.started'),
    ).toHaveLength(0)
  } finally {
    await f.close()
  }
})

test('a resolved write timeout remains an unknown effect while a read timeout is a known failure', async () => {
  for (const effect of ['read', 'write'] as const) {
    const f = await fixture(async (_name, args) => ({
      admission: { effect, workspaceAccess: { kind: 'none' }, timeoutMs: 50 },
      arguments: { ...args },
      execute: async (_final, context) =>
        new Promise((_resolve, reject) => {
          if (context.signal.aborted) reject(context.signal.reason)
          else context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true })
        }),
    }))
    try {
      const { results } = await f.run(effect)
      expect(results.at(-1)?.outcome).toMatchObject({
        kind: effect === 'write' ? 'unknown' : 'failed',
        executionStarted: true,
      })
      expect(results.at(-1)?.details).toMatchObject({
        code: 'TOOL_TIMEOUT',
        timeoutMs: 50,
        resultUnknown: effect === 'write',
      })
    } finally {
      await f.close()
    }
  }
})

test('Workflow and managed metadata inspect the immutable nested destination rather than a permitted flat decoy', async () => {
  for (const destination of ['outside.txt', 'proof.txt']) {
    let executions = 0
    const f = await fixture(async (_name, args) => ({
      admission: {
        effect: 'write',
        timeoutMs: 1_000,
        workspaceAccess: {
          kind: 'paths',
          arguments: [{ field: 'input.path', fieldPath: ['input', 'path'], access: 'write' }],
        },
      },
      arguments: { ...args, 'input.path': 'proof.txt', input: { path: destination } },
      async execute(final, context) {
        const parsed = z.object({ input: z.object({ path: z.string() }) }).parse(final)
        executions++
        await writeFile(join(context.workspace.path, parsed.input.path), context.run.id)
        return { text: 'Nested write committed' }
      },
    }))
    try {
      await f.kernel.changePlugin('goal.codex', true, { autoContinue: false })
      await f.kernel.plugins.get<GoalService>('goal').create(f.session.id, 'Write the scoped nested proof')
      const plan = await f.kernel.plugins
        .get<PlanService>('plan')
        .update(f.session.id, [{ step: 'Proof', status: 'in_progress' }])
      await f.kernel.plugins.get<WorkflowService>('workflow').focus(
        f.session.id,
        0,
        {
          id: 'proof',
          title: 'Proof',
          scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['bound_operation'] },
          acceptanceChecks: [{ id: 'proof', description: 'Review proof', verifier: { kind: 'user' } }],
        },
        'user',
        plan.revision,
      )
      f.kernel.hooks.on('tool.admitting', (event) => {
        if (event.name !== 'bound_operation') return event
        const access = event.tool.workspaceAccess
        if (access?.kind !== 'paths') throw new Error('Nested path admission was lost')
        const path = access.arguments[0]?.fieldPath
        expect(path).toEqual(['input', 'path'])
        expect(Object.isFrozen(path)).toBe(true)
        if (path) expect(Reflect.set(path, '1', 'other')).toBe(false)
        const restored = restoreRuntimeHook('tool.admitting', describeRuntimeHook('tool.admitting', event), [
          event.tool,
        ])
        expect(restored.tool.workspaceAccess).toEqual(access)
        return event
      })
      const { run, results } = await f.run('write')
      expect(executions).toBe(destination === 'proof.txt' ? 1 : 0)
      expect(await Bun.file(join(f.root, 'outside.txt')).exists()).toBe(false)
      if (destination === 'proof.txt') expect(await readFile(join(f.root, destination), 'utf8')).toBe(run.id)
      else expect(results.some((block) => block.isError && block.text.includes('outside'))).toBe(true)
    } finally {
      await f.close()
    }
  }
})

test('an unbound ordinary tool keeps its original validation and executor', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, 'proof.txt'), 'ordinary tool proof')
    await f.kernel.submit(
      f.session.id,
      'binding-ordinary',
      {
        text: '/tool read_file {"path":"proof.txt"}',
        images: [],
        approval: 'allow',
      },
      'local-fixture',
    )
    await f.kernel.waitForIdle()
    const snapshot = await f.kernel.snapshot(f.session.id)
    expect(
      snapshot.messages
        .flatMap((message) => message.content)
        .some((block) => block.type === 'tool_result' && block.text.includes('ordinary tool proof') && !block.isError),
    ).toBe(true)
    expect(f.executions).toBe(0)
    expect(f.staticExecutions).toBe(0)
  } finally {
    await f.close()
  }
})

for (const denied of ['generic', 'native', 'neither'] as const)
  test(`resolved permission aliases preserve ${denied} denial before durable intent`, async () => {
    let executed = 0
    const seen: Array<{ name: string; args: Record<string, unknown> }> = []
    const f = await fixture(
      async (_name, args) => ({
        admission: {
          effect: 'read',
          workspaceAccess: { kind: 'none' },
          timeoutMs: 1_000,
          permissionAliases: [{ name: 'native_operation', arguments: { path: 'host-final.txt' } }],
        },
        arguments: args,
        execute: async () => {
          executed++
          return { text: 'permitted native operation' }
        },
      }),
      1_000,
      undefined,
      {
        async decide(tool, args) {
          seen.push({ name: tool.name, args: structuredClone(args) })
          return (denied === 'generic' && tool.name === 'bound_operation') ||
            (denied === 'native' && tool.name === 'native_operation')
            ? 'deny'
            : 'allow'
        },
      },
    )
    try {
      const result = await f.run('read')
      expect(executed).toBe(denied === 'neither' ? 1 : 0)
      expect(seen.map((entry) => entry.name)).toEqual(
        denied === 'generic' ? ['bound_operation'] : ['bound_operation', 'native_operation'],
      )
      if (denied !== 'generic') expect(seen[1]?.args).toEqual({ path: 'host-final.txt' })
      const events = await f.kernel.storage.call('events', f.session.id, 0)
      expect(events.some((event) => event.type === 'tool.started')).toBe(denied === 'neither')
      expect(result.results.some((block) => block.type === 'tool_result' && block.isError)).toBe(denied !== 'neither')
    } finally {
      await f.close()
    }
  })

for (const ask of ['generic', 'native'] as const)
  test(`the ${ask} entry point still requires approval when the other entry point allows`, async () => {
    let executed = 0
    const f = await fixture(
      async (_name, args) => ({
        admission: {
          effect: 'read',
          workspaceAccess: { kind: 'none' },
          timeoutMs: 1_000,
          permissionAliases: [{ name: 'native_operation', arguments: {} }],
        },
        arguments: args,
        execute: async () => {
          executed++
          return { text: 'approved native operation' }
        },
      }),
      1_000,
      undefined,
      {
        async decide(tool) {
          return tool.name === (ask === 'generic' ? 'bound_operation' : 'native_operation') ? 'ask' : 'allow'
        },
      },
    )
    const decisions: Promise<unknown>[] = []
    let approvals = 0
    const unsubscribe = f.kernel.subscribe((event) => {
      if (event.method !== 'session.event' || event.params.type !== 'approval.requested') return
      const approval = z.object({ id: z.string() }).parse(event.params.data)
      approvals++
      decisions.push(f.kernel.resolveApproval(approval.id, 'allowed'))
    })
    try {
      await f.run('read', 'ask')
      await Promise.all(decisions)
      expect(approvals).toBe(1)
      expect(executed).toBe(1)
    } finally {
      unsubscribe()
      await Promise.all(decisions)
      await f.close()
    }
  })

test('scope admission checks both entry points against immutable final native arguments before execution', async () => {
  let executed = 0
  const f = await fixture(async (_name, args) => ({
    admission: {
      effect: 'write',
      workspaceAccess: { kind: 'none' },
      timeoutMs: 1_000,
      permissionAliases: [{ name: 'native_operation', arguments: { destination: 'final-destination' } }],
    },
    arguments: args,
    execute: async () => {
      executed++
      return { text: 'Unexpected execution' }
    },
  }))
  const seen: string[] = []
  f.kernel.hooks.on('tool.admitting', (event) => {
    seen.push(event.name)
    if (event.name === 'native_operation') {
      expect(event.args).toEqual({ destination: 'final-destination' })
      expect(event.tool.name).toBe('native_operation')
      throw new HbarError('WORKFLOW_SCOPE_REQUIRED', 'The native operation is outside the authorized scope')
    }
    return event
  })
  try {
    const result = await f.run('write')
    expect(seen).toEqual(['bound_operation', 'native_operation'])
    expect(executed).toBe(0)
    expect(
      result.results.some(
        (block) => block.type === 'tool_result' && block.text.includes('outside the authorized scope'),
      ),
    ).toBe(true)
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).some((event) => event.type === 'tool.started'),
    ).toBe(false)
  } finally {
    await f.close()
  }
})

test('invalid resolved arguments fail before policy, approval, intent and execution', () => {
  const tool: ToolDefinition = {
    name: 'bound_test',
    description: 'Fixture',
    effect: 'read',
    inputSchema: z.object({}),
    execute: async () => ({ text: '' }),
  }
  const binding: ToolCallBinding = {
    admission: { effect: 'write', workspaceAccess: { kind: 'none' }, timeoutMs: 1_000 },
    arguments: { data: 'x'.repeat(262_144) },
    execute: async () => ({ text: 'unexpected' }),
  }
  expect(() => bindToolCall(tool, binding)).toThrow(HbarError)
  expect(() => bindToolCall(tool, { ...binding, arguments: { invalid: undefined } })).toThrow()
})
