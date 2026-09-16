import type { Approval, UserInputRequest } from '@hbar/contracts'
import { HbarAppUiApprovalRequest, HbarAppUiQuestionnaire } from 'hbar-app-ui'
import { useLocale } from './locale'
import { useConnection } from './stores'
import {
  answerQuestion,
  decisionKey,
  EMPTY_ANSWERS,
  IDLE_DECISION,
  resolveApproval,
  submitQuestionnaire,
  useDecisionModel,
} from './decision-model'

export function ApprovalDecision({ approval, sessionId }: { readonly approval: Approval; readonly sessionId: string }) {
  const { t } = useLocale()
  const connection = useConnection((state) => state.client)
  const record = useDecisionModel((state) => state.records[decisionKey(sessionId, 'approval', approval.id)])
  const args = approval.args
  const target = typeof args.path === 'string' ? args.path : typeof args.command === 'string' ? args.command : ''
  return (
    <HbarAppUiApprovalRequest
      id={approval.id}
      tool={approval.tool}
      summary={target ? `${approval.tool} · ${target}` : approval.tool}
      details={JSON.stringify(args, null, 2)}
      state={record?.source === connection ? record.state : IDLE_DECISION}
      labels={{
        title: t('chatApproveTool'),
        detailsLabel: t('chatViewRequest'),
        statusLabel: t('chatDecisionRequired'),
        denyLabel: t('chatDeny'),
        allowLabel: t('chatApprove'),
        allowAlwaysLabel: t('chatAllowRemember'),
        savingLabel: t('chatDecisionSaving'),
        completeLabel: t('chatDecisionSaved'),
        failureMessage: t('approvalSubmitFailed'),
      }}
      onDecision={(id, decision) => {
        void resolveApproval(sessionId, id, decision)
      }}
    />
  )
}

export function QuestionDecision({
  request,
  sessionId,
}: {
  readonly request: UserInputRequest
  readonly sessionId: string
}) {
  const { t } = useLocale()
  const connection = useConnection((state) => state.client)
  const record = useDecisionModel((state) => state.records[decisionKey(sessionId, 'question', request.requestId)])
  const current = record?.source === connection ? record : undefined
  return (
    <HbarAppUiQuestionnaire
      requestId={request.requestId}
      state={current?.state ?? IDLE_DECISION}
      answers={current?.answers ?? EMPTY_ANSWERS}
      labels={{
        title: t('chatUserInputRequired'),
        countLabel: (count) => `${count} ${t('chatQuestionsCount')}`,
        customAnswerLabel: t('chatOther'),
        customAnswerPlaceholder: t('chatFillOtherAnswer'),
        freeformLabel: t('chatFillAnswer'),
        submitLabel: t('chatSubmitAnswers'),
        submittingLabel: t('chatSubmitting'),
        submittedLabel: t('chatSubmitted'),
        incompleteMessage: t('chatAnswerAllQuestions'),
        rejectedMessage: t('chatInputHandled'),
        failureMessage: t('chatSubmitFailed'),
      }}
      questions={request.questions.map((question) => ({
        id: question.id,
        header: question.header,
        prompt: question.question,
        options: question.options?.map((option) => ({
          value: option.label,
          label: option.label,
          description: option.description,
        })),
        acceptsCustomAnswer: question.isOther !== false,
        secret: question.isSecret,
      }))}
      onAnswer={(requestId, questionId, answer) => answerQuestion(sessionId, requestId, questionId, answer)}
      onSubmit={(requestId) => {
        void submitQuestionnaire(sessionId, requestId)
      }}
    />
  )
}
