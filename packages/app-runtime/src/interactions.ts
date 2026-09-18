import { CommandError, type CommandExecutor, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { interactionDraftCommands } from '@hbar/contracts/commands/interaction-draft'
import type { StateReader } from './state'
import { createState } from './state'
import type {
  InteractionActionState,
  InteractionState,
  QuestionnaireDraftsState,
  QuestionnaireDraftState,
  SessionTimelineState,
} from './types'

const MAX_ACTIONS = 100

function key(name: string, input: unknown): string {
  const value = input as Record<string, unknown>
  if (name === 'approval.resolve' && typeof value.approvalId === 'string') return `approval:${value.approvalId}`
  if (name === 'questionnaire.answer' && typeof value.requestId === 'string') return `questionnaire:${value.requestId}`
  throw new CommandError('INVALID_INPUT', 'Interaction target is missing')
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return error instanceof Error ? error.message : 'EXECUTION_FAILED'
}

export function createInteractions(
  local: CommandRegistry,
  port: CommandExecutor | undefined,
  timeline: StateReader<SessionTimelineState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
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
    for (const [id, action] of Object.entries(current)) {
      if (action.sessionId !== session.sessionId || !['submitting', 'unknown'].includes(action.status)) continue
      const settled =
        action.kind === 'approval'
          ? session.approvals.some((approval) => approval.id === action.targetId && approval.status !== 'pending')
          : !session.userInputs.some((request) => request.requestId === action.targetId)
      if (settled) {
        next[id] = { ...action, status: 'succeeded', error: null }
        changed = true
      }
    }
    if (changed) state.replace(next)
  }
  const unsubscribe = timeline.subscribe(reconcile)

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
      const request = timeline
        .getSnapshot()
        .userInputs.find((item) => item.sessionId === sessionId && item.requestId === requestId)
      if (!request || !request.questions.some((question) => question.id === questionId))
        throw new CommandError('INVALID_INPUT', 'Questionnaire request or question is unavailable')
      const current = questionnaire(requestId) ?? { sessionId, requestId, revision: 0, answers: {} }
      if (expectedRevision !== undefined && expectedRevision !== current.revision)
        throw new CommandError('VERSION_CONFLICT', 'Questionnaire answers changed before this edit')
      const next = {
        ...current,
        revision: current.revision + 1,
        answers: { ...current.answers, [questionId]: { ...answer } },
      }
      replaceQuestionnaire(requestId, next)
      return { requestId, revision: next.revision }
    },
  )
  local.register(interactionDraftCommands['questionnaire.resetAnswers'], ({ sessionId, requestId }) => {
    const current = questionnaire(requestId)
    if (current && current.sessionId !== sessionId)
      throw new CommandError('INVALID_INPUT', 'Questionnaire draft belongs to another session')
    const revision = (current?.revision ?? 0) + 1
    replaceQuestionnaire(requestId, { sessionId, requestId, revision, answers: {} })
    return { requestId, revision }
  })

  const offQuestionnaires = timeline.subscribe(() => {
    const current = timeline.getSnapshot()
    const active = new Set(current.userInputs.map((request) => request.requestId))
    const drafts = questionnaires.reader.getSnapshot()
    if (!Object.keys(drafts).some((requestId) => !active.has(requestId))) return
    questionnaires.replace(Object.fromEntries(Object.entries(drafts).filter(([requestId]) => active.has(requestId))))
  })

  return {
    reader: state.reader,
    questionnaires: questionnaires.reader,
    async execute(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!port) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Interaction commands are unavailable')
      const id = key(name, input)
      const value = input as { sessionId: string; approvalId?: string; requestId?: string }
      const action: InteractionActionState = {
        id,
        kind: name === 'approval.resolve' ? 'approval' : 'questionnaire',
        sessionId: value.sessionId,
        targetId: value.approvalId ?? value.requestId!,
        status: 'submitting',
        error: null,
      }
      replace(id, action)
      try {
        if (name === 'questionnaire.answer') {
          const request = timeline
            .getSnapshot()
            .userInputs.find((item) => item.sessionId === value.sessionId && item.requestId === value.requestId)
          const answers =
            input &&
            typeof input === 'object' &&
            'answers' in input &&
            input.answers &&
            typeof input.answers === 'object'
              ? (input.answers as Record<string, { answers?: readonly string[] }>)
              : {}
          if (
            !request ||
            request.questions.some(
              (question) => !answers[question.id]?.answers?.some((answer) => answer.trim().length > 0),
            )
          )
            throw new CommandError('QUESTIONNAIRE_INCOMPLETE', 'Every questionnaire item requires an answer')
        }
        const result = await port.execute(name, input, options)
        replace(id, { ...action, status: 'succeeded' })
        return result
      } catch (error) {
        const code = errorCode(error)
        replace(id, { ...action, status: code === 'RESULT_UNKNOWN' ? 'unknown' : 'failed', error: code })
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
