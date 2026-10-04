import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { runAcceptedSchema, submitRunInputSchema, type SubmitRunInput } from '@hbar/contracts/commands/run'

async function fixture() {
  const workspace = { id: 'workspace', path: 'D:/fixture', name: 'Workspace', createdAt: 1 }
  const session = {
    id: 'one',
    workspaceId: workspace.id,
    title: 'Planning',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 2,
    seq: 1,
  }
  const runs: SubmitRunInput[] = []
  let release = () => {}
  let hold: Promise<void> | null = null
  const runtime = createAppRuntime({
    instanceId: 'permission-plan-ownership',
    hostId: 'host',
    directory: {
      async execute(name) {
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'session.get') return session
        throw new Error(`Unexpected directory command ${name}`)
      },
    },
    models: {
      async execute(name) {
        if (name !== 'session.getModel') throw new Error(`Unexpected model command ${name}`)
        return {
          sessionId: session.id,
          status: 'configured',
          modelId: 'mock:model',
          model: null,
          thinkingLevel: 'medium',
          revisions: {},
          sources: { model: 'session', thinkingLevel: 'session' },
        }
      },
    },
    configuration: {
      async execute(name) {
        if (name !== 'permission.get') throw new Error(`Unexpected global mutation ${name}`)
        if (hold) await hold
        return { mode: 'deny' }
      },
    },
    run: {
      async execute(_name, input, execution) {
        const request = submitRunInputSchema.parse(input)
        runs.push(request)
        return runAcceptedSchema.parse({
          status: 'accepted',
          commandId: 'run.submit',
          commandVersion: 1,
          sessionId: request.sessionId,
          requestId: crypto.randomUUID(),
          operationId: crypto.randomUUID(),
          idempotencyKey: execution?.idempotencyKey,
          acceptedAt: 3,
        })
      },
      getReceipt: async () => null,
    },
    timeline: {
      async snapshot() {
        return {
          session,
          messages: [
            {
              id: 'proposal',
              sessionId: session.id,
              runId: 'source-run',
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: '<proposed_plan>\n# Confirmed proposal\n\n1. Do the planned work.\n</proposed_plan>',
                },
              ],
              seq: 1,
              createdAt: 2,
            },
          ],
          runs: [
            {
              id: 'source-run',
              sessionId: session.id,
              requestId: 'source-request',
              input: { text: 'Plan', images: [], mode: 'plan' },
              modelId: 'mock:model',
              status: 'completed',
              createdAt: 1,
              startedAt: 1,
              endedAt: 2,
              error: null,
            },
          ],
          approvals: [],
          userInputs: [],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
          cursor: 1,
          hasOlder: false,
          streams: [],
        }
      },
      watch: async () => () => {},
    },
    planProposal: { requestText: ({ markdown }) => `Execute this plan\n${markdown}` },
  })
  await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
  for (
    let i = 0;
    i < 100 &&
    (!runtime.view.state.planProposal.getSnapshot().proposal ||
      runtime.view.state.planProposal.getSnapshot().availability !== 'ready');
    i++
  )
    await Bun.sleep(1)
  const proposal = runtime.view.state.planProposal.getSnapshot().proposal
  if (!proposal) {
    runtime.dispose()
    throw new Error('Expected the real public proposal projection')
  }
  expect(runtime.view.state.planProposal.getSnapshot().availability).toBe('ready')
  return {
    runtime,
    runs,
    target: proposal.target,
    block: () => {
      hold = new Promise<void>((resolve) => {
        release = resolve
      })
      return () => release()
    },
    dispose: () => runtime.dispose(),
  }
}

test('Plan detached execution does not read or consume the ordinary composer allow choice', async () => {
  const f = await fixture()
  try {
    await f.runtime.view.commands.execute('draft.setText', { sessionId: 'one', text: 'Unsent ordinary draft' })
    await f.runtime.view.commands.execute('composerPermission.setChoice', {
      sessionId: 'one',
      expectedRevision: 0,
      choice: 'allow',
      confirmAllow: true,
    })
    await f.runtime.view.commands.execute('proposedPlan.submit', { ...f.target, action: 'implement' })
    expect(f.runs).toHaveLength(1)
    expect(f.runs[0]?.input.approval).toBeUndefined()
    expect(f.runs[0]?.input.mode).toBe('default')
    expect(f.runtime.view.state.composerPermission.getSnapshot().entries.one).toMatchObject({
      choice: 'allow',
      revision: 1,
      locked: false,
    })
    expect(f.runtime.view.state.drafts.getSnapshot().one?.text).toBe('Unsent ordinary draft')
  } finally {
    f.dispose()
  }
})

test('ordinary permission preparation reserves the session before Drafts dispatch so detached Plan cannot race it', async () => {
  const f = await fixture()
  const release = f.block()
  try {
    const sending = f.runtime.view.commands.execute('composerIntent.submit', {
      sessionId: 'one',
      modelId: 'mock:model',
      input: { text: 'Ordinary send', images: [] },
      expectedPermissionRevision: 0,
    })
    await expect(
      f.runtime.view.commands.execute('proposedPlan.submit', { ...f.target, action: 'implement' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    // Access verification now precedes permission capture; the competing intent must
    // remain BUSY across both phases, not depend on a synchronous permission read.
    expect(f.runtime.view.state.composerPermission.getSnapshot().entries.one?.status).toBe('preparing')
    expect(f.runs).toHaveLength(0)
    release()
    await sending
    expect(f.runs).toHaveLength(1)
    expect(f.runs[0]?.input).toMatchObject({ text: 'Ordinary send', approval: 'deny' })
    expect(f.runtime.view.state.composerPermission.getSnapshot().entries.one?.locked).toBe(false)
  } finally {
    release()
    f.dispose()
  }
})
