import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  LoaderCircle,
  Pause,
  Play,
  ShieldCheck,
  Square,
  Wrench,
  X,
} from 'lucide-react'
import type { ArtifactRef, ContentBlock, GitInfo, GoalStatus, Message, Run, UserInput, UserInputRequest } from '@hbar/contracts'
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
import GlassSurface from './react-bits/GlassSurface'
import GlareButton from './react-bits/GlareButton'
import SpotlightCard from './react-bits/SpotlightCard'
import PromptComposer, { type AttachmentKind, type OpenFilePicker } from './PromptComposer'
import ChatSessionChrome from './ChatSessionChrome'
import GitContextSwitcher from './GitContextSwitcher'
import TerminalPanel from './TerminalPanel'
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

function QueuedRunList({
  runs,
  activeRun,
  onStopActive,
  onEdit,
  onRemove,
  onReorder,
}: {
  runs: readonly Run[]
  activeRun?: Run | undefined
  onStopActive(): void
  onEdit(run: Run): void
  onRemove(run: Run): void
  onReorder(runIds: string[]): void
}) {
  const { t } = useLocale()
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  if (!runs.length) return null
  return (
    <section className="queue-panel rb-queue-surface" aria-label={t('chatQueueAria')}>
      <GlassSurface className="queue-glass" width="100%" height="100%" aria-hidden="true" />
      <header className="queue-panel-heading">
        <div>
          <strong>{runs.length} {t('chatQueueCount')}</strong>
          <small>{t('chatQueueAutoSend')}</small>
        </div>
        {activeRun && (
          <button type="button" className="queue-continue" onClick={onStopActive}>
            {t('chatQueueContinue')}
          </button>
        )}
      </header>
      <ol className="queue-list">
        {runs.map((run, index) => (
          <li
            key={run.id}
            draggable
            className={`queue-item ${dragOverId === run.id ? 'drag-over' : ''}`}
            onDragStart={() => setDraggedId(run.id)}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverId(run.id)
            }}
            onDragEnd={() => {
              setDraggedId(null)
              setDragOverId(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (!draggedId || draggedId === run.id) return
              const ids = runs.map((item) => item.id).filter((id) => id !== draggedId)
              const targetIndex = ids.indexOf(run.id)
              ids.splice(Math.max(0, targetIndex), 0, draggedId)
              onReorder(ids)
              setDraggedId(null)
              setDragOverId(null)
            }}
          >
            <span className="queue-item-index">{index + 1}</span>
            <span className="queue-item-grip" aria-hidden="true">⋮⋮</span>
            <span className="queue-item-text">{run.input.text || t('chatAttachmentMessage')}</span>
            <div className="queue-item-actions">
              <button type="button" title={t('chatEditQueued')} aria-label={t('chatEditQueued')} onClick={() => onEdit(run)}>
                {t('chatEdit')}
              </button>
              <button type="button" title={t('chatRemoveQueued')} aria-label={t('chatRemoveQueued')} onClick={() => onRemove(run)}>
                {t('chatRemove')}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ToolResult({ block }: { block: Extract<ContentBlock, { type: 'tool_result' }> }) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false),
    [diff, setDiff] = useState<'after' | 'before'>('after')
  const details = block.details as { before?: string; after?: string; path?: string } | undefined
  return (
    <SpotlightCard
      className={`tool-result ${block.isError ? 'tool-failed' : ''}`}
      spotlightColor={
        block.isError
          ? 'color-mix(in srgb, var(--hbar-er) 24%, transparent)'
          : 'color-mix(in srgb, var(--rb-accent) 22%, transparent)'
      }
    >
      <button className="tool-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={13} />
        <span>{block.name}</span>
        <span className="tool-path">{details?.path ?? block.text.split('\n')[0]?.slice(0, 90)}</span>
        {block.isError ? <X size={13} className="danger" /> : <Check size={13} className="success" />}
      </button>
      {open && (
        <div className="tool-content">
          {details?.after !== undefined ? (
            <>
              <div className="segmented">
                <button className={diff === 'before' ? 'selected' : ''} onClick={() => setDiff('before')}>
                  {t('chatBefore')}
                </button>
                <button className={diff === 'after' ? 'selected' : ''} onClick={() => setDiff('after')}>
                  {t('chatAfter')}
                </button>
                <span>{details.path}</span>
              </div>
              <Suspense fallback={<pre>{details[diff]}</pre>}>
                <CodeEditor value={details[diff] ?? ''} />
              </Suspense>
            </>
          ) : (
            <pre>{block.text}</pre>
          )}
        </div>
      )}
    </SpotlightCard>
  )
}

function ToolCallView({ block }: { block: Extract<ContentBlock, { type: 'tool_call' }> }) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const argumentSummary = String(block.args.path ?? block.args.command ?? '').slice(0, 160)
  return (
    <SpotlightCard className="tool-call" spotlightColor="color-mix(in srgb, var(--rb-status) 22%, transparent)">
      <button
        type="button"
        className="tool-call-summary"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={13} />
        <span>{block.name}</span>
        <code>{argumentSummary || t('chatCallArguments')}</code>
      </button>
      {open && (
        <div className="tool-call-content">
          <span>{t('chatArguments')}</span>
          <pre>{JSON.stringify(block.args, null, 2)}</pre>
        </div>
      )}
    </SpotlightCard>
  )
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

function UserInputPrompt({ request }: { request: UserInputRequest }) {
  const { t } = useLocale()
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    const answers = Object.fromEntries(
      request.questions.map((question) => {
        const value = question.options?.length
          ? selected[question.id] === '__other__'
            ? other[question.id]
            : selected[question.id]
          : other[question.id]
        return [question.id, { answers: value?.trim() ? [value.trim()] : [] }]
      }),
    )
    if (request.questions.some((question) => !answers[question.id]?.answers.length)) {
      setError(t('chatAnswerAllQuestions'))
      return
    }
    setError('')
    setSaving(true)
    try {
      const result = await client().call('user_input.resolve', { requestId: request.requestId, answers })
      if (!result.accepted) setError(t('chatInputHandled'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="user-input-prompt rb-decision-surface" aria-label={t('chatUserInputRequired')} aria-busy={saving}>
      <GlassSurface className="decision-glass" width="100%" height="100%" aria-hidden="true" />
      <div className="user-input-heading">
        <strong>{t('chatUserInputRequired')}</strong>
        <span>{request.questions.length} {t('chatQuestionsCount')}</span>
      </div>
      <div className="user-input-questions">
        {request.questions.map((question) => (
          <fieldset key={question.id}>
            <legend>
              <span>{question.header}</span>
              {question.question}
            </legend>
            <div className="user-input-options">
              {question.options?.map((option) => (
                <label key={option.label} className="user-input-option">
                  <input
                    type="radio"
                    name={`${request.requestId}:${question.id}`}
                    value={option.label}
                    checked={selected[question.id] === option.label}
                    disabled={saving}
                    onChange={() => setSelected((current) => ({ ...current, [question.id]: option.label }))}
                  />
                  <span>
                    <strong>{option.label}{option.recommended ? `（${t('chatRecommended')}）` : ''}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
              {question.options?.length ? (
                question.isOther !== false && (
                  <label className="user-input-option">
                    <input
                      type="radio"
                      name={`${request.requestId}:${question.id}`}
                      value="__other__"
                      checked={selected[question.id] === '__other__'}
                      disabled={saving}
                      onChange={() => setSelected((current) => ({ ...current, [question.id]: '__other__' }))}
                    />
                    <span>
                      <strong>{t('chatOther')}</strong>
                      {selected[question.id] === '__other__' && (
                        <input
                          autoFocus
                          aria-label={`${question.header} ${t('chatOtherAnswer')}`}
                          type={question.isSecret ? 'password' : 'text'}
                          value={other[question.id] ?? ''}
                          disabled={saving}
                          placeholder={t('chatFillOtherAnswer')}
                          onChange={(event) =>
                            setOther((current) => ({ ...current, [question.id]: event.target.value }))
                          }
                        />
                      )}
                    </span>
                  </label>
                )
              ) : (
                <label className="user-input-option user-input-freeform">
                  <span>
                    <strong>{t('chatFillAnswer')}</strong>
                    <input
                      aria-label={`${question.header} ${t('chatAnswer')}`}
                      type={question.isSecret ? 'password' : 'text'}
                      value={other[question.id] ?? ''}
                      disabled={saving}
                      onChange={(event) => setOther((current) => ({ ...current, [question.id]: event.target.value }))}
                    />
                  </span>
                </label>
              )}
            </div>
          </fieldset>
        ))}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="user-input-actions">
        <GlareButton type="button" className="button primary" disabled={saving} onClick={() => void submit()}>
          {saving ? <LoaderCircle size={14} className="spinning" /> : <Check size={14} />}
          {t('chatSubmitAnswers')}
        </GlareButton>
      </div>
    </section>
  )
}
function MessageView({ message }: { message: Message }) {
  const { t } = useLocale()
  const [copied, setCopied] = useState(false)
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  const messageContent = message.content.map((block, index) => {
    if (block.type === 'text') return <Markdown key={index} text={block.text} />
    if (block.type === 'thinking')
      return (
        <details className="thinking rb-thinking-surface" key={index}>
          <GlassSurface className="thinking-glass" width="100%" height="100%" aria-hidden="true" />
          <summary>{t('chatThinking')}</summary>
          <Markdown text={block.text} />
        </details>
      )
    if (block.type === 'image')
      return (
        <a key={index} href={client().artifactUrl(block.artifact.id)} target="_blank" rel="noreferrer">
          <img
            className="attachment-image"
            src={client().artifactUrl(block.artifact.id)}
            alt={block.artifact.name}
            loading="lazy"
          />
        </a>
      )
    if (block.type === 'file')
      return (
        <a
          className="attachment-file"
          key={index}
          href={client().artifactUrl(block.artifact.id)}
          target="_blank"
          rel="noreferrer"
        >
          <FileCode2 size={15} />
          <span>{block.artifact.name}</span>
        </a>
      )
    if (block.type === 'tool_call') return <ToolCallView key={index} block={block} />
    return <ToolResult key={index} block={block} />
  })
  return (
    <article className={`message message-${message.role}`} data-message-id={message.id}>
      {message.role !== 'tool' && (
        <div className="message-heading">
          <span className={`avatar ${message.role === 'user' ? 'avatar-user' : ''}`}>
            {message.role === 'user' ? 'U' : 'h'}
          </span>
          <span>{message.role === 'user' ? t('chatYou') : 'hbar'}</span>
          <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
      )}
      {message.role === 'user' ? (
        <SpotlightCard
          className="message-body rb-message-user-surface"
          spotlightColor="color-mix(in srgb, var(--rb-accent) 24%, transparent)"
        >
          {messageContent}
        </SpotlightCard>
      ) : (
        <div className="message-body">{messageContent}</div>
      )}
      {text && message.role !== 'tool' && (
        <div className="message-actions">
          <button
            title={t('chatCopyMessage')}
            aria-label={t('chatCopyMessage')}
            onClick={() => {
              void copyText(text)
                .then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1200)
                })
                .catch(report)
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      )}
    </article>
  )
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
  const { t } = useLocale()
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
  }, [gitRevision, workspace?.path])
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
  const streamText = snapshot?.streams.map((stream) => stream.text.length + stream.thinking.length).join(',')
  const composerActions = useMemo(
    () =>
      buildComposerActions(contributedActions, {
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
      }),
    [catalog?.models, catalog?.plugins, contributedActions, modelId, sessionId],
  )
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
    <div className="chat-panel">
      <ChatSessionChrome
        sessionId={sessionId}
        session={sessionInfo}
        workspace={workspace}
        gitInfo={gitInfo}
        modelContext={catalog?.models.find((model) => model.id === modelId)?.modelName ?? modelId}
        thinkingContext={thinkingLevel}
        activeRun={activeRun}
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
              <div className="empty-conversation">
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
                  <MessageView message={messages[item.index]!} />
                </div>
              ))}
            </div>
            {snapshot?.streams.map((stream) => (
              <article className="message message-assistant" key={stream.id}>
                <div className="message-heading">
                  <span className="avatar">h</span>
                  <span>hbar</span>
                  <LoaderCircle size={13} className="spinning" />
                </div>
                <div className="message-body">
                  {stream.thinking && (
                    <details className="thinking rb-thinking-surface">
                      <GlassSurface className="thinking-glass" width="100%" height="100%" aria-hidden="true" />
                      <summary>{t('chatThinking')}</summary>
                      <Markdown text={stream.thinking} streaming />
                    </details>
                  )}
                  <Markdown text={stream.text} streaming />
                </div>
              </article>
            ))}
            {lastRun && ['failed', 'interrupted', 'cancelled'].includes(lastRun.status) && (
              <div className={`run-outcome rb-run-outcome-surface ${lastRun.status === 'cancelled' ? '' : 'danger'}`}>
                <GlassSurface className="run-outcome-glass" width="100%" height="100%" aria-hidden="true" />
                <Square size={12} />
                <span className="run-outcome-copy">{lastRun.status === 'cancelled' ? t('chatStopped') : lastRun.error}</span>
                <button
                  className="text-command"
                  onClick={() => {
                    setDraft(lastRun.input.text)
                    updateComposerDraft(sessionId, {
                      images: lastRun.input.images,
                      files: lastRun.input.files ?? [],
                    })
                  }}
                >
                  {t('chatEditAgain')}
                </button>
              </div>
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
          <div className="composer-area">
            {(snapshot?.userInputs ?? []).map((request) => (
              <UserInputPrompt key={request.requestId} request={request} />
            ))}
            {snapshot?.approvals.map((approval) => (
              <section
                className="approval rb-decision-surface"
                key={approval.id}
                aria-busy={resolvingApprovals.has(approval.id)}
              >
                <GlassSurface className="decision-glass" width="100%" height="100%" aria-hidden="true" />
                <div className="approval-heading">
                  <ShieldCheck size={16} />
                  <strong>{t('chatApproveTool')}</strong>
                  <code>{approval.tool}</code>
                </div>
                <div className="approval-target">
                  <p className="approval-impact">{approvalImpact(approval.tool, t)}</p>
                  <strong>{approvalSummary(approval.tool, approval.args)}</strong>
                  <details>
                    <summary>{t('chatViewRequest')}</summary>
                    <pre>{JSON.stringify(approval.args, null, 2)}</pre>
                  </details>
                </div>
                <div className="approval-actions">
                  <button
                    className="button"
                    disabled={resolvingApprovals.has(approval.id)}
                    onClick={() => void resolveApproval(approval.id, 'denied')}
                  >
                    {resolvingApprovals.has(approval.id) ? (
                      <LoaderCircle size={14} className="spinning" />
                    ) : (
                      <X size={14} />
                    )}
                    {t('chatDeny')}
                  </button>
                  <GlareButton
                    className="button primary"
                    disabled={resolvingApprovals.has(approval.id)}
                    onClick={() => void resolveApproval(approval.id, 'allowed')}
                    glareColor="color-mix(in srgb, var(--hbar-ok) 62%, transparent)"
                  >
                    {resolvingApprovals.has(approval.id) ? (
                      <LoaderCircle size={14} className="spinning" />
                    ) : (
                      <Check size={14} />
                    )}
                    {t('chatApprove')}
                  </GlareButton>
                  <button
                    className="button approval-remember"
                    disabled={resolvingApprovals.has(approval.id)}
                    onClick={() => void resolveApproval(approval.id, 'allowed', true)}
                  >
                    {resolvingApprovals.has(approval.id) ? (
                      <LoaderCircle size={14} className="spinning" />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    {t('chatAllowRemember')}
                  </button>
                </div>
              </section>
            ))}
            <QueuedRunList
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
                  {modelThinkingLabel(thinkingLevel)}
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
