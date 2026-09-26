import { CommandError, type CommandExecutor, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { interactionDraftCommands } from '@hbar/contracts/commands/interaction-draft'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import { questionnaireFact } from './interaction-presentations'
import { interactionRecoveryCommands, readInteractionResolution } from './interaction-recovery'
import type { StateReader } from './state'
import { createState } from './state'
import type {
  InteractionActionState,
  InteractionState,
  InteractionRecoveryPort,
  QuestionnaireDraftsState,
  QuestionnaireDraftState,
  SessionTimelineState,
} from './types'

const MAX_ACTIONS = 100
const UNKNOWN_CODES = new Set([
  'RESULT_UNKNOWN',
  'TIMEOUT',
  'TIMED_OUT',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'CANCELLED',
  'INVALID_OUTPUT',
  'EXECUTION_FAILED',
])

function key(name: string, input: unknown): string {
  const value = input as Record<string, unknown>
  if ((name === 'approval.resolve' || name === 'planExit.resolve') && typeof value.approvalId === 'string')
    return `approval:${value.approvalId}`
  if (name === 'questionnaire.answer' && typeof value.requestId === 'string') return `questionnaire:${value.requestId}`
  throw new CommandError('INVALID_INPUT', 'Interaction target is missing')
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return 'EXECUTION_FAILED'
}

export function createInteractions(
  local: CommandRegistry,
  port: CommandExecutor | undefined,
  timeline: StateReader<SessionTimelineState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
  recovery?: InteractionRecoveryPort,
) {
  const state = createState<InteractionState>({}, onSubscriberError)
  const questionnaires = createState<QuestionnaireDraftsState>({}, onSubscriberError)

  const replace = (id: string, action: InteractionActionState) => {
    if (isDisposed()) return
    const current = state.reader.getSnapshot()
    const next: Record<string, InteractionActionState> = { ...current }
    if (!next[id] && Object.keys(next).length >= MAX_ACTIONS) {
      const settled = Object.entries(next).find(([, item]) => ['failed', 'succeeded'].includes(item.status))
      if (!settled) throw new CommandError('BUSY', 'Too many interaction actions are pending')
      delete next[settled[0]]
    }
    next[id] = action
    state.replace(next)
  }
  const reconcile = () => {
    const current = state.reader.getSnapshot()
    const session = timeline.getSnapshot()
    let changed = false
    const next: Record<string, InteractionActionState> = { ...current }
    for (const request of session.userInputs) {
      if (request.sessionId !== session.sessionId || next[`questionnaire:${request.requestId}`]) continue
      if (Object.keys(next).length >= MAX_ACTIONS) {
        const settled = Object.entries(next).find(([, action]) => action.resolution)
        if (!settled) continue
        delete next[settled[0]]
      }
      const id = `questionnaire:${request.requestId}`
      next[id] = {
        id,
        kind: 'questionnaire',
        sessionId: request.sessionId,
        targetId: request.requestId,
        request,
        startCursor: session.cursor,
        status: 'idle',
        error: null,
      }
      changed = true
    }
    for (const [id, action] of Object.entries(next)) {
      if (action.sessionId !== session.sessionId || action.resolution) continue
      const approval =
        action.kind === 'approval'
          ? session.approvals.find(
              (value) =>
                value.sessionId === action.sessionId &&
                value.id === action.targetId &&
                (!action.approval ||
                  (value.runId === action.approval.runId &&
                    value.callId === action.approval.callId &&
                    value.tool === action.approval.tool)),
            )
          : undefined
      const question = action.request ? questionnaireFact(action.request, session.messages, session.events) : null
      const resolution: InteractionActionState['resolution'] =
        approval && approval.status !== 'pending'
          ? { kind: 'approval', status: approval.status }
          : question
            ? { kind: 'questionnaire', status: question.status }
            : undefined
      if (resolution) {
        next[id] = { ...action, status: 'succeeded', error: null, resolution }
        changed = true
      }
    }
    if (changed) state.replace(next)
  }
  const unsubscribe = timeline.subscribe(reconcile)
  reconcile()

  const questionnaire = (requestId: string): QuestionnaireDraftState | undefined =>
    questionnaires.reader.getSnapshot()[requestId]
  const replaceQuestionnaire = (requestId: string, value: QuestionnaireDraftState | null) => {
    if (isDisposed()) return
    const current = questionnaires.reader.getSnapshot()
    const next: Record<string, QuestionnaireDraftState> = { ...current }
    if (value) {
      if (!next[requestId] && Object.keys(next).length >= 40)
        throw new CommandError('BUSY', 'Too many questionnaire drafts are open')
      next[requestId] = value
    } else delete next[requestId]
    questionnaires.replace(next)
  }
  local.register(
    interactionDraftCommands['questionnaire.setAnswer'],
    ({ sessionId, requestId, questionId, answer, expectedRevision }) => {
      const action = state.reader.getSnapshot()[`questionnaire:${requestId}`]
      if (action?.sessionId === sessionId && ['submitting', 'unknown', 'succeeded'].includes(action.status))
        throw new CommandError('BUSY', 'The questionnaire response is already pending or confirmed')
      const request = timeline
        .getSnapshot()
        .userInputs.find((item) => item.sessionId === sessionId && item.requestId === requestId)
      if (!request || !request.questions.some((question) => question.id === questionId))
        throw new CommandError('INVALID_INPUT', 'Questionnaire request or question is unavailable')
      const current = questionnaire(requestId) ?? { sessionId, requestId, revision: 0, answers: {} }
      if (current.sessionId !== sessionId)
        throw new CommandError('INVALID_INPUT', 'Questionnaire draft belongs to another session')
      if (expectedRevision !== undefined && expectedRevision !== current.revision)
        throw new CommandError('VERSION_CONFLICT', 'Questionnaire answers changed before this edit')
      const next = {
        ...current,
        request,
        revision: current.revision + 1,
        answers: { ...current.answers, [questionId]: { ...answer } },
      }
      replaceQuestionnaire(requestId, next)
      return { requestId, revision: next.revision }
    },
  )
  local.register(interactionDraftCommands['questionnaire.resetAnswers'], ({ sessionId, requestId }) => {
    const action = state.reader.getSnapshot()[`questionnaire:${requestId}`]
    if (action?.sessionId === sessionId && ['submitting', 'unknown', 'succeeded'].includes(action.status))
      throw new CommandError('BUSY', 'The questionnaire response is already pending or confirmed')
    const current = questionnaire(requestId)
    if (current && current.sessionId !== sessionId)
      throw new CommandError('INVALID_INPUT', 'Questionnaire draft belongs to another session')
    const revision = (current?.revision ?? 0) + 1
    replaceQuestionnaire(requestId, {
      sessionId,
      requestId,
      revision,
      answers: {},
      ...(current?.request ? { request: current.request } : {}),
    })
    return { requestId, revision }
  })

  const offQuestionnaires = timeline.subscribe(() => {
    const current = timeline.getSnapshot()
    const active = new Set(current.userInputs.map((request) => request.requestId))
    const drafts = questionnaires.reader.getSnapshot()
    const retained = Object.entries(drafts).filter(([requestId, draft]) => {
      if (draft.sessionId !== current.sessionId || active.has(requestId)) return true
      const action = state.reader.getSnapshot()[`questionnaire:${requestId}`]
      if (draft.request && questionnaireFact(draft.request, current.messages, current.events)) return false
      return action?.sessionId !== draft.sessionId || (action.status !== 'succeeded' && !action.resolution)
    })
    if (retained.length !== Object.keys(drafts).length) questionnaires.replace(Object.fromEntries(retained))
  })

  local.register(interactionRecoveryCommands['interaction.reconcile'], async ({ sessionId, actionId }) => {
    const original = state.reader.getSnapshot()[actionId]
    if (!original || original.sessionId !== sessionId)
      throw new CommandError('STALE_TARGET', 'The original interaction is unavailable')
    if (original.resolution) return { confirmed: true }
    if (original.status === 'submitting' || original.reconciling)
      throw new CommandError('BUSY', 'The interaction is already pending or being checked')
    if (!recovery) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Interaction history checking is unavailable')
    replace(actionId, { ...original, reconciling: true })
    try {
      const fact = await readInteractionResolution(original, recovery)
      const current = state.reader.getSnapshot()[actionId]
      if (isDisposed() || !current || current.sessionId !== sessionId || current.startCursor !== original.startCursor)
        return { confirmed: false }
      if (current.resolution) return { confirmed: true }
      if (!fact) return { confirmed: false }
      replace(actionId, {
        ...current,
        status: 'succeeded',
        error: null,
        resolution: fact.resolution,
        ...(fact.questionnaire ? { questionnaireFact: fact.questionnaire } : {}),
      })
      if (fact.questionnaire && questionnaire(original.targetId)?.sessionId === sessionId)
        replaceQuestionnaire(original.targetId, null)
      return { confirmed: true }
    } finally {
      const current = state.reader.getSnapshot()[actionId]
      if (current?.sessionId === sessionId && current.startCursor === original.startCursor)
        replace(actionId, { ...current, reconciling: false })
    }
  })

  return {
    reader: state.reader,
    questionnaires: questionnaires.reader,
    async execute(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!port) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Interaction commands are unavailable')
      if (name === 'planExit.get') return port.execute(name, interactionCommands[name].input.parse(input), options)
      if (name !== 'approval.resolve' && name !== 'questionnaire.answer' && name !== 'planExit.resolve')
        throw new CommandError('INVALID_INPUT', 'Unsupported interaction command')
      const parsedInput = interactionCommands[name].input.parse(input)
      input = parsedInput
      const id = key(name, input)
      const value = parsedInput
      const existing = state.reader.getSnapshot()[id]
      if (existing && ['submitting', 'unknown', 'succeeded'].includes(existing.status))
        throw new CommandError('BUSY', 'Reconcile the original interaction before submitting again')
      const snapshot = timeline.getSnapshot()
      if (snapshot.sessionId !== value.sessionId || snapshot.status !== 'ready')
        throw new CommandError('STALE_TARGET', 'The interaction session is not selected and ready')
      const approval =
        'approvalId' in value
          ? snapshot.approvals.find((item) => item.sessionId === value.sessionId && item.id === value.approvalId)
          : undefined
      const request =
        'requestId' in value
          ? snapshot.userInputs.find((item) => item.sessionId === value.sessionId && item.requestId === value.requestId)
          : undefined
      const action: InteractionActionState = {
        id,
        kind: name !== 'questionnaire.answer' ? 'approval' : 'questionnaire',
        sessionId: value.sessionId,
        targetId: 'approvalId' in value ? value.approvalId : value.requestId,
        status: 'submitting',
        error: null,
        startCursor: snapshot.cursor,
        ...(approval ? { approval } : {}),
        ...(request ? { request } : {}),
        ...('answers' in value ? { submittedAnswers: value.answers } : {}),
        ...('feedback' in value && value.feedback !== undefined ? { submittedFeedback: value.feedback } : {}),
      }
      replace(id, action)
      let dispatched = false
      try {
        if ('approvalId' in value && (!approval || approval.status !== 'pending'))
          throw new CommandError('INTERACTION_UNAVAILABLE', 'The approval is no longer pending')
        if (name === 'approval.resolve' && approval?.tool === 'exit_plan_mode')
          throw new CommandError('PLAN_EXIT_DECISION_REQUIRED', 'Use the Plan exit decision for this request')
        if (
          name === 'planExit.resolve' &&
          'runId' in value &&
          (approval?.tool !== 'exit_plan_mode' || approval.runId !== value.runId || approval.callId !== value.callId)
        )
          throw new CommandError('PLAN_EXIT_TARGET', 'Plan decision does not match the original request')
        if ('answers' in value) {
          const answers = value.answers
          if (
            !request ||
            request.questions.some(
              (question) => !answers[question.id]?.answers?.some((answer) => answer.trim().length > 0),
            )
          )
            throw new CommandError('QUESTIONNAIRE_INCOMPLETE', 'Every questionnaire item requires an answer')
        }
        dispatched = true
        const result = await port.execute(name, input, options)
        if (name === 'planExit.resolve' && 'runId' in value) {
          const response = interactionCommands[name].output.safeParse(result)
          if (
            !response.success ||
            response.data.sessionId !== value.sessionId ||
            response.data.approvalId !== value.approvalId ||
            response.data.runId !== value.runId ||
            response.data.callId !== value.callId ||
            response.data.status !== (value.decision === 'implement' ? 'allowed' : 'denied')
          )
            throw new CommandError('RESULT_UNKNOWN', 'Plan decision confirmation could not be verified')
          if (!state.reader.getSnapshot()[id]?.resolution)
            replace(id, {
              ...action,
              status: 'succeeded',
              resolution: { kind: 'approval', status: response.data.status },
            })
          return response.data
        }
        if (name === 'approval.resolve') {
          const response = interactionCommands[name].output.safeParse(result)
          if (
            !response.success ||
            response.data.sessionId !== action.sessionId ||
            response.data.approvalId !== action.targetId ||
            response.data.status === 'pending'
          )
            throw new CommandError('RESULT_UNKNOWN', 'Approval confirmation could not be verified')
          if (!state.reader.getSnapshot()[id]?.resolution)
            replace(id, {
              ...action,
              status: 'succeeded',
              resolution: { kind: 'approval', status: response.data.status },
            })
          return response.data
        }
        const response = interactionCommands['questionnaire.answer'].output.safeParse(result)
        if (
          !response.success ||
          response.data.sessionId !== action.sessionId ||
          response.data.requestId !== action.targetId
        )
          throw new CommandError('RESULT_UNKNOWN', 'Questionnaire confirmation could not be verified')
        if (!response.data.accepted)
          throw new CommandError('INTERACTION_NOT_ACCEPTED', 'The Host did not accept this questionnaire response')
        if (!state.reader.getSnapshot()[id]?.resolution) replace(id, { ...action, status: 'succeeded' })
        reconcile()
        return response.data
      } catch (error) {
        const code = errorCode(error)
        const unknown = dispatched && UNKNOWN_CODES.has(code)
        if (!state.reader.getSnapshot()[id]?.resolution)
          replace(id, {
            ...action,
            status: unknown ? 'unknown' : 'failed',
            error: unknown ? 'RESULT_UNKNOWN' : code,
          })
        throw error
      }
    },
    dispose() {
      unsubscribe()
      offQuestionnaires()
      state.dispose()
      questionnaires.dispose()
    },
  }
}
