export type {
  LumenApprovalDecision as HbarAppUiApprovalDecision,
  LumenApprovalRequestLabels as HbarAppUiApprovalRequestLabels,
  LumenApprovalRequestProps as HbarAppUiApprovalRequestProps,
  LumenDecisionState as HbarAppUiDecisionState,
  LumenFailureMessage as HbarAppUiFailureMessage,
  LumenQuestionAnswer as HbarAppUiQuestionAnswer,
  LumenQuestionnaireLabels as HbarAppUiQuestionnaireLabels,
  LumenQuestionnaireOption as HbarAppUiQuestionnaireOption,
  LumenQuestionnaireProps as HbarAppUiQuestionnaireProps,
  LumenQuestionnaireQuestion as HbarAppUiQuestionnaireQuestion,
} from '@lumen/app-ui'

/** Retained response envelope used by host transport adapters. */
export interface HbarAppUiQuestionnaireResult {
  readonly accepted: boolean
  readonly error?: string | undefined
}
