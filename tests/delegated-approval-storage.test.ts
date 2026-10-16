import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { SettingsService } from '@hbar/kernel'
import type { Approval } from '@hbar/contracts'
import {
  AUTONOMY_DECISION_MODE_SETTING,
  AUTONOMY_DECISION_TARGET_SETTING,
  automaticPlanExitDecisionSchema,
  automaticToolApprovalDecisionSchema,
} from '@hbar/contracts/autonomy'
import type { DelegatedInputRecord } from '@hbar/contracts/delegated-user-input'
import { delegatedDecisionText } from '../packages/storage/src/delegated-input-delivery'
import { removeOwnedTestDirectory } from './owned-temp-directory'
import {
  createDelegatedApprovalSource,
  DELEGATED_APPROVAL_INDEX,
} from '../packages/storage/src/delegated-approval-source'

async function rejected(operation: Promise<unknown>) {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected the original approval delegation to be rejected')
}
const identity = (state: DelegatedInputRecord) => ({ sessionId: state.sessionId, requestId: state.requestId })
const mutation = (state: DelegatedInputRecord) => ({
  ...identity(state),
  delegationId: state.delegationId,
  expectedRevision: state.revision,
})
const evidence = (state: DelegatedInputRecord) => ({
  version: 1,
  source: 'delegate',
  policy: state.policy,
  delegation: {
    delegationId: state.delegationId,
    targetSessionId: state.targetSessionId,
    targetRunId: state.targetRunId,
    replyRevision: state.revision,
  },
})
const toolEvidence = (state: DelegatedInputRecord) =>
  automaticToolApprovalDecisionSchema.parse({
    ...evidence(state),
    admission: state.approval?.context.admission,
  })
const planEvidence = (state: DelegatedInputRecord) => automaticPlanExitDecisionSchema.parse(evidence(state))

async function fixture(mode: 'plan' | 'default' = 'plan', approvalMode: 'ask' | 'deny' = 'ask') {
  const prefix = 'hbar-delegated-approval-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const path = join(root, 'state.sqlite')
  let storage = new Storage(path)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Source')
    const targetWorkspace = await storage.call('createWorkspace', join(root, 'target'), 'Target')
    const actor = {
      id: 'approval-operator',
      name: 'Approval operator',
      role: 'operator' as const,
      workspaceIds: null,
      createdAt: 1,
      lastSeenAt: 1,
    }
    await storage.call('putDevice', actor, 'approval-test-token')
    const source = await storage.call('createSessionCommand', {
      workspaceId: workspace.id,
      actorId: actor.id,
      idempotencyKey: 'source',
    })
    const target = await storage.call('createSessionCommand', {
      workspaceId: targetWorkspace.id,
      actorId: actor.id,
      idempotencyKey: 'target',
    })
    const sourceRun = await storage.call(
      'enqueue',
      source.id,
      'source-task',
      { text: 'Original task', images: [], approval: approvalMode, mode },
      'fixture',
    )
    const targetRun = await storage.call(
      'enqueue',
      target.id,
      'target-task',
      { text: 'Original target task', images: [] },
      'fixture',
    )
    await storage.call('claim', source.id)
    await storage.call('claim', target.id)
    const service = new SettingsService(storage)
    const scope = { kind: 'session' as const, targetId: source.id }
    const settings = await service.get(scope)
    await service.apply({
      schemaVersion: settings.schemaVersion,
      scope,
      baselineRevisions: settings.revisions,
      actorId: actor.id,
      idempotencyKey: 'delegate-policy',
      changes: [
        { op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'delegate' },
        { op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_TARGET_SETTING }], value: target.id },
      ],
    })
    const policy = await service.decisionPolicy(source.id)
    const admission = { mode: 'ask', decision: 'ask', humanApproval: false } as const
    async function approval(
      kind: 'approval' | 'plan_exit' = 'approval',
      context: 'full' | 'policy' | 'absent' = 'full',
      args: Record<string, unknown> = { path: 'original.txt', content: 'Original permitted change' },
    ) {
      const value: Approval = {
        id: crypto.randomUUID(),
        sessionId: source.id,
        runId: sourceRun.id,
        callId: crypto.randomUUID(),
        tool: kind === 'plan_exit' ? 'exit_plan_mode' : 'write_file',
        args,
        status: 'pending',
        createdAt: Date.now(),
      }
      await storage.call(
        'createApproval',
        value,
        context === 'absent' ? undefined : { policy, ...(context === 'full' ? { admission } : {}) },
      )
      await storage.call('setRun', sourceRun.id, 'waiting_approval')
      return value
    }
    const accept = (value: Approval, kind: 'approval' | 'plan_exit' = 'approval', timeoutMs?: number) =>
      storage.call('delegatedInputAccept', {
        sessionId: source.id,
        requestId: value.id,
        kind,
        policy,
        expectedQuestionRevision: 1,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      })
    const bind = async (state: DelegatedInputRecord) =>
      (
        await storage.call('delegatedInputBind', {
          ...mutation(state),
          targetSessionId: target.id,
          targetRunId: targetRun.id,
          delivery: 'guidance',
        })
      ).state
    const reply = (state: DelegatedInputRecord, value = 'allowed') =>
      storage.call('delegatedInputComplete', {
        ...mutation(state),
        targetSessionId: target.id,
        targetRunId: targetRun.id,
        targetCallId: 'target-choice',
        reply: { kind: 'answered', response: { answers: { decision: { answers: [value] } } } },
      })
    return {
      get storage() {
        return storage
      },
      source,
      sourceRun,
      target,
      targetRun,
      actor,
      policy,
      approval,
      accept,
      bind,
      reply,
      async restart() {
        await storage.close()
        storage = new Storage(path)
        await storage.call('ready')
      },
      async close() {
        await storage.close()
        await removeOwnedTestDirectory(root, prefix)
      },
    }
  } catch (error) {
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
    throw error
  }
}

test('approval grant retains original admission and parameters without creating a questionnaire', async () => {
  const f = await fixture()
  try {
    const approval = await f.approval()
    const state = await f.bind((await f.accept(approval)).state)
    expect(state.approval?.approval.args).toEqual(approval.args)
    expect(state.approval?.context.admission?.humanApproval).toBe(false)
    expect(state.sourceCallId).toBe(approval.callId)
    expect(await f.storage.call('userInputRead', { sessionId: f.source.id, requestId: approval.id })).toBeNull()
    const text: unknown = JSON.parse(delegatedDecisionText(state))
    expect(text).toMatchObject({ approval: { kind: 'approval', approval: { args: approval.args } } })
    const answered = await f.reply(state)
    expect(answered.state.status).toBe('answered')
    expect((await f.storage.call('approval', approval.id)).status).toBe('pending')
    expect((await f.storage.call('run', f.targetRun.id)).input.text).toBe('Original target task')
  } finally {
    await f.close()
  }
})

test('Plan exit grants carry the original plan and only accept implement or continue', async () => {
  const f = await fixture()
  try {
    const plan = { plan: '# Keep the original scope\n\nImplement only this plan.' }
    const approval = await f.approval('plan_exit', 'policy', plan)
    const state = await f.bind((await f.accept(approval, 'plan_exit')).state)
    expect(state.approval?.kind).toBe('plan_exit')
    expect(state.approval?.approval.args).toEqual(plan)
    expect(await rejected(f.reply(state, 'allowed'))).toMatchObject({ code: 'USER_INPUT_INVALID' })
    expect((await f.reply(state, 'continue')).state.reply).toMatchObject({
      response: { answers: { decision: { answers: ['continue'] } } },
    })
    expect((await f.storage.call('approval', approval.id)).status).toBe('pending')
  } finally {
    await f.close()
  }
})

test('historical and explicitly human approvals cannot mint delegated admission', async () => {
  const f = await fixture()
  try {
    for (const context of ['absent', 'policy'] as const) {
      const approval = await f.approval('approval', context)
      expect(await rejected(f.accept(approval))).toMatchObject({ code: 'DECISION_CONFLICT' })
      expect(await f.storage.call('delegatedInputRead', { sessionId: f.source.id, requestId: approval.id })).toBeNull()
    }
    const approval = await f.approval()
    expect(await rejected(f.accept(approval, 'plan_exit'))).toMatchObject({ code: 'DECISION_CONFLICT' })
  } finally {
    await f.close()
  }
})

test('grant kind and original deadline survive restart and cannot become a questionnaire', async () => {
  const f = await fixture()
  try {
    const approval = await f.approval()
    const state = await f.bind((await f.accept(approval)).state)
    await f.restart()
    const accepted = await f.accept(approval)
    expect(accepted.created).toBe(false)
    expect(accepted.state).toEqual(state)
    expect(
      await rejected(
        f.storage.call('delegatedInputAccept', {
          ...identity(state),
          policy: f.policy,
          expectedQuestionRevision: 1,
        }),
      ),
    ).toMatchObject({ code: 'DECISION_CONFLICT' })
    const answered = await f.reply(state, 'denied')
    await f.restart()
    expect(await f.storage.call('delegatedInputRead', identity(state))).toEqual(answered.state)
  } finally {
    await f.close()
  }
})

test('manual, cancellation, archive and policy winners reject a late target answer', async () => {
  for (const winner of ['manual', 'cancel', 'archive', 'policy'] as const) {
    const f = await fixture()
    try {
      const approval = await f.approval()
      const state = await f.bind((await f.accept(approval)).state)
      if (winner === 'manual') await f.storage.call('resolveApproval', approval.id, 'denied')
      if (winner === 'cancel') await f.storage.call('requestCancel', f.sourceRun.id)
      if (winner === 'archive') await f.storage.call('updateSession', f.target.id, { archived: true })
      if (winner === 'policy') {
        const service = new SettingsService(f.storage)
        const scope = { kind: 'session' as const, targetId: f.source.id }
        const before = await service.get(scope)
        await service.apply({
          schemaVersion: before.schemaVersion,
          scope,
          baselineRevisions: before.revisions,
          actorId: f.actor.id,
          idempotencyKey: 'replace-policy',
          changes: [{ op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'wait_user' }],
        })
      }
      expect(await rejected(f.reply(state))).toHaveProperty(
        'code',
        {
          manual: 'DECISION_CONFLICT',
          cancel: 'USER_CANCELLED',
          archive: 'DELEGATION_TARGET_UNAVAILABLE',
          policy: 'DECISION_POLICY_CHANGED',
        }[winner],
      )
      expect((await f.storage.call('run', f.targetRun.id)).status).toBe('running')
    } finally {
      await f.close()
    }
  }
})

test('oversized original approval fails before a grant or target delivery is published', async () => {
  const f = await fixture()
  try {
    const approval = await f.approval('approval', 'full', { content: 'x'.repeat(270_000) })
    expect(await rejected(f.accept(approval))).toMatchObject({ code: 'DELEGATION_CAPACITY' })
    expect(await f.storage.call('delegatedInputRead', { sessionId: f.source.id, requestId: approval.id })).toBeNull()
    expect((await f.storage.call('run', f.targetRun.id)).status).toBe('running')
  } finally {
    await f.close()
  }
})

test('an approval receipt cannot be consumed by a colliding questionnaire identity', async () => {
  const f = await fixture()
  try {
    const approval = await f.approval()
    const state = await f.bind((await f.accept(approval)).state)
    await f.reply(state)
    const question = await f.storage.call('userInputAccept', { request: state.request, policy: f.policy })
    expect(
      await rejected(
        f.storage.call('userInputCommit', {
          ...identity(state),
          expectedRevision: question.state.revision,
          settlement: { kind: 'answered', response: { answers: { decision: { answers: ['allowed'] } } } },
        }),
      ),
    ).toMatchObject({ code: 'DECISION_CONFLICT' })
    expect((await f.storage.call('approval', approval.id)).status).toBe('pending')
    expect((await f.storage.call('delegatedInputRead', identity(state)))?.status).toBe('answered')
  } finally {
    await f.close()
  }
})

test('approval grants require the original waiting ask Run and Plan grants require Plan mode', async () => {
  for (const invalid of ['deny', 'mode', 'running'] as const) {
    const f = await fixture(invalid === 'mode' ? 'default' : 'plan', invalid === 'deny' ? 'deny' : 'ask')
    try {
      const kind = invalid === 'mode' ? 'plan_exit' : 'approval'
      const approval = await f.approval(kind)
      if (invalid === 'running') await f.storage.call('setRun', f.sourceRun.id, 'running')
      expect(await rejected(f.accept(approval, kind))).toMatchObject({ code: 'DELEGATION_HUMAN_REQUIRED' })
      expect(await f.storage.call('delegatedInputRead', { sessionId: f.source.id, requestId: approval.id })).toBeNull()
    } finally {
      await f.close()
    }
  }
})

test('approval parameters must match the immutable request rather than a changed projection', () => {
  const db = new Database(':memory:')
  try {
    db.exec('CREATE TABLE events(sessionId TEXT, type TEXT, data TEXT, seq INTEGER)')
    db.exec(DELEGATED_APPROVAL_INDEX)
    const approval: Approval = {
      id: 'original',
      sessionId: 'source',
      runId: 'run',
      callId: 'call',
      tool: 'write_file',
      args: { path: 'original.txt' },
      status: 'pending',
      createdAt: 1,
    }
    const automationContext = {
      policy: {
        sessionId: 'source',
        source: 'session',
        policy: { mode: 'delegate', targetSessionId: 'target' },
        revisions: { original: 1 },
      },
      admission: { mode: 'ask', decision: 'ask', humanApproval: false },
    }
    db.query('INSERT INTO events VALUES(?,?,?,?)').run(
      'source',
      'approval.requested',
      JSON.stringify({ ...approval, automationContext }),
      1,
    )
    const read = createDelegatedApprovalSource(db, () => approval)
    const input = { sessionId: 'source', requestId: 'original' }
    expect(read(input, 'approval')?.approval.args).toEqual({ path: 'original.txt' })
    approval.args = { path: 'different.txt' }
    expect(read(input, 'approval')).toBeNull()
    approval.args = { path: 'original.txt' }
    approval.callId = 'different-call'
    expect(read(input, 'approval')).toBeNull()
  } finally {
    db.close()
  }
})

test('source approval consumes the exact allowed or denied target receipt once across restart', async () => {
  for (const choice of ['allowed', 'denied'] as const) {
    const f = await fixture('default')
    try {
      const approval = await f.approval()
      const state = (await f.reply(await f.bind((await f.accept(approval)).state), choice)).state
      const automatic = toolEvidence(state)
      const result = await f.storage.call('resolveApproval', approval.id, choice, automatic)
      expect(result?.approval).toMatchObject({ status: choice, decidedBy: f.actor.id, args: approval.args })
      expect(result?.event.data).toMatchObject({ automatic: { source: 'delegate', delegation: automatic.delegation } })
      expect(result?.delegationEvents.at(-1)?.seq).toBeGreaterThan(result?.event.seq ?? 0)
      expect((await f.storage.call('delegatedInputRead', identity(state)))?.status).toBe('closed')
      await f.restart()
      expect(await f.storage.call('resolveApproval', approval.id, choice, automatic)).toBeNull()
      const resolved = (await f.storage.call('events', f.source.id, 0, 256)).filter(
        (event) => event.type === 'approval.resolved',
      )
      expect(resolved).toHaveLength(1)
      expect((await f.storage.call('run', f.targetRun.id)).status).toBe('running')
    } finally {
      await f.close()
    }
  }
})

test('delegated Plan exit preserves the original Run and commits implement or continue canonically', async () => {
  for (const choice of ['implement', 'continue'] as const) {
    const f = await fixture()
    try {
      const approval = await f.approval('plan_exit', 'policy', { plan: '# Original plan' })
      const state = (await f.reply(await f.bind((await f.accept(approval, 'plan_exit')).state), choice)).state
      const result = await f.storage.call(
        'resolvePlanExit',
        approval.id,
        f.source.id,
        f.sourceRun.id,
        approval.callId,
        choice,
        undefined,
        f.actor.id,
        planEvidence(state),
      )
      expect(result.approval.status).toBe(choice === 'implement' ? 'allowed' : 'denied')
      expect(result.approval.decidedBy).toBe(f.actor.id)
      expect(result.event.type).toBe('plan_exit.resolved')
      expect(result.event.data).toMatchObject({ automatic: { source: 'delegate' }, exitRunId: f.sourceRun.id })
      expect(result.event.data).toMatchObject({ mode: choice === 'implement' ? 'default' : null })
      expect((await f.storage.call('run', f.sourceRun.id)).input.mode).toBe('plan')
      expect((await f.storage.call('delegatedInputRead', identity(state)))?.status).toBe('closed')
      expect(result.delegationEvents.at(-1)?.seq).toBeGreaterThan(result.event.seq)
      await f.restart()
      expect((await f.storage.call('approval', approval.id)).status).toBe(result.approval.status)
      expect((await f.storage.call('delegatedInputRead', identity(state)))?.status).toBe('closed')
    } finally {
      await f.close()
    }
  }
})

test('forged grant, target, revision and a different choice cannot settle the original approval', async () => {
  const f = await fixture('default')
  try {
    const approval = await f.approval()
    const state = (await f.reply(await f.bind((await f.accept(approval)).state))).state
    const original = toolEvidence(state)
    for (const replacement of [
      { delegationId: 'different-grant' },
      { targetSessionId: f.source.id },
      { targetRunId: f.sourceRun.id },
      { replyRevision: state.revision + 1 },
    ]) {
      const automatic = automaticToolApprovalDecisionSchema.parse({
        ...original,
        delegation: { ...original.delegation, ...replacement },
      })
      expect(await rejected(f.storage.call('resolveApproval', approval.id, 'allowed', automatic))).toMatchObject({
        code: 'DELEGATION_RECEIPT_INVALID',
      })
      expect((await f.storage.call('approval', approval.id)).status).toBe('pending')
    }
    expect(await rejected(f.storage.call('resolveApproval', approval.id, 'denied', original))).toMatchObject({
      code: 'DELEGATION_RECEIPT_INVALID',
    })
    expect((await f.storage.call('resolveApproval', approval.id, 'allowed', original))?.approval.status).toBe('allowed')
    expect(automaticToolApprovalDecisionSchema.safeParse({ ...original, delegation: undefined }).success).toBe(false)
    expect(automaticPlanExitDecisionSchema.safeParse({ ...planEvidence(state), source: 'recommended' }).success).toBe(
      false,
    )
  } finally {
    await f.close()
  }
})

test('manual and cancelled source decisions close grants without fabricating automatic provenance', async () => {
  for (const manual of ['denied', 'cancelled'] as const) {
    const f = await fixture('default')
    try {
      const approval = await f.approval()
      const state = (await f.reply(await f.bind((await f.accept(approval)).state))).state
      const result = await f.storage.call('resolveApproval', approval.id, manual)
      expect(result?.event.data).not.toHaveProperty('automatic')
      expect((await f.storage.call('delegatedInputRead', identity(state)))?.status).toBe(
        manual === 'cancelled' ? 'cancelled' : 'closed',
      )
      expect(await f.storage.call('resolveApproval', approval.id, 'allowed', toolEvidence(state))).toBeNull()
      expect((await f.storage.call('approval', approval.id)).status).toBe(manual)
      expect((await f.storage.call('run', f.targetRun.id)).status).toBe('running')
    } finally {
      await f.close()
    }
  }
})

test('permission, cancellation, policy, archive and deadline changes after the answer prevent source approval', async () => {
  for (const boundary of ['permission', 'cancel', 'policy', 'archive', 'timeout'] as const) {
    const f = await fixture('default')
    try {
      const approval = await f.approval()
      const state = (
        await f.reply(
          await f.bind((await f.accept(approval, 'approval', boundary === 'timeout' ? 1_000 : undefined)).state),
        )
      ).state
      if (boundary === 'permission') {
        await f.storage.call('revokeDevice', f.actor.id)
        await f.storage.call('putDevice', { ...f.actor, role: 'observer' }, 'narrowed-approval-token')
      } else if (boundary === 'cancel') await f.storage.call('requestCancel', f.sourceRun.id)
      else if (boundary === 'archive') await f.storage.call('updateSession', f.target.id, { archived: true })
      else if (boundary === 'timeout') await Bun.sleep(Math.max(1, state.expiresAt - Date.now() + 10))
      else {
        const service = new SettingsService(f.storage)
        const scope = { kind: 'session' as const, targetId: f.source.id }
        const before = await service.get(scope)
        await service.apply({
          schemaVersion: before.schemaVersion,
          scope,
          baselineRevisions: before.revisions,
          actorId: f.actor.id,
          idempotencyKey: 'policy-after-reply',
          changes: [{ op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'wait_user' }],
        })
      }
      expect(
        await rejected(f.storage.call('resolveApproval', approval.id, 'allowed', toolEvidence(state))),
      ).toHaveProperty(
        'code',
        {
          permission: 'FORBIDDEN',
          cancel: 'USER_CANCELLED',
          policy: 'DECISION_POLICY_CHANGED',
          archive: 'DELEGATION_TARGET_UNAVAILABLE',
          timeout: 'DELEGATION_EXPIRED',
        }[boundary],
      )
      expect((await f.storage.call('approval', approval.id)).status).toBe('pending')
      expect(
        (await f.storage.call('events', f.source.id, 0, 256)).filter((event) => event.type === 'approval.resolved'),
      ).toHaveLength(0)
    } finally {
      await f.close()
    }
  }
})
