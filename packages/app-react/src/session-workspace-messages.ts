import { createMessageScope } from './messages'
import type { HbarSessionWorkspaceLabels } from './session-workspace-contract'

type SessionHeaderMessages = Pick<HbarSessionWorkspaceLabels, 'find' | 'tools' | 'runs' | 'liveStatus'>

type SessionHistoryMessages = Pick<
  HbarSessionWorkspaceLabels,
  | 'find'
  | 'anchors'
  | 'conversationTitle'
  | 'loading'
  | 'emptyHistory'
  | 'emptyHero'
  | 'disconnected'
  | 'executionAccess'
  | 'liveStatus'
  | 'interruption'
  | 'refreshing'
  | 'loadOlder'
  | 'loadingOlder'
  | 'retryHistory'
  | 'retryTimeline'
  | 'historyLimit'
  | 'latest'
  | 'readingPositionUnavailable'
  | 'fileReferences'
  | 'author'
  | 'avatar'
  | 'copy'
  | 'thinking'
  | 'toolCall'
  | 'toolResult'
  | 'attachment'
  | 'timestamp'
  | 'error'
  | 'agentToolOpen'
  | 'messageFork'
  | 'decisions'
  | 'decisionHistory'
  | 'goalContinuation'
  | 'goalLifecycle'
  | 'goalHistory'
  | 'proposedPlan'
  | 'proposedPlanReadOnly'
  | 'proposedPlanAvailability'
  | 'messageBlocks'
  | 'messageActions'
  | 'conversationSelection'
  | 'fileChanges'
>

type SessionComposerMessages = Pick<
  HbarSessionWorkspaceLabels,
  | 'composerFeedback'
  | 'conversationTitle'
  | 'disconnected'
  | 'executionAccess'
  | 'liveStatus'
  | 'prompt'
  | 'attachments'
  | 'workspaceContexts'
  | 'mentions'
  | 'slash'
  | 'addMenu'
  | 'modelPicker'
  | 'intent'
  | 'permissionPicker'
  | 'error'
  | 'runningActions'
  | 'backgroundAgents'
  | 'queuedUserRuns'
  | 'usage'
>

export const { Provider: SessionHeaderMessagesProvider, useMessages: useSessionHeaderMessages } =
  createMessageScope<SessionHeaderMessages>()

export const { Provider: SessionHistoryMessagesProvider, useMessages: useSessionHistoryMessages } =
  createMessageScope<SessionHistoryMessages>()

export const { Provider: SessionComposerMessagesProvider, useMessages: useSessionComposerMessages } =
  createMessageScope<SessionComposerMessages>()

export function sessionHeaderMessages(labels: HbarSessionWorkspaceLabels): SessionHeaderMessages {
  return { find: labels.find, tools: labels.tools, runs: labels.runs, liveStatus: labels.liveStatus }
}

export function sessionHistoryMessages(labels: HbarSessionWorkspaceLabels): SessionHistoryMessages {
  const messages: SessionHistoryMessages = {
    find: labels.find,
    anchors: labels.anchors,
    conversationTitle: labels.conversationTitle,
    loading: labels.loading,
    emptyHistory: labels.emptyHistory,
    emptyHero: labels.emptyHero,
    disconnected: labels.disconnected,
    executionAccess: labels.executionAccess,
    liveStatus: labels.liveStatus,
    interruption: labels.interruption,
    refreshing: labels.refreshing,
    loadOlder: labels.loadOlder,
    loadingOlder: labels.loadingOlder,
    retryHistory: labels.retryHistory,
    retryTimeline: labels.retryTimeline,
    historyLimit: labels.historyLimit,
    latest: labels.latest,
    readingPositionUnavailable: labels.readingPositionUnavailable,
    fileReferences: labels.fileReferences,
    author: labels.author,
    avatar: labels.avatar,
    copy: labels.copy,
    thinking: labels.thinking,
    toolCall: labels.toolCall,
    toolResult: labels.toolResult,
    attachment: labels.attachment,
    timestamp: labels.timestamp,
    error: labels.error,
    agentToolOpen: labels.agentToolOpen,
    messageFork: labels.messageFork,
    decisions: labels.decisions,
    decisionHistory: labels.decisionHistory,
    goalContinuation: labels.goalContinuation,
    goalLifecycle: labels.goalLifecycle,
    goalHistory: labels.goalHistory,
    proposedPlan: labels.proposedPlan,
    proposedPlanReadOnly: labels.proposedPlanReadOnly,
    proposedPlanAvailability: labels.proposedPlanAvailability,
    messageBlocks: labels.messageBlocks,
    messageActions: labels.messageActions,
    conversationSelection: labels.conversationSelection,
  }
  return labels.fileChanges ? { ...messages, fileChanges: labels.fileChanges } : messages
}

export function sessionComposerMessages(labels: HbarSessionWorkspaceLabels): SessionComposerMessages {
  return {
    composerFeedback: labels.composerFeedback,
    conversationTitle: labels.conversationTitle,
    disconnected: labels.disconnected,
    executionAccess: labels.executionAccess,
    liveStatus: labels.liveStatus,
    prompt: labels.prompt,
    attachments: labels.attachments,
    workspaceContexts: labels.workspaceContexts,
    mentions: labels.mentions,
    slash: labels.slash,
    addMenu: labels.addMenu,
    modelPicker: labels.modelPicker,
    intent: labels.intent,
    permissionPicker: labels.permissionPicker,
    error: labels.error,
    runningActions: labels.runningActions,
    backgroundAgents: labels.backgroundAgents,
    queuedUserRuns: labels.queuedUserRuns,
    usage: labels.usage,
  }
}
