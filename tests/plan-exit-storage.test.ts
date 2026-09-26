import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Approval, SessionEvent } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { ModeService } from '@hbar/plugin-sdk'
import { createPathLayout, isDurableSessionEvent, scanSessionLogs, SessionLogWriter, Storage } from '@hbar/storage'
import type { PathLayout } from '@hbar/storage'

interface Resource {
  readonly root: string
  readonly layout: PathLayout
  kernel: Kernel | null
  storage: Storage | null
}

const resources: Resource[] = []
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.storage?.close()
    await resource.kernel?.close()
    await rm(resource.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-plan-exit-storage-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  const resource: Resource = { root, layout, kernel: null, storage: null }
  resources.push(resource)
  const kernel = await Kernel.create({
    home: layout.dataRoot,
    layout,
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resource.kernel = kernel
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Fixture workspace is missing')
  const session = await kernel.createSession(workspace.id)
  const mode = kernel.plugins.get<ModeService>('mode')
  await mode.set(session.id, 'plan')
  await kernel.waitForIdle()
  // Drive the persisted Run states without scheduling a model or touching a real provider.
  const run = await kernel.storage.call(
    'enqueue',
    session.id,
    'plan-exit-storage',
    { text: 'Plan', images: [], mode: 'plan' },
    'local-fixture',
  )
  await kernel.storage.call('claim', session.id)
  const approval: Approval = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    runId: run.id,
    callId: crypto.randomUUID(),
    tool: 'exit_plan_mode',
    args: { plan: '# A verified plan' },
    status: 'pending',
    createdAt: Date.now(),
  }
  await kernel.storage.call('commit', session.id, run.id, 'assistant', [
    { type: 'tool_call', name: approval.tool, callId: approval.callId, args: approval.args },
  ])
  await kernel.storage.call('createApproval', approval)
  await kernel.storage.call('setRun', run.id, 'waiting_approval')
  return { resource, kernel, mode, session, run, approval }
}

async function removeProjection(resource: Resource) {
  await resource.kernel?.close()
  resource.kernel = null
  await resource.storage?.close()
  resource.storage = null
  for (const path of [resource.layout.database, `${resource.layout.database}-wal`, `${resource.layout.database}-shm`])
    await rm(path, { force: true })
}

test('only the exact Plan exit decision event gains the durable journal guarantee', () => {
  expect(isDurableSessionEvent('plan_exit.resolved')).toBe(true)
  expect(isDurableSessionEvent('plan_exit.preview')).toBe(false)
  expect(isDurableSessionEvent('plan_exit.resolved.extra')).toBe(false)
})

test.each(['denied', 'identity'] as const)(
  'the live mode projection does not announce a default transition from an invalid %s result',
  async (mismatch) => {
    const f = await fixture()
    const notifications: string[] = []
    const unsubscribe = f.kernel.subscribe((event) => {
      if (event.method === 'mode.changed') notifications.push(event.params.mode)
    })
    try {
      const event: SessionEvent = {
        eventId: crypto.randomUUID(),
        sessionId: f.session.id,
        seq: f.session.seq + 1,
        runId: f.run.id,
        stepId: null,
        type: 'plan_exit.resolved',
        time: Date.now(),
        version: 1,
        data: {
          approval: { ...f.approval, status: mismatch === 'denied' ? 'denied' : 'allowed' },
          mode: mismatch === 'denied' ? null : 'default',
          exitRunId: f.run.id,
          callId: mismatch === 'identity' ? 'another-call' : f.approval.callId,
        },
      }
      let rejection: unknown
      try {
        await f.mode.commitExit(f.session.id, async () => {
          return { modeEvent: event }
        })
      } catch (error) {
        rejection = error
      }
      expect(rejection).toMatchObject({
        code: mismatch === 'denied' ? 'PLAN_EXIT_INVALID' : 'PLAN_REPLAY',
      })
      expect(await f.mode.get(f.session.id)).toEqual({ mode: 'plan' })
      expect(f.mode.effectiveMode(f.run)).toBe('plan')
      expect(notifications).toEqual([])
    } finally {
      unsubscribe()
      await f.kernel.storage.call('setRun', f.run.id, 'interrupted')
    }
  },
)

test.each(['implement', 'continue'] as const)(
  'one canonical record restores the %s decision and mode together after projection loss',
  async (decision) => {
    const f = await fixture()
    const pending = await f.kernel.storage.call('approval', f.approval.id)
    expect(Object.hasOwn(pending, 'feedback')).toBe(false)
    expect(Object.hasOwn(pending, 'decidedBy')).toBe(false)
    const before = (await f.kernel.storage.call('session', f.session.id)).seq
    const commit = () =>
      f.kernel.storage.call(
        'resolvePlanExit',
        f.approval.id,
        f.session.id,
        f.run.id,
        f.approval.callId,
        decision,
        decision === 'continue' ? 'Check the migration.' : undefined,
        'actor-1',
      )
    const resolved = decision === 'implement' ? await f.mode.commitExit(f.session.id, commit) : await commit()
    if (decision === 'implement') expect(Object.hasOwn(resolved.approval, 'feedback')).toBe(false)
    expect(resolved.event).toMatchObject({
      type: 'plan_exit.resolved',
      seq: before + 1,
      runId: f.run.id,
      data: {
        approval: { id: f.approval.id, status: decision === 'implement' ? 'allowed' : 'denied', decidedBy: 'actor-1' },
        mode: decision === 'implement' ? 'default' : null,
        exitRunId: f.run.id,
        callId: f.approval.callId,
      },
    })
    expect(resolved.modeEvent).toEqual(decision === 'implement' ? resolved.event : null)
    expect((await f.kernel.storage.call('session', f.session.id)).seq).toBe(before + 1)
    const originalEvents = await f.kernel.storage.call('events', f.session.id, 0)
    expect(originalEvents.filter((event) => event.type === 'plan_exit.resolved')).toHaveLength(1)
    expect(originalEvents.filter((event) => event.type === 'approval.resolved')).toHaveLength(0)
    expect(originalEvents.filter((event) => event.type === 'mode.changed')).toHaveLength(1)
    const canonical = scanSessionLogs(f.resource.layout.sessions).events.map((item) => item.event)
    expect(canonical.filter((event) => event.type === 'plan_exit.resolved')).toEqual([resolved.event])

    await removeProjection(f.resource)
    const storage = new Storage(f.resource.layout.database, f.resource.layout)
    f.resource.storage = storage
    await storage.call('ready')
    expect(await storage.call('approval', f.approval.id)).toMatchObject({
      status: decision === 'implement' ? 'allowed' : 'denied',
      decidedBy: 'actor-1',
      ...(decision === 'continue' ? { feedback: 'Check the migration.' } : {}),
    })
    expect(await storage.call('events', f.session.id, 0)).toEqual(originalEvents)
    expect((await storage.call('snapshot', f.session.id)).approvals).toEqual([resolved.approval])
    await storage.close()
    f.resource.storage = null
    const restarted = await Kernel.create({
      home: f.resource.layout.dataRoot,
      layout: f.resource.layout,
      demo: true,
      secrets: new MemorySecrets(),
    })
    f.resource.kernel = restarted
    const mode = restarted.plugins.get<ModeService>('mode')
    expect(await mode.get(f.session.id)).toEqual({ mode: decision === 'implement' ? 'default' : 'plan' })
    const recoveredRun = await restarted.storage.call('run', f.run.id)
    expect(mode.effectiveMode(recoveredRun)).toBe(decision === 'implement' ? 'default' : 'plan')
    expect(recoveredRun.input.mode).toBe('plan')
    expect(recoveredRun.status).toBe('interrupted')
    expect((await restarted.snapshot(f.session.id)).approvals).toEqual([resolved.approval])
    expect(
      (await restarted.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'plan_exit.resolved'),
    ).toEqual([resolved.event])
  },
)

test('snapshot preserves only exact Plan exit calls in its current message page, with pending requests first', async () => {
  const f = await fixture()
  const resolved = await f.kernel.storage.call(
    'resolvePlanExit',
    f.approval.id,
    f.session.id,
    f.run.id,
    f.approval.callId,
    'continue',
    'Keep the safe migration path.',
    'actor-1',
  )
  const otherSession = await f.kernel.createSession(f.session.workspaceId)
  for (const changes of [
    { callId: 'another-call' },
    { runId: 'another-run' },
    { tool: 'write_file' },
    { sessionId: otherSession.id },
  ]) {
    const unrelated = { ...f.approval, ...changes, id: crypto.randomUUID(), createdAt: Date.now() }
    await f.kernel.storage.call('createApproval', unrelated)
    await f.kernel.storage.call('resolveApproval', unrelated.id, 'denied')
  }
  const pending = {
    ...f.approval,
    id: crypto.randomUUID(),
    callId: 'pending-call',
    tool: 'write_file',
    createdAt: Date.now(),
  }
  await f.kernel.storage.call('createApproval', pending)
  const original = (await f.kernel.storage.call('snapshot', f.session.id)).messages[0]
  if (!original) throw new Error('The Plan call message is missing')
  const newer = await f.kernel.storage.call('commit', f.session.id, f.run.id, 'assistant', [
    { type: 'text', text: 'A different message page' },
  ])
  const current = await f.kernel.storage.call('snapshot', f.session.id, undefined, 1)
  expect(current.messages.map((message) => message.id)).toEqual([newer.message.id])
  expect(current.approvals).toEqual([pending])
  const older = await f.kernel.storage.call('snapshot', f.session.id, newer.message.seq, 1)
  expect(older.messages.map((message) => message.id)).toEqual([original.id])
  expect(older.approvals).toEqual([pending, resolved.approval])
  expect(older.approvals[1]?.args).toEqual({ plan: '# A verified plan' })
  expect(older.approvals[1]?.feedback).toBe('Keep the safe migration path.')
  await f.kernel.storage.call('commit', f.session.id, f.run.id, 'tool', [
    {
      type: 'tool_result',
      name: 'exit_plan_mode',
      callId: f.approval.callId,
      text: 'Continue planning',
      isError: true,
    },
  ])
  expect((await f.kernel.storage.call('snapshot', f.session.id, undefined, 1)).approvals).toEqual([
    pending,
    resolved.approval,
  ])
})

test('snapshot approval history is bounded to 80 and never displaces pending requests', async () => {
  const f = await fixture()
  for (let index = 0; index < 82; index++) {
    const approval: Approval = { ...f.approval, id: crypto.randomUUID(), callId: `pending-${index}`, createdAt: index }
    await f.kernel.storage.call('createApproval', approval)
  }
  const snapshot = await f.kernel.storage.call('snapshot', f.session.id)
  expect(snapshot.approvals).toHaveLength(80)
  expect(snapshot.approvals.every((approval) => approval.status === 'pending')).toBe(true)
})

test('a truncated decision record cannot recover an approval without its mode transition', async () => {
  const f = await fixture()
  const nextSeq = (await f.kernel.storage.call('session', f.session.id)).seq + 1
  const event: SessionEvent = {
    eventId: crypto.randomUUID(),
    sessionId: f.session.id,
    seq: nextSeq,
    runId: f.run.id,
    stepId: null,
    type: 'plan_exit.resolved',
    time: Date.now(),
    version: 1,
    data: {
      approval: { ...f.approval, status: 'allowed', decidedBy: 'actor-1' },
      mode: 'default',
      exitRunId: f.run.id,
      callId: f.approval.callId,
    },
  }
  await removeProjection(f.resource)
  const writer = new SessionLogWriter(f.resource.layout.sessions)
  const path = writer.file(f.session.workspaceId, f.session.id, event.time)
  const existing = await Bun.file(path).text()
  const incomplete = JSON.stringify(event)
  await Bun.write(path, `${existing}${incomplete.slice(0, incomplete.indexOf('"mode"'))}`)
  const restarted = await Kernel.create({
    home: f.resource.layout.dataRoot,
    layout: f.resource.layout,
    demo: true,
    secrets: new MemorySecrets(),
  })
  f.resource.kernel = restarted
  expect(await restarted.plugins.get<ModeService>('mode').get(f.session.id)).toEqual({ mode: 'plan' })
  expect(await restarted.storage.call('approval', f.approval.id)).toMatchObject({ status: 'cancelled' })
  expect(
    (await restarted.storage.call('events', f.session.id, 0)).filter((item) => item.type === 'plan_exit.resolved'),
  ).toHaveLength(0)
})

test.each(['mode', 'call', 'session'] as const)(
  'replay rejects a complete Plan exit record with inconsistent %s',
  async (mismatch) => {
    const f = await fixture()
    const nextSeq = (await f.kernel.storage.call('session', f.session.id)).seq + 1
    await removeProjection(f.resource)
    new SessionLogWriter(f.resource.layout.sessions).append(f.session.workspaceId, {
      eventId: crypto.randomUUID(),
      sessionId: f.session.id,
      seq: nextSeq,
      runId: f.run.id,
      stepId: null,
      type: 'plan_exit.resolved',
      time: Date.now(),
      version: 1,
      data: {
        approval: {
          ...f.approval,
          status: 'allowed',
          decidedBy: 'actor-1',
          ...(mismatch === 'session' ? { sessionId: 'another-session' } : {}),
        },
        mode: mismatch === 'mode' ? null : 'default',
        exitRunId: f.run.id,
        callId: mismatch === 'call' ? 'another-call' : f.approval.callId,
      },
    })
    const storage = new Storage(f.resource.layout.database, f.resource.layout)
    f.resource.storage = storage
    await expect(storage.call('ready')).rejects.toThrow('SESSION_LOG_CORRUPTED')
  },
)
