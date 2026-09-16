export type HbarAppUiApprovalDecision = 'deny' | 'allow' | 'allow_always'
export type HbarAppUiFailureMessage = string | ((cause: unknown) => string)
export interface HbarAppUiDecisionState {
  readonly status: 'idle' | 'pending' | 'complete'
  readonly error?: string | undefined
}
export interface HbarAppUiApprovalRequestLabels {
  readonly title: string
  readonly detailsLabel: string
  readonly statusLabel: string
  readonly denyLabel: string
  readonly allowLabel: string
  readonly allowAlwaysLabel?: string | undefined
  readonly savingLabel: string
  readonly completeLabel: string
  readonly failureMessage: HbarAppUiFailureMessage
}
export interface HbarAppUiApprovalRequestProps {
  readonly id: string
  readonly tool: string
  readonly summary: string
  readonly details?: string | undefined
  readonly labels: HbarAppUiApprovalRequestLabels
  readonly state: HbarAppUiDecisionState
  readonly onDecision: (id: string, decision: HbarAppUiApprovalDecision) => void
}
export interface HbarAppUiQuestionnaireOption {
  readonly value: string
  readonly label: string
  readonly description?: string | undefined
}
export interface HbarAppUiQuestionnaireQuestion {
  readonly id: string
  readonly header: string
  readonly prompt: string
  readonly options?: readonly HbarAppUiQuestionnaireOption[] | undefined
  readonly acceptsCustomAnswer?: boolean | undefined
  readonly secret?: boolean | undefined
}
export interface HbarAppUiQuestionnaireResult {
  readonly accepted: boolean
  readonly error?: string | undefined
}
export interface HbarAppUiQuestionnaireLabels {
  readonly title: string
  readonly countLabel: (count: number) => string
  readonly customAnswerLabel: string
  readonly customAnswerPlaceholder: string
  readonly freeformLabel: string
  readonly submitLabel: string
  readonly submittingLabel: string
  readonly submittedLabel: string
  readonly incompleteMessage: string
  readonly rejectedMessage: string
  readonly failureMessage: HbarAppUiFailureMessage
}
export interface HbarAppUiQuestionAnswer {
  readonly kind: 'option' | 'custom'
  readonly value: string
}
export interface HbarAppUiQuestionnaireProps {
  readonly requestId: string
  /** Bounded by the host request contract; every supplied question is rendered. */
  readonly questions: readonly HbarAppUiQuestionnaireQuestion[]
  readonly answers: Readonly<Record<string, HbarAppUiQuestionAnswer>>
  readonly labels: HbarAppUiQuestionnaireLabels
  readonly state: HbarAppUiDecisionState
  readonly onAnswer: (requestId: string, questionId: string, answer: HbarAppUiQuestionAnswer) => void
  readonly onSubmit: (requestId: string) => void
}
