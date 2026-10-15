import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarError } from '@hbar/contracts'
import type { GoalService, PlanService, WorkflowService, ToolContext } from '@hbar/plugin-sdk'
import { WorkflowRuntime } from '../plugins/workflow/src/index'

async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error: unknown) {
    return error
  }
  throw new Error('Expected guarded completion failure')
}

test('missing verification guidance is bounded, private, and progress preserves pending checks until actual tool settlement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-check-guidance-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    await kernel.changePlugin('goal.codex', true, { autoContinue: false })
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected fixture workspace')
    const session = await kernel.createSession(workspace.id)
    await kernel.plugins.get<GoalService>('goal').create(session.id, 'Deliver source without claiming unrun QA')
    const plans = kernel.plugins.get<PlanService>('plan')
    const workflow = kernel.plugins.get<WorkflowService>('workflow')
    if (!(workflow instanceof WorkflowRuntime)) throw new Error('Expected real local Workflow runtime')
    const registeredRead = kernel.tools.get('read_file')
    if (!registeredRead) throw new Error('Expected registered read tool')
    const tool = registeredRead
    const secret = 'SENSITIVE-COMMAND-PATH-OUTPUT-CANARY'
    await writeFile(join(root, secret), secret)
    const plan = await plans.update(session.id, [{ step: 'Read back delivered source', status: 'in_progress' }])
    await workflow.focus(
      session.id,
      0,
      {
        id: 'delivery',
        title: 'Read back source',
        scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
        acceptanceChecks: Array.from({ length: 7 }, (_, index) => ({
          id: `check-${index}-${'x'.repeat(72)}`,
          description: secret,
          verifier: {
            kind: 'tool' as const,
            toolName: 'read_file',
            expectedArguments: { path: secret },
            result: { kind: 'textContains' as const, value: secret },
          },
        })),
      },
      'agent',
      plan.revision,
    )
    const current = (await workflow.get(session.id)).workflow
    if (!current) throw new Error('Expected focus')
    const rejected = await failure(
      workflow.checkpoint(session.id, 'delivery', 'complete', 'Source only', null, current.revision),
    )
    expect(rejected instanceof HbarError).toBe(true)
    if (!(rejected instanceof HbarError)) throw new Error('Expected Workflow guard')
    expect(rejected.code).toBe('WORKFLOW_ACCEPTANCE_PENDING')
    expect(rejected.message).toContain('actual matching registered tool settlement')
    expect(rejected.message).toContain('no workflow_verify tool')
    expect(rejected.message).toContain('outcome="progress"')
    expect(rejected.message).toContain('2 more')
    expect(rejected.message).not.toContain(secret)
    expect(rejected.message).not.toContain('check-5-')
    expect(rejected.message).not.toContain('x'.repeat(65))
    expect(rejected.message.length).toBeLessThan(1600)
    await workflow.checkpoint(
      session.id,
      'delivery',
      'progress',
      'Delivered source; QA not run under execution restriction',
      null,
      current.revision,
    )
    const pending = (await workflow.get(session.id)).workflow
    expect(pending?.focus?.acceptanceChecks.every((check) => check.status === 'pending')).toBe(true)
    expect(pending?.evidence).toHaveLength(0)
    expect(pending?.status).toBe('active')
    // Execute the registered read_file against a real temporary file; only
    // actual matching settlement can issue the passing evidence.
    const run = await kernel.storage.call(
      'enqueue',
      session.id,
      'proof',
      { text: 'Read source', images: [] },
      'local-fixture',
    )
    const context: ToolContext = { session, workspace, run, callId: 'read-proof', signal: new AbortController().signal }
    await workflow.beforeTool(tool.name, { path: secret }, context, tool)
    await workflow.beginTool(tool.name, { path: secret }, context, tool)
    const result = await tool.execute({ path: secret }, context)
    await workflow.settleTool(tool.name, { path: secret }, result, context, tool)
    const proven = (await workflow.get(session.id)).workflow
    if (!proven) throw new Error('Expected verified focus')
    expect(proven.focus?.acceptanceChecks.every((check) => check.status === 'passed')).toBe(true)
    await workflow.checkpoint(session.id, 'delivery', 'complete', 'Actual matching read settled', null, proven.revision)
    expect((await workflow.get(session.id)).workflow?.status).toBe('completed')
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
