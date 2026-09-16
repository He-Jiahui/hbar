/** Production entry: never import the variant registry or preview fixtures here. */
export { HbarAppUiIcon, type HbarAppUiIconTier } from './icon'
export { HbarAppUiDialog, type HbarAppUiDialogProps } from './components/app-dialog/NativeDialog'
export { HbarAppUiEventLog } from './components/agent-activity/EventLog'
export type { HbarAppUiEventLogProps, HbarAppUiEventLogItem } from './components/agent-activity/EventLog'
export { HbarAppUiVirtualList } from './VirtualList'
export { HbarAppUiPromptComposer } from './components/prompt-input/Composer'
export type {
  HbarAppUiPromptProps,
  HbarAppUiPromptLabels,
  HbarAppUiComposerAttachment,
} from './components/prompt-input/Composer'
export { HbarAppUiMessage } from './components/ai-chat/Message'
export { HbarAppUiConversation } from './components/ai-chat/Conversation'
export type { HbarAppUiConversationProps } from './components/ai-chat/Conversation'
export type { HbarAppUiMessageProps } from './components/ai-chat/Message'
export { HbarAppUiWorkspaceFiles, HbarAppUiFileDocument } from './components/file-manager/WorkspaceFiles'
export type { HbarAppUiWorkspaceFile, HbarAppUiWorkspaceFileLabels } from './components/file-manager/WorkspaceFiles'
export { HbarAppUiSessionNavigator } from './components/app-sidebar/SessionNavigator'
export type {
  HbarAppUiSessionNavigatorProps,
  HbarAppUiSessionLabels,
  HbarAppUiSessionRow,
} from './components/app-sidebar/SessionNavigator'
export { HbarAppUiWorkbenchShell, HbarAppUiNavigation } from './components/app-shell/WorkbenchShell'
export type {
  HbarAppUiShellProps,
  HbarAppUiShellLabels,
  HbarAppUiNavigationItem,
} from './components/app-shell/WorkbenchShell'
export {
  HbarAppUiButton,
  HbarAppUiEmptyState,
  HbarAppUiIconButton,
  HbarAppUiMetricStrip,
  HbarAppUiProgress,
  HbarAppUiSpotlight,
  HbarAppUiStatus,
  HbarAppUiSurface,
  HbarAppUiTabs,
  HbarAppUiTimeline,
  HbarAppUiToolbar,
} from './primitives'
export { HbarAppUiRunActivity } from './components/RunActivity'
export { HbarAppUiApprovalRequest } from './components/ApprovalRequest'
export { HbarAppUiQuestionnaire } from './components/Questionnaire'
export type { HbarAppUiDecisionState, HbarAppUiQuestionAnswer } from './decision-types'
export type {
  HbarAppUiApprovalDecision,
  HbarAppUiApprovalRequestLabels,
  HbarAppUiApprovalRequestProps,
  HbarAppUiFailureMessage,
  HbarAppUiMetric,
  HbarAppUiOption,
  HbarAppUiQuestionnaireLabels,
  HbarAppUiQuestionnaireOption,
  HbarAppUiQuestionnaireProps,
  HbarAppUiQuestionnaireQuestion,
  HbarAppUiQuestionnaireResult,
  HbarAppUiRunActivityItem,
  HbarAppUiRunActivityLabels,
  HbarAppUiRunActivityProps,
  HbarAppUiRunActivityStatus,
  HbarAppUiTimelineStep,
} from './types'

export { HbarAppUiPlanEditor } from './components/agent-plan/PlanEditor'
export type {
  HbarAppUiAgentPlanEditableContent,
  HbarAppUiAgentPlanState,
  HbarAppUiAgentPlanStep,
} from './components/agent-plan/AgentPlanContent'

export * from './ai-usage'

export * from './settings-form'
export * from './authentication'
