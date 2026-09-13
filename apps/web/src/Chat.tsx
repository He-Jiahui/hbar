import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  FileCode2,
  Pause,
  Play,
  X,
} from 'lucide-react'
import type { ArtifactRef, GitInfo, GoalStatus, Run, UserInput } from '@hbar/contracts'
import type { ComposerAction } from '@hbar/ui-sdk'
import {
  acknowledgeComposerDraft,
  client,
  moveComposerDraft,
  updateComposerDraft,
  loadOlder,
  openSession,
  refreshCatalog,
  report,
  setApprovalMode,
  useCatalog,
  useGitState,
  useSessions,
  useWorkbench,
} from './stores'
import Markdown from './Markdown'
import { copyText, newRequestId } from './browser-utils'
import { buildComposerActions } from './composer-actions'
import { modelThinkingLabel } from './model-catalog'
import { useUIPlugins } from './ui-plugins'
import { clearBudget, clearGoal, createGoal, setBudget, setGoal, setGoalArmed, setMode, setUnattended, useSessionCapabilities } from './session-capabilities'
import PromptComposer, { type AttachmentKind, type OpenFilePicker } from './PromptComposer'
import ChatSessionChrome from './ChatSessionChrome'
import GitContextSwitcher from './GitContextSwitcher'
import TerminalPanel from './TerminalPanel'
import { useReferenceProjections } from './react-bits/production-context'
import {
  ChatApprovalSurface,
  ChatMessageSurface,
  ChatQueueSurface,
  ChatStreamSurface,
  RunOutcomeSurface,
  UserInputSurface,
  referenceAttributes,
  type ChatApprovalSurfaceLabels,
  type ChatMessageSurfaceLabels,
  type ChatQueueSurfaceLabels,
  type ReferenceContextItem,
  type RunOutcomeSurfaceLabels,
  type UserInputSurfaceLabels,
} from './react-bits'
import { useLocale, type LocaleMessageKey } from './locale'
const CodeEditor = lazy(() => import('./CodeEditor'))
const EMPTY_ARTIFACTS: ArtifactRef[] = []
type Translate = (key: LocaleMessageKey) => string

function goalStatusLabel(status: GoalStatus, t: Translate) {
  return {
    active: t('chatStatusActive'),
    paused: t('chatStatusPaused'),
    blocked: t('chatStatusBlocked'),
    usage_limited: t('chatStatusUsageLimited'),
    budget_limited: t('chatStatusBudgetLimited'),
    complete: t('chatStatusComplete'),
  }[status]
}

function approvalSummary(tool: string, args: Record<string, unknown>): string {
  if (typeof args.path === 'string') return `${tool} · ${args.path}`
  if (typeof args.command === 'string') return `${tool} · ${args.command}`
  return tool
}

function approvalImpact(tool: string, t: Translate): string {
  const normalized = tool.toLocaleLowerCase()
  if (/(write|edit|delete|move|rename|mkdir)/.test(normalized)) return t('chatApprovalWorkspaceImpact')
  if (/(terminal|shell|command|exec)/.test(normalized)) return t('chatApprovalTerminalImpact')
  if (/(browser|navigate|page)/.test(normalized)) return t('chatApprovalBrowserImpact')
  return t('chatApprovalConfirmImpact')
}

export default function Chat({
  sessionId = '',
  onSettings,
  view = 'chat',
  onViewChange,
  onSelectSession,
  onUseWorktree,
}: {
  sessionId?: string
  onSettings(): void
  view?: 'chat' | 'console'
  onViewChange(view: 'chat' | 'console'): void
  onSelectSession(sessionId: string): void
  onUseWorktree(path: string): void | Promise<void>
}) {
  const { locale, t } = useLocale()
  const snapshot = useSessions((state) => state.snapshots[sessionId])
  const catalog = useCatalog((state) => state.data)
  const sessionInfo = catalog?.sessions.find((session) => session.id === sessionId) ?? snapshot?.session
  const composerDraft = useWorkbench((state) => state.drafts[sessionId || 'new'])
  const draft = composerDraft?.text ?? ''
  const images = composerDraft?.images ?? EMPTY_ARTIFACTS
  const files = composerDraft?.files ?? EMPTY_ARTIFACTS
  const modelId = useWorkbench((state) => state.modelId),
    thinkingLevel = useWorkbench((state) => state.thinkingLevel),
    approvalMode = useWorkbench((state) => state.approvalMode),
    workspaceId = useWorkbench((state) => state.workspaceId)
  const gitRevision = useGitState((state) => state.revision)
  const workspace = catalog?.workspaces.find((item) => item.id === (snapshot?.session.workspaceId ?? workspaceId))
  const contributedActions = useUIPlugins((state) => state.composerActions)
  const capabilityState = useSessionCapabilities((state) => state.sessions[sessionId])
  const referenceProjections = useReferenceProjections(sessionId)
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState('')
  const [budgetEditing, setBudgetEditing] = useState(false)
  const [resolvingApprovals, setResolvingApprovals] = useState<Set<string>>(() => new Set())
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const [gitProject, setGitProject] = useState<boolean | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const scroll = useRef<HTMLDivElement>(null),
    stick = useRef(true)
  const pendingRequest = useRef<{ key: string; requestId: string } | null>(null)
  const resolvingApprovalIds = useRef(new Set<string>())
  const messages = snapshot?.messages ?? []
  useEffect(() => {
    if (!workspace?.path) {
      setGitInfo(null)
      setGitProject(null)
      return
    }
    let connection: ReturnType<typeof client>
    try {
      connection = client()
    } catch {
      setGitInfo(null)
      setGitProject(null)
      return
    }
    let alive = true
    void connection
      .call('git.status', { cwd: workspace.path })
      .then((status) => {
        if (alive)
          setGitInfo({
            sha: status.head,
            branch: status.root ? status.branch ?? t('chatDetachedHead') : null,
            originUrl: status.originUrl,
          })
        if (alive) setGitProject(Boolean(status.root))
      })
      .catch(() => {
        if (alive) setGitInfo(null)
        if (alive) setGitProject(null)
      })
    return () => {
      alive = false
    }
  }, [gitRevision, t, workspace?.path])
  const virtual = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 170,
    getItemKey: (index) => messages[index]!.id,
    overscan: 5,
  })
  const activeRun = snapshot?.runs.find((run) => ['running', 'waiting_approval'].includes(run.status))
  // Snapshots are newest-first for the activity view, while the queue contract
  // is oldest-first: the first row is the next run the Host will claim.
  const queued = snapshot?.runs.filter((run) => run.status === 'queued').sort((left, right) => left.createdAt - right.createdAt) ?? []
  const lastRun = snapshot?.runs[0]
  const totalSize = virtual.getTotalSize()
  const referenceContext = useMemo<ReferenceContextItem[]>(() => {
    const items: ReferenceContextItem[] = []
    const selectedModel = catalog?.models.find((model) => model.id === modelId)
    if (selectedModel) {
      items.push({ id: 'model', label: t('model'), value: selectedModel.modelName, title: selectedModel.providerName })
    }
    if (snapshot) {
      items.push({
        id: 'tokens',
        label: t('contextUsage'),
        value: `${referenceProjections.usage.totalTokens.toLocaleString()} ${t('chatTokens')}`,
        title: `${t('inputTokens')} + ${t('outputTokens')}`,
      })
    }
    const approvalCount = referenceProjections.approval.approvals.filter((approval) => approval.status === 'pending').length
    if (approvalCount > 0)
      items.push({ id: 'approvals', label: t('approvals'), value: approvalCount, status: 'waiting' })
    if (referenceProjections.plan.steps.length > 0) {
      const completed = referenceProjections.plan.completed
      items.push({
        id: 'plan',
        label: t('steps'),
        value: `${completed}/${referenceProjections.plan.steps.length}`,
        status: completed === referenceProjections.plan.steps.length ? 'success' : 'running',
      })
    }
    if (referenceProjections.artifact.artifacts.length > 0)
      items.push({ id: 'artifacts', label: t('pendingAttachments'), value: referenceProjections.artifact.artifacts.length })
    if (referenceProjections.usage.budget) {
      const budget = referenceProjections.usage.budget
      items.push({
        id: 'budget',
        label: t('chatBudget'),
        value: `${budget.usedTokens.toLocaleString()}/${budget.limit.toLocaleString()}`,
        status: budget.remainingTokens === 0 ? 'error' : 'warning',
      })
    }
    return items
  }, [catalog?.models, modelId, referenceProjections, snapshot, t])
  const streamText = snapshot?.streams.map((stream) => stream.text.length + stream.thinking.length).join(',')
  const composerActions = useMemo(() => {
    const availability = {
        hasSession: Boolean(sessionId),
        canAttachImages: Boolean(catalog?.models.find((model) => model.id === modelId)?.imageInput),
        hasGoalPlugin: Boolean(
          catalog?.plugins.some((plugin) => plugin.id === 'goal.codex' && plugin.status === 'active'),
        ),
        hasPlanPlugin: Boolean(
          catalog?.plugins.some((plugin) => plugin.id === 'plan.codex' && plugin.status === 'active'),
        ),
        hasBudgetPlugin: Boolean(
          catalog?.plugins.some((plugin) => plugin.id === 'budget.codex' && plugin.status === 'active'),
        ),
      }
    const built = buildComposerActions(contributedActions, availability)
    const labels: Record<string, { label: string; description: string }> = {
      goal: { label: t('chatGoalMode'), description: t('chatGoalDescription') },
      plan: { label: t('chatPlanModeAction'), description: t('chatPlanDescription') },
      budget: { label: t('chatBudgetMode'), description: t('chatBudgetDescription') },
      'add-image': { label: t('chatAddImage'), description: t('chatAddImageDescription') },
      'add-file': { label: t('chatAddFile'), description: t('chatAddFileDescription') },
    }
    return built.map((action) => {
      const localized = labels[action.id]
      if (!localized) return action
      let disabledReason = action.disabledReason
      if (action.id === 'add-image' && !availability.canAttachImages) disabledReason = t('chatImageUnsupported')
      else if (action.id === 'goal' && availability.hasGoalPlugin === false) disabledReason = t('chatGoalPluginDisabled')
      else if (action.id === 'plan' && availability.hasPlanPlugin === false) disabledReason = t('chatPlanPluginDisabled')
      else if (action.id === 'budget' && availability.hasBudgetPlugin === false) disabledReason = t('chatBudgetPluginDisabled')
      else if (action.requiresSession && !availability.hasSession) disabledReason = t('chatSessionRequired')
      return { ...action, ...localized, ...(disabledReason ? { disabledReason } : {}) }
    })
  }, [catalog?.models, catalog?.plugins, contributedActions, modelId, sessionId, t])
  const messageLabels: ChatMessageSurfaceLabels = {
    thinking: t('chatThinking'),
    you: t('chatYou'),
    copyMessage: t('chatCopyMessage'),
    before: t('chatBefore'),
    after: t('chatAfter'),
    arguments: t('chatArguments'),
    callArguments: t('chatCallArguments'),
  }
  const queueLabels: ChatQueueSurfaceLabels = {
    queueAria: t('chatQueueAria'),
    queueCount: t('chatQueueCount'),
    queueAutoSend: t('chatQueueAutoSend'),
    queueContinue: t('chatQueueContinue'),
    editQueued: t('chatEditQueued'),
    removeQueued: t('chatRemoveQueued'),
    edit: t('chatEdit'),
    remove: t('chatRemove'),
    attachmentMessage: t('chatAttachmentMessage'),
  }
  const approvalLabels: ChatApprovalSurfaceLabels = {
    approveTool: t('chatApproveTool'),
    viewRequest: t('chatViewRequest'),
    deny: t('chatDeny'),
    approve: t('chatApprove'),
    allowRemember: t('chatAllowRemember'),
  }
  const userInputLabels: UserInputSurfaceLabels = {
    userInputRequired: t('chatUserInputRequired'),
    questionsCount: t('chatQuestionsCount'),
    recommended: t('chatRecommended'),
    other: t('chatOther'),
    otherAnswer: t('chatOtherAnswer'),
    fillOtherAnswer: t('chatFillOtherAnswer'),
    fillAnswer: t('chatFillAnswer'),
    answer: t('chatAnswer'),
    submitAnswers: t('chatSubmitAnswers'),
    answerAllQuestions: t('chatAnswerAllQuestions'),
    inputHandled: t('chatInputHandled'),
  }
  const outcomeLabels: RunOutcomeSurfaceLabels = {
    stopped: t('chatStopped'),
    editAgain: t('chatEditAgain'),
  }
  useEffect(() => {
    stick.current = true
    setAtBottom(true)
  }, [sessionId])
  useLayoutEffect(() => {
    if (stick.current) {
      const id = requestAnimationFrame(() => {
        if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
      })
      return () => cancelAnimationFrame(id)
    }
    return undefined
  }, [sessionId, totalSize, streamText, snapshot?.approvals.length, snapshot?.userInputs.length])
  const setDraft = (text: string) => updateComposerDraft(sessionId, { text })
  async function resolveApproval(approvalId: string, decision: 'allowed' | 'denied', remember = false) {
    if (resolvingApprovalIds.current.has(approvalId)) return
    resolvingApprovalIds.current.add(approvalId)
    setResolvingApprovals((current) => new Set(current).add(approvalId))
    try {
      if (remember && !(await setApprovalMode('allow'))) return
      await client().call('approval.resolve', { approvalId, decision })
    } catch (error) {
      report(error)
    } finally {
      resolvingApprovalIds.current.delete(approvalId)
      setResolvingApprovals((current) => {
        if (!current.has(approvalId)) return current
        const next = new Set(current)
        next.delete(approvalId)
        return next
      })
    }
  }
  async function send() {
    if (busy || uploading || sessionInfo?.archived || (!draft.trim() && !images.length && !files.length)) return
    if (!modelId) {
      onSettings()
      return
    }
    const sentDraft = { text: draft, images: [...images], files: [...files] }
    setBusy(true)
    try {
      let target = sessionId
      if (!target) {
        const created = await client().call('session.create', { workspaceId })
        target = created.id
        moveComposerDraft(undefined, target)
        await refreshCatalog()
        await openSession(target)
      }
      const input: UserInput = {
        text: sentDraft.text,
        images: sentDraft.images,
        files: sentDraft.files,
        thinking: thinkingLevel,
        approval: approvalMode,
      }
      const capabilities = useSessionCapabilities.getState().sessions[target]
      // Goal+Plan keeps the goal intent armed until Plan has persisted a
      // reviewable checklist; the Plan hook then promotes that checklist into
      // the active goal and starts the execution turn.
      if (capabilities?.goalArmed && !capabilities.goal && capabilities.mode !== 'plan' && sentDraft.text.trim()) {
        await createGoal(client(), target, sentDraft.text.trim())
        await setUnattended(client(), target, capabilities.unattended, false)
        setGoalArmed(target, false)
      }
      const key = JSON.stringify({ target, input, modelId, thinkingLevel })
      if (pendingRequest.current?.key !== key) pendingRequest.current = { key, requestId: newRequestId() }
      await client().call('run.start', {
        sessionId: target,
        requestId: pendingRequest.current.requestId,
        input,
        modelId,
      })
      pendingRequest.current = null
      acknowledgeComposerDraft(target, sentDraft)
      stick.current = true
      if (!snapshot) await openSession(target)
    } catch (error) {
      report(error)
    } finally {
      setBusy(false)
    }
  }
  function editQueuedRun(run: Run) {
    updateComposerDraft(sessionId, {
      text: run.input.text,
      images: run.input.images,
      files: run.input.files ?? [],
    })
    void client().call('run.cancel', { runId: run.id }).catch(report)
  }
  function removeQueuedRun(run: Run) {
    void client().call('run.cancel', { runId: run.id }).catch(report)
  }
  function reorderQueuedRuns(runIds: string[]) {
    if (!sessionId) return
    void client().call('run.reorder', { sessionId, runIds }).catch(report)
  }
  async function attach(selected: FileList | null, kind: AttachmentKind) {
    if (!selected) return
    const capacity = 12 - images.length - files.length
    if (capacity <= 0) {
      report(new Error(t('chatAttachmentLimit')))
      return
    }
    setUploading(true)
    const uploadedImages: ArtifactRef[] = []
    const uploadedFiles: ArtifactRef[] = []
    try {
      for (const file of [...selected].slice(0, capacity)) {
        const artifact = await client().upload(file)
        if (kind === 'image' && artifact.mime.startsWith('image/')) uploadedImages.push(artifact)
        else uploadedFiles.push(artifact)
      }
    } catch (error) {
      report(error)
    } finally {
      if (uploadedImages.length)
        updateComposerDraft(sessionId, (current) => ({ images: [...current.images, ...uploadedImages] }))
      if (uploadedFiles.length)
        updateComposerDraft(sessionId, (current) => ({ files: [...current.files, ...uploadedFiles] }))
      setUploading(false)
    }
  }
  function selectComposerAction(action: ComposerAction, openFilePicker: OpenFilePicker) {
    if (action.id === 'goal' || action.id === 'plan' || action.id === 'budget') {
      if (!sessionId) return
      if (action.id === 'goal' && !capabilityState?.goal) {
        setGoalArmed(sessionId, true)
        void setUnattended(client(), sessionId, capabilityState?.unattended ?? false, true).catch(report)
        return
      }
      if (action.id === 'budget') {
        setBudgetDraft(capabilityState?.budget ? String(capabilityState.budget.limit) : '')
        setBudgetEditing(true)
        return
      }
      const mode = action.id === 'plan' ? 'plan' : 'default'
      void (async () => {
        await setMode(client(), sessionId, mode)
      })().catch(report)
      return
    }
    if (!action.execute) return
    void Promise.resolve(
      action.execute({
        ...(sessionId ? { sessionId } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        openFilePicker,
      }),
    ).catch(report)
  }
  const modeTags = sessionId && (capabilityState?.mode === 'plan' || capabilityState?.goal || capabilityState?.budget || capabilityState?.goalArmed || capabilityState?.unattended || budgetEditing) ? (
    <div className="composer-mode-tags" aria-label={t('chatSessionModeAria')}>
      {capabilityState?.goalArmed && !capabilityState.goal && (
        <span className="composer-mode-tag composer-mode-tag-active" title={t('chatGoalNextMessage')}>
          <span>{capabilityState.mode === 'plan' && capabilityState.plan ? t('chatGoalArmedPlan') : t('chatGoalArmedPending')}</span>
          <button type="button" title={t('chatCancelGoalSetup')} aria-label={t('chatCancelGoalSetup')} onClick={() => setGoalArmed(sessionId, false)}><X size={12} /></button>
        </span>
      )}
      {capabilityState?.mode === 'plan' && (
        <span className={`composer-mode-tag${capabilityState.plan ? '' : ' composer-mode-tag-pending'}`} title={t('chatPlanModeTitle')}>
          <span>{capabilityState.plan ? `${t('chatPlanSaved')} ${capabilityState.plan.plan.length} ${t('chatSteps')}` : t('chatPlanPending')}</span>
          <button
            type="button"
            title={t('chatClosePlan')}
            aria-label={t('chatClosePlan')}
            onClick={() => void setMode(client(), sessionId, 'default').catch(report)}
          >
            <X size={12} />
          </button>
        </span>
      )}
      {capabilityState?.goal && (
        <span className="composer-mode-tag" title={`${t('chatGoalTitle')}：${capabilityState.goal.objective}`}>
          <span>{t('chatGoalTitle')} · {goalStatusLabel(capabilityState.goal.status, t)}</span>
          {['active', 'paused'].includes(capabilityState.goal.status) && (
            <button
              type="button"
              title={capabilityState.goal.status === 'active' ? t('chatPauseGoal') : t('chatContinueGoal')}
              aria-label={capabilityState.goal.status === 'active' ? t('chatPauseGoal') : t('chatContinueGoal')}
              onClick={() => {
                const goalId = capabilityState.goal?.goalId
                void setGoal(client(), sessionId, {
                  status: capabilityState.goal?.status === 'active' ? 'paused' : 'active',
                  ...(goalId ? { expectedGoalId: goalId } : {}),
                }).catch(report)
              }}
            >
              {capabilityState.goal.status === 'active' ? <Pause size={12} /> : <Play size={12} />}
            </button>
          )}
          <button
            type="button"
            title={t('chatCloseGoal')}
            aria-label={t('chatCloseGoal')}
            onClick={() => void clearGoal(client(), sessionId).catch(report)}
          >
            <X size={12} />
          </button>
        </span>
      )}
      {capabilityState?.budget && (
        <span className="composer-mode-tag" title={`${t('chatBudgetTitle')}：${t('chatBudgetRemaining')} ${capabilityState.budget.remainingTokens.toLocaleString()} ${t('chatTokens')}`}>
          <span>{t('chatBudgetTitle')} · {capabilityState.budget.phase === 'exhausted' ? t('chatBudgetExhausted') : `${capabilityState.budget.usedTokens.toLocaleString()} / ${capabilityState.budget.limit.toLocaleString()}`}</span>
          <button
            type="button"
            title={t('chatCloseBudget')}
            aria-label={t('chatCloseBudget')}
            onClick={() => void clearBudget(client(), sessionId).catch(report)}
          >
            <X size={12} />
          </button>
        </span>
      )}
      {budgetEditing && (
        <span className="composer-mode-tag composer-mode-budget-editor">
          <input aria-label={t('chatBudgetTokens')} type="number" min={1} value={budgetDraft} placeholder={t('chatDefaultBudget')} onChange={(event) => setBudgetDraft(event.target.value)} />
          <button type="button" title={t('chatSaveBudget')} aria-label={t('chatSaveBudget')} onClick={() => {
            const value = Number(budgetDraft)
            const save = Number.isSafeInteger(value) && value > 0
              ? setBudget(client(), sessionId, value)
              : client().call('settings.snapshot', { scope: 'global' }).then((snapshot) => {
                  const fallback = snapshot.values['session.defaultBudgetTokens']?.effectiveValue
                  return setBudget(client(), sessionId, typeof fallback === 'number' ? fallback : 10_000)
                })
            void save.then(() => setBudgetEditing(false)).catch(report)
          }}>✓</button>
          <button type="button" title={t('chatCancelBudget')} aria-label={t('chatCancelBudget')} onClick={() => setBudgetEditing(false)}><X size={12} /></button>
        </span>
      )}
      {capabilityState?.unattended ? (
        <span className="composer-mode-tag composer-mode-tag-active" title={t('chatUnattendedTitle')}>
          <span>{t('chatUnattended')}</span>
          <button type="button" title={t('chatCloseUnattended')} aria-label={t('chatCloseUnattended')} onClick={() => void setUnattended(client(), sessionId, false).catch(report)}><X size={12} /></button>
        </span>
      ) : (
        <button type="button" className="composer-unattended-toggle" onClick={() => {
          if (window.confirm(t('chatUnattendedConfirm')))
            void setUnattended(client(), sessionId, true).catch(report)
        }}>{t('chatEnterUnattended')}</button>
      )}
    </div>
  ) : undefined
  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-1', 'session-chat')}
      className="chat-panel"
    >
      <ChatSessionChrome
        sessionId={sessionId}
        session={sessionInfo}
        workspace={workspace}
        gitInfo={gitInfo}
        modelContext={catalog?.models.find((model) => model.id === modelId)?.modelName ?? modelId}
        thinkingContext={thinkingLevel}
        activeRun={activeRun}
        referenceContext={referenceContext}
        view={view}
        showContext={view === 'chat'}
        onViewChange={onViewChange}
        onRefresh={async () => {
          try {
            await openSession(sessionId)
          } catch (error) {
            report(error)
          }
        }}
      />
      {view === 'console' && (
        <TerminalPanel embedded onSelectSession={onSelectSession} onClose={() => onViewChange('chat')} />
      )}
      {view === 'console' ? null : (
        <>
          {snapshot?.hasOlder && (
            <button
              className="older-messages"
              onClick={() => {
                stick.current = false
                void loadOlder(sessionId).catch(report)
              }}
            >
              {t('chatOlderMessages')}
            </button>
          )}
          <div
            className="chat-scroll"
            ref={scroll}
            onScroll={() => {
              const element = scroll.current
              if (element) {
                const near = element.scrollHeight - element.scrollTop - element.clientHeight < 120
                stick.current = near
                setAtBottom(near)
              }
            }}
          >
            {!messages.length && !activeRun && (
              <div
                {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-3', 'session-chat')}
                className="empty-conversation"
              >
                <div className="empty-symbol">
                  hbar
                  <span className="empty-dot" />
                </div>
                <h1>{t('chatNewSession')}</h1>
                <div className="empty-context">
                  <FileCode2 size={15} />
                  {catalog?.workspaces.find((w) => w.id === workspaceId)?.path ?? t('chatNoWorkspace')}
                </div>
                {!catalog?.models.length && (
                  <button className="text-command" onClick={onSettings}>
                    {t('chatConfigureModel')}
                  </button>
                )}
              </div>
            )}
            <div className="message-list" style={{ height: totalSize, position: 'relative' }}>
              {virtual.getVirtualItems().map((item) => (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtual.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <ChatMessageSurface
                    message={messages[item.index]!}
                    labels={messageLabels}
                    artifactUrl={(id) => client().artifactUrl(id)}
                    renderMarkdown={(text) => <Markdown text={text} />}
                    renderCode={(value) => (
                      <Suspense fallback={<pre>{value}</pre>}>
                        <CodeEditor value={value} />
                      </Suspense>
                    )}
                    onCopy={(text) => copyText(text).catch(report)}
                  />
                </div>
              ))}
            </div>
            {snapshot?.streams.map((stream) => (
              <ChatStreamSurface
                key={stream.id}
                stream={stream}
                thinkingLabel={t('chatThinking')}
                renderMarkdown={(text) => <Markdown text={text} streaming />}
              />
            ))}
            {lastRun && ['failed', 'interrupted', 'cancelled'].includes(lastRun.status) && (
              <RunOutcomeSurface
                run={lastRun}
                labels={outcomeLabels}
                onEdit={() => {
                  setDraft(lastRun.input.text)
                  updateComposerDraft(sessionId, {
                    images: lastRun.input.images,
                    files: lastRun.input.files ?? [],
                  })
                }}
              />
            )}
            <div className="conversation-tail" />
          </div>
          {!atBottom && (
            <button
              className="scroll-bottom"
              title={t('chatScrollBottom')}
              aria-label={t('chatScrollBottom')}
              onClick={() => {
                stick.current = true
                if (scroll.current) scroll.current.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' })
              }}
            >
              <ArrowDown size={17} />
            </button>
          )}
          <div
            {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/prompt-input/prompt-input-1', 'session-chat')}
            className="composer-area"
          >
            {(snapshot?.userInputs ?? []).map((request) => (
              <UserInputSurface
                key={request.requestId}
                request={request}
                labels={userInputLabels}
                resolve={(answers) => client().call('user_input.resolve', { requestId: request.requestId, answers })}
              />
            ))}
            {snapshot?.approvals.map((approval) => (
              <ChatApprovalSurface
                key={approval.id}
                approval={approval}
                labels={approvalLabels}
                impact={approvalImpact(approval.tool, t)}
                summary={approvalSummary(approval.tool, approval.args)}
                resolving={resolvingApprovals.has(approval.id)}
                onResolve={(decision, remember = false) => resolveApproval(approval.id, decision, remember)}
              />
            ))}
            <ChatQueueSurface
              labels={queueLabels}
              runs={queued}
              activeRun={activeRun}
              onStopActive={() => {
                if (activeRun) void client().call('run.cancel', { runId: activeRun.id }).catch(report)
              }}
              onEdit={editQueuedRun}
              onRemove={removeQueuedRun}
              onReorder={reorderQueuedRuns}
            />
            <PromptComposer
              sessionInfo={sessionInfo}
              workspace={workspace}
              draft={draft}
              images={images}
              files={files}
              artifactUrl={(id) => client().artifactUrl(id)}
              composerActions={composerActions}
              modeTags={modeTags}
              activeRun={activeRun}
              busy={busy}
              uploading={uploading}
              onDraftChange={setDraft}
              onSend={send}
              onAttach={attach}
              onSelectAction={selectComposerAction}
              onRemoveImage={(id) =>
                updateComposerDraft(sessionId, (current) => ({
                  images: current.images.filter((item) => item.id !== id),
                }))
              }
              onRemoveFile={(id) =>
                updateComposerDraft(sessionId, (current) => ({ files: current.files.filter((item) => item.id !== id) }))
              }
              onStopRun={async () => {
                if (!activeRun) return
                try {
                  await client().call('run.cancel', { runId: activeRun.id })
                } catch (error) {
                  report(error)
                }
              }}
              gitContext={
                <GitContextSwitcher
                  workspacePath={workspace?.path ?? ''}
                  branch={gitInfo?.branch ?? null}
                  gitProject={gitProject}
                  onUseWorktree={onUseWorktree}
                />
              }
            />
            <div className="composer-footer">
              <span className="composer-footer-model">
                {capabilityState?.mode === 'plan' ? t('chatPlanMode') : t('chatDefaultMode')}
                {capabilityState?.budget && (
                  <em title={t('chatSessionBudget')}>
                    {t('chatBudget')} {capabilityState.budget.remainingTokens.toLocaleString()} /{' '}
                    {capabilityState.budget.limit.toLocaleString()}
                  </em>
                )}
                <small>
                  {modelId ? catalog?.models.find((model) => model.id === modelId)?.model : t('chatUnconfiguredModel')} ·{' '}
                  {modelThinkingLabel(thinkingLevel, locale)}
                </small>
              </span>
              <span>{snapshot ? (snapshot.usage.input + snapshot.usage.output).toLocaleString() : 0} tokens</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
