import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandError } from '@hbar/commands'
import { providerSchema, workflowStateSchema } from '@hbar/contracts'
import type { WorkflowPlanItemInput, WorkflowSnapshot } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { createRunCommands, createWorkflowCommands } from '@hbar/kernel/controller'
import type { PlanService, WorkflowService } from '@hbar/plugin-sdk'

const actorId = 'workflow-target-fixture-actor'
const resources: { root: string; kernel: Kernel }[] = []
type WorkflowTargetTransport = NonNullable<Parameters<typeof createWorkflowCommands>[1]>

afterEach(async () => {
  const failures: unknown[] = []
  for (const { root, kernel } of resources.splice(0)) {
    try {
      await kernel.close()
    } catch (error) {
      failures.push(error)
    } finally {
      try {
        await rm(root, { recursive: true, force: true })
      } catch (error) {
        failures.push(error)
      }
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Workflow target fixture cleanup failed')
})

async function fixture(targetCount: number) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-targets-'))
  await writeFile(join(root, '.gitignore'), 'data/\n', 'utf8')
  const initialized = Bun.spawn({ cmd: ['git', 'init', '--quiet'], cwd: root, stdout: 'ignore', stderr: 'pipe' })
  if ((await initialized.exited) !== 0) throw new Error(await new Response(initialized.stderr).text())
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    lifecycle: 'managed',
  })
  resources.push({ root, kernel })
  await kernel.createWorkspace(root)
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  const model = providerSchema.parse({
    id: 'workflow-target-fixture-model',
    name: 'Workflow target fixture',
    protocol: 'mock',
    model: 'fixture',
    baseUrl: 'http://127.0.0.1',
  })
  await kernel.storage.call('saveProvider', model)
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Workflow target workspace was not initialized')
  const source = await kernel.createSession(workspace.id, 'workflow source')
  const targets = await Promise.all(
    Array.from({ length: targetCount }, (_, index) => kernel.createSession(workspace.id, `target ${index + 1}`)),
  )
  const service = kernel.plugins.get<WorkflowService>('workflow')
  const runCommands = createRunCommands(kernel)
  const transport: WorkflowTargetTransport = {
    lookup: (input, options) => runCommands.getPeerMessageReceipt(input, options.actorId, options.idempotencyKey),
    send: (input, options) => runCommands.execute('session.message.send', input, options),
    cancel: (operationId, options) => runCommands.execute('operation.cancel', { operationId }, options),
    get: (operationId, options) => runCommands.execute('operation.get', { operationId }, options),
  }
  const commands = createWorkflowCommands(service, transport)
  return { root, kernel, source, targets, service, runCommands, transport, commands }
}

async function restartFixture(current: Awaited<ReturnType<typeof fixture>>, runRecovery = false) {
  await current.kernel.close()
  const resourceIndex = resources.findIndex((entry) => entry.kernel === current.kernel)
  if (resourceIndex >= 0) resources.splice(resourceIndex, 1)
  const kernel = await Kernel.create({
    home: join(current.root, 'data'),
    workspace: current.root,
    demo: true,
    secrets: new MemorySecrets(),
    ...(runRecovery ? {} : { lifecycle: 'managed' as const }),
  })
  resources.push({ root: current.root, kernel })
  const service = kernel.plugins.get<WorkflowService>('workflow')
  const runCommands = createRunCommands(kernel)
  const transport: WorkflowTargetTransport = {
    lookup: (input, options) => runCommands.getPeerMessageReceipt(input, options.actorId, options.idempotencyKey),
    send: (input, options) => runCommands.execute('session.message.send', input, options),
    cancel: (operationId, options) => runCommands.execute('operation.cancel', { operationId }, options),
    get: (operationId, options) => runCommands.execute('operation.get', { operationId }, options),
  }
  return {
    ...current,
    kernel,
    service,
    runCommands,
    transport,
    commands: createWorkflowCommands(service, transport),
  }
}

function item(id: string, targetSessionId: string): WorkflowPlanItemInput {
  return {
    id,
    title: `Inspect target ${id}`,
    scope: { readPaths: [], writePaths: [], tools: [] },
    acceptanceChecks: [{ id: 'review', description: 'A person reviews the result', verifier: { kind: 'user' } }],
    targetSessionIds: [targetSessionId],
  }
}

async function startPlan(
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  items: WorkflowPlanItemInput[],
): Promise<NonNullable<WorkflowSnapshot['workflowPlan']>> {
  const started = await fixtureValue.commands.execute(
    'workflow.start',
    { sessionId: fixtureValue.source.id, objective: 'Complete target work and return results', items },
    { actorId, idempotencyKey: 'workflow-start-fixture' },
  )
  if (!started.workflowPlan) throw new Error('Workflow start did not persist its canonical Plan')
  return started.workflowPlan
}

async function dispatch(
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  plan: NonNullable<WorkflowSnapshot['workflowPlan']>,
  itemIds: string[],
  idempotencyKey = 'workflow-dispatch-fixture',
) {
  return fixtureValue.commands.execute(
    'workflow.targets.dispatch',
    {
      sessionId: fixtureValue.source.id,
      planId: plan.planId,
      planRevision: plan.revision,
      itemIds,
      modelId: 'workflow-target-fixture-model',
    },
    { actorId, idempotencyKey },
  )
}

async function expectRejected(promise: Promise<unknown>, expected: Record<string, unknown>) {
  // Keep Worker-backed failures on a plain await path; Bun's async matcher can stall follow-up Worker IPC here.
  // See https://github.com/oven-sh/bun/issues/37189.
  let failure: unknown
  try {
    await promise
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject(expected)
}

async function reconcile(
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  plan: NonNullable<WorkflowSnapshot['workflowPlan']>,
  dispatchIds: string[],
) {
  return fixtureValue.commands.execute(
    'workflow.targets.reconcile',
    { sessionId: fixtureValue.source.id, planId: plan.planId, planRevision: plan.revision, dispatchIds },
    { actorId, idempotencyKey: crypto.randomUUID() },
  )
}

async function queuedRunIds(kernel: Kernel, sessionId: string) {
  const events = await kernel.storage.call('events', sessionId, 0, 10_000)
  return events.flatMap((event) => (event.type === 'run.queued' && event.runId ? [event.runId] : []))
}

async function storedWorkflow(kernel: Kernel, sessionId: string) {
  const events = await kernel.storage.call('events', sessionId, 0, 10_000)
  const event = events.findLast(
    (candidate) =>
      ['workflow.started', 'workflow.updated', 'workflow.migrated.v2', 'workflow.focus.set'].includes(candidate.type) &&
      candidate.data &&
      typeof candidate.data === 'object' &&
      'workflow' in candidate.data,
  )
  if (!event?.data || typeof event.data !== 'object' || !('workflow' in event.data))
    throw new Error('The persisted Workflow state event is missing')
  return workflowStateSchema.parse(event.data.workflow)
}

async function assistantText(kernel: Kernel, sessionId: string, runId: string) {
  const context = await kernel.storage.call('context', sessionId)
  return context.messages
    .filter((message) => message.runId === runId && message.role === 'assistant')
    .flatMap((message) => message.content.filter((block) => block.type === 'text').map((block) => block.text))
    .filter(Boolean)
    .join('\n')
    .trim()
    .slice(-2_000)
}

test('one Workflow Plan dispatches to two targets and completed ACK loss reconciles the same Run and final reply', async () => {
  const current = await fixture(2)
  const [first, second] = current.targets
  if (!first || !second) throw new Error('Two target sessions were not created')
  const plan = await startPlan(current, [item('first-item', first.id), item('second-item', second.id)])
  const originalSend = current.transport.send
  let lostFirstAcknowledgement = false
  const commands = createWorkflowCommands(current.service, {
    ...current.transport,
    async send(input, options) {
      const receipt = await originalSend(input, options)
      if (input.targetSessionId === first.id && !lostFirstAcknowledgement) {
        lostFirstAcknowledgement = true
        throw new CommandError('RESULT_UNKNOWN', 'Fixture lost the acknowledgement after canonical admission')
      }
      return receipt
    },
  })
  const dispatched = await commands.execute(
    'workflow.targets.dispatch',
    {
      sessionId: current.source.id,
      planId: plan.planId,
      planRevision: plan.revision,
      itemIds: ['first-item', 'second-item'],
      modelId: 'workflow-target-fixture-model',
    },
    { actorId, idempotencyKey: 'workflow-dispatch-ack-loss' },
  )
  const firstDispatch = dispatched.targetDispatches.find((entry) => entry.itemId === 'first-item')
  const secondDispatch = dispatched.targetDispatches.find((entry) => entry.itemId === 'second-item')
  if (!firstDispatch || !secondDispatch) throw new Error('The same Plan did not create both target dispatches')
  expect(firstDispatch.status).toBe('result_unknown')
  expect(secondDispatch.status).toBe('running')
  expect(firstDispatch).not.toHaveProperty('messageText')
  expect(firstDispatch).not.toHaveProperty('peerIdempotencyKey')
  expect(firstDispatch).not.toHaveProperty('targetRunStartSeq')

  await current.kernel.activate()
  await current.kernel.waitForIdle()
  const firstRunIds = await queuedRunIds(current.kernel, first.id)
  const secondRunIds = await queuedRunIds(current.kernel, second.id)
  expect(firstRunIds).toHaveLength(1)
  expect(secondRunIds).toHaveLength(1)
  const firstRunId = firstRunIds[0]
  if (!firstRunId) throw new Error('The canonical queued event has no Run ID')
  const firstAssistant = await assistantText(current.kernel, first.id, firstRunId)
  expect(firstAssistant.length).toBeGreaterThan(0)
  const recovered = await reconcile(current, plan, [firstDispatch.dispatchId, secondDispatch.dispatchId])
  const recoveredFirst = recovered.targetDispatches.find((entry) => entry.dispatchId === firstDispatch.dispatchId)
  const recoveredSecond = recovered.targetDispatches.find((entry) => entry.dispatchId === secondDispatch.dispatchId)
  expect(recoveredFirst).toMatchObject({
    status: 'succeeded',
    operationId: firstRunId,
    targetRunId: firstRunId,
    resultSummary: firstAssistant,
  })
  expect(recoveredSecond?.status).toBe('succeeded')
  expect(await queuedRunIds(current.kernel, first.id)).toEqual(firstRunIds)
  expect(await queuedRunIds(current.kernel, second.id)).toEqual(secondRunIds)
  expect(
    (await reconcile(current, plan, [firstDispatch.dispatchId, secondDispatch.dispatchId])).targetDispatches,
  ).toHaveLength(2)
  expect(await queuedRunIds(current.kernel, first.id)).toEqual(firstRunIds)
  expect(await queuedRunIds(current.kernel, second.id)).toEqual(secondRunIds)
})

test('one known target admission failure does not settle another target WorkItem', async () => {
  const current = await fixture(2)
  const [rejectedTarget, acceptedTarget] = current.targets
  if (!rejectedTarget || !acceptedTarget) throw new Error('Two target sessions were not created')
  const plan = await startPlan(current, [
    item('rejected-item', rejectedTarget.id),
    item('accepted-item', acceptedTarget.id),
  ])
  const commands = createWorkflowCommands(current.service, {
    ...current.transport,
    send(input, options) {
      if (input.targetSessionId === rejectedTarget.id)
        throw new CommandError('ARCHIVED', 'Fixture confirms this target rejected admission')
      return current.transport.send(input, options)
    },
  })
  const dispatched = await commands.execute(
    'workflow.targets.dispatch',
    {
      sessionId: current.source.id,
      planId: plan.planId,
      planRevision: plan.revision,
      itemIds: ['rejected-item', 'accepted-item'],
      modelId: 'workflow-target-fixture-model',
    },
    { actorId, idempotencyKey: 'workflow-dispatch-partial-failure' },
  )
  const rejected = dispatched.targetDispatches.find((entry) => entry.itemId === 'rejected-item')
  const accepted = dispatched.targetDispatches.find((entry) => entry.itemId === 'accepted-item')
  if (!rejected || !accepted) throw new Error('Both target outcomes were not recorded')
  expect(rejected.status).toBe('failed')
  expect(accepted.status).toBe('running')

  await current.kernel.activate()
  await current.kernel.waitForIdle()
  const settled = await reconcile(current, plan, [rejected.dispatchId, accepted.dispatchId])
  expect(settled.targetDispatches.find((entry) => entry.dispatchId === rejected.dispatchId)?.status).toBe('failed')
  expect(settled.targetDispatches.find((entry) => entry.dispatchId === accepted.dispatchId)?.status).toBe('succeeded')
  expect(settled.workflow?.status).not.toBe('completed')
  expect(await queuedRunIds(current.kernel, rejectedTarget.id)).toHaveLength(0)
  expect(await queuedRunIds(current.kernel, acceptedTarget.id)).toHaveLength(1)
})

test('a dependent target waits for canonical WorkItem completion and is admitted exactly once', async () => {
  let current = await fixture(2)
  const [firstTarget, secondTarget] = current.targets
  if (!firstTarget || !secondTarget) throw new Error('Two target sessions were not created')
  const items = [
    item('first-item', firstTarget.id),
    { ...item('second-item', secondTarget.id), dependsOnItemIds: ['first-item'] },
  ]
  const draft = await current.commands.execute(
    'workflow.plan.save',
    {
      sessionId: current.source.id,
      objective: 'Complete target work and return results',
      items,
      expectedRevision: null,
    },
    { actorId, idempotencyKey: 'workflow-dependency-plan-save-1' },
  )
  const revisedDraft = await current.commands.execute(
    'workflow.plan.save',
    {
      sessionId: current.source.id,
      objective: 'Complete target work and return results',
      items,
      expectedRevision: draft.workflowPlan!.revision,
    },
    { actorId, idempotencyKey: 'workflow-dependency-plan-save-2' },
  )
  const plan = await startPlan(current, items)
  expect(plan.planId).toBe(revisedDraft.workflowPlan!.planId)
  expect(plan.revision).toBeGreaterThan(revisedDraft.workflowPlan!.revision)
  current = await restartFixture(current)
  const replayed = await current.service.get(current.source.id)
  const persistedWorkflow = await storedWorkflow(current.kernel, current.source.id)
  expect(replayed.workflowPlan?.items[1]?.dependsOnItemIds).toEqual(['first-item'])
  expect(replayed.workflow).not.toHaveProperty('canonicalPlanRevision')
  expect(persistedWorkflow.workItems.find((entry) => entry.id === 'second-item')).not.toHaveProperty('dependsOnItemIds')

  await expectRejected(dispatch(current, plan, ['first-item', 'second-item'], 'dependency-batch-atomicity'), {
    code: 'WORKFLOW_DEPENDENCY_PENDING',
  })
  expect(await queuedRunIds(current.kernel, firstTarget.id)).toHaveLength(0)
  expect(await queuedRunIds(current.kernel, secondTarget.id)).toHaveLength(0)

  await expectRejected(dispatch(current, plan, ['second-item'], 'dependent-dispatch-early'), {
    code: 'WORKFLOW_DEPENDENCY_PENDING',
  })
  expect(await queuedRunIds(current.kernel, secondTarget.id)).toHaveLength(0)

  const first = await dispatch(current, plan, ['first-item'], 'first-item-dispatch')
  const firstDispatch = first.targetDispatches.find((entry) => entry.itemId === 'first-item')
  if (!firstDispatch) throw new Error('The prerequisite target was not dispatched')
  await current.kernel.activate()
  await current.kernel.waitForIdle()
  expect((await current.kernel.storage.call('run', firstDispatch.targetRunId!)).status).toBe('completed')
  await reconcile(current, plan, [firstDispatch.dispatchId])

  // A successful target Run is not itself a completed Plan WorkItem.
  await expectRejected(dispatch(current, plan, ['second-item'], 'dependent-dispatch-before-checkpoint'), {
    code: 'WORKFLOW_DEPENDENCY_PENDING',
  })
  expect(await queuedRunIds(current.kernel, secondTarget.id)).toHaveLength(0)

  const waiting = await current.service.checkpoint(
    current.source.id,
    'first-item',
    'complete',
    'The prerequisite Run succeeded and is ready for review.',
    null,
    (await current.service.get(current.source.id)).workflow!.revision,
  )
  expect(waiting.workflow?.status).toBe('waiting_user')
  const accepted = await current.service.acceptCheck(
    current.source.id,
    'first-item',
    'review',
    'accepted',
    null,
    waiting.workflow!.revision,
    actorId,
  )
  const completed = await current.service.checkpoint(
    current.source.id,
    'first-item',
    'complete',
    'The prerequisite WorkItem passed its normal review checkpoint.',
    null,
    accepted.workflow!.revision,
  )
  const completedInternal = await storedWorkflow(current.kernel, current.source.id)
  const firstCompletedAt = completedInternal.workItems.find((entry) => entry.id === 'first-item')?.completedAt
  const completedFirstItem = completedInternal.workItems.find((entry) => entry.id === 'first-item')
  expect(completedFirstItem?.status).toBe('completed')
  expect(typeof firstCompletedAt).toBe('number')
  if (typeof firstCompletedAt !== 'number') throw new Error('The prerequisite WorkItem has no completion time')
  expect(completed.workflow).not.toHaveProperty('workItems')
  expect(completed.workflow?.focus).toBeNull()
  expect(completedInternal.workItems.find((entry) => entry.id === 'second-item')?.status).toBe('pending')
  expect((await current.kernel.plugins.get<PlanService>('plan').get(current.source.id))?.plan).toMatchObject([
    { status: 'completed' },
    { status: 'in_progress' },
  ])

  const advancedPlan = (await current.service.get(current.source.id)).workflowPlan
  if (!advancedPlan) throw new Error('The canonical Plan disappeared after prerequisite checkpoint')
  const successor = advancedPlan.items.find((entry) => entry.id === 'second-item')
  if (!successor) throw new Error('The ready successor disappeared from the canonical Plan')
  const { dependsOnItemIds: _dependencies, ...successorFocusItem } = successor
  const agentPlan = await current.kernel.plugins.get<PlanService>('plan').get(current.source.id)
  if (!agentPlan) throw new Error('The ready successor has no authoritative Agent Plan')
  const focused = await current.commands.execute(
    'workflow.focus.set',
    {
      sessionId: current.source.id,
      stepIndex: 1,
      item: successorFocusItem,
      completionPolicy: 'user',
      expectedPlanRevision: agentPlan.revision,
    },
    { actorId, idempotencyKey: 'focus-ready-dependent-successor' },
  )
  expect(focused.workflow?.focus?.focusId).toBe('second-item')
  expect(focused.workflowPlan?.items.map((entry) => entry.id)).toEqual(['first-item', 'second-item'])
  expect(focused.workflowPlan?.items[1]?.dependsOnItemIds).toEqual(['first-item'])
  expect(focused.workflowPlan?.items[1]?.targetSessionIds).toEqual([secondTarget.id])
  expect(focused.targetDispatches.find((entry) => entry.itemId === 'first-item')?.status).toBe('succeeded')
  const focusedInternal = await storedWorkflow(current.kernel, current.source.id)
  expect(focusedInternal.workItems.find((entry) => entry.id === 'first-item')).toMatchObject({
    status: 'completed',
    completedAt: firstCompletedAt,
  })
  expect(focused.workflow).not.toHaveProperty('workItems')
  const second = await dispatch(current, advancedPlan, ['second-item'], 'dependent-dispatch-after-checkpoint')
  expect(second.targetDispatches.find((entry) => entry.itemId === 'second-item')?.status).toBe('running')
  await current.kernel.activate()
  await current.kernel.waitForIdle()
  const secondRunIds = await queuedRunIds(current.kernel, secondTarget.id)
  expect(secondRunIds).toHaveLength(1)
  const replayedSecond = await dispatch(current, advancedPlan, ['second-item'], 'dependent-dispatch-after-checkpoint')
  expect(replayedSecond.targetDispatches.find((entry) => entry.itemId === 'second-item')?.targetRunId).toBe(
    secondRunIds[0],
  )
  expect(await queuedRunIds(current.kernel, secondTarget.id)).toEqual(secondRunIds)

  const settled = await reconcile(current, advancedPlan, [
    second.targetDispatches.find((entry) => entry.itemId === 'second-item')!.dispatchId,
  ])
  expect(settled.targetDispatches.find((entry) => entry.itemId === 'first-item')?.status).toBe('succeeded')
  expect(settled.targetDispatches.find((entry) => entry.itemId === 'second-item')?.status).toBe('succeeded')
  expect(settled.workflow?.status).not.toBe('completed')
  const secondWaiting = await current.service.checkpoint(
    current.source.id,
    'second-item',
    'complete',
    'The dependent target Run succeeded and is ready for review.',
    null,
    (await current.service.get(current.source.id)).workflow!.revision,
  )
  expect(secondWaiting.workflow?.status).toBe('waiting_user')
  const secondAccepted = await current.service.acceptCheck(
    current.source.id,
    'second-item',
    'review',
    'accepted',
    null,
    secondWaiting.workflow!.revision,
    actorId,
  )
  const allCompleted = await current.service.checkpoint(
    current.source.id,
    'second-item',
    'complete',
    'The dependent WorkItem passed its normal review checkpoint.',
    null,
    secondAccepted.workflow!.revision,
  )
  expect(allCompleted.workflow?.status).toBe('completed')
  const allCompletedInternal = await storedWorkflow(current.kernel, current.source.id)
  const allCompletedFirstItem = allCompletedInternal.workItems.find((entry) => entry.id === 'first-item')
  const allCompletedSecondItem = allCompletedInternal.workItems.find((entry) => entry.id === 'second-item')
  expect(allCompletedFirstItem?.status).toBe('completed')
  expect(allCompletedFirstItem?.completedAt).toBe(firstCompletedAt)
  expect(allCompletedSecondItem?.status).toBe('completed')
  expect(typeof allCompletedSecondItem?.completedAt).toBe('number')
  expect(allCompleted.targetDispatches.find((entry) => entry.itemId === 'first-item')?.status).toBe('succeeded')
  expect(allCompleted.targetDispatches.find((entry) => entry.itemId === 'second-item')?.status).toBe('succeeded')
})

test('replay marks an old checkpoint intent stale instead of completing a replaced canonical Plan', async () => {
  let current = await fixture(1)
  const target = current.targets[0]
  if (!target) throw new Error('The target session was not created')
  const plan = await startPlan(current, [
    item('recovery-first', target.id),
    { ...item('recovery-second', target.id), dependsOnItemIds: ['recovery-first'] },
  ])
  const snapshot = await current.service.get(current.source.id)
  const focus = snapshot.workflow?.focus
  if (!focus) throw new Error('The active first item has no public focus binding')
  const events = await current.kernel.storage.call('events', current.source.id, 0, 10_000)
  const started = events.findLast((event) => event.type === 'workflow.started')
  if (!started || !started.data || typeof started.data !== 'object' || !('workflow' in started.data))
    throw new Error('The canonical Workflow start event is missing')
  const initialWorkflow = (started.data as { workflow: Record<string, unknown> }).workflow
  await current.kernel.storage.call('append', current.source.id, 'workflow.updated', {
    workflow: {
      ...initialWorkflow,
      revision: Number(initialWorkflow.revision) + 1,
      transitionIntent: {
        operationId: 'replaced-plan-transition',
        planRevision: focus.planRevision,
        stepIndex: focus.stepIndex,
        stepTextHash: focus.stepTextHash,
        itemId: 'recovery-first',
        summary: 'An interrupted checkpoint from the old Plan',
        createdAt: Date.now(),
      },
      updatedAt: Date.now(),
    },
  })
  await current.kernel.storage.call('append', current.source.id, 'workflow.plan.saved', {
    plan: { ...plan, revision: plan.revision + 1, objective: 'Replacement Plan revision' },
  })

  current = await restartFixture(current, true)
  const recovered = await current.service.get(current.source.id)
  expect(recovered.workflow?.status).toBe('needs_revision')
  expect(recovered.workflow?.focus?.focusId).toBe('recovery-first')
  expect((await current.kernel.plugins.get<PlanService>('plan').get(current.source.id))?.plan[0]?.status).toBe(
    'in_progress',
  )
  const recoveredEvents = await current.kernel.storage.call('events', current.source.id, 0, 10_000)
  const staleRecovery = recoveredEvents.findLast(
    (event) =>
      event.type === 'workflow.updated' &&
      event.data &&
      typeof event.data === 'object' &&
      'transition' in event.data &&
      (event.data as { transition?: { operationId?: string; status?: string } }).transition?.operationId ===
        'replaced-plan-transition',
  )
  expect(staleRecovery?.data).toMatchObject({ transition: { status: 'stale' } })
  expect(await queuedRunIds(current.kernel, target.id)).toHaveLength(0)
})

test('replacement stales and cancels the old target without redispatch on repeated reconciliation', async () => {
  const current = await fixture(2)
  const [target, dependentTarget] = current.targets
  if (!target || !dependentTarget) throw new Error('Target sessions were not created')
  const plan = await startPlan(current, [
    item('replace-item', target.id),
    { ...item('replacement-dependent', dependentTarget.id), dependsOnItemIds: ['replace-item'] },
  ])
  const dispatched = await dispatch(current, plan, ['replace-item'])
  const oldDispatch = dispatched.targetDispatches[0]
  if (!oldDispatch?.operationId) throw new Error('Target dispatch did not persist its accepted Run')
  const agentPlan = await current.kernel.plugins.get<PlanService>('plan').get(current.source.id)
  if (!agentPlan) throw new Error('The target Workflow has no authoritative Agent Plan to replace')
  await current.kernel.plugins
    .get<PlanService>('plan')
    .update(
      current.source.id,
      [{ step: 'Replacement Agent Plan', status: 'in_progress' }],
      'Test explicit Plan replacement while a target Run is pending',
      null,
      agentPlan.revision,
    )
  expect((await current.service.get(current.source.id)).workflow?.status).toBe('needs_revision')
  const stale = await reconcile(current, plan, [oldDispatch.dispatchId])
  expect(stale.targetDispatches[0]).toMatchObject({ dispatchId: oldDispatch.dispatchId, status: 'stale' })
  expect((await current.kernel.storage.call('run', oldDispatch.operationId)).status).toBe('cancelled')
  expect(await queuedRunIds(current.kernel, target.id)).toHaveLength(1)
  await expectRejected(dispatch(current, plan, ['replacement-dependent'], 'dependent-after-replacement'), {
    code: 'WORKFLOW_NOT_ACTIVE',
  })
  expect(await queuedRunIds(current.kernel, dependentTarget.id)).toHaveLength(0)

  const eventsBeforeRetry = await current.kernel.storage.call('events', current.source.id, 0, 10_000)
  const workflowRevisionBeforeRetry = stale.workflow?.revision
  const staleAgain = await reconcile(current, plan, [oldDispatch.dispatchId])
  expect(staleAgain.targetDispatches[0]).toMatchObject({ dispatchId: oldDispatch.dispatchId, status: 'stale' })
  expect(staleAgain.workflow?.revision).toBe(workflowRevisionBeforeRetry)
  const eventsAfterRetry = await current.kernel.storage.call('events', current.source.id, 0, 10_000)
  expect(eventsAfterRetry.filter((event) => event.type === 'workflow.updated')).toHaveLength(
    eventsBeforeRetry.filter((event) => event.type === 'workflow.updated').length,
  )
  expect(await queuedRunIds(current.kernel, target.id)).toHaveLength(1)
})

test('explicit target cancellation leaves a terminal dispatch and reconcile does not create another Run', async () => {
  const current = await fixture(2)
  const [target, dependentTarget] = current.targets
  if (!target || !dependentTarget) throw new Error('Target sessions were not created')
  const plan = await startPlan(current, [
    item('cancel-item', target.id),
    { ...item('cancel-dependent', dependentTarget.id), dependsOnItemIds: ['cancel-item'] },
  ])
  const dispatched = await dispatch(current, plan, ['cancel-item'])
  const entry = dispatched.targetDispatches[0]
  if (!entry?.operationId) throw new Error('Target dispatch did not persist its accepted Run')
  const cancelled = await current.commands.execute(
    'workflow.targets.cancel',
    {
      sessionId: current.source.id,
      planId: plan.planId,
      planRevision: plan.revision,
      dispatchId: entry.dispatchId,
    },
    { actorId, idempotencyKey: 'workflow-cancel-target' },
  )
  expect(
    cancelled.targetDispatches.find((dispatchEntry) => dispatchEntry.dispatchId === entry.dispatchId)?.status,
  ).toBe('cancelled')
  expect((await current.kernel.storage.call('run', entry.operationId)).status).toBe('cancelled')
  expect(await queuedRunIds(current.kernel, target.id)).toHaveLength(1)
  await expectRejected(dispatch(current, plan, ['cancel-dependent'], 'dependent-after-cancel'), {
    code: 'WORKFLOW_DEPENDENCY_PENDING',
  })
  expect(await queuedRunIds(current.kernel, dependentTarget.id)).toHaveLength(0)

  const reconciled = await reconcile(current, plan, [entry.dispatchId])
  expect(
    reconciled.targetDispatches.find((dispatchEntry) => dispatchEntry.dispatchId === entry.dispatchId)?.status,
  ).toBe('cancelled')
  expect(await queuedRunIds(current.kernel, target.id)).toHaveLength(1)
})

test('edited queued target text is cancelled and marked stale without redispatch', async () => {
  const current = await fixture(1)
  const target = current.targets[0]
  if (!target) throw new Error('Target session was not created')
  const plan = await startPlan(current, [item('edited-item', target.id)])
  const dispatched = await dispatch(current, plan, ['edited-item'])
  const entry = dispatched.targetDispatches[0]
  if (!entry?.operationId) throw new Error('Target dispatch did not persist its accepted Run')
  expect((await current.kernel.storage.call('run', entry.operationId)).status).toBe('queued')
  const editable = await current.runCommands.execute('queuedRun.getEditable', {
    sessionId: target.id,
    operationId: entry.operationId,
  })
  await current.runCommands.execute(
    'queuedRun.editText',
    {
      sessionId: target.id,
      operationId: entry.operationId,
      expectedRevision: editable.revision,
      text: 'A user-edited target request must not be overwritten by reconciliation',
    },
    { actorId, idempotencyKey: 'workflow-target-user-edit' },
  )

  const stale = await reconcile(current, plan, [entry.dispatchId])
  expect(stale.targetDispatches.find((dispatchEntry) => dispatchEntry.dispatchId === entry.dispatchId)).toMatchObject({
    status: 'stale',
    errorCode: 'TARGET_RUN_INPUT_CHANGED',
  })
  expect((await current.kernel.storage.call('run', entry.operationId)).status).toBe('cancelled')
  expect((await current.kernel.storage.call('run', entry.operationId)).input.text).toBe(
    'A user-edited target request must not be overwritten by reconciliation',
  )
  expect(await queuedRunIds(current.kernel, target.id)).toHaveLength(1)

  await reconcile(current, plan, [entry.dispatchId])
  expect(await queuedRunIds(current.kernel, target.id)).toHaveLength(1)
})
