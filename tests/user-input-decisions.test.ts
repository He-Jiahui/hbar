import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, userInputRequestSchema, userInputAutomaticDecisionSchema } from '@hbar/contracts'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { AUTONOMY_DECISION_MODE_SETTING } from '@hbar/contracts/autonomy'
import type { StorageMethods } from '@hbar/storage'
import { recommendedInputDecision } from '../packages/kernel/src/user-input-decisions'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const question = {
  id: 'scope',
  header: 'Scope',
  question: 'Which scope?',
  purpose: 'decision' as const,
  options: [
    { label: 'App', description: 'Cover the app.', recommended: true },
    { label: 'API', description: 'Cover the API.' },
  ],
}
const request = (questions: unknown[]) =>
  userInputRequestSchema.parse({ requestId: 'request', sessionId: 'session', runId: 'run', callId: 'call', questions })
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to fail')
}

test('automatic recommendations select only explicit choices and retain an all-or-human decision boundary', () => {
  expect(recommendedInputDecision(request([question, { ...question, id: 'second' }]))).toEqual({
    kind: 'recommended',
    response: { answers: { scope: { answers: ['App'] }, second: { answers: ['App'] } } },
  })
  for (const [variant, reason] of [
    [{ ...question, isSecret: true }, 'secret'],
    [{ ...question, purpose: 'fact' }, 'fact'],
    [{ ...question, purpose: 'authorization' }, 'authorization'],
    [{ ...question, purpose: undefined }, 'fact'],
    [{ ...question, options: [] }, 'recommendation_required'],
    [
      { ...question, options: question.options.map((option) => ({ ...option, recommended: false })) },
      'recommendation_required',
    ],
  ] as const) {
    expect(recommendedInputDecision(request([question, { ...variant, id: 'second' }]))).toEqual({
      kind: 'human',
      reason,
    })
  }
})

async function fixture() {
  const prefix = 'hbar-user-input-decisions-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Expected decision fixture workspace')
  return {
    kernel,
    workspace,
    async close() {
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('unattended sessions still wait for a human on facts, secrets, authorization and legacy questions', async () => {
  const f = await fixture()
  const resolutions: Promise<unknown>[] = []
  const requested: string[] = []
  const unsubscribe = f.kernel.subscribe((event) => {
    if (event.method !== 'user_input.requested') return
    requested.push(event.params.requestId)
    resolutions.push(f.kernel.resolveUserInput(event.params.requestId, { scope: { answers: ['API'] } }))
  })
  try {
    for (const variant of [
      { ...question, isSecret: true },
      { ...question, purpose: 'fact' },
      { ...question, purpose: 'authorization' },
      { ...question, purpose: undefined },
    ]) {
      const session = await f.kernel.createSession(f.workspace.id)
      await f.kernel.automationSet(session.id, true)
      await f.kernel.submit(
        session.id,
        crypto.randomUUID(),
        {
          text: `/tool request_user_input ${JSON.stringify({ questions: [variant] })}`,
          images: [],
        },
        'local-fixture',
      )
      await f.kernel.waitForIdle()
      const snapshot = await f.kernel.snapshot(session.id)
      const result = snapshot.messages
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result' && block.name === 'request_user_input')
      expect(result?.type === 'tool_result' ? JSON.parse(result.text) : null).toEqual({
        answers: { scope: { answers: ['API'] } },
      })
      expect(
        (await f.kernel.storage.call('events', session.id, 0)).some((event) => event.type === 'user_input.autoDecided'),
      ).toBe(false)
    }
    await Promise.all(resolutions)
    expect(requested).toHaveLength(4)
  } finally {
    unsubscribe()
    await Promise.all(resolutions)
    await f.close()
  }
})

test('a recommended choice is durably auditable and storage failure cannot fabricate an automatic answer', async () => {
  const f = await fixture()
  const original = f.kernel.storage.call.bind(f.kernel.storage)
  try {
    const session = await f.kernel.createSession(f.workspace.id)
    await f.kernel.automationSet(session.id, true)
    const submit = () =>
      f.kernel.submit(
        session.id,
        crypto.randomUUID(),
        {
          text: `/tool request_user_input ${JSON.stringify({ questions: [question] })}`,
          images: [],
        },
        'local-fixture',
      )
    await submit()
    await f.kernel.waitForIdle()
    const events = await f.kernel.storage.call('events', session.id, 0)
    const automatic = events.filter((event) => event.type === 'user_input.autoDecided')
    expect(automatic).toHaveLength(1)
    expect(userInputAutomaticDecisionSchema.parse(automatic[0]?.data)).toMatchObject({
      source: 'recommended',
      request: { sessionId: session.id, questions: [{ purpose: 'decision' }] },
      response: { answers: { scope: { answers: ['App'] } } },
    })
    f.kernel.storage.call = async <Name extends keyof StorageMethods>(
      method: Name,
      ...args: Parameters<StorageMethods[Name]>
    ): Promise<ReturnType<StorageMethods[Name]>> => {
      if (method === 'append' && args[1] === 'user_input.autoDecided')
        throw new HbarError('DECISION_AUDIT_FAILED', 'Injected audit write failure')
      return original(method, ...args)
    }
    const failed = await submit()
    await f.kernel.waitForIdle()
    const snapshot = await f.kernel.snapshot(session.id)
    const result = snapshot.messages
      .filter((message) => message.runId === failed.id)
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'request_user_input')
    expect(result?.type === 'tool_result' && result.isError).toBe(true)
    expect(result?.type === 'tool_result' && result.text).toContain('Injected audit write failure')
    expect(
      (await f.kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'user_input.autoDecided'),
    ).toHaveLength(1)
  } finally {
    f.kernel.storage.call = original
    await f.close()
  }
})

test('a cancelled automatic question never records or returns a recommended decision', async () => {
  const f = await fixture()
  try {
    const session = await f.kernel.createSession(f.workspace.id)
    await f.kernel.automationSet(session.id, true)
    const run = await f.kernel.storage.call(
      'enqueue',
      session.id,
      'cancelled-question',
      { text: 'question', images: [] },
      'fixture',
    )
    const controller = new AbortController()
    controller.abort(new Error('Source question was cancelled'))
    expect(
      await failure(
        f.kernel.requestUserInput(
          userInputRequestSchema.parse({ ...request([question]), sessionId: session.id, runId: run.id }),
          controller.signal,
        ),
      ),
    ).toMatchObject({ message: 'Source question was cancelled' })
    expect(
      (await f.kernel.storage.call('events', session.id, 0)).some(
        (event) => event.type === 'user_input.autoDecided' || event.type === 'user_input.requested',
      ),
    ).toBe(false)
  } finally {
    await f.close()
  }
})

test('new global recommendation and session wait policies govern real questions while ordinary Runs finish without Goals', async () => {
  const f = await fixture()
  const settings = new SettingsService(f.kernel.storage)
  const resolutions: Promise<unknown>[] = []
  const unsubscribe = f.kernel.subscribe((event) => {
    if (event.method === 'user_input.requested')
      resolutions.push(f.kernel.resolveUserInput(event.params.requestId, { scope: { answers: ['API'] } }))
  })
  try {
    const automatic = await f.kernel.createSession(f.workspace.id)
    const manual = await f.kernel.createSession(f.workspace.id)
    const global = await settings.get({ kind: 'global' })
    await settings.apply({
      schemaVersion: 1,
      scope: { kind: 'global' },
      changes: [{ op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'recommended' }],
      baselineRevisions: global.revisions,
      actorId: 'fixture',
      idempotencyKey: 'global-recommend',
    })
    await f.kernel.automationSet(manual.id, true)
    const local = await settings.get({ kind: 'session', targetId: manual.id })
    await settings.apply({
      schemaVersion: 1,
      scope: { kind: 'session', targetId: manual.id },
      changes: [{ op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'wait_user' }],
      baselineRevisions: local.revisions,
      actorId: 'fixture',
      idempotencyKey: 'session-wait',
    })
    for (const session of [automatic, manual]) {
      const run = await f.kernel.submit(
        session.id,
        crypto.randomUUID(),
        {
          text: `/tool request_user_input ${JSON.stringify({ questions: [question] })}`,
          images: [],
        },
        'local-fixture',
      )
      await f.kernel.waitForIdle()
      const snapshot = await f.kernel.snapshot(session.id)
      const result = snapshot.messages
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result' && block.name === 'request_user_input')
      expect(result?.type === 'tool_result' ? JSON.parse(result.text) : null).toEqual({
        answers: { scope: { answers: [session.id === automatic.id ? 'App' : 'API'] } },
      })
      expect(snapshot.runs.find((item) => item.id === run.id)?.status).toBe('completed')
      const events = await f.kernel.storage.call('events', session.id, 0)
      expect(events.some((event) => event.type === 'goal.created')).toBe(false)
      const audit = events.find((event) => event.type === 'user_input.autoDecided')
      if (session.id === automatic.id)
        expect(userInputAutomaticDecisionSchema.parse(audit?.data).policy).toMatchObject({
          source: 'global',
          policy: { mode: 'recommended' },
        })
      else expect(audit).toBeUndefined()
    }
    await Promise.all(resolutions)
    expect(resolutions).toHaveLength(1)
  } finally {
    unsubscribe()
    await Promise.all(resolutions)
    await f.close()
  }
})
