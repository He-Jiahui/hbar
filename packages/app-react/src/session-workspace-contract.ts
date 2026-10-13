import { type ReactNode } from 'react'

import { type LumenApprovalRequestLabels, type LumenPromptLabels, type LumenQuestionnaireLabels } from '@lumen/app-ui'
import { type PlanProposalState } from '@hbar/app-runtime'
import type { HbarProposedPlanLabels } from './proposed-plan'

import { type HbarSessionImagesOptions } from './session-images'
import {
  type HbarMessageBlocksLabels,
  type HbarMessageBlocksProps,
  type HbarMessageActionLabels,
} from './session-message'

import { type HbarRunFileChangesLabels } from './run-file-changes'
import type { HbarRunFileChangeRenderer } from './run-file-change-renderer'

import { type HbarConversationSelectionLabels } from './conversation-selection'
import { type HbarSessionDecisionLabels } from './session-interactions'
import type { WorkspaceLocationPickerLabels } from './workspace-location-picker'
import type { HbarSessionDecisionHistoryLabels } from './session-decision-history'

import { type HbarComposerModelLabels } from './composer-model-picker'

import { type HbarComposerFeedbackDetailsLabels, type HbarComposerFeedbackLabels } from './composer-feedback'

import { type HbarConversationAnchorLabels } from './conversation-anchors'
import { type HbarComposerBackgroundAgentLabels } from './composer-background-agents'
import { type HbarComposerIntentLabels } from './composer-intent-controls'
import { type HbarSessionUsageLabels } from './session-usage-control'

import { type HbarComposerPermissionLabels } from './composer-permission-picker'
import { type HbarSessionRunLabels } from './session-run-activity'

import { type HbarSessionInterruptionLabels } from './session-interruption-notice'
import { type HbarSessionLiveStatusLabels } from './session-live-status'

import { type HbarQueuedUserRunsLabels } from './queued-user-runs'
import type { HbarSessionToolsMenuLabels } from './session-tools-labels'
import { type HbarSessionAttachmentSelection } from './composer-attachment-input'
import { type HbarComposerMentionLabels } from './composer-mention-editor'
import { type HbarComposerAddMenuLabels } from './composer-add-menu'

import { type HbarAgentToolOpenLabels } from './agent-tool-open'

import { type HbarSessionProjectContextLabels } from './session-project-context'

import { type HbarSessionEmptyHeroLabels } from './session-empty-hero'
import type { MessageFileReferenceLabels } from './message-file-reference'
import type { HbarComposerSlashLabels } from './composer-slash-menu'

import { type HbarComposerAttachmentLabels } from './composer-attachments'
import { type HbarComposerWorkspaceContextLabels } from './composer-workspace-contexts'
import { type HbarPreSessionLaunchStatusLabels } from './pre-session-launch-status'

import type { HbarSessionFindLabels } from './session-find-view'
import type { HbarGoalContinuationLabels } from './goal-continuation'
import { type HbarGoalLifecycleLabels, type HbarGoalHistoryLabels } from './goal-lifecycle'

import { type HbarSessionExecutionLabels } from './session-execution-notice'
export interface HbarSessionWorkspaceLabels {
  readonly composerFeedback: HbarComposerFeedbackLabels
  readonly find: HbarSessionFindLabels
  readonly anchors: HbarConversationAnchorLabels
  readonly conversationTitle: (title: string) => string
  readonly loading: string
  readonly emptyHistory: string
  readonly emptyHero: HbarSessionEmptyHeroLabels
  readonly disconnected: string
  readonly executionAccess: HbarSessionExecutionLabels
  readonly liveStatus: HbarSessionLiveStatusLabels
  readonly interruption: HbarSessionInterruptionLabels
  readonly refreshing: string
  readonly loadOlder: string
  readonly loadingOlder: string
  readonly retryHistory: string
  readonly retryTimeline: string
  readonly historyLimit: string
  readonly latest: string
  readonly readingPositionUnavailable: string
  readonly fileReferences: MessageFileReferenceLabels
  readonly author: Readonly<Record<'user' | 'assistant' | 'system' | 'tool', string>>
  readonly avatar: Readonly<Record<'user' | 'assistant' | 'system' | 'tool', string>>
  readonly copy: string
  readonly thinking: string
  readonly toolCall: (name: string) => string
  readonly toolResult: (name: string, failed: boolean) => string
  readonly attachment: (kind: 'image' | 'file', name: string) => string
  readonly timestamp: (value: number) => string
  readonly error: (code: string) => string
  readonly prompt: LumenPromptLabels
  readonly attachments: HbarComposerAttachmentLabels
  readonly workspaceContexts: HbarComposerWorkspaceContextLabels
  readonly conversationSelection: HbarConversationSelectionLabels
  readonly mentions: HbarComposerMentionLabels
  readonly slash: HbarComposerSlashLabels
  readonly addMenu: HbarComposerAddMenuLabels
  readonly modelPicker: HbarComposerModelLabels
  readonly intent: HbarComposerIntentLabels
  readonly permissionPicker: HbarComposerPermissionLabels
  readonly messageBlocks: HbarMessageBlocksLabels
  readonly messageActions: HbarMessageActionLabels
  /** Omitted only by hosts that do not expose file-change review. */
  readonly fileChanges?: HbarRunFileChangesLabels
  readonly agentToolOpen: HbarAgentToolOpenLabels
  readonly messageFork: {
    readonly ready: string
    readonly submitting: string
    readonly retry: string
    readonly recheck: string
    readonly unknown: string
    readonly created: string
    readonly createdAfterTimestamp: (timestamp: string) => string
    readonly error: (code: string) => string
  }
  readonly runningActions: { readonly queueLabel: string; readonly queueTitle: string }
  readonly backgroundAgents: HbarComposerBackgroundAgentLabels
  readonly queuedUserRuns: HbarQueuedUserRunsLabels
  readonly decisions: HbarSessionDecisionLabels
  readonly decisionHistory: HbarSessionDecisionHistoryLabels
  readonly goalContinuation: HbarGoalContinuationLabels
  readonly goalLifecycle: HbarGoalLifecycleLabels
  readonly goalHistory: HbarGoalHistoryLabels
  readonly proposedPlan: HbarProposedPlanLabels
  readonly proposedPlanReadOnly: string
  readonly proposedPlanAvailability: (value: PlanProposalState['availability']) => string | null
  readonly tools: HbarSessionToolsMenuLabels & {
    readonly panel: string
    readonly label: string
    readonly files: string
    readonly activity: string
    readonly monitoring: string
    readonly agents: string
    readonly goals: string
    readonly settings: string
    readonly systemTerminal: string
    readonly error: (code: string) => string
    readonly noticeDetails: HbarComposerFeedbackDetailsLabels
  }
  readonly runs: HbarSessionRunLabels
  readonly runDetail: (modelId: string) => string
  readonly runDuration: (startedAt: number, endedAt: number | null) => string
  readonly approval: LumenApprovalRequestLabels
  readonly approvalSummary: (tool: string) => string
  readonly questionnaire: LumenQuestionnaireLabels
  readonly usage: HbarSessionUsageLabels
}

export interface HbarSessionWorkspaceProps {
  readonly sessionTitle: string
  readonly workspaceName: string
  readonly workspacePath?: string | undefined
  readonly workspaceNodeBadge?:
    { readonly nodeName: string; readonly labels: Pick<WorkspaceLocationPickerLabels, 'remoteWorkspace'> } | undefined
  readonly sessionWorkspaceId: string
  readonly labels: HbarSessionWorkspaceLabels
  readonly describeTool?: HbarMessageBlocksProps['describeTool']
  /** Undefined preserves the default Enter shortcut; null disables keyboard sending until resolved. */
  readonly sendBehavior?: 'enter' | 'modifierEnter' | null
  readonly connected: boolean
  readonly prepareAttachment?: ((file: File) => Promise<HbarSessionAttachmentSelection>) | undefined
  readonly files?: { execute(name: string, input: unknown): Promise<unknown> } | undefined
  readonly showFilesInHeader?: boolean | undefined
  readonly navigationAccessory?: ReactNode | undefined
  readonly firstSendLabels?: HbarPreSessionLaunchStatusLabels | undefined
  readonly projectContextLabels?: HbarSessionProjectContextLabels | undefined
  /** Rendered in place of readonly project context only while the Host-confirmed Session is empty. */
  readonly renderLaunchControls?: (() => ReactNode) | undefined
  readonly images?: HbarSessionImagesOptions | undefined
  readonly modelMenuPresentation?: 'native' | 'web' | undefined
  readonly onOpenSystemTerminal?: (() => void) | undefined
  readonly fileChangeRenderer?: HbarRunFileChangeRenderer | undefined
}
export type SessionToolToggle = (
  panelId: 'files' | 'activity' | 'monitoring' | 'agents' | 'goals',
  command?: 'sessionTools.toggle' | 'sessionTools.open',
) => void
export interface SessionComposerProps extends Omit<HbarSessionWorkspaceProps, 'labels'> {
  readonly composerWrites: import('react').RefObject<Map<string, Set<Promise<unknown>>>>
  readonly toggleTool: SessionToolToggle
}

export interface SessionWorkspaceHeaderProps extends Pick<
  HbarSessionWorkspaceProps,
  'sessionTitle' | 'workspaceName' | 'workspaceNodeBadge' | 'connected' | 'showFilesInHeader' | 'onOpenSystemTerminal'
> {
  readonly find: Pick<
    ReturnType<typeof import('./session-find').useSessionFind>,
    'trigger' | 'disabled' | 'open' | 'activate'
  >
  readonly toolActions: ReturnType<typeof import('./session-tool-actions').useSessionToolActions>
}

export type SessionWorkspaceHistoryProps = Omit<HbarSessionWorkspaceProps, 'labels'>
