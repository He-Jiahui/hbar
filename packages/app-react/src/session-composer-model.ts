import { useEffect, useMemo, useRef, useState } from 'react'

import {
  RuntimeCommandError,
  getComposerState,
  isSessionWorkspaceMoveLocked,
  getGoalHistoryProjection,
  type PromptMention,
  type SessionLaunchDraftEntry,
} from '@hbar/app-runtime'

import { useHbarRuntime, useHbarRuntimeSelector, useHbarRuntimeState } from './runtime'

import { type HbarBackgroundAgentFeedbackKind } from './composer-background-agents'

import { currentSessionRun } from './session-run-activity'

import { addComposerAttachments } from './composer-attachment-input'

import { useHbarSessionProjectContext } from './session-project-context'

import {
  localAgentSlash,
  localGoalSlash,
  goalSlashReplacesCurrent,
  localSlashCanSubmit,
  localSlashCommand,
  type LocalSlashCommand,
} from './composer-slash'
import { showSessionEmptyHero } from './session-empty-hero'

import type { HbarComposerSlashLabels } from './composer-slash-menu'
import { composerAgentSlashLabels } from './composer-agent-slash-labels'

import { firstSendIsLocked } from './pre-session-launch-status'

import { useSessionStopAction } from './session-stop'
import { sessionStopCanCancel } from './session-stop-model'

import { sessionPreparationStatus } from './session-execution-notice'
import type { SessionComposerProps } from './session-workspace-contract'
import { useSessionComposerMessages } from './session-workspace-messages'
export function useSessionComposer({
  sessionWorkspaceId,
  connected,
  prepareAttachment,
  files,
  projectContextLabels,
  renderLaunchControls,
  composerWrites,
}: SessionComposerProps) {
  const { t } = useSessionComposerMessages()
  const slashMessageLabels = t('slash')
  const runtime = useHbarRuntime()
  const stopRun = useSessionStopAction()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const sessionId = navigation.sessionId
  const executionAccess = useHbarRuntimeState(runtime.state.sessionExecutionAccess)
  const selectedExecution = useHbarRuntimeState(runtime.state.selectedSessionExecution)
  const timeline = useHbarRuntimeState(runtime.state.timeline)
  const queuedUserRuns = useHbarRuntimeState(runtime.state.queuedUserRuns)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const workspaceMoveEntry = useHbarRuntimeSelector(runtime.state.sessionWorkspaceMove, (state) =>
    sessionId
      ? (state.entries[sessionId] ?? Object.values(state.entries).find((entry) => entry.targetSessionId === sessionId))
      : undefined,
  )
  const draft = useHbarRuntimeSelector(runtime.state.drafts, (state) => (sessionId ? state[sessionId] : undefined))
  const firstSendDraft = useHbarRuntimeSelector(runtime.state.preSessionDrafts, (state) =>
    Object.values(state).find(
      (entry) =>
        entry.sessionId === sessionId &&
        entry.capturedWorkspaceId === sessionWorkspaceId &&
        entry.error !== 'GOAL_PREPARED' &&
        entry.phase !== 'accepted' &&
        entry.phase !== 'idle',
    ),
  )
  const launchDraftEntry = useHbarRuntimeSelector(runtime.state.sessionLaunchDrafts, (state) =>
    sessionId ? state.entries[sessionId] : undefined,
  )
  const runActions = useHbarRuntimeState(runtime.state.runActions)
  const controls = useHbarRuntimeState(runtime.state.controls)
  const composerModel = useHbarRuntimeState(runtime.state.composerModel)
  const profileCatalog = useHbarRuntimeSelector(runtime.state.agentComposer, (state) => state.profileCatalog)
  const agentAction = useHbarRuntimeSelector(runtime.state.agentComposer, (state) =>
    sessionId ? state.actions[sessionId] : undefined,
  )
  const backgroundCandidate = useHbarRuntimeSelector(runtime.state.composerBackgroundAgents, (state) =>
    sessionId ? state.entries[sessionId] : undefined,
  )
  const composerFacts = useHbarRuntimeSelector(runtime.state.composerIntent, (state) => state.facts)
  const intentEntry = useHbarRuntimeSelector(runtime.state.composerIntent, (state) =>
    sessionId ? state.entries[sessionId] : undefined,
  )
  const goalHistoryAvailable = useHbarRuntimeSelector(runtime.state.goalHistory, (state) => state.available)
  const goalHistoryEntry = useHbarRuntimeSelector(runtime.state.goalHistory, (state) =>
    sessionId ? state.sessions[sessionId] : undefined,
  )
  const permissionAvailable = useHbarRuntimeSelector(runtime.state.composerPermission, (state) => state.available)
  const permissionDefault = useHbarRuntimeSelector(runtime.state.composerPermission, (state) => state.hostDefault)
  const permissionEntry = useHbarRuntimeSelector(runtime.state.composerPermission, (state) =>
    sessionId ? state.entries[sessionId] : undefined,
  )
  const planModeAvailable = useHbarRuntimeSelector(runtime.state.composerPlanMode, (state) => state.available)
  const planModeEntry = useHbarRuntimeSelector(runtime.state.composerPlanMode, (state) =>
    sessionId ? state.entries[sessionId] : undefined,
  )
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const workspaceMoveLocked = isSessionWorkspaceMoveLocked(workspaceMoveEntry)
  const firstSendLocked = firstSendIsLocked(firstSendDraft)
  const slashLabels = useMemo<HbarComposerSlashLabels>(
    () => composerAgentSlashLabels(slashMessageLabels, profileCatalog),
    [profileCatalog, slashMessageLabels],
  )
  useEffect(() => {
    if (!connected || !sessionId || !navigation.workspaceId) return
    void runtime.commands
      .execute('agentComposer.refresh', { sessionId, workspaceId: navigation.workspaceId })
      .catch(() => undefined)
  }, [connected, navigation.workspaceId, runtime.commands, sessionId])
  const preparationStatus = sessionPreparationStatus(
    executionAccess,
    sessionId && navigation.workspaceId === sessionWorkspaceId ? { sessionId, workspaceId: sessionWorkspaceId } : null,
  )
  const canPrepare = preparationStatus === 'ready' && !firstSendLocked && !workspaceMoveLocked
  const composerDraft = sessionId ? (runtime.state.drafts.getSnapshot()[sessionId] ?? draft) : draft
  const goalHistoryProjection = useMemo(
    () => (goalHistoryEntry ? getGoalHistoryProjection(goalHistoryEntry) : null),
    [goalHistoryEntry],
  )
  const intentPending = intentEntry?.submission.status === 'submitting' || intentEntry?.submission.status === 'unknown'
  const activeSessionTab = tabs.items.find((tab) => tab.id === tabs.activeId)
  const activeConversationOwner =
    navigation.status === 'idle' &&
    Boolean(sessionId) &&
    navigation.sessionId === sessionId &&
    navigation.workspaceId === sessionWorkspaceId &&
    presentation.page.kind === 'session' &&
    (tabs.activeId === null
      ? activeSessionTab === undefined
      : activeSessionTab?.kind === 'session' &&
        activeSessionTab.sessionId === sessionId &&
        activeSessionTab.workspaceId === sessionWorkspaceId)
  const intent = intentEntry?.intent ?? 'default'
  const model = controls.sessionId === sessionId ? controls.model : null
  const configured = model?.status === 'configured' && model.modelId !== null
  const modelPending =
    composerModel.sessionId === sessionId &&
    (composerModel.action.status === 'submitting' || composerModel.action.status === 'unknown')
  const activeRuns =
    timeline.sessionId === sessionId
      ? timeline.runs.filter(
          (run) => run.sessionId === sessionId && ['queued', 'running', 'waiting_approval'].includes(run.status),
        )
      : []
  const activeRun = currentSessionRun(activeRuns)
  const canCancelRun = (operationId: string) =>
    sessionStopCanCancel(
      {
        hostId: runtime.hostId,
        runtimeId: runtime.instanceId,
        connected,
        navigation,
        tabs,
        presentation,
        surfaces,
        timeline,
        actions: runActions,
      },
      operationId,
    )
  const projectContext = useHbarSessionProjectContext({
    sessionId,
    workspaceId: sessionWorkspaceId,
    connected,
    terminalRunId:
      [...timeline.runs].reverse().find((run) => ['completed', 'failed', 'cancelled'].includes(run.status))?.id ?? null,
    enabled: Boolean(projectContextLabels),
  })
  const branchTargetsAvailable = useHbarRuntimeSelector(
    runtime.state.sessionBranchTargetPicker,
    (state) => state.available,
  )
  const branchTargetEntry = useHbarRuntimeSelector(runtime.state.sessionBranchTargetPicker, (state) =>
    sessionId ? state.entries[sessionId] : undefined,
  )
  const execute = (name: string, input: unknown) =>
    (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input)
  const invoke = (name: string, input: unknown) => void execute(name, input).catch(() => {})
  const canPrepareTarget = (targetSessionId: string, targetWorkspaceId: string) =>
    runtime.getSessionExecutionAccess({ sessionId: targetSessionId, workspaceId: targetWorkspaceId }).kind === 'ready'
  const hasOwnedEmptySessionLaunchDraft = (targetSessionId: string, targetWorkspaceId: string) => {
    const owner = runtime.state.sessionLaunchDrafts.getSnapshot().entries[targetSessionId]
    const navigationState = runtime.state.navigation.getSnapshot()
    const latestDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
    const sessionTimeline = runtime.state.timeline.getSnapshot()
    const submission = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]?.submission.status
    return Boolean(
      owner?.workspaceId === targetWorkspaceId &&
      navigationState.status === 'idle' &&
      navigationState.sessionId === targetSessionId &&
      navigationState.workspaceId === targetWorkspaceId &&
      latestDraft?.lastOperationId === null &&
      sessionTimeline.sessionId === targetSessionId &&
      sessionTimeline.status === 'ready' &&
      sessionTimeline.messages.length === 0 &&
      !sessionTimeline.hasOlder &&
      sessionTimeline.runs.length === 0 &&
      sessionTimeline.approvals.length === 0 &&
      sessionTimeline.userInputs.length === 0 &&
      Object.keys(sessionTimeline.streams).length === 0 &&
      !['submitting', 'unknown'].includes(submission ?? ''),
    )
  }
  const prepareSessionLaunchTarget = async (
    targetSessionId: string,
    targetWorkspaceId: string,
    expectedDraftRevision: number,
  ): Promise<number> => {
    if (!runtime.state.sessionLaunchDrafts.getSnapshot().available)
      throw new RuntimeCommandError('CAPABILITY_UNAVAILABLE', 'Session Location preparation is unavailable')
    const selected = runtime.state.navigation.getSnapshot()
    const latestDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
    const sessionTimeline = runtime.state.timeline.getSnapshot()
    const intentSubmission = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]?.submission.status
    if (
      selected.status !== 'idle' ||
      selected.sessionId !== targetSessionId ||
      selected.workspaceId !== targetWorkspaceId ||
      latestDraft?.revision !== expectedDraftRevision ||
      latestDraft.lastOperationId !== null ||
      sessionTimeline.sessionId !== targetSessionId ||
      sessionTimeline.status !== 'ready' ||
      sessionTimeline.messages.length > 0 ||
      sessionTimeline.hasOlder ||
      sessionTimeline.runs.length > 0 ||
      sessionTimeline.approvals.length > 0 ||
      sessionTimeline.userInputs.length > 0 ||
      Object.keys(sessionTimeline.streams).length > 0 ||
      ['submitting', 'unknown'].includes(intentSubmission ?? '')
    )
      throw new RuntimeCommandError('SESSION_LAUNCH_TARGET_LOCKED', 'This Session is no longer empty')
    const existing = runtime.state.sessionLaunchDrafts.getSnapshot().entries[targetSessionId]
    const entry: SessionLaunchDraftEntry =
      existing ??
      (await runtime.commands.execute('sessionLaunchDraft.open', {
        sessionId: targetSessionId,
        workspaceId: targetWorkspaceId,
      }))
    if (entry.workspaceId !== targetWorkspaceId || entry.sessionId !== targetSessionId)
      throw new RuntimeCommandError('STALE_TARGET', 'Launch choice belongs to another Session or Workspace')
    const prepared = await runtime.commands.execute('sessionLaunchDraft.prepare', {
      sessionId: targetSessionId,
      expectedRevision: entry.revision,
    })
    const current = runtime.state.sessionLaunchDrafts.getSnapshot().entries[targetSessionId]
    const currentNavigation = runtime.state.navigation.getSnapshot()
    const currentDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
    if (
      prepared.phase !== 'ready' ||
      prepared.targetRevision === null ||
      current?.revision !== entry.revision ||
      current.phase !== 'ready' ||
      current.targetRevision !== prepared.targetRevision ||
      currentNavigation.status !== 'idle' ||
      currentNavigation.sessionId !== targetSessionId ||
      currentNavigation.workspaceId !== targetWorkspaceId ||
      currentDraft?.revision !== expectedDraftRevision
    )
      throw new RuntimeCommandError(
        prepared.error ?? current?.error ?? 'STALE_TARGET',
        'First-send launch preparation is not ready',
      )
    return prepared.targetRevision
  }
  const releaseSessionLaunchChoices = (targetSessionId: string) => {
    void runtime.commands.execute('sessionLaunchDraft.close', { sessionId: targetSessionId }).catch(() => undefined)
    void runtime.commands
      .execute('sessionLaunchBranchCreation.cancel', { draftId: targetSessionId })
      .catch(() => undefined)
  }
  const composerWrite = useRef<{ sessionId: string; promise: Promise<unknown> } | null>(null)
  const firstSessionRunInFlight = useRef<string | null>(null)
  const composerGoalTrigger = useRef<HTMLButtonElement>(null)
  const [goalMenuSlot, setGoalMenuSlot] = useState<HTMLDivElement | null>(null)
  const [goalPreparedRequest, setGoalPreparedRequest] = useState(0)
  const [editorFocusRequest, setEditorFocusRequest] = useState(0)
  const composerWriteError = useRef<{ sessionId: string; error: unknown } | null>(null)
  const localSlashInFlight = useRef(false)
  const pendingModelSlash = useRef<{ sessionId: string; workspaceId: string; revision: number } | null>(null)
  const [modelOpenRequest, setModelOpenRequest] = useState(0)
  const [slashOpenRequest, setSlashOpenRequest] = useState(0)
  const [slashFailure, setSlashFailure] = useState<{ sessionId: string; code: string; profileId?: string } | null>(null)
  const [templateRouteError, setTemplateRouteError] = useState<{ sessionId: string; code: string } | null>(null)
  const canOpenTemplates = Boolean(
    connected &&
    runtime.state.promptTemplates &&
    sessionId &&
    sessionWorkspaceId &&
    activeConversationOwner &&
    !workspaceMoveLocked &&
    !firstSendLocked &&
    !intentPending &&
    draft?.status !== 'submitting' &&
    draft?.status !== 'unknown',
  )
  const openTemplates = () => {
    if (!canOpenTemplates || !sessionId || !sessionWorkspaceId) return
    const targetSessionId = sessionId
    setTemplateRouteError(null)
    void runtime.commands
      .execute('app.openPanel', {
        panelId: 'prompt-templates',
        workspaceId: sessionWorkspaceId,
        sessionId: targetSessionId,
        binding: 'pinned',
      })
      .catch((reason: unknown) =>
        setTemplateRouteError({
          sessionId: targetSessionId,
          code: reason instanceof Error ? reason.message : String(reason),
        }),
      )
  }
  const [workspaceContextFailure, setWorkspaceContextFailure] = useState<{ sessionId: string; message: string } | null>(
    null,
  )
  const [launchTargetFailure, setLaunchTargetFailure] = useState<{ sessionId: string; code: string } | null>(null)
  const [goalConfirmation, setGoalConfirmation] = useState<{
    sessionId: string
    workspaceId: string
    revision: number
    text: string
    expectedGoalId: string
    previousObjective: string
    action: 'set' | 'clear'
    objective?: string
  } | null>(null)
  const slashIds = slashLabels.commands.map((item) => item.id)
  const sessionSlashSubmitCandidates: readonly LocalSlashCommand[] = [
    'model',
    'settings',
    'agents',
    'cost',
    'help',
    'compact',
  ]
  const submitSlashCommands = sessionSlashSubmitCandidates.filter((command) => slashIds.includes(command))
  useEffect(() => {
    pendingModelSlash.current = null
    localSlashInFlight.current = false
    setGoalConfirmation(null)
    setWorkspaceContextFailure(null)
  }, [sessionId])
  const saveComposerContent = (
    targetSessionId: string,
    text: string,
    mentions: readonly PromptMention[],
    expectedRevision: number,
  ) => {
    setSlashFailure((current) => (current?.sessionId === targetSessionId ? null : current))
    const promise = execute('draft.setContent', { sessionId: targetSessionId, text, mentions, expectedRevision })
    const writes = composerWrites.current.get(targetSessionId) ?? new Set<Promise<unknown>>()
    writes.add(promise)
    composerWrites.current.set(targetSessionId, writes)
    const token = { sessionId: targetSessionId, promise }
    composerWrite.current = token
    void promise.then(
      () => {
        writes.delete(promise)
        if (writes.size === 0) composerWrites.current.delete(targetSessionId)
        if (composerWrite.current === token) {
          composerWrite.current = null
          composerWriteError.current = null
        }
      },
      (error) => {
        writes.delete(promise)
        if (writes.size === 0) composerWrites.current.delete(targetSessionId)
        if (composerWrite.current === token) {
          composerWrite.current = null
          composerWriteError.current = { sessionId: targetSessionId, error }
        }
      },
    )
    return promise
  }
  const clearLocalSlash = async (target: { sessionId: string; workspaceId: string; revision: number }) => {
    const selected = runtime.state.navigation.getSnapshot()
    const latest = runtime.state.drafts.getSnapshot()[target.sessionId]
    if (
      selected.sessionId !== target.sessionId ||
      selected.workspaceId !== target.workspaceId ||
      latest?.revision !== target.revision ||
      !localSlashCommand(latest.text, slashIds) ||
      latest.mentions.length ||
      latest.workspaceContexts?.length ||
      latest.attachments.length ||
      latest.attachmentTransfers.length
    )
      return
    await execute('draft.setContent', {
      sessionId: target.sessionId,
      text: '',
      mentions: [],
      expectedRevision: target.revision,
    })
  }
  const runGoalSlash = async (
    target: { sessionId: string; workspaceId: string; revision: number; text: string },
    command: { action: 'set'; objective: string } | { action: 'clear' },
    expectedGoalId?: string,
  ) => {
    if (localSlashInFlight.current) return
    const selected = runtime.state.navigation.getSnapshot()
    const latest = runtime.state.drafts.getSnapshot()[target.sessionId]
    const goalFacts = runtime.state.composerIntent.getSnapshot().facts
    const replacing = goalSlashReplacesCurrent(
      command,
      goalFacts.sessionId === target.sessionId ? goalFacts.snapshot?.goal : null,
    )
    if (
      selected.sessionId !== target.sessionId ||
      selected.workspaceId !== target.workspaceId ||
      latest?.revision !== target.revision ||
      latest.text !== target.text ||
      latest.mentions.length ||
      latest.workspaceContexts?.length ||
      latest.attachments.length ||
      latest.attachmentTransfers.length ||
      (activeRun && !replacing)
    )
      return
    localSlashInFlight.current = true
    setSlashFailure(null)
    try {
      const modelState = runtime.state.controls.getSnapshot()
      const currentModel = modelState.sessionId === target.sessionId ? modelState.model : null
      if (
        command.action === 'set' &&
        !replacing &&
        (!currentModel || currentModel.status !== 'configured' || !currentModel.modelId)
      ) {
        setSlashFailure({ sessionId: target.sessionId, code: 'MODEL_NOT_CONFIGURED' })
        return
      }
      const permissionState = runtime.state.composerPermission.getSnapshot()
      const permission = permissionState.entries[target.sessionId]
      if (command.action === 'set' && permission?.locked && !replacing) {
        setSlashFailure({ sessionId: target.sessionId, code: 'SUBMISSION_PENDING' })
        return
      }
      const result = await execute('composerIntent.commandGoal', {
        sessionId: target.sessionId,
        ...command,
        ...(expectedGoalId ? { expectedGoalId } : {}),
      })
      const hostOwnsExecution =
        result && typeof result === 'object' && 'executionOwner' in result && result.executionOwner === 'host'
      if (command.action === 'set' && !hostOwnsExecution) {
        const goalId =
          result && typeof result === 'object' && 'goalId' in result && typeof result.goalId === 'string'
            ? result.goalId
            : null
        if (!goalId || !currentModel?.modelId) {
          setSlashFailure({ sessionId: target.sessionId, code: 'INVALID_OUTPUT' })
          return
        }
        let expectedLaunchTargetRevision: number | undefined
        if (
          (welcome && renderLaunchControls !== undefined) ||
          hasOwnedEmptySessionLaunchDraft(target.sessionId, target.workspaceId)
        ) {
          try {
            expectedLaunchTargetRevision = await prepareSessionLaunchTarget(
              target.sessionId,
              target.workspaceId,
              target.revision,
            )
          } catch (reason) {
            const code =
              reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                ? reason.code
                : 'EXECUTION_FAILED'
            setSlashFailure({ sessionId: target.sessionId, code })
            return
          }
        }
        await execute('composerIntent.startGoalRun', {
          sessionId: target.sessionId,
          objective: command.objective,
          expectedGoalId: goalId,
          modelId: currentModel.modelId,
          ...(expectedLaunchTargetRevision === undefined ? {} : { expectedLaunchTargetRevision }),
          ...(currentModel.thinkingLevel ? { thinking: currentModel.thinkingLevel } : {}),
          ...(permissionState.available ? { expectedPermissionRevision: permission?.revision ?? 0 } : {}),
          expectedDraftRevision: target.revision,
          draftText: target.text,
        })
        if (expectedLaunchTargetRevision !== undefined) releaseSessionLaunchChoices(target.sessionId)
      }
      await clearLocalSlash(target)
    } catch (reason) {
      const code =
        reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
          ? reason.code
          : 'EXECUTION_FAILED'
      setSlashFailure({
        sessionId: target.sessionId,
        code: code === 'RUN_ACTIVE' ? 'GOAL_RUN_ACTIVE' : code,
      })
    } finally {
      localSlashInFlight.current = false
    }
  }
  const submitLatest = async (targetSessionId: string, targetWorkspaceId: string) => {
    if (
      Object.values(runtime.state.preSessionDrafts.getSnapshot()).some(
        (entry) =>
          entry.sessionId === targetSessionId &&
          entry.capturedWorkspaceId === targetWorkspaceId &&
          firstSendIsLocked(entry),
      )
    )
      return
    const pending = composerWrite.current
    if (pending?.sessionId === targetSessionId) {
      try {
        await pending.promise
      } catch {
        return
      }
    }
    if (composerWriteError.current?.sessionId === targetSessionId) return
    const selected = runtime.state.navigation.getSnapshot()
    const latest = runtime.state.drafts.getSnapshot()[targetSessionId]
    if (latest && /^\/agent(?:\s|$)/.test(latest.text.trim())) {
      if (!connected || selected.sessionId !== targetSessionId || selected.workspaceId !== targetWorkspaceId) return
      const command = localAgentSlash(latest.text)
      if (!command) {
        setSlashFailure({ sessionId: targetSessionId, code: 'AGENT_REQUIRED' })
        return
      }
      let catalog = runtime.state.agentComposer.getSnapshot().profileCatalog
      if (catalog.status !== 'ready') {
        if (localSlashInFlight.current) return
        localSlashInFlight.current = true
        try {
          await runtime.commands.execute('agentComposer.refresh', {
            sessionId: targetSessionId,
            workspaceId: targetWorkspaceId,
          })
          catalog = runtime.state.agentComposer.getSnapshot().profileCatalog
        } catch {
          setSlashFailure({ sessionId: targetSessionId, code: 'AGENT_CATALOG_UNAVAILABLE' })
          return
        } finally {
          localSlashInFlight.current = false
        }
        const currentTarget = runtime.state.navigation.getSnapshot()
        const currentDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
        if (
          currentTarget.sessionId !== targetSessionId ||
          currentTarget.workspaceId !== targetWorkspaceId ||
          currentDraft?.revision !== latest.revision ||
          composerWrite.current?.sessionId === targetSessionId
        )
          return
      }
      if (catalog.status !== 'ready') {
        setSlashFailure({ sessionId: targetSessionId, code: 'AGENT_CATALOG_UNAVAILABLE' })
        return
      }
      if (!catalog.profiles.some((profile) => profile === command.profileId)) {
        setSlashFailure({ sessionId: targetSessionId, code: 'AGENT_PROFILE_UNAVAILABLE', profileId: command.profileId })
        return
      }
      // Completion/validation never creates a child. The ordinary parent Run below
      // owns its exact draft, attachments, model, permission and unknown receipt.
      setSlashFailure(null)
    }
    const slash = latest && localSlashCommand(latest.text, slashIds)
    if (slash) {
      const currentIntent = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]
      const currentPermission = runtime.state.composerPermission.getSnapshot().entries[targetSessionId]
      const currentModelAction = runtime.state.composerModel.getSnapshot()
      const pendingGoalCommand = slash === 'goal' && latest ? localGoalSlash(latest.text) : null
      const currentGoalFacts = runtime.state.composerIntent.getSnapshot().facts
      const currentGoal = currentGoalFacts.sessionId === targetSessionId ? currentGoalFacts.snapshot?.goal : null
      const activeGoalReplacement = Boolean(activeRun && goalSlashReplacesCurrent(pendingGoalCommand, currentGoal))
      if (
        !connected ||
        selected.sessionId !== targetSessionId ||
        selected.workspaceId !== targetWorkspaceId ||
        !latest ||
        !localSlashCanSubmit({
          draftStatus: latest.status,
          modelPending:
            currentModelAction.sessionId === targetSessionId &&
            ['submitting', 'unknown'].includes(currentModelAction.action.status),
          intentPending: ['submitting', 'unknown'].includes(currentIntent?.submission.status ?? ''),
          permissionLocked: Boolean(currentPermission?.locked) && !activeGoalReplacement,
        }) ||
        localSlashInFlight.current
      )
        return
      if (
        latest.mentions.length ||
        latest.attachments.length ||
        latest.attachmentTransfers.length ||
        (slash === 'compact' && latest.workspaceContexts?.length)
      ) {
        setSlashFailure({ sessionId: targetSessionId, code: 'ATTACHMENTS' })
        return
      }
      if (slash === 'model' && modelPending) return
      if (slash === 'model' && activeRun) {
        setSlashFailure({ sessionId: targetSessionId, code: 'RUN_ACTIVE' })
        return
      }
      if (slash === 'model' && !canPrepareTarget(targetSessionId, targetWorkspaceId)) return
      const target = { sessionId: targetSessionId, workspaceId: targetWorkspaceId, revision: latest.revision }
      if (slash === 'compact') {
        const currentTimeline = runtime.state.timeline.getSnapshot()
        if (currentTimeline.sessionId !== targetSessionId || currentTimeline.status !== 'ready') return
        if (
          currentTimeline.runs.some(
            (run) =>
              run.sessionId === targetSessionId && ['queued', 'running', 'waiting_approval'].includes(run.status),
          ) ||
          currentTimeline.activeCompaction?.status === 'running'
        ) {
          setSlashFailure({ sessionId: targetSessionId, code: 'COMPACTION_BUSY' })
          return
        }
      }
      if (slash === 'goal') {
        if (['submitting', 'unknown'].includes(currentIntent?.goalAction.status ?? '')) return
        const command = localGoalSlash(latest.text)
        if (!command) {
          setSlashFailure({ sessionId: targetSessionId, code: 'GOAL_REQUIRED' })
          return
        }
        if (activeRun && !activeGoalReplacement) {
          setSlashFailure({ sessionId: targetSessionId, code: 'GOAL_RUN_ACTIVE' })
          return
        }
        const facts = runtime.state.composerIntent.getSnapshot().facts
        if (facts.sessionId !== targetSessionId || facts.status !== 'ready' || !facts.snapshot) {
          setSlashFailure({ sessionId: targetSessionId, code: 'GOAL_SNAPSHOT_UNAVAILABLE' })
          return
        }
        const previous = facts.snapshot.goal
        if (previous && !previous.goalId) {
          setSlashFailure({ sessionId: targetSessionId, code: 'GOAL_SNAPSHOT_UNAVAILABLE' })
          return
        }
        if (previous && (command.action === 'clear' || previous.objective !== command.objective)) {
          setGoalConfirmation({
            ...target,
            text: latest.text,
            expectedGoalId: previous.goalId!,
            previousObjective: previous.objective,
            ...command,
          })
          setSlashFailure(null)
          return
        }
        await runGoalSlash({ ...target, text: latest.text }, command, previous?.goalId)
        return
      }
      localSlashInFlight.current = true
      setSlashFailure(null)
      try {
        if (slash === 'model') {
          pendingModelSlash.current = target
          setModelOpenRequest((value) => value + 1)
        } else if (slash === 'compact') {
          const modelState = runtime.state.controls.getSnapshot()
          const currentModel = modelState.sessionId === targetSessionId ? modelState.model : null
          if (currentModel?.status !== 'configured' || !currentModel.modelId) {
            setSlashFailure({ sessionId: targetSessionId, code: 'MODEL_NOT_CONFIGURED' })
            return
          }
          await execute('context.compact', { sessionId: targetSessionId, modelId: currentModel.modelId })
          await clearLocalSlash(target)
        } else if (slash === 'cost' || slash === 'agents') {
          const opened = await runtime.commands.execute('sessionTools.open', {
            panelId: slash === 'agents' ? 'agents' : 'monitoring',
            workspaceId: targetWorkspaceId,
            sessionId: targetSessionId,
            sourceTabInstanceKey: sourceTab?.instanceKey ?? null,
          })
          const presented = runtime.state.presentation.getSnapshot()
          if (presented.page.kind === 'session' && presented.toolInstanceId === opened.instanceId)
            await clearLocalSlash(target)
        } else if (slash === 'help') {
          const opened = await runtime.commands.execute('app.openPanel', { panelId: 'commands' })
          const presented = runtime.state.presentation.getSnapshot()
          if (opened.panelId === 'commands' && presented.modalInstanceId === opened.instanceId)
            await clearLocalSlash(target)
        } else {
          await execute('app.openSettings', {
            scope: 'session',
            targetId: targetSessionId,
            workspaceId: targetWorkspaceId,
            sessionId: targetSessionId,
            binding: 'pinned',
          })
          const presented = runtime.state.presentation.getSnapshot().page
          if (presented.kind === 'settings') await clearLocalSlash(target)
        }
      } catch (reason) {
        setSlashFailure({
          sessionId: targetSessionId,
          code:
            reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
              ? reason.code
              : 'EXECUTION_FAILED',
        })
      } finally {
        if (slash !== 'model') localSlashInFlight.current = false
      }
      return
    }
    const modelState = runtime.state.controls.getSnapshot()
    const currentModel = modelState.sessionId === targetSessionId ? modelState.model : null
    const intentState = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]
    const planModeState = runtime.state.composerPlanMode.getSnapshot()
    const permissionState = runtime.state.composerPermission.getSnapshot()
    const permission = permissionState.entries[targetSessionId]
    const modelAction = runtime.state.composerModel.getSnapshot()
    const sessionTimeline = runtime.state.timeline.getSnapshot()
    const launchPreparationRequired =
      ((welcome && renderLaunchControls !== undefined) ||
        hasOwnedEmptySessionLaunchDraft(targetSessionId, targetWorkspaceId)) &&
      sessionTimeline.sessionId === targetSessionId &&
      sessionTimeline.status === 'ready' &&
      latest?.lastOperationId === null &&
      sessionTimeline.messages.length === 0 &&
      !sessionTimeline.hasOlder &&
      sessionTimeline.runs.length === 0 &&
      sessionTimeline.approvals.length === 0 &&
      sessionTimeline.userInputs.length === 0 &&
      Object.keys(sessionTimeline.streams).length === 0 &&
      !['submitting', 'unknown'].includes(intentState?.submission.status ?? '')
    if (
      !connected ||
      !canPrepareTarget(targetSessionId, targetWorkspaceId) ||
      selected.sessionId !== targetSessionId ||
      selected.workspaceId !== targetWorkspaceId ||
      !latest ||
      !currentModel ||
      currentModel.status !== 'configured' ||
      !currentModel.modelId ||
      sessionTimeline.sessionId !== targetSessionId ||
      ['loading', 'error'].includes(sessionTimeline.status) ||
      latest.status === 'unknown' ||
      latest.status === 'submitting' ||
      latest.attachmentTransfers.length ||
      (!latest.text.trim() && !latest.attachments.length && !latest.workspaceContexts?.length) ||
      (intentState?.intent === 'goal' && !latest.text.trim()) ||
      permission?.locked ||
      (modelAction.sessionId === targetSessionId && ['submitting', 'unknown'].includes(modelAction.action.status)) ||
      ['submitting', 'unknown'].includes(intentState?.submission.status ?? '') ||
      (planModeState.available &&
        (planModeState.entries[targetSessionId]?.status !== 'ready' || !planModeState.entries[targetSessionId]?.mode))
    )
      return
    const submitInput = {
      sessionId: targetSessionId,
      modelId: currentModel.modelId,
      expectedIntentRevision: intentState?.revision ?? 0,
      expectedDraftRevision: latest.revision,
      ...(permissionState.available ? { expectedPermissionRevision: permission?.revision ?? 0 } : {}),
      input: {
        text: latest.text,
        images: latest.attachments.filter((item) => item.kind === 'image').map((item) => item.artifact),
        files: latest.attachments.filter((item) => item.kind === 'file').map((item) => item.artifact),
        ...(currentModel.thinkingLevel ? { thinking: currentModel.thinkingLevel } : {}),
      },
    }
    if (launchPreparationRequired) {
      if (firstSessionRunInFlight.current === targetSessionId) return
      firstSessionRunInFlight.current = targetSessionId
      setLaunchTargetFailure(null)
      try {
        const expectedLaunchTargetRevision = await prepareSessionLaunchTarget(
          targetSessionId,
          targetWorkspaceId,
          latest.revision,
        )
        const currentNavigation = runtime.state.navigation.getSnapshot()
        const currentDraft = runtime.state.drafts.getSnapshot()[targetSessionId]
        const currentComposerIntent = runtime.state.composerIntent.getSnapshot().entries[targetSessionId]
        const currentComposerModel = runtime.state.controls.getSnapshot()
        const currentPermission = runtime.state.composerPermission.getSnapshot().entries[targetSessionId]
        const currentPlanMode = runtime.state.composerPlanMode.getSnapshot().entries[targetSessionId]
        if (
          currentNavigation.status !== 'idle' ||
          currentNavigation.sessionId !== targetSessionId ||
          currentNavigation.workspaceId !== targetWorkspaceId ||
          currentDraft?.revision !== latest.revision ||
          (currentComposerIntent?.revision ?? 0) !== submitInput.expectedIntentRevision ||
          currentComposerModel.sessionId !== targetSessionId ||
          currentComposerModel.model?.status !== 'configured' ||
          currentComposerModel.model.modelId !== submitInput.modelId ||
          currentComposerModel.model.thinkingLevel !== currentModel.thinkingLevel ||
          (permissionState.available &&
            (currentPermission?.locked || currentPermission?.revision !== (permission?.revision ?? 0))) ||
          (planModeState.available &&
            (currentPlanMode?.status !== 'ready' ||
              currentPlanMode.mode !== planModeState.entries[targetSessionId]?.mode))
        )
          throw new RuntimeCommandError('VERSION_CONFLICT', 'Composer choices changed during first-send preparation')
        await runtime.commands.execute('composerIntent.submit', {
          ...submitInput,
          expectedLaunchTargetRevision,
        })
        releaseSessionLaunchChoices(targetSessionId)
      } catch (reason) {
        setLaunchTargetFailure({
          sessionId: targetSessionId,
          code:
            reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
              ? reason.code
              : 'EXECUTION_FAILED',
        })
      } finally {
        if (firstSessionRunInFlight.current === targetSessionId) firstSessionRunInFlight.current = null
      }
      return
    }
    invoke('composerIntent.submit', submitInput)
  }
  const attachmentTransfers = draft?.attachmentTransfers ?? []
  const workspaceContexts = draft?.workspaceContexts ?? []
  const attachmentIntakeEnabled =
    Boolean(prepareAttachment) &&
    canPrepare &&
    !workspaceMoveLocked &&
    connected &&
    timeline.status !== 'loading' &&
    timeline.status !== 'error' &&
    draft?.status !== 'submitting' &&
    draft?.status !== 'unknown' &&
    !intentPending &&
    !attachmentTransfers.some((item) => item.status === 'unknown' || item.status === 'reconciling')
  const canAddAttachments =
    attachmentIntakeEnabled && (draft?.attachments.length ?? 0) + attachmentTransfers.length < 12
  const canOpenSlash =
    !firstSendLocked &&
    !workspaceMoveLocked &&
    Boolean(files && sessionId && navigation.workspaceId && connected) &&
    timeline.status !== 'loading' &&
    timeline.status !== 'error' &&
    draft?.status !== 'submitting' &&
    draft?.status !== 'unknown'
  const addAttachments = (files: readonly File[]) => {
    if (!sessionId || !prepareAttachment || !attachmentIntakeEnabled) return
    void addComposerAttachments(runtime, { sessionId, revision: draft?.revision ?? 0 }, files, prepareAttachment).catch(
      () => {},
    )
  }
  const removeWorkspaceContext = (contextId: string) => {
    if (!sessionId || !draft || !connected || firstSendLocked || workspaceMoveLocked || intentPending) return
    const targetSessionId = sessionId
    const expectedRevision = draft.revision
    setWorkspaceContextFailure(null)
    void execute('draft.removeWorkspaceContext', { sessionId: targetSessionId, expectedRevision, contextId }).catch(
      () => {
        if (runtime.state.navigation.getSnapshot().sessionId === targetSessionId)
          setWorkspaceContextFailure({ sessionId: targetSessionId, message: t('workspaceContexts').removeError })
      },
    )
  }
  const workspaceContextError =
    connected && workspaceContextFailure?.sessionId === sessionId ? workspaceContextFailure.message : undefined
  const sourceTab = tabs.items.find((item) => item.kind === 'session' && item.sessionId === sessionId)
  const backgroundTarget =
    sessionId && navigation.workspaceId && sourceTab?.kind === 'session'
      ? { sessionId, workspaceId: navigation.workspaceId, sourceTabInstanceKey: sourceTab.instanceKey }
      : null
  const backgroundEntry =
    backgroundTarget &&
    backgroundCandidate?.workspaceId === backgroundTarget.workspaceId &&
    backgroundCandidate.sourceTabInstanceKey === backgroundTarget.sourceTabInstanceKey
      ? backgroundCandidate
      : undefined
  const backgroundCount =
    backgroundEntry?.items.filter((item) =>
      ['queued', 'running', 'waiting_approval', 'cancelRequested'].includes(item.status),
    ).length ?? 0
  const backgroundPending = backgroundEntry?.action.status === 'busy'
  const backgroundUnknown = backgroundEntry?.action.status === 'unknown'
  const backgroundDisabled =
    !connected ||
    !activeConversationOwner ||
    workspaceMoveLocked ||
    firstSendLocked ||
    timeline.sessionId !== sessionId ||
    timeline.status !== 'ready' ||
    backgroundEntry?.readStatus !== 'ready'
  const backgroundFeedback: HbarBackgroundAgentFeedbackKind | null = backgroundPending
    ? backgroundEntry?.action.phase === 'reconcile'
      ? 'checking'
      : 'submitting'
    : backgroundUnknown
      ? 'unknown'
      : backgroundEntry?.action.status === 'failed'
        ? 'failed'
        : backgroundEntry?.action.status === 'requested'
          ? 'requested'
          : backgroundEntry?.action.status === 'settled'
            ? 'settled'
            : backgroundEntry?.readStatus === 'error' || backgroundEntry?.readStatus === 'unknown'
              ? 'read-error'
              : null
  const reconcileBackground = () => {
    if (backgroundTarget && backgroundEntry?.action.id)
      invoke('composerBackgroundAgents.reconcile', { ...backgroundTarget, actionId: backgroundEntry.action.id })
  }
  const stopBackground = () => {
    if (backgroundTarget) invoke('composerBackgroundAgents.cancel', backgroundTarget)
  }
  const retryBackground = () => {
    if (backgroundTarget && backgroundEntry?.action.id)
      invoke('composerBackgroundAgents.cancel', { ...backgroundTarget, actionId: backgroundEntry.action.id })
  }
  const draftGoalReplacement = goalSlashReplacesCurrent(
    localSlashCommand(draft?.text ?? '', slashIds) === 'goal' ? localGoalSlash(draft?.text ?? '') : null,
    composerFacts.sessionId === sessionId ? composerFacts.snapshot?.goal : null,
  )
  const welcome =
    (!goalHistoryAvailable ||
      (goalHistoryEntry?.status === 'ready' &&
        !goalHistoryProjection?.gap &&
        !goalHistoryEntry.hasOlder &&
        goalHistoryEntry.facts.length === 0)) &&
    !(composerFacts.sessionId === sessionId && composerFacts.snapshot?.goal) &&
    showSessionEmptyHero({
      connected,
      sessionId,
      loadedSessionId: timeline.sessionId,
      timelineStatus: timeline.status,
      timelineError: timeline.error,
      olderStatus: timeline.olderStatus,
      hasOlder: timeline.hasOlder,
      messageCount: timeline.messages.length,
      runCount: timeline.runs.length,
      streamCount: Object.keys(timeline.streams).length,
      approvalCount: timeline.approvals.length,
      userInputCount: timeline.userInputs.length,
      draftStatus: draft?.status ?? null,
      lastOperationId: draft?.lastOperationId ?? null,
      submissionPending: intentPending || Boolean(permissionEntry?.locked),
    })
  const confirmedEmptyTimeline =
    timeline.sessionId === sessionId &&
    timeline.status === 'ready' &&
    timeline.messages.length === 0 &&
    !timeline.hasOlder &&
    timeline.runs.length === 0 &&
    timeline.approvals.length === 0 &&
    timeline.userInputs.length === 0 &&
    Object.keys(timeline.streams).length === 0 &&
    draft?.lastOperationId === null
  const showLaunchLocation =
    welcome ||
    Boolean(launchDraftEntry && launchDraftEntry.workspaceId === sessionWorkspaceId && confirmedEmptyTimeline)
  const visibleSlashFailure = (() => {
    if (!slashFailure || slashFailure.sessionId !== sessionId) return undefined
    if (
      agentAction?.status === 'unknown' &&
      ['RESULT_UNKNOWN', 'TIMEOUT', 'DISCONNECTED', 'CONNECTION_CLOSED'].includes(slashFailure.code)
    )
      return undefined
    if (
      slashFailure.code === 'RESULT_UNKNOWN' &&
      localSlashCommand(draft?.text ?? '', slashIds) === 'goal' &&
      intentEntry?.goalAction.status === 'succeeded'
    )
      return undefined
    if (
      slashFailure.code === 'ATTACHMENTS' &&
      !draft?.attachments.length &&
      !draft?.mentions.length &&
      !draft?.workspaceContexts?.length &&
      !attachmentTransfers.length
    )
      return undefined
    switch (slashFailure.code) {
      case 'ATTACHMENTS':
        return t('slash').attachmentsBlocked
      case 'RUN_ACTIVE':
        return t('slash').modelBusy
      case 'GOAL_REQUIRED':
        return t('slash').goalRequired
      case 'GOAL_RUN_ACTIVE':
        return t('slash').goalBusy
      case 'GOAL_SNAPSHOT_UNAVAILABLE':
        return t('slash').goalSnapshotUnavailable
      case 'AGENT_REQUIRED':
        return t('slash').agentRequired
      case 'AGENT_CATALOG_UNAVAILABLE':
        return t('slash').agentCatalogUnavailable
      case 'AGENT_PROFILE_UNAVAILABLE':
        return t('slash').agentProfileUnavailable(slashFailure.profileId ?? '')
      default:
        return t('slash').error(slashFailure.code)
    }
  })()
  const composerState = getComposerState({
    connected,
    sessionLoaded: timeline.sessionId === sessionId,
    timelineStatus: timeline.status,
    cancelAllowed: Boolean(activeRun && canCancelRun(activeRun.id)),
    preparation: preparationStatus,
    firstSend: firstSendDraft,
    workspaceMove: workspaceMoveEntry,
    draft,
    configured: Boolean(configured),
    modelPending,
    intentPending,
    permissionLocked: Boolean(permissionEntry?.locked),
    planModeReady: !planModeAvailable || planModeEntry?.status === 'ready',
    intent,
    slash: localSlashCommand(draft?.text ?? '', slashIds),
    goalReplacement: draftGoalReplacement,
    goalActionPending: ['submitting', 'unknown'].includes(intentEntry?.goalAction.status ?? ''),
    runActive: Boolean(activeRun),
    compactionRunning: timeline.activeCompaction?.status === 'running',
  })
  return {
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
    canCancelRun,
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
    setModelOpenRequest,
    slashOpenRequest,
    setSlashOpenRequest,
    slashFailure,
    setSlashFailure,
    templateRouteError,
    setTemplateRouteError,
    canOpenTemplates,
    openTemplates,
    launchTargetFailure,
    setLaunchTargetFailure,
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
  }
}
