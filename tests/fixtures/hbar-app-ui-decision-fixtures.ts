import type {
  HbarAppUiApprovalRequestLabels,
  HbarAppUiQuestionnaireLabels,
} from '../../packages/hbar-app-ui/src/decision-types'

export const APPROVAL_LABELS: HbarAppUiApprovalRequestLabels = {
  title: 'Approval required',
  detailsLabel: 'Review details',
  statusLabel: 'Decision required',
  denyLabel: 'Deny',
  allowLabel: 'Allow',
  savingLabel: 'Saving decision',
  completeLabel: 'Decision saved',
  failureMessage: 'Unable to save decision',
}
export const QUESTION_LABELS: HbarAppUiQuestionnaireLabels = {
  title: 'Your input is needed',
  countLabel: (count) => `${count} questions`,
  customAnswerLabel: 'Other',
  customAnswerPlaceholder: 'Enter another answer',
  freeformLabel: 'Your answer',
  submitLabel: 'Submit answers',
  submittingLabel: 'Submitting answers',
  submittedLabel: 'Answers submitted',
  incompleteMessage: 'Answer every question',
  rejectedMessage: 'Request expired',
  failureMessage: 'Unable to submit answers',
}
