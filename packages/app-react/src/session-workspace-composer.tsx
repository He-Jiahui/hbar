import { type ReactNode } from 'react'

import { LumenContentText, LumenFrame, LumenButton } from '@lumen/app-ui'

import { HbarDraftImageAttachments } from './session-images'

import { HbarComposerModelPicker } from './composer-model-picker'
import { HbarPromptComposer } from './prompt-composer'
import {
  HbarComposerFeedback,
  HbarComposerFeedbackSessionProvider,
  HbarComposerPrimaryNotice,
  HbarComposerBlockedNotice,
} from './composer-feedback'

import { HbarComposerBackgroundAgentStop, HbarComposerBackgroundAgentFeedback } from './composer-background-agents'
import { HbarComposerGoal, HbarComposerIntentControls } from './composer-intent-controls'
import { HbarSessionUsageControl, sessionUsagePresentation } from './session-usage-control'

import { HbarComposerPermissionPicker } from './composer-permission-picker'

import { HbarSessionLiveStatus } from './session-live-status'
import { HbarContextCompactionNotice } from './session-context-history'

import { HbarQueuedUserRuns } from './queued-user-runs'

import { HbarComposerMentionEditor } from './composer-mention-editor'
import { HbarComposerAddMenu } from './composer-add-menu'
import { HbarComposerAgentNotice } from './composer-agent-notice'

import { HbarSessionProjectContext } from './session-project-context'
import { HbarSessionBranchTargetControl } from './session-branch-target-control'

import { HbarComposerAttachmentDropTarget, HbarComposerAttachmentTransfers } from './composer-attachments'
import { HbarComposerWorkspaceContexts } from './composer-workspace-contexts'
import './lumen-session-workspace.css'
import { HbarPreSessionLaunchStatus } from './pre-session-launch-status'

import { HbarSessionStopNotice } from './session-stop'

import { HbarSessionExecutionNotice } from './session-execution-notice'
import { memo } from 'react'
import type { SessionComposerProps } from './session-workspace-contract'
import { useSessionComposer } from './session-composer-model'
import { useSessionComposerMessages } from './session-workspace-messages'
export const SessionWorkspaceComposer = memo(function SessionWorkspaceComposer(props: SessionComposerProps) {
  const {
    sessionTitle,
    workspaceName,
    workspacePath,
    sessionWorkspaceId,
    sendBehavior,
    connected,
    prepareAttachment,
    files,
    firstSendLabels,
    projectContextLabels,
    renderLaunchControls,
    images,
    modelMenuPresentation,
    toggleTool,
  } = props
  const { t } = useSessionComposerMessages()
  const liveStatusLabels = t('liveStatus')
  const {
    runtime,
    stopRun,
    navigation,
    selectedExecution,
    timeline,
    queuedUserRuns,
    controls,
    composerModel,
    composerFacts,
    permissionAvailable,
    permissionDefault,
    planModeAvailable,
    sessionId,
    workspaceMoveLocked,
    firstSendDraft,
    firstSendLocked,
    slashLabels,
    preparationStatus,
    canPrepare,
    draft,
    composerDraft,
    agentAction,
    intentEntry,
    permissionEntry,
    planModeEntry,
    intentPending,
    activeConversationOwner,
    intent,
    activeRun,
    projectContext,
    branchTargetsAvailable,
    branchTargetEntry,
    invoke,
    composerGoalTrigger,
    goalMenuSlot,
    setGoalMenuSlot,
    goalPreparedRequest,
    setGoalPreparedRequest,
    editorFocusRequest,
    setEditorFocusRequest,
    localSlashInFlight,
    pendingModelSlash,
    modelOpenRequest,
    slashOpenRequest,
    setSlashOpenRequest,
    setSlashFailure,
    templateRouteError,
    canOpenTemplates,
    openTemplates,
    launchTargetFailure,
    goalConfirmation,
    setGoalConfirmation,
    submitSlashCommands,
    saveComposerContent,
    clearLocalSlash,
    runGoalSlash,
    submitLatest,
    attachmentTransfers,
    workspaceContexts,
    attachmentIntakeEnabled,
    canAddAttachments,
    canOpenSlash,
    addAttachments,
    removeWorkspaceContext,
    workspaceContextError,
    backgroundTarget,
    backgroundEntry,
    backgroundCount,
    backgroundPending,
    backgroundUnknown,
    backgroundDisabled,
    backgroundFeedback,
    reconcileBackground,
    stopBackground,
    retryBackground,
    showLaunchLocation,
    visibleSlashFailure,
    composerState,
  } = useSessionComposer(props)
  const projectContextView = (showLaunchControls: boolean) =>
    showLaunchControls && renderLaunchControls ? (
      renderLaunchControls()
    ) : projectContextLabels && sessionId ? (
      <HbarSessionProjectContext
        workspaceName={workspaceName}
        workspacePath={workspacePath}
        sessionId={sessionId}
        workspaceId={sessionWorkspaceId}
        connected={connected}
        context={projectContext.context}
        labels={projectContextLabels}
        onRetry={projectContext.onRetry}
        executionPath={
          branchTargetEntry?.workspaceId === sessionWorkspaceId ? branchTargetEntry.page?.execution.path : undefined
        }
        renderBranch={
          projectContextLabels.target && branchTargetsAvailable
            ? (branch) => (
                <HbarSessionBranchTargetControl
                  key={sessionId}
                  sessionId={sessionId}
                  workspaceId={sessionWorkspaceId}
                  connected={connected}
                  busy={Boolean(activeRun)}
                  branch={branch}
                  labels={projectContextLabels.target!}
                  branchLabel={projectContextLabels.branch}
                />
              )
            : undefined
        }
      />
    ) : null
  const composer: ReactNode = sessionId ? (
    <HbarComposerFeedbackSessionProvider
      key={sessionId}
      scope={{ workspaceId: sessionWorkspaceId, sessionId }}
      labels={t('composerFeedback')}
    >
      <LumenFrame
        className="hbar-app-react-session-footer"
        data-hbar-composer-session={sessionId}
        data-composer-blocked-reason={composerState.blockedReason ?? undefined}
        data-git-context-status={projectContext.context.status}
      >
        <HbarComposerPrimaryNotice />
        {composerState.blockedReason && <HbarComposerBlockedNotice reason={composerState.blockedReason} />}
        {!connected && (
          <HbarComposerFeedback priority="blocking">
            <LumenContentText context="feedback.message" role="status">
              {t('disconnected')}
            </LumenContentText>
          </HbarComposerFeedback>
        )}
        {liveStatusLabels.history && (
          <HbarContextCompactionNotice
            record={timeline.sessionId === sessionId ? timeline.activeCompaction : null}
            sessionId={sessionId}
            owned={activeConversationOwner}
            connected={connected}
            labels={liveStatusLabels.history}
          />
        )}
        <HbarSessionLiveStatus
          key={`live:${sessionId}`}
          sessionId={sessionId}
          timelineSessionId={timeline.sessionId}
          owned={activeConversationOwner}
          connected={connected}
          run={activeRun}
          labels={liveStatusLabels}
          history={{
            page: timeline.contextHistory,
            status: timeline.contextHistoryStatus,
            error: timeline.contextHistoryError,
            before: timeline.contextHistoryBefore,
            onRetry: () =>
              invoke('timeline.contextHistory', {
                sessionId,
                ...(timeline.contextHistoryRequestBefore ? { before: timeline.contextHistoryRequestBefore } : {}),
              }),
            onLoad: (before) =>
              invoke('timeline.contextHistory', { sessionId, ...(before === undefined ? {} : { before }) }),
          }}
          context={{
            facts: composerFacts,
            onRefresh: () => invoke('composerIntent.refresh', { sessionId }),
            summary: (
              <LumenFrame className="hbar-session-current-goal" data-current-goal-session={sessionId}>
                <HbarComposerGoal
                  key={sessionId}
                  sessionId={sessionId}
                  workspaceId={navigation.workspaceId}
                  connected={connected}
                  labels={t('intent')}
                  surface="summary"
                  embedded
                  runActive={
                    connected &&
                    ((timeline.sessionId === sessionId && Boolean(activeRun)) ||
                      (selectedExecution.target?.sessionId === sessionId &&
                        selectedExecution.target.workspaceId === sessionWorkspaceId &&
                        selectedExecution.status === 'ready' &&
                        selectedExecution.snapshot?.execution.activeCount !== undefined &&
                        selectedExecution.snapshot.execution.activeCount > 0))
                  }
                  executionReadError={
                    connected &&
                    selectedExecution.target?.sessionId === sessionId &&
                    selectedExecution.target.workspaceId === sessionWorkspaceId &&
                    selectedExecution.status === 'error'
                  }
                  executionChecking={
                    connected &&
                    selectedExecution.target?.sessionId === sessionId &&
                    selectedExecution.target.workspaceId === sessionWorkspaceId &&
                    selectedExecution.status === 'loading'
                  }
                  goalTriggerRef={composerGoalTrigger}
                  canPrepare={canPrepare}
                />
              </LumenFrame>
            ),
          }}
        />
        <HbarSessionStopNotice region="main" />
        {connected && (
          <HbarSessionExecutionNotice
            key={`${sessionId}:${sessionWorkspaceId}`}
            status={preparationStatus}
            workspaceName={workspaceName}
            connected={connected}
            labels={t('executionAccess')}
            onOpenArchived={async () => {
              const target = { sessionId, workspaceId: sessionWorkspaceId }
              const selected = runtime.state.navigation.getSnapshot()
              if (selected.sessionId !== target.sessionId || selected.workspaceId !== target.workspaceId) return
              await runtime.commands.execute('archivedSessions.open', { workspaceId: target.workspaceId })
              const latest = runtime.state.navigation.getSnapshot()
              if (latest.sessionId !== target.sessionId || latest.workspaceId !== target.workspaceId) return
              await runtime.commands.execute('app.setSidebarVisible', { visible: true })
            }}
          />
        )}
        <HbarComposerGoal
          key={`submission:${sessionId}`}
          sessionId={sessionId}
          workspaceId={navigation.workspaceId}
          connected={connected}
          labels={t('intent')}
          surface="submission"
          canPrepare={canPrepare}
        />
        <HbarComposerAgentNotice
          status={
            agentAction?.status === 'succeeded' && agentAction.draftCleared && draft?.text
              ? undefined
              : agentAction?.status
          }
          agentId={agentAction?.agent?.agentId}
          labels={t('slash').agentNotice}
          connected={connected}
          onRetry={() => {
            if (!agentAction || !sessionId || !navigation.workspaceId) return
            void runtime.commands
              .execute('agentComposer.invoke', {
                sessionId: agentAction.sessionId,
                workspaceId: agentAction.workspaceId,
                draftText: agentAction.draftText,
                draftRevision: agentAction.draftRevision,
                profileId: agentAction.profileId,
                objective: agentAction.objective,
              })
              .catch((reason: unknown) => {
                setSlashFailure({
                  sessionId,
                  code:
                    reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                      ? reason.code
                      : 'EXECUTION_FAILED',
                })
              })
          }}
          onOpen={() => {
            if (!agentAction?.agent || !sessionId || !navigation.workspaceId) return
            void runtime.commands
              .execute('agentComposer.openResult', {
                sessionId: agentAction.sessionId,
                workspaceId: agentAction.workspaceId,
                agentId: agentAction.agent.agentId,
              })
              .catch((reason: unknown) => {
                setSlashFailure({
                  sessionId,
                  code:
                    reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                      ? reason.code
                      : 'EXECUTION_FAILED',
                })
              })
          }}
        />
        <HbarComposerAttachmentDropTarget
          key={`attachments:${sessionId}`}
          enabled={attachmentIntakeEnabled}
          label={t('attachments').drop}
          onAdd={addAttachments}
        >
          {goalConfirmation?.sessionId === sessionId &&
            goalConfirmation.workspaceId === navigation.workspaceId &&
            goalConfirmation.revision === draft?.revision &&
            goalConfirmation.text === draft.text && (
              <LumenFrame
                className="hbar-composer-goal-confirmation"
                role="group"
                aria-label={
                  goalConfirmation.action === 'clear'
                    ? t('slash').goalConfirmClear(goalConfirmation.previousObjective)
                    : t('slash').goalConfirmReplace(goalConfirmation.previousObjective)
                }
              >
                <LumenContentText context="message.inline">
                  {goalConfirmation.action === 'clear'
                    ? t('slash').goalConfirmClear(goalConfirmation.previousObjective)
                    : t('slash').goalConfirmReplace(goalConfirmation.previousObjective)}
                </LumenContentText>
                <LumenFrame className="hbar-composer-goal-confirmation-actions">
                  <LumenButton type="button" size="s" onClick={() => setGoalConfirmation(null)}>
                    {t('slash').goalCancel}
                  </LumenButton>
                  <LumenButton
                    type="button"
                    size="s"
                    tone="danger"
                    onClick={() => {
                      const confirmation = goalConfirmation
                      setGoalConfirmation(null)
                      void runGoalSlash(
                        confirmation,
                        confirmation.action === 'clear'
                          ? { action: 'clear' }
                          : { action: 'set', objective: confirmation.objective! },
                        confirmation.expectedGoalId,
                      )
                    }}
                  >
                    {t('slash').goalConfirm}
                  </LumenButton>
                </LumenFrame>
              </LumenFrame>
            )}
          <HbarPromptComposer
            boundary="none"
            value={composerDraft?.text ?? ''}
            editor={
              files && sessionId && navigation.workspaceId
                ? ({ inputLabel, placeholder, disabled }) => (
                    <HbarComposerMentionEditor
                      key={`${sessionId}:${navigation.workspaceId}`}
                      sessionId={sessionId}
                      workspaceId={navigation.workspaceId!}
                      revision={composerDraft?.revision ?? 0}
                      text={composerDraft?.text ?? ''}
                      mentions={composerDraft?.mentions ?? []}
                      disabled={disabled}
                      connected={connected}
                      inputLabel={inputLabel}
                      placeholder={placeholder}
                      labels={t('mentions')}
                      slashLabels={slashLabels}
                      submitSlashCommands={submitSlashCommands}
                      slashOpenRequest={slashOpenRequest}
                      focusRequest={editorFocusRequest}
                      sendBehavior={sendBehavior}
                      files={files}
                      onContent={(text, mentions, expectedRevision) =>
                        saveComposerContent(sessionId, text, mentions, expectedRevision)
                      }
                      onSubmit={() => {
                        void submitLatest(sessionId, navigation.workspaceId!)
                      }}
                    />
                  )
                : undefined
            }
            labels={{
              ...t('prompt'),
              placeholder:
                intent === 'goal'
                  ? t('intent').goalPlaceholder
                  : planModeEntry?.status === 'ready' && planModeEntry.mode === 'plan'
                    ? t('intent').planPlaceholder
                    : t('prompt').placeholder,
            }}
            attachments={(draft?.attachments ?? []).map((attachment) => ({
              id: attachment.artifact.id,
              kind: attachment.kind,
              name: attachment.artifact.name,
            }))}
            attachmentContent={
              draft &&
              (workspaceContexts.length > 0 || workspaceContextError || (images && draft.attachments.length > 0)) ? (
                <>
                  <HbarComposerWorkspaceContexts
                    contexts={workspaceContexts}
                    attachments={!images ? draft.attachments : []}
                    labels={t('workspaceContexts')}
                    removeAttachmentLabel={(attachment) =>
                      t('prompt').removeAttachment({
                        id: attachment.artifact.id,
                        kind: attachment.kind,
                        name: attachment.artifact.name,
                      })
                    }
                    removeDisabled={
                      !connected ||
                      firstSendLocked ||
                      workspaceMoveLocked ||
                      draft.status === 'submitting' ||
                      draft.status === 'unknown' ||
                      intentPending
                    }
                    error={workspaceContextError}
                    onRemove={removeWorkspaceContext}
                    onRemoveAttachment={(attachment) =>
                      invoke('draft.removeAttachment', {
                        sessionId,
                        artifactId: attachment.artifact.id,
                        kind: attachment.kind,
                        expectedRevision: draft.revision,
                      })
                    }
                  />
                  {images && draft.attachments.length > 0 ? (
                    <HbarDraftImageAttachments
                      draft={draft}
                      removeLabel={t('prompt').removeAttachment}
                      removeDisabled={
                        draft.status === 'submitting' ||
                        draft.status === 'unknown' ||
                        intentEntry?.submission.status === 'submitting' ||
                        workspaceMoveLocked
                      }
                      onRemove={(id, kind) =>
                        invoke('draft.removeAttachment', {
                          sessionId,
                          artifactId: id,
                          kind,
                          expectedRevision: draft.revision,
                        })
                      }
                    />
                  ) : null}
                </>
              ) : undefined
            }
            disabled={composerState.editorDisabled}
            submitting={draft?.status === 'submitting' || intentEntry?.submission.status === 'submitting'}
            uploading={(draft?.uploading ?? 0) > 0}
            canAddAttachments={canAddAttachments}
            canSubmit={composerState.canSubmit}
            canStop={composerState.showStop}
            runningActions={{
              ...t('runningActions'),
              submit:
                (draft?.text.trim() || draft?.attachments.length || workspaceContexts.length) &&
                (intent !== 'goal' || draft?.text.trim())
                  ? 'queue'
                  : 'hidden',
            }}
            stopping={composerState.showStop && !composerState.canStop}
            error={
              !connected
                ? undefined
                : draft?.uploadError && !attachmentTransfers.some((item) => item.error === draft.uploadError)
                  ? t('attachments').error(draft.uploadError)
                  : draft?.error
                    ? t('error')(draft.error)
                    : composerModel.sessionId === sessionId && composerModel.action.status === 'unknown'
                      ? t('modelPicker').unknown
                      : templateRouteError?.sessionId === sessionId
                        ? t('error')(templateRouteError.code)
                        : visibleSlashFailure
            }
            controls={
              <LumenFrame className="hbar-session-composer-controls">
                <HbarComposerAddMenu
                  key={`add:${sessionId}`}
                  labels={t('addMenu')}
                  canAddFiles={canAddAttachments}
                  canOpenSlash={canOpenSlash}
                  onFiles={prepareAttachment ? addAttachments : undefined}
                  onOpenSlash={() => setSlashOpenRequest((request) => request + 1)}
                  templateAction={{ disabled: !canOpenTemplates, onChoose: openTemplates }}
                  goalSlotRef={intent === 'goal' ? undefined : setGoalMenuSlot}
                  triggerRef={composerGoalTrigger}
                  goalPreparedRequest={goalPreparedRequest}
                  onGoalPrepared={() => setEditorFocusRequest((request) => request + 1)}
                />
                {(permissionAvailable || planModeAvailable) && (
                  <HbarComposerPermissionPicker
                    key={`permission:${sessionId}`}
                    sessionId={sessionId}
                    sessionLabel={sessionTitle}
                    entry={permissionEntry}
                    hostDefault={permissionDefault}
                    defaultAvailable={permissionAvailable}
                    connected={connected}
                    disabled={composerState.optionControlsLocked}
                    runActive={Boolean(activeRun)}
                    canPrepare={canPrepare}
                    labels={t('permissionPicker')}
                    onRefresh={async () => {
                      await runtime.commands.execute('composerPermission.refresh', {})
                    }}
                    onSelect={async (input) => {
                      await runtime.commands.execute('composerPermission.setChoice', input)
                    }}
                    onReconcile={async () => {
                      await runtime.commands.execute('composerPermission.reconcile', { sessionId })
                    }}
                    {...(planModeAvailable
                      ? {
                          plan: {
                            entry: planModeEntry,
                            onSetMode: async (mode: 'default' | 'plan', expectedRevision: number) => {
                              await runtime.commands.execute('composerPlanMode.setMode', {
                                sessionId,
                                mode,
                                expectedRevision,
                              })
                            },
                            onSelectOrdinary: async (input, expectedModeRevision) => {
                              await runtime.commands.execute('composerPlanChoice.selectOrdinary', {
                                sessionId: input.sessionId,
                                choice: input.choice,
                                expectedPermissionRevision: input.expectedRevision,
                                expectedModeRevision,
                                ...(input.confirmAllow ? { confirmAllow: true } : {}),
                              })
                            },
                            onRefresh: async () => {
                              await runtime.commands.execute('composerPlanMode.refresh', { sessionId })
                            },
                            onReconcile: async () => {
                              await runtime.commands.execute('composerPlanMode.reconcile', { sessionId })
                            },
                          },
                        }
                      : {})}
                  />
                )}
                {projectContextLabels && (
                  <LumenFrame className="hbar-session-project-context-toolbar">
                    {projectContextView(showLaunchLocation)}
                  </LumenFrame>
                )}
                <HbarComposerIntentControls
                  key={sessionId}
                  preferMenu
                  menuSlot={goalMenuSlot}
                  onPrepared={() => setGoalPreparedRequest((request) => request + 1)}
                  sessionId={sessionId}
                  connected={connected}
                  disabled={composerState.intentControlsLocked}
                  canPrepare={canPrepare}
                  labels={t('intent')}
                />
              </LumenFrame>
            }
            adaptiveToolbar={{
              moreLabel: t('addMenu').menu,
              controlsLabel: t('addMenu').open,
              modelLabel: t('modelPicker').title,
              revealModelRequest: modelOpenRequest,
            }}
            context={
              <>
                <HbarComposerBackgroundAgentFeedback
                  kind={connected ? backgroundFeedback : null}
                  error={
                    backgroundEntry?.action.error ??
                    backgroundEntry?.action.targets.find((target) => target.error)?.error ??
                    backgroundEntry?.error ??
                    null
                  }
                  disabled={!connected || backgroundPending || !activeConversationOwner}
                  labels={t('backgroundAgents')}
                  onReconcile={reconcileBackground}
                  onRetry={retryBackground}
                  onRefresh={() => {
                    if (backgroundTarget) invoke('composerBackgroundAgents.refresh', backgroundTarget)
                  }}
                />
                {firstSendDraft && firstSendLabels && (
                  <HbarPreSessionLaunchStatus
                    key={firstSendDraft.draftId}
                    draft={firstSendDraft}
                    labels={firstSendLabels}
                    connected={connected}
                  />
                )}
                {connected && launchTargetFailure?.sessionId === sessionId && firstSendLabels && (
                  <HbarComposerFeedback tone="danger">
                    <LumenContentText context="feedback.message" role="alert">
                      {firstSendLabels.error(launchTargetFailure.code)}
                    </LumenContentText>
                  </HbarComposerFeedback>
                )}
                <HbarQueuedUserRuns
                  state={queuedUserRuns}
                  sessionId={sessionId}
                  connected={connected}
                  labels={t('queuedUserRuns')}
                  activeRunId={
                    timeline.sessionId === sessionId &&
                    timeline.status === 'ready' &&
                    activeRun?.sessionId === sessionId &&
                    activeRun.status === 'running'
                      ? activeRun.id
                      : null
                  }
                  onRefresh={() => void invoke('queuedUserRuns.refresh', { sessionId })}
                  onPrevious={() => void invoke('queuedUserRuns.previous', { sessionId })}
                  onNext={() => void invoke('queuedUserRuns.next', { sessionId })}
                  onStartEdit={(operationId) => void invoke('queuedUserRuns.startEdit', { sessionId, operationId })}
                  onEditText={(operationId, text) =>
                    void invoke('queuedUserRuns.setEditText', { sessionId, operationId, text })
                  }
                  onSaveEdit={(operationId) => void invoke('queuedUserRuns.saveEdit', { sessionId, operationId })}
                  onRetryEdit={(operationId) => void invoke('queuedUserRuns.retryEdit', { sessionId, operationId })}
                  onGuide={(operationId, expectedRevision, activeRunId) =>
                    void invoke('queuedUserRuns.guide', { sessionId, operationId, expectedRevision, activeRunId })
                  }
                  onRetryGuide={(operationId) => void invoke('queuedUserRuns.retryGuide', { sessionId, operationId })}
                  onDismissGuide={() => void invoke('queuedUserRuns.dismissGuide', { sessionId })}
                  onCancelEdit={() => void invoke('queuedUserRuns.cancelEdit', { sessionId })}
                  onRemove={(operationId, expectedRevision) =>
                    void invoke('queuedUserRuns.remove', { sessionId, operationId, expectedRevision })
                  }
                  onRetryRemoval={(operationId) =>
                    void invoke('queuedUserRuns.retryRemoval', { sessionId, operationId })
                  }
                  onDismissRemoval={() => void invoke('queuedUserRuns.dismissRemoval', { sessionId })}
                />
                <HbarComposerAttachmentTransfers
                  transfers={attachmentTransfers}
                  labels={t('attachments')}
                  connected={connected}
                  onRemove={(item) =>
                    invoke('draft.removeAttachmentTransfer', {
                      sessionId,
                      reservationId: item.id,
                      ownerRevision: item.ownerRevision,
                    })
                  }
                  onReconcile={(item) =>
                    invoke('draft.reconcileAttachment', {
                      sessionId,
                      reservationId: item.id,
                      ownerRevision: item.ownerRevision,
                    })
                  }
                  onAccept={(item) =>
                    invoke('draft.acceptReadyAttachment', {
                      sessionId,
                      reservationId: item.id,
                      ownerRevision: item.ownerRevision,
                      expectedRevision: draft?.revision ?? 0,
                    })
                  }
                />
              </>
            }
            modelPicker={
              <LumenFrame className="hbar-session-composer-options">
                <HbarSessionUsageControl
                  key={`usage:${sessionId}`}
                  controls={controls}
                  labels={t('usage')}
                  onOpenMonitor={() => toggleTool('monitoring')}
                  onRefresh={() => {
                    void runtime.contextUsage.refresh(sessionId)
                  }}
                />
                <HbarComposerModelPicker
                  key={sessionId}
                  sessionId={sessionId}
                  connected={connected}
                  runActive={Boolean(activeRun)}
                  disabled={
                    workspaceMoveLocked ||
                    firstSendLocked ||
                    draft?.status === 'submitting' ||
                    draft?.status === 'unknown' ||
                    intentPending ||
                    Boolean(activeRun && canPrepare)
                  }
                  canSelect={canPrepare && !activeRun && !workspaceMoveLocked}
                  labels={t('modelPicker')}
                  menuPresentation={modelMenuPresentation}
                  openRequest={modelOpenRequest}
                  onOpened={() => {
                    const target = pendingModelSlash.current
                    pendingModelSlash.current = null
                    localSlashInFlight.current = false
                    if (target?.sessionId === sessionId && target.workspaceId === navigation.workspaceId)
                      void clearLocalSlash(target).catch((reason: unknown) => {
                        setSlashFailure({
                          sessionId: target.sessionId,
                          code:
                            reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                              ? reason.code
                              : 'EXECUTION_FAILED',
                        })
                      })
                  }}
                  onOpenFailed={(code) => {
                    const target = pendingModelSlash.current
                    pendingModelSlash.current = null
                    localSlashInFlight.current = false
                    if (target?.sessionId === sessionId) setSlashFailure({ sessionId, code })
                  }}
                />
              </LumenFrame>
            }
            backgroundAction={
              !activeRun ? (
                <HbarComposerBackgroundAgentStop
                  count={backgroundCount}
                  disabled={
                    backgroundDisabled ||
                    backgroundUnknown ||
                    backgroundEntry?.action.status === 'requested' ||
                    backgroundEntry?.action.status === 'failed'
                  }
                  pending={backgroundPending}
                  labels={t('backgroundAgents')}
                  onStop={stopBackground}
                />
              ) : undefined
            }
            onChange={(text) => {
              setSlashFailure(null)
              invoke('draft.setText', { sessionId, text })
            }}
            onAddAttachments={undefined}
            onRemoveAttachment={(id, kind) =>
              invoke('draft.removeAttachment', {
                sessionId,
                artifactId: id,
                kind,
                expectedRevision: draft?.revision ?? 0,
              })
            }
            onSubmit={() => {
              if (sessionId && navigation.workspaceId) void submitLatest(sessionId, navigation.workspaceId)
            }}
            onStop={() => {
              if (activeRun) {
                if (stopRun) stopRun(activeRun.id)
                else invoke('operation.cancel', { operationId: activeRun.id })
              }
            }}
          />
        </HbarComposerAttachmentDropTarget>
        {projectContextLabels && (
          <LumenFrame className="hbar-session-project-context-below">
            {projectContextView(showLaunchLocation)}
          </LumenFrame>
        )}
        {sessionUsagePresentation(controls, t('usage')).notice && (
          <HbarComposerFeedback tone="danger">
            <LumenContentText context="feedback.message" className="hbar-session-budget-notice" role="status">
              {sessionUsagePresentation(controls, t('usage')).notice}
            </LumenContentText>
          </HbarComposerFeedback>
        )}
      </LumenFrame>
    </HbarComposerFeedbackSessionProvider>
  ) : null
  return composer
})
