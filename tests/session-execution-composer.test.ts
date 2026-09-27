import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import type { Session, ThreadGoal } from '@hbar/contracts'
import { goalPlanCommands, type GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import {
  modelCommands,
  type ModelConfiguration,
  type ModelDescriptor,
  type ModelReceipt,
} from '@hbar/contracts/commands/models'
import { runAcceptedSchema, submitRunInputSchema, type RunAccepted } from '@hbar/contracts/commands/run'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { createState } from '../packages/app-runtime/src/state'
import { createSessionExecutionAccess } from '../packages/app-runtime/src/session-execution-access'
import { createSessionExecutionPreparation } from '../packages/app-runtime/src/session-execution-preparation'
import { createComposerIntent } from '../packages/app-runtime/src/composer-intent'
import { createComposerModel } from '../packages/app-runtime/src/composer-model'
import { createComposerPlanMode } from '../packages/app-runtime/src/composer-plan-mode'
import type {
  DirectoryState,
  GoalPlanWorkspacePort,
  NavigationState,
  SessionControlsState,
} from '../packages/app-runtime/src/types'
import type { ComposerPermissionSubmission } from '../packages/app-runtime/src/composer-permission'

const models: readonly ModelDescriptor[] = ['one', 'two'].map((id) => ({
  id: `fixture/${id}`,
  providerId: 'fixture',
  providerName: 'Fixture',
  modelId: id,
  modelName: id,
  contextWindow: 10000,
  maxOutput: 1000,
  imageInput: true,
  reasoning: true,
  thinkingLevels: ['low', 'high'],
  defaultThinkingLevel: 'low',
  hasKey: true,
}))
const session = (id: string, archived = false, seq = 1): Session => ({
  id,
  workspaceId: 'w',
  title: id,
  archived,
  seq,
  createdAt: 1,
  updatedAt: seq,
  parentId: null,
})
const makeGoal = (id: string, status: ThreadGoal['status'] = 'active'): ThreadGoal => ({
  threadId: id,
  goalId: `goal-${id}`,
  objective: 'Objective',
  status,
  tokenBudget: null,
  tokensUsed: 0,
  timeUsedSeconds: 0,
  createdAt: 1,
  updatedAt: 1,
})
type Stage =
  | 'capture'
  | 'modeRead'
  | 'permission'
  | 'goalRead'
  | 'goalWrite'
  | 'runWrite'
  | 'modelWrite'
  | 'planWrite'
  | 'latestModel'
type ReceiptMode = 'normal' | 'missing' | 'foreign' | 'key' | 'field' | 'revision' | 'read-failed'

function fixture() {
  const local = new CommandRegistry()
  let disposed = false
  let runActive = false
  const navigation = createState<NavigationState>(
    { workspaceId: 'w', sessionId: null, status: 'idle', error: null },
    () => {},
  )
  const directory = createState<DirectoryState>(
    { workspaces: {}, sessions: { a: session('a'), b: session('b') } },
    () => {},
  )
  const subscribers = new Set<(facts: readonly Session[]) => void>()
  const access = createSessionExecutionAccess({
    navigation: navigation.reader,
    directory: directory.reader,
    onSubscriberError: () => {},
    subscribeConfirmedSessions: (listener) => {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
  })
  const basePreparation = createSessionExecutionPreparation({
    access,
    directory: directory.reader,
    isDisposed: () => disposed,
    readSession: () => Promise.reject(new Error('All fixture targets are canonical')),
  })
  const waits = new Map<
    Stage,
    { entered: ReturnType<typeof Promise.withResolvers<void>>; release: ReturnType<typeof Promise.withResolvers<void>> }
  >()
  const allWaits: ReturnType<typeof Promise.withResolvers<void>>[] = []
  const pause = async (stage: Stage) => {
    const wait = waits.get(stage)
    if (!wait) return
    waits.delete(stage)
    wait.entered.resolve()
    await wait.release.promise
  }
  const flags: {
    captureError: string | null
    goalError: string | null
    runError: string | null
    modelError: string | null
    modeError: string | null
    latestError: string | null
    receipt: ReceiptMode
  } = {
    captureError: null,
    goalError: null,
    runError: null,
    modelError: null,
    modeError: null,
    latestError: null,
    receipt: 'normal',
  }
  const preparation = {
    async capture(sessionId: string, signal?: AbortSignal) {
      const target = await basePreparation.capture(sessionId, signal)
      await pause('capture')
      if (flags.captureError) throw new CommandError(flags.captureError, 'Fixture preparation read failed')
      return target
    },
    assertCanPrepare: basePreparation.assertCanPrepare,
  }
  const writes: { name: string; sessionId: string; key?: string | undefined }[] = []
  const modelReads: { name: string; sessionId: string; key?: string | undefined }[] = []
  let permissions = 0
  const permissionSettles: string[] = []
  const goalValues = new Map<string, GoalPlanSnapshot>()
  const goalValue = (id: string): GoalPlanSnapshot =>
    goalValues.get(id) ?? { sessionId: id, goal: null, goalSeq: 0, remainingTokens: null, plan: null, planSeq: 0 }
  const setGoal = (id: string, goal: ThreadGoal | null) => {
    const old = goalValue(id)
    goalValues.set(id, { ...old, goal, goalSeq: old.goalSeq + 1 })
  }
  const goals: GoalPlanWorkspacePort = {
    async snapshot(id) {
      const value = goalValue(id)
      await pause('goalRead')
      return value
    },
    async execute(name, raw) {
      if (name === 'goal.create') {
        const input = goalPlanCommands[name].input.parse(raw)
        writes.push({ name, sessionId: input.sessionId })
        setGoal(input.sessionId, { ...makeGoal(input.sessionId), objective: input.objective })
        await pause('goalWrite')
        if (flags.goalError) throw new CommandError(flags.goalError, 'Fixture lost Goal acknowledgement')
        return { goal: goalValue(input.sessionId).goal, remainingTokens: null }
      }
      if (name === 'goal.set') {
        const input = goalPlanCommands[name].input.parse(raw)
        const before = goalValue(input.sessionId).goal
        if (!before || before.goalId !== input.expectedGoalId) throw new CommandError('GOAL_CONFLICT', 'Wrong Goal')
        writes.push({ name, sessionId: input.sessionId })
        setGoal(input.sessionId, { ...before, status: input.status ?? before.status })
        await pause('goalWrite')
        if (flags.goalError) throw new CommandError(flags.goalError, 'Fixture lost control acknowledgement')
        return { goal: goalValue(input.sessionId).goal, remainingTokens: null }
      }
      if (name === 'goal.clear') {
        const input = goalPlanCommands[name].input.parse(raw)
        writes.push({ name, sessionId: input.sessionId })
        setGoal(input.sessionId, null)
        return { cleared: true }
      }
      throw new Error(`Unexpected Goal command ${name}`)
    },
  }
  const runReceipts = new Map<string, RunAccepted>()
  const composer = createComposerIntent(local, {
    goals,
    navigation: navigation.reader,
    preparation,
    onSubscriberError: () => {},
    refreshMode: async () => {
      await pause('modeRead')
      return 'default'
    },
    permissions: {
      async prepareComposerSubmission(id) {
        permissions++
        await pause('permission')
        return { token: 'permission', sessionId: id, revision: 0, choice: 'inherit', approval: 'ask' }
      },
      settleSubmission(_capture: ComposerPermissionSubmission, outcome) {
        permissionSettles.push(outcome)
        return true
      },
    },
    async executeRun(name, raw, execution?: ExecuteOptions) {
      const input = submitRunInputSchema.parse(raw)
      const key = execution?.idempotencyKey
      if (!key) throw new Error('Missing original Run key')
      writes.push({ name, sessionId: input.sessionId, key })
      const receipt = runAcceptedSchema.parse({
        status: 'accepted',
        commandId: 'run.submit',
        commandVersion: 1,
        requestId: 'request',
        idempotencyKey: key,
        sessionId: input.sessionId,
        operationId: `run-${writes.length}`,
        acceptedAt: 1,
      })
      runReceipts.set(input.sessionId, receipt)
      await pause('runWrite')
      if (flags.runError) throw new CommandError(flags.runError, 'Fixture lost Run receipt')
      return receipt
    },
    reconcileRun: (id) => Promise.resolve(runReceipts.get(id) ?? null),
  })
  const configurations = new Map<string, ModelConfiguration>(
    ['a', 'b'].map((id) => [
      id,
      {
        sessionId: id,
        status: 'configured',
        modelId: models[0]?.id ?? null,
        model: models[0] ?? null,
        thinkingLevel: 'low',
        revisions: { 'settings:global': 0, 'settings:workspace:w': 0, [`settings:session:${id}`]: 1 },
        sources: { model: 'global', thinkingLevel: 'global' },
      },
    ]),
  )
  const receipts = new Map<string, ModelReceipt>()
  const modelPort = {
    async execute(name: string, raw: unknown, execution?: ExecuteOptions): Promise<unknown> {
      if (name === 'model.list') return models
      if (name === 'session.getModel') {
        const input = modelCommands[name].input.parse(raw)
        modelReads.push({ name, sessionId: input.sessionId })
        const value = structuredClone(configurations.get(input.sessionId))
        await pause('latestModel')
        if (flags.latestError) throw new CommandError(flags.latestError, 'Fixture latest read failed')
        return value
      }
      if (name === 'session.getModelReceipt') {
        const input = modelCommands[name].input.parse(raw)
        modelReads.push({ name, sessionId: input.sessionId, key: input.idempotencyKey })
        const receipt = receipts.get(input.idempotencyKey)
        if (!receipt || flags.receipt === 'missing') return null
        if (flags.receipt === 'read-failed') throw new CommandError('TIMEOUT', 'Receipt read failed')
        return flags.receipt === 'foreign'
          ? { ...receipt, sessionId: 'b' }
          : flags.receipt === 'key'
            ? { ...receipt, idempotencyKey: 'different' }
            : flags.receipt === 'field'
              ? { ...receipt, thinkingLevel: 'low' }
              : flags.receipt === 'revision'
                ? { ...receipt, revisions: { ...receipt.revisions, 'settings:global': 2 } }
                : receipt
      }
      if (name !== 'session.setModel' && name !== 'session.setThinkingLevel')
        throw new Error(`Unexpected Model command ${name}`)
      const input = modelCommands[name].input.parse(raw)
      const before = configurations.get(input.sessionId)
      const key = execution?.idempotencyKey
      if (!before || !key) throw new Error('Missing Model target/key')
      writes.push({ name, sessionId: input.sessionId, key })
      const layer = `settings:session:${input.sessionId}`
      const revision = (before.revisions[layer] ?? 0) + 1
      const selected = 'modelId' in input ? models.find((item) => item.id === input.modelId) : before.model
      const value: ModelConfiguration = {
        ...before,
        model: selected ?? null,
        modelId: selected?.id ?? null,
        thinkingLevel: 'thinkingLevel' in input ? input.thinkingLevel : 'low',
        revisions: { ...before.revisions, [layer]: revision },
      }
      configurations.set(input.sessionId, value)
      const receipt: ModelReceipt = {
        sessionId: input.sessionId,
        idempotencyKey: key,
        commitId: key,
        revision,
        modelId: value.modelId,
        thinkingLevel: value.thinkingLevel,
        revisions: value.revisions,
      }
      receipts.set(key, receipt)
      await pause('modelWrite')
      if (flags.modelError) throw new CommandError(flags.modelError, 'Fixture lost Model acknowledgement')
      return { ...value, commitId: key, revision }
    },
  }
  const projection = createState<SessionControlsState>(
    {
      sessionId: null,
      status: 'ready',
      model: null,
      usage: null,
      budget: null,
      errors: { model: null, usage: null, budget: null },
    },
    () => {},
  )
  let modelGeneration = 0
  const invalidateModels = () => {
    modelGeneration += 1
    projection.replace({ ...projection.reader.getSnapshot(), model: null })
  }
  const commitModel = (model: ModelConfiguration, expectedGeneration = modelGeneration) => {
    if (navigation.reader.getSnapshot().sessionId !== model.sessionId || expectedGeneration !== modelGeneration)
      return false
    const previous = projection.reader.getSnapshot().model
    if (
      previous &&
      Object.entries(previous.revisions).some(([key, revision]) => revision > (model.revisions[key] ?? 0))
    )
      return false
    modelGeneration += 1
    projection.replace({ ...projection.reader.getSnapshot(), sessionId: model.sessionId, model })
    return true
  }
  const model = createComposerModel(
    local,
    modelPort,
    navigation.reader,
    {
      reader: projection.reader,
      refreshModel: async (id, execution) => {
        const value = modelCommands['session.getModel'].output.parse(
          await modelPort.execute('session.getModel', { sessionId: id }, execution),
        )
        commitModel(value)
      },
      readModel: async (id, execution) =>
        modelCommands['session.getModel'].output.parse(
          await modelPort.execute('session.getModel', { sessionId: id }, execution),
        ),
      commitModel,
      captureModelGeneration: () => modelGeneration,
      invalidateModels,
      setConnected: () => invalidateModels(),
    },
    () => {},
    () => disposed,
    preparation,
    (sessionId) => sessionId === 'a' && runActive,
  )
  const modeValues = new Map<string, 'default' | 'plan'>([
    ['a', 'default'],
    ['b', 'default'],
  ])
  const mode = createComposerPlanMode(local, {
    navigation: navigation.reader,
    preparation,
    isSubmissionLocked: () => false,
    onSubscriberError: () => {},
    configuration: {
      async execute(name, raw, execution) {
        if (name === 'mode.get') {
          const input = configurationCommands[name].input.parse(raw)
          return { mode: modeValues.get(input.sessionId) }
        }
        if (name !== 'mode.set') throw new Error('Unexpected mode command')
        const input = configurationCommands[name].input.parse(raw)
        writes.push({ name, sessionId: input.sessionId, key: execution?.idempotencyKey })
        modeValues.set(input.sessionId, input.mode)
        await pause('planWrite')
        if (flags.modeError) throw new CommandError(flags.modeError, 'Fixture lost Plan acknowledgement')
        return { mode: input.mode }
      },
    },
  })
  const select = (id: string) => {
    navigation.replace({ workspaceId: 'w', sessionId: id, status: 'idle', error: null })
    const value = configurations.get(id)
    if (value) projection.replace({ ...projection.reader.getSnapshot(), sessionId: id, model: value })
  }
  const observe = (id: string, archived: boolean) => {
    const before = directory.reader.getSnapshot()
    const prior = before.sessions[id]
    if (!prior) throw new Error('Missing fixture Session')
    const fact = session(id, archived, prior.seq + 1)
    directory.replace({ ...before, sessions: { ...before.sessions, [id]: fact } })
    for (const listener of subscribers) listener([fact])
  }
  return {
    local,
    access,
    model,
    mode,
    composer,
    configurations,
    modelReads,
    writes,
    flags,
    permissionSettles,
    modeValues,
    permissions: () => permissions,
    projected: () => projection.reader.getSnapshot().model,
    setRunActive: (value: boolean) => {
      runActive = value
    },
    select,
    archive: (id = 'a') => observe(id, true),
    restore: (id = 'a') => observe(id, false),
    setGoal,
    block(stage: Stage) {
      const value = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
      waits.set(stage, value)
      allWaits.push(value.release)
      return value
    },
    async ready() {
      select('a')
      await local.execute('composerIntent.refresh', { sessionId: 'a' })
      await local.execute('composerModel.refresh', { sessionId: 'a' })
      for (let attempt = 0; attempt < 200; attempt++) {
        if (mode.reader.getSnapshot().entries.a?.status === 'ready') return
        await Bun.sleep(1)
      }
      throw new Error('Fixture mode did not settle')
    },
    intent: (intent: 'goal' | 'default' | 'plan', id = 'a') =>
      local.execute('composerIntent.setIntent', { sessionId: id, intent }),
    submit: (id = 'a') =>
      local.execute('composerIntent.submit', {
        sessionId: id,
        modelId: 'fixture/one',
        input: { text: 'Objective', images: [] },
      }),
    setMode: (id = 'a') =>
      local.execute('composerPlanMode.setMode', {
        sessionId: id,
        mode: 'plan',
        expectedRevision: mode.reader.getSnapshot().entries[id]?.revision ?? 0,
      }),
    dispose() {
      disposed = true
      for (const wait of allWaits) wait.resolve()
      model.dispose()
      mode.dispose()
      composer.dispose()
      access.dispose()
      navigation.dispose()
      directory.dispose()
      projection.dispose()
      local.dispose()
    },
  }
}

test('accepted archive blocks new Goal/Plan intent and every configuration write but leaves default dismissal and reads available', async () => {
  const f = fixture()
  try {
    await f.ready()
    f.archive()
    for (const intent of ['goal', 'plan'] as const)
      await expect(f.intent(intent)).rejects.toMatchObject({ code: 'ARCHIVED' })
    await f.intent('default')
    await expect(f.submit()).rejects.toMatchObject({ code: 'ARCHIVED' })
    await expect(
      f.local.execute('composerModel.selectModel', { sessionId: 'a', modelId: 'fixture/two' }),
    ).rejects.toMatchObject({ code: 'ARCHIVED' })
    await expect(
      f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'ARCHIVED' })
    await expect(f.setMode()).rejects.toMatchObject({ code: 'ARCHIVED' })
    await f.local.execute('composerIntent.refresh', { sessionId: 'a' })
    await f.local.execute('composerModel.refresh', { sessionId: 'a' })
    await f.local.execute('composerPlanMode.refresh', { sessionId: 'a' })
    expect(f.permissions()).toBe(0)
    expect(f.writes).toEqual([])
  } finally {
    f.dispose()
  }
})

for (const stage of ['capture', 'modeRead', 'permission', 'goalRead'] as const)
  test(`archive observed during ${stage} blocks dispatch without creating a Goal or Run`, async () => {
    const f = fixture()
    try {
      await f.ready()
      await f.intent('goal')
      const gate = f.block(stage)
      const attempt = f.submit().catch((error: unknown) => error)
      await gate.entered.promise
      f.archive()
      gate.release.resolve()
      expect(await attempt).toMatchObject({ code: 'ARCHIVED' })
      expect(f.writes).toEqual([])
      expect(f.permissions()).toBe(stage === 'permission' || stage === 'goalRead' ? 1 : 0)
    } finally {
      f.dispose()
    }
  })

test('already-dispatched Goal ACK is recorded before archive prevents its Run, preserving a partial operation', async () => {
  const f = fixture()
  try {
    await f.ready()
    await f.intent('goal')
    const gate = f.block('goalWrite')
    const attempt = f.submit().catch((error: unknown) => error)
    await gate.entered.promise
    f.archive()
    gate.release.resolve()
    expect(await attempt).toMatchObject({ code: 'ARCHIVED' })
    expect(f.writes.map((write) => write.name)).toEqual(['goal.create'])
    expect(f.composer.reader.getSnapshot().entries.a?.submission).toMatchObject({
      status: 'partial',
      phase: 'run',
      preparedGoalId: 'goal-a',
      error: 'ARCHIVED',
    })
    expect(f.permissionSettles).toEqual(['failed'])
  } finally {
    f.dispose()
  }
})

test('already-dispatched Goal unknown recovers only by reading its original Goal, never sends after archive', async () => {
  const f = fixture()
  try {
    await f.ready()
    await f.intent('goal')
    f.flags.goalError = 'RESULT_UNKNOWN'
    await expect(f.submit()).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    f.archive()
    await f.local.execute('composerIntent.reconcile', { sessionId: 'a' })
    expect(f.composer.reader.getSnapshot().entries.a?.submission).toMatchObject({
      status: 'partial',
      preparedGoalId: 'goal-a',
    })
    expect(f.writes.map((write) => write.name)).toEqual(['goal.create'])
    await expect(f.submit()).rejects.toMatchObject({ code: 'ARCHIVED' })
    expect(f.writes).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('original Run receipt settles after dispatch/archive/navigation without retargeting B or sending again', async () => {
  const f = fixture()
  try {
    await f.ready()
    const gate = f.block('runWrite')
    const attempt = f.submit()
    await gate.entered.promise
    f.archive()
    f.select('b')
    gate.release.resolve()
    expect(await attempt).toMatchObject({ sessionId: 'a' })
    expect(f.composer.reader.getSnapshot().entries.a?.submission.status).toBe('idle')
    expect(f.writes.map(({ name, sessionId }) => [name, sessionId])).toEqual([['run.submit', 'a']])
    expect(f.permissionSettles).toEqual(['accepted'])
  } finally {
    f.dispose()
  }
})

test('unknown original Run still reads its receipt after archive without a new permission capture or Run', async () => {
  const f = fixture()
  try {
    await f.ready()
    f.flags.runError = 'RESULT_UNKNOWN'
    await expect(f.submit()).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    f.archive()
    await f.local.execute('composerIntent.reconcile', { sessionId: 'a' })
    expect(f.composer.reader.getSnapshot().entries.a?.submission.status).toBe('idle')
    expect(f.writes).toHaveLength(1)
    expect(f.permissions()).toBe(1)
  } finally {
    f.dispose()
  }
})

test('resume is guarded but exact Goal pause/clear and unknown control read recovery remain legal', async () => {
  const f = fixture()
  try {
    await f.ready()
    f.setGoal('a', makeGoal('a', 'paused'))
    f.archive()
    await expect(
      f.local.execute('composerIntent.controlGoal', { sessionId: 'a', expectedGoalId: 'goal-a', action: 'resume' }),
    ).rejects.toMatchObject({ code: 'ARCHIVED' })
    expect(f.composer.reader.getSnapshot().entries.a?.goalAction.status).toBe('failed')
    f.flags.goalError = 'RESULT_UNKNOWN'
    await expect(
      f.local.execute('composerIntent.controlGoal', { sessionId: 'a', expectedGoalId: 'goal-a', action: 'pause' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await f.local.execute('composerIntent.reconcile', { sessionId: 'a' })
    f.flags.goalError = null
    await f.local.execute('composerIntent.controlGoal', { sessionId: 'a', expectedGoalId: 'goal-a', action: 'clear' })
    expect(f.writes.map((write) => write.name)).toEqual(['goal.set', 'goal.clear'])
  } finally {
    f.dispose()
  }
})

for (const owner of ['model', 'plan', 'resume'] as const)
  test(`${owner} preparation TIMEOUT before dispatch is failed, never an uncertain write`, async () => {
    const f = fixture()
    try {
      await f.ready()
      f.flags.captureError = 'TIMEOUT'
      f.setGoal('a', makeGoal('a', 'paused'))
      const work =
        owner === 'model'
          ? f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' })
          : owner === 'plan'
            ? f.setMode()
            : f.local.execute('composerIntent.controlGoal', {
                sessionId: 'a',
                expectedGoalId: 'goal-a',
                action: 'resume',
              })
      await expect(work).rejects.toMatchObject({ code: 'TIMEOUT' })
      const status =
        owner === 'model'
          ? f.model.reader.getSnapshot().action.status
          : owner === 'plan'
            ? f.mode.reader.getSnapshot().entries.a?.status
            : f.composer.reader.getSnapshot().entries.a?.goalAction.status
      expect(status).toBe('failed')
      expect(f.writes).toEqual([])
    } finally {
      f.dispose()
    }
  })

for (const owner of ['model', 'plan'] as const)
  test(`${owner} cancelled while captured preparation is awaiting cannot dispatch or claim an unknown write`, async () => {
    const f = fixture()
    try {
      await f.ready()
      const gate = f.block('capture')
      const controller = new AbortController()
      const attempt =
        owner === 'model'
          ? f.local.execute(
              'composerModel.selectThinking',
              { sessionId: 'a', thinkingLevel: 'high' },
              { signal: controller.signal },
            )
          : f.local.execute(
              'composerPlanMode.setMode',
              { sessionId: 'a', mode: 'plan', expectedRevision: f.mode.reader.getSnapshot().entries.a?.revision ?? 0 },
              { signal: controller.signal },
            )
      const settled = attempt.catch((error: unknown) => error)
      await gate.entered.promise
      controller.abort()
      gate.release.resolve()
      // Registry cancellation conservatively rejects application commands as unknown;
      // this owner's settled projection knows it never dispatched a Host write.
      expect(await settled).toMatchObject({ code: 'RESULT_UNKNOWN' })
      const status = () =>
        owner === 'model' ? f.model.reader.getSnapshot().action.status : f.mode.reader.getSnapshot().entries.a?.status
      for (let attempt = 0; attempt < 20 && (status() === 'submitting' || status() === 'pending'); attempt++)
        await Bun.sleep(1)
      expect(status()).toBe('failed')
      expect(f.writes).toEqual([])
    } finally {
      f.dispose()
    }
  })

test('active Run blocks model and thinking changes without blocking catalog reads or later selection', async () => {
  const f = fixture()
  try {
    await f.ready()
    f.setRunActive(true)
    await expect(
      f.local.execute('composerModel.selectModel', { sessionId: 'a', modelId: 'fixture/two' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await f.local.execute('composerModel.refresh', { sessionId: 'a' })
    expect(f.writes).toEqual([])
    f.setRunActive(false)
    await f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' })
    expect(f.writes).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('a Run starting during model preparation prevents dispatching the configuration write', async () => {
  const f = fixture()
  try {
    await f.ready()
    const gate = f.block('capture')
    const attempt = f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' })
    const rejected = attempt.catch((error: unknown) => error)
    await gate.entered.promise
    f.setRunActive(true)
    gate.release.resolve()
    expect(await rejected).toMatchObject({ code: 'BUSY' })
    expect(f.writes).toEqual([])
    expect(f.model.reader.getSnapshot().action).toMatchObject({ status: 'failed', error: 'BUSY' })
  } finally {
    f.dispose()
  }
})

test('an unknown model receipt remains read-only recoverable during an active Run', async () => {
  const f = fixture()
  try {
    await f.ready()
    f.flags.modelError = 'RESULT_UNKNOWN'
    await expect(
      f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    f.setRunActive(true)
    await f.local.execute('composerModel.reconcile', { sessionId: 'a' })
    expect(f.writes).toHaveLength(1)
    expect(f.modelReads.at(-1)?.name).toBe('session.getModel')
    expect(f.model.reader.getSnapshot().action.status).toBe('idle')
  } finally {
    f.dispose()
  }
})

test('model preparation is single-flight; archive or a changed selection cannot start an old configuration write', async () => {
  const f = fixture()
  try {
    await f.ready()
    const gate = f.block('capture')
    const attempt = f.local
      .execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' })
      .catch((error: unknown) => error)
    await gate.entered.promise
    await expect(
      f.local.execute('composerModel.selectModel', { sessionId: 'a', modelId: 'fixture/two' }),
    ).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
    f.select('b')
    gate.release.resolve()
    expect(await attempt).toMatchObject({ code: 'STALE_TARGET' })
    expect(f.writes).toEqual([])
    expect(f.model.reader.getSnapshot().sessionId).toBe('b')
  } finally {
    f.dispose()
  }
})

test('late model ACK remains on original A and cannot change B while accepted archive blocks only A', async () => {
  const f = fixture()
  try {
    await f.ready()
    const gate = f.block('modelWrite')
    const attempt = f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' })
    await gate.entered.promise
    f.archive()
    f.select('b')
    gate.release.resolve()
    await attempt
    expect(f.projected()).toMatchObject({ sessionId: 'b', thinkingLevel: 'low' })
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0]?.sessionId).toBe('a')
    await f.local.execute('composerModel.selectThinking', { sessionId: 'b', thinkingLevel: 'high' })
    expect(f.writes[1]?.sessionId).toBe('b')
  } finally {
    f.dispose()
  }
})

for (const receipt of ['missing', 'foreign', 'key', 'field', 'revision', 'read-failed'] as const)
  test(`model ${receipt} receipt stays unknown after archive and never replays a configuration write`, async () => {
    const f = fixture()
    try {
      await f.ready()
      f.flags.modelError = 'RESULT_UNKNOWN'
      await expect(
        f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' }),
      ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
      f.archive()
      f.flags.receipt = receipt
      await expect(f.local.execute('composerModel.reconcile', { sessionId: 'a' })).rejects.toMatchObject({
        code: 'RESULT_UNKNOWN',
      })
      expect(f.model.reader.getSnapshot().action.status).toBe('unknown')
      expect(f.writes).toHaveLength(1)
      expect(f.modelReads.at(-1)).toMatchObject({ name: 'session.getModelReceipt', key: f.writes[0]?.key })
    } finally {
      f.dispose()
    }
  })

test('model receipt recovery reads current configuration rather than rolling back to historical values; failed latest reads stay unknown', async () => {
  const f = fixture()
  try {
    await f.ready()
    f.flags.modelError = 'RESULT_UNKNOWN'
    await expect(
      f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    f.archive()
    f.flags.latestError = 'DISCONNECTED'
    await expect(f.local.execute('composerModel.reconcile', { sessionId: 'a' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(f.model.reader.getSnapshot().action.status).toBe('unknown')
    const before = f.configurations.get('a')
    if (!before) throw new Error('Fixture Model disappeared')
    f.configurations.set('a', {
      ...before,
      thinkingLevel: 'low',
      revisions: { ...before.revisions, 'settings:session:a': 3 },
    })
    f.flags.latestError = null
    await f.local.execute('composerModel.reconcile', { sessionId: 'a' })
    expect(f.projected()).toMatchObject({ thinkingLevel: 'low', revisions: { 'settings:session:a': 3 } })
    expect(f.model.reader.getSnapshot().action.status).toBe('idle')
    expect(f.writes).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('model recovery cannot confirm a current model read older than the committed receipt', async () => {
  const f = fixture()
  try {
    await f.ready()
    f.flags.modelError = 'RESULT_UNKNOWN'
    await expect(
      f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    const committed = f.configurations.get('a')
    if (!committed) throw new Error('Fixture Model disappeared')
    f.configurations.set('a', {
      ...committed,
      thinkingLevel: 'low',
      revisions: { ...committed.revisions, 'settings:session:a': 1 },
    })
    await expect(f.local.execute('composerModel.reconcile', { sessionId: 'a' })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(f.model.reader.getSnapshot().action.status).toBe('unknown')
    expect(f.writes).toHaveLength(1)
    f.configurations.set('a', committed)
    await f.local.execute('composerModel.reconcile', { sessionId: 'a' })
    expect(f.projected()).toMatchObject({ thinkingLevel: 'high', revisions: { 'settings:session:a': 2 } })
  } finally {
    f.dispose()
  }
})

test('a late original model receipt read cannot publish into B and disposal keeps it uncertain without a write', async () => {
  const f = fixture()
  try {
    await f.ready()
    f.flags.modelError = 'RESULT_UNKNOWN'
    await expect(
      f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    const gate = f.block('latestModel')
    const recovery = f.local.execute('composerModel.reconcile', { sessionId: 'a' })
    await gate.entered.promise
    f.select('b')
    gate.release.resolve()
    await recovery
    expect(f.projected()).toMatchObject({ sessionId: 'b', thinkingLevel: 'low' })
    expect(f.model.reader.getSnapshot().action.status).toBe('idle')
    expect(f.writes).toHaveLength(1)

    f.select('a')
    const another = f.local.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' })
    await expect(another).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    const lastGate = f.block('latestModel')
    const interrupted = f.local.execute('composerModel.reconcile', { sessionId: 'a' }).catch((error: unknown) => error)
    await lastGate.entered.promise
    const before = f.model.reader.getSnapshot()
    f.dispose()
    lastGate.release.resolve()
    expect(await interrupted).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.model.reader.getSnapshot()).toBe(before)
    expect(f.writes).toHaveLength(2)
  } finally {
    f.dispose()
  }
})

test('Plan pre-dispatch archive writes nothing; an already-dispatched unknown is still reconciled only by mode.get', async () => {
  const f = fixture()
  try {
    await f.ready()
    const gate = f.block('capture')
    const attempt = f.setMode().catch((error: unknown) => error)
    await gate.entered.promise
    f.archive()
    gate.release.resolve()
    expect(await attempt).toMatchObject({ code: 'ARCHIVED' })
    expect(f.writes).toEqual([])
    f.restore()
    await f.local.execute('composerPlanMode.refresh', { sessionId: 'a' })
    f.flags.modeError = 'RESULT_UNKNOWN'
    await expect(f.setMode()).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    f.archive()
    await f.local.execute('composerPlanMode.reconcile', { sessionId: 'a' })
    expect(f.mode.reader.getSnapshot().entries.a).toMatchObject({ status: 'ready', mode: 'plan' })
    expect(f.writes.map((write) => write.name)).toEqual(['mode.set'])
  } finally {
    f.dispose()
  }
})

test('a late Plan ACK stays with original A after archive/navigation, never alters B', async () => {
  const f = fixture()
  try {
    await f.ready()
    const gate = f.block('planWrite')
    const attempt = f.setMode()
    await gate.entered.promise
    f.archive()
    f.select('b')
    gate.release.resolve()
    await attempt
    expect(f.mode.reader.getSnapshot().entries.a).toMatchObject({ status: 'ready', mode: 'plan' })
    expect(f.modeValues.get('b')).toBe('default')
    expect(f.writes[0]?.sessionId).toBe('a')
  } finally {
    f.dispose()
  }
})
