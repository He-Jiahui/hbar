import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { AgentService, GoalService, ModelRequest, PlanService, WorkflowService } from '@hbar/plugin-sdk'
import { WorkflowRuntime } from '../plugins/workflow/src/index.ts'

const resources: { root: string; kernel: Kernel }[] = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-v2-'))
  await writeFile(join(root, '.gitignore'), 'data/\n', 'utf8')
  const initialized = Bun.spawn({ cmd: ['git', 'init', '--quiet'], cwd: root, stdout: 'ignore', stderr: 'pipe' })
  if ((await initialized.exited) !== 0) throw new Error(await new Response(initialized.stderr).text())
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return {
    root,
    kernel,
    session,
    goals: kernel.plugins.get<GoalService>('goal'),
    agents: kernel.plugins.get<AgentService>('agent'),
    plans: kernel.plugins.get<PlanService>('plan'),
    workflows: kernel.plugins.get<WorkflowService>('workflow'),
  }
}

async function rejection(operation: Promise<unknown>) {
  try {
    await operation
    throw new Error('Expected rejection')
  } catch (error) {
    return error
  }
}

test('workflow bootstrap guidance uses the Codex Agent Plan and focus tools', async () => {
  const { kernel, session, workflows } = await fixture()
  const model = (await kernel.storage.call('providers'))[0]!
  const request = {
    system: 'base instructions',
    messages: [],
    model,
    context: { sessionId: session.id },
  } satisfies ModelRequest

  const decorated = (workflows as WorkflowRuntime).decorate(request)

  expect(decorated.system).toContain('get_plan and update_plan')
  expect(decorated.system).toContain('workflow_focus')
  expect(decorated.system).not.toContain('workflow_start')
  expect(decorated.system).not.toContain('save_workflow_plan')
})

test('workflow focus normalizes registered tool aliases and escapes repeated scope denial', async () => {
  const { root, kernel, session, plans, workflows } = await fixture()
  await writeFile(join(root, 'outside.txt'), 'outside', 'utf8')
  const plan = await plans.update(session.id, [{ step: 'Inspect the bounded file', status: 'in_progress' }])

  expect(
    await rejection(
      workflows.focus(
        session.id,
        0,
        {
          id: 'inspect',
          title: 'ignored in favor of Agent Plan',
          scope: { readPaths: ['allowed'], writePaths: [], tools: ['unknown_tool'] },
          acceptanceChecks: [],
        },
        'agent',
        plan.revision,
      ),
    ),
  ).toMatchObject({ code: 'WORKFLOW_TOOL_UNKNOWN' })

  expect(
    await rejection(
      workflows.focus(
        session.id,
        0,
        {
          id: 'inspect',
          title: 'ignored in favor of Agent Plan',
          scope: { readPaths: ['allowed'], writePaths: ['allowed'], tools: ['functions.shell'] },
          acceptanceChecks: [],
        },
        'agent',
        plan.revision,
      ),
    ),
  ).toMatchObject({ code: 'WORKFLOW_SCOPE_REQUIRED' })

  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'inspect',
      title: 'ignored in favor of Agent Plan',
      scope: { readPaths: ['allowed'], writePaths: [], tools: ['functions.read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )
  expect(focused.workflow).toMatchObject({
    status: 'active',
    planRevision: plan.revision,
    focus: {
      stepIndex: 0,
      title: 'Inspect the bounded file',
      scope: { tools: ['read_file'] },
    },
  })
  expect(
    await rejection(
      workflows.expandScope(
        session.id,
        'inspect',
        { readPaths: ['allowed'], writePaths: [], tools: ['read_file'] },
        'No semantic change',
        focused.workflow!.revision,
      ),
    ),
  ).toMatchObject({ code: 'WORKFLOW_SCOPE_NOOP' })

  for (let attempt = 0; attempt < 3; attempt++) {
    await kernel.submit(
      session.id,
      `outside-${attempt}`,
      { text: '/tool read_file {"path":"outside.txt"}', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
  }
  expect((await workflows.get(session.id)).workflow).toMatchObject({
    status: 'needs_revision',
    rejection: { toolName: 'read_file', path: 'outside.txt', count: 3 },
  })
  const revisedPlan = await plans.update(
    session.id,
    [{ step: 'Inspect the corrected bounded file', status: 'in_progress' }],
    'Self-revise after repeated denial',
    null,
    plan.revision,
  )
  const recovered = await workflows.focus(
    session.id,
    0,
    {
      id: 'inspect-corrected',
      title: 'ignored',
      scope: { readPaths: ['outside.txt'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    revisedPlan.revision,
  )
  expect(recovered.workflow).toMatchObject({
    status: 'active',
    planRevision: revisedPlan.revision,
    rejection: null,
  })
})

test('control queries preserve rejection and the returned workflow revision remains usable for recovery', async () => {
  const { root, kernel, session, goals, plans, workflows } = await fixture()
  await writeFile(join(root, 'proof.txt'), 'verified proof', 'utf8')
  await goals.create(session.id, 'Inspect the proof')
  const plan = await plans.update(session.id, [{ step: 'Inspect the proof', status: 'in_progress' }])
  await workflows.focus(
    session.id,
    0,
    {
      id: 'proof',
      title: 'Inspect the proof',
      scope: { readPaths: ['elsewhere'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )
  await kernel.submit(
    session.id,
    'denied-read',
    { text: '/tool read_file {"path":"proof.txt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const denied = (await workflows.get(session.id)).workflow!
  expect(denied.rejection?.count).toBe(1)
  for (const name of ['get_workflow', 'get_goal', 'get_plan']) {
    await kernel.submit(session.id, `inspect-${name}`, { text: `/tool ${name} {}`, images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    const after = (await workflows.get(session.id)).workflow!
    expect(after.revision).toBe(denied.revision)
    expect(after.rejection).toEqual(denied.rejection)
  }
  await kernel.submit(
    session.id,
    'repair-scope',
    {
      text: `/tool workflow_update ${JSON.stringify({ action: 'expand_scope', itemId: 'proof', expectedRevision: denied.revision, reason: 'Align the scope with the authorized task', scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] } })}`,
      images: [],
    },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await workflows.get(session.id)).workflow?.rejection).toBeNull()
  expect((await workflows.get(session.id)).workflow?.focus?.scope.readPaths).toContain('proof.txt')
  const results = (await kernel.snapshot(session.id)).messages.flatMap((message) => message.content)
  expect(
    results.some((block) => block.type === 'tool_result' && block.name === 'workflow_update' && !block.isError),
  ).toBe(true)
})

test('scope denial supplies the committed recovery identity without another model inspection turn', async () => {
  const { root, kernel, session, plans, workflows } = await fixture()
  await writeFile(join(root, 'proof.txt'), 'verified proof', 'utf8')
  const plan = await plans.update(session.id, [{ step: 'Inspect the proof', status: 'in_progress' }])
  await workflows.focus(
    session.id,
    0,
    {
      id: 'proof',
      title: 'Inspect the proof',
      scope: { readPaths: ['elsewhere'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )
  const deniedRun = await kernel.submit(
    session.id,
    'denied-hint',
    { text: '/tool read_file {"path":"proof.txt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const result = (await kernel.snapshot(session.id)).messages
    .filter((message) => message.runId === deniedRun.id)
    .flatMap((message) => message.content)
    .find((block) => block.type === 'tool_result' && block.isError)
  if (result?.type !== 'tool_result') throw new Error('Expected scope denial result')
  expect(result.text).toContain('does not grant new user permission')
  const hint = /itemId=("[^"]+"), expectedRevision=(\d+)/.exec(result.text)
  if (!hint?.[1] || !hint[2]) throw new Error('Expected usable committed scope recovery hint')
  const itemId = z.string().parse(JSON.parse(hint[1]))
  await kernel.submit(
    session.id,
    'use-denial-hint',
    {
      text: `/tool workflow_update ${JSON.stringify({ action: 'expand_scope', itemId, expectedRevision: Number(hint[2]), reason: 'Correct the scope of the already authorized proof', scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] } })}`,
      images: [],
    },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await workflows.get(session.id)).workflow).toMatchObject({ status: 'active', rejection: null })
  await kernel.submit(
    session.id,
    'verified-read',
    { text: '/tool read_file {"path":"proof.txt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const results = (await kernel.snapshot(session.id)).messages.flatMap((message) => message.content)
  expect(
    results.some((block) => block.type === 'tool_result' && !block.isError && block.text.includes('verified proof')),
  ).toBe(true)
  expect(results.some((block) => block.type === 'tool_result' && block.name === 'get_workflow')).toBe(false)
})

test('blocked checkpoints request autonomous revision instead of exposing a legacy blocked workflow state', async () => {
  const { session, plans, workflows } = await fixture()
  const plan = await plans.update(session.id, [{ step: 'Recover the bounded task', status: 'in_progress' }])
  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'recover',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )

  const blocked = await workflows.checkpoint(
    session.id,
    'recover',
    'blocked',
    'The focus must be revised before work can continue',
    null,
    focused.workflow!.revision,
  )

  expect(blocked.workflow).toMatchObject({
    status: 'needs_revision',
    focus: { focusId: 'recover', status: 'blocked' },
  })
})

test('workflow checkpoint advances the authoritative Agent Plan without completing the Goal', async () => {
  const { session, goals, plans, workflows } = await fixture()
  await goals.create(session.id, 'Complete both Agent Plan steps')
  const plan = await plans.update(session.id, [
    { step: 'Implement the change', status: 'in_progress' },
    { step: 'Verify the change', status: 'pending' },
  ])
  const first = await workflows.focus(
    session.id,
    0,
    {
      id: 'implement',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )
  const advanced = await workflows.checkpoint(
    session.id,
    'implement',
    'complete',
    'Implementation is complete',
    null,
    first.workflow!.revision,
  )
  expect(await plans.get(session.id)).toMatchObject({
    revision: plan.revision + 1,
    plan: [
      { step: 'Implement the change', status: 'completed' },
      { step: 'Verify the change', status: 'in_progress' },
    ],
  })
  expect(advanced.workflow).toMatchObject({ status: 'active', focus: null })

  const secondPlan = (await plans.get(session.id))!
  const second = await workflows.focus(
    session.id,
    1,
    {
      id: 'verify',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    secondPlan.revision,
  )
  const completed = await workflows.checkpoint(
    session.id,
    'verify',
    'complete',
    'Verification is complete',
    null,
    second.workflow!.revision,
  )
  expect(completed.workflow?.status).toBe('completed')
  expect((await plans.get(session.id))?.plan.every((step) => step.status === 'completed')).toBeTrue()
  expect((await goals.get(session.id)).goal?.status).toBe('active')
})

test('typed tool predicates and the default Agent conclusion create durable evidence', async () => {
  const { kernel, session, plans, workflows } = await fixture()
  const dispose = kernel.tools.register({
    name: 'structured_check',
    description: 'Return deterministic structured verification data.',
    inputSchema: z.strictObject({ target: z.string() }),
    effect: 'read',
    workspaceAccess: { kind: 'none' },
    execute: async () => ({ text: 'verification complete', details: { ok: true, nested: { count: 2 } } }),
  })
  const plan = await plans.update(session.id, [{ step: 'Verify structured results', status: 'in_progress' }])
  await workflows.focus(
    session.id,
    0,
    {
      id: 'typed-checks',
      title: 'ignored',
      scope: { readPaths: [], writePaths: [], tools: ['structured_check'] },
      acceptanceChecks: [
        {
          id: 'success',
          description: 'The tool succeeds',
          verifier: { kind: 'tool', toolName: 'structured_check', result: { kind: 'success' } },
        },
        {
          id: 'text',
          description: 'The text contains the expected marker',
          verifier: {
            kind: 'tool',
            toolName: 'structured_check',
            result: { kind: 'textContains', value: 'complete' },
          },
        },
        {
          id: 'json',
          description: 'The JSON result has the expected count',
          verifier: {
            kind: 'tool',
            toolName: 'structured_check',
            result: { kind: 'jsonPathEquals', path: ['nested', 'count'], value: 2 },
          },
        },
        {
          id: 'boolean',
          description: 'The JSON result reports success',
          verifier: {
            kind: 'tool',
            toolName: 'structured_check',
            result: { kind: 'booleanTrue', path: ['ok'] },
          },
        },
      ],
    },
    'agent',
    plan.revision,
  )
  await kernel.submit(
    session.id,
    'structured-verification',
    { text: '/tool structured_check {"target":"current"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const verified = await workflows.get(session.id)
  expect(verified.workflow?.focus?.acceptanceChecks.every((check) => check.status === 'passed')).toBeTrue()
  const evidenceIds = verified.workflow!.evidence.map((entry) => entry.evidenceId)
  const completed = await workflows.checkpoint(
    session.id,
    'typed-checks',
    'complete',
    'All structured predicates passed',
    null,
    verified.workflow!.revision,
    evidenceIds,
  )
  expect(completed.workflow?.status).toBe('completed')
  expect(completed.workflow?.evidence.at(-1)).toMatchObject({
    source: 'agent',
    checkId: 'agent-conclusion',
    outcome: 'passed',
  })
  await dispose()
})

test('read-only reviewer approval survives restart and stale or rejected verdicts cannot advance Plan', async () => {
  const first = await fixture()
  await first.goals.create(first.session.id, 'Finish after independent review', 10_000)
  const plan = await first.plans.update(first.session.id, [
    { step: 'Review the completed change', status: 'in_progress' },
  ])
  const focused = await first.workflows.focus(
    first.session.id,
    0,
    {
      id: 'review-focus',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'review_agent',
    plan.revision,
  )
  const waiting = await first.workflows.checkpoint(
    first.session.id,
    'review-focus',
    'complete',
    'Ready for independent review',
    null,
    focused.workflow!.revision,
    [],
    'local-fixture',
  )
  expect(waiting.workflow).toMatchObject({ status: 'waiting_review', review: { status: 'running' } })
  await first.kernel.waitForIdle()
  const review = (await first.workflows.get(first.session.id)).workflow!.review!
  const reviewerId = review.reviewerAgentId!
  expect((await first.agents.result(first.session.id, reviewerId)).tokenBudget).toBe(10_000)
  await first.kernel.submit(
    reviewerId,
    'review-write-denied',
    { text: '/tool write_file {"path":"review.txt","text":"forbidden"}', images: [] },
    'local-fixture',
  )
  await first.kernel.waitForIdle()
  expect(
    (await first.kernel.snapshot(reviewerId)).messages
      .flatMap((message) => message.content)
      .some((block) => block.type === 'tool_result' && block.isError && block.text.includes('read-only review scope')),
  ).toBeTrue()

  await first.kernel.close()
  resources.splice(
    resources.findIndex((entry) => entry.kernel === first.kernel),
    1,
  )
  const restarted = await Kernel.create({
    home: join(first.root, 'data'),
    workspace: first.root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root: first.root, kernel: restarted })
  expect(await restarted.plugins.get<WorkflowService>('workflow').get(first.session.id)).toMatchObject({
    workflow: { status: 'waiting_review', review: { reviewId: review.reviewId, status: 'running' } },
  })
  await restarted.submit(
    reviewerId,
    'review-approve',
    {
      text: `/tool workflow_review_submit ${JSON.stringify({
        reviewId: review.reviewId,
        verdict: 'approved',
        summary: 'Independent checks passed',
      })}`,
      images: [],
    },
    'local-fixture',
  )
  await restarted.waitForIdle()
  expect(await restarted.plugins.get<PlanService>('plan').get(first.session.id)).toMatchObject({
    plan: [{ status: 'completed' }],
  })
  expect(await restarted.plugins.get<WorkflowService>('workflow').get(first.session.id)).toMatchObject({
    workflow: {
      status: 'completed',
      review: { status: 'approved', summary: 'Independent checks passed' },
      evidence: [{ source: 'agent' }, { source: 'reviewer', outcome: 'approved' }],
    },
  })

  const rejectedFixture = await fixture()
  const rejectedPlan = await rejectedFixture.plans.update(rejectedFixture.session.id, [
    { step: 'Reject this review', status: 'in_progress' },
  ])
  const rejectedFocus = await rejectedFixture.workflows.focus(
    rejectedFixture.session.id,
    0,
    {
      id: 'reject-focus',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'review_agent',
    rejectedPlan.revision,
  )
  const rejectedWaiting = await rejectedFixture.workflows.checkpoint(
    rejectedFixture.session.id,
    'reject-focus',
    'complete',
    'Request rejection',
    null,
    rejectedFocus.workflow!.revision,
    [],
    'local-fixture',
  )
  const rejectedReview = rejectedWaiting.workflow!.review!
  await rejectedFixture.kernel.waitForIdle()
  await rejectedFixture.kernel.submit(
    rejectedReview.reviewerAgentId!,
    'review-reject',
    {
      text: `/tool workflow_review_submit ${JSON.stringify({
        reviewId: rejectedReview.reviewId,
        verdict: 'rejected',
        summary: 'A required assertion is missing',
      })}`,
      images: [],
    },
    'local-fixture',
  )
  await rejectedFixture.kernel.waitForIdle()
  expect(await rejectedFixture.workflows.get(rejectedFixture.session.id)).toMatchObject({
    workflow: { status: 'needs_revision', review: { status: 'rejected' } },
  })
  expect(await rejectedFixture.plans.get(rejectedFixture.session.id)).toMatchObject({
    revision: rejectedPlan.revision,
    plan: [{ status: 'in_progress' }],
  })

  const staleFixture = await fixture()
  const stalePlan = await staleFixture.plans.update(staleFixture.session.id, [
    { step: 'Invalidate this review', status: 'in_progress' },
  ])
  const staleFocus = await staleFixture.workflows.focus(
    staleFixture.session.id,
    0,
    {
      id: 'stale-focus',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'review_agent',
    stalePlan.revision,
  )
  const staleWaiting = await staleFixture.workflows.checkpoint(
    staleFixture.session.id,
    'stale-focus',
    'complete',
    'Request stale review',
    null,
    staleFocus.workflow!.revision,
    [],
    'local-fixture',
  )
  const staleReview = staleWaiting.workflow!.review!
  await staleFixture.kernel.waitForIdle()
  await writeFile(join(staleFixture.root, 'changed-after-review.txt'), 'changed', 'utf8')
  await staleFixture.kernel.submit(
    staleReview.reviewerAgentId!,
    'review-stale',
    {
      text: `/tool workflow_review_submit ${JSON.stringify({
        reviewId: staleReview.reviewId,
        verdict: 'approved',
        summary: 'This verdict is stale',
      })}`,
      images: [],
    },
    'local-fixture',
  )
  await staleFixture.kernel.waitForIdle()
  expect(await staleFixture.workflows.get(staleFixture.session.id)).toMatchObject({
    workflow: { status: 'needs_revision', review: { status: 'stale' } },
  })
  expect((await staleFixture.plans.get(staleFixture.session.id))?.revision).toBe(stalePlan.revision)
})

test('reviewer cancellation restores the main Agent without user intervention', async () => {
  const { session, plans, workflows } = await fixture()
  const plan = await plans.update(session.id, [{ step: 'Cancel reviewer', status: 'in_progress' }])
  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'cancel-review',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'review_agent',
    plan.revision,
  )
  const waiting = await workflows.checkpoint(
    session.id,
    'cancel-review',
    'complete',
    'Start cancellable review',
    null,
    focused.workflow!.revision,
    [],
    'local-fixture',
  )
  await (workflows as WorkflowRuntime).handleAgentSettled({
    parentSessionId: session.id,
    agentId: waiting.workflow!.review!.reviewerAgentId!,
    status: 'cancelled',
  })
  expect(await workflows.get(session.id)).toMatchObject({
    workflow: { status: 'active', review: { status: 'cancelled' } },
  })
  expect((await plans.get(session.id))?.plan[0]?.status).toBe('in_progress')
})

test('replacing a Goal cancels its reviewer and archives the old execution focus', async () => {
  const { session, goals, plans, workflows } = await fixture()
  const original = await goals.create(session.id, 'Original reviewed goal')
  const plan = await plans.update(session.id, [{ step: 'Review before replacement', status: 'in_progress' }])
  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'replace-review',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'review_agent',
    plan.revision,
  )
  await workflows.checkpoint(
    session.id,
    'replace-review',
    'complete',
    'Awaiting review before replacement',
    null,
    focused.workflow!.revision,
    [],
    'local-fixture',
  )
  await goals.set(session.id, { objective: 'Replacement goal', expectedGoalId: original.goal?.goalId })
  expect(await workflows.get(session.id)).toMatchObject({
    workflow: { status: 'cancelled', review: { status: 'cancelled' } },
  })
  expect(await plans.get(session.id)).toBeNull()
})

test('manual evidence is impossible before an explicitly user-gated current focus waits', async () => {
  const { session, plans, workflows } = await fixture()
  const plan = await plans.update(session.id, [{ step: 'Obtain explicit acceptance', status: 'in_progress' }])
  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'accept',
      title: 'ignored',
      scope: { readPaths: [], writePaths: [], tools: [] },
      acceptanceChecks: [{ id: 'human', description: 'The current result is accepted', verifier: { kind: 'user' } }],
    },
    'user',
    plan.revision,
  )
  expect(
    await rejection(
      workflows.acceptCheck(session.id, 'accept', 'human', 'accepted', null, focused.workflow!.revision, 'user'),
    ),
  ).toMatchObject({ code: 'WORKFLOW_CHECK_INVALID' })

  const waiting = await workflows.checkpoint(
    session.id,
    'accept',
    'complete',
    'Ready for the explicitly requested user review',
    null,
    focused.workflow!.revision,
  )
  expect(waiting.workflow?.status).toBe('waiting_user')
  const accepted = await workflows.acceptCheck(
    session.id,
    'accept',
    'human',
    'accepted',
    null,
    waiting.workflow!.revision,
    'user',
  )
  expect(accepted.workflow?.status).toBe('verifying')
  const completed = await workflows.checkpoint(
    session.id,
    'accept',
    'complete',
    'The explicit acceptance is current and recorded',
    null,
    accepted.workflow!.revision,
  )
  expect(completed.workflow?.status).toBe('completed')
})

test('legacy namespaced tools and trailing globs migrate into a recoverable Agent Plan focus', async () => {
  const { root, kernel, session } = await fixture()
  const now = Date.now()
  const item = {
    id: 'legacy-step',
    title: 'Repair the historical focus',
    scope: { readPaths: ['apps/web/**'], writePaths: ['apps/web/**/*'], tools: ['functions.read_file'] },
    acceptanceChecks: [],
  }
  const plan = {
    schemaVersion: 1,
    planId: 'legacy-plan',
    sessionId: session.id,
    revision: 1,
    phase: 'active',
    objective: 'Migrate the historical workflow',
    items: [item],
    createdAt: now,
    updatedAt: now,
  }
  const workflow = {
    schemaVersion: 1,
    workflowId: 'legacy-workflow',
    sessionId: session.id,
    goalId: null,
    planId: plan.planId,
    planRevision: 1,
    revision: 1,
    status: 'active',
    activeItemId: item.id,
    explorationCount: 0,
    workItems: [
      {
        ...item,
        status: 'in_progress',
        owner: { kind: 'main' },
        acceptanceChecks: [],
        startedAt: now,
        completedAt: null,
      },
    ],
    scopeExpansions: [],
    delegations: [],
    evidence: [],
    startCommand: null,
    createdAt: now,
    updatedAt: now,
  }
  await kernel.storage.call('append', session.id, 'workflow.started', { plan, workflow })
  await kernel.close()
  resources.splice(
    resources.findIndex((entry) => entry.kernel === kernel),
    1,
  )

  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  expect(await restarted.plugins.get<PlanService>('plan').get(session.id)).toMatchObject({
    plan: [{ step: item.title, status: 'in_progress' }],
  })
  expect(await restarted.plugins.get<WorkflowService>('workflow').get(session.id)).toMatchObject({
    workflow: {
      executionModel: 'focus_v2',
      status: 'active',
      focus: {
        stepIndex: 0,
        scope: { readPaths: ['apps/web'], writePaths: ['apps/web'], tools: ['read_file'] },
      },
    },
  })
  expect(
    (await restarted.storage.call('events', session.id, 0, 10_000)).some(
      (event) => event.type === 'workflow.migrated.v2',
    ),
  ).toBeTrue()
})

test('recorded checkpoint intent completes idempotently after a Host restart', async () => {
  const { root, kernel, session, plans, workflows } = await fixture()
  const plan = await plans.update(session.id, [{ step: 'Finish across restart', status: 'in_progress' }])
  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'restart-step',
      title: 'ignored',
      scope: { readPaths: [], writePaths: [], tools: [] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )
  const focusEvent = (await kernel.storage.call('events', session.id, 0, 10_000)).findLast(
    (event) => event.type === 'workflow.focus.set',
  )
  if (!focusEvent || !focusEvent.data || typeof focusEvent.data !== 'object' || !('workflow' in focusEvent.data))
    throw new Error('Missing internal focus event')
  const workflow = (focusEvent.data as { workflow: Record<string, unknown> }).workflow
  const focus = focused.workflow!.focus!
  await kernel.storage.call('append', session.id, 'workflow.updated', {
    workflow: {
      ...workflow,
      revision: Number(workflow.revision) + 1,
      transitionIntent: {
        operationId: 'recover-operation',
        planRevision: focus.planRevision,
        stepIndex: focus.stepIndex,
        stepTextHash: focus.stepTextHash,
        itemId: focus.focusId,
        summary: 'Complete after recovery',
        createdAt: Date.now(),
      },
      updatedAt: Date.now(),
    },
  })
  await kernel.close()
  resources.splice(
    resources.findIndex((entry) => entry.kernel === kernel),
    1,
  )
  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  expect(await restarted.plugins.get<PlanService>('plan').get(session.id)).toMatchObject({
    plan: [{ step: 'Finish across restart', status: 'completed' }],
  })
  expect(await restarted.plugins.get<WorkflowService>('workflow').get(session.id)).toMatchObject({
    workflow: { status: 'completed', transitionIntent: null, focus: null },
  })
})
