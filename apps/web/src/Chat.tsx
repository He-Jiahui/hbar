import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  Square,
  Wrench,
  X,
} from 'lucide-react'
import type { ArtifactRef, ContentBlock, GitInfo, Message } from '@hbar/contracts'
import type { ComposerAction } from '@hbar/ui-sdk'
import {
  client,
  updateComposerDraft,
  loadOlder,
  openSession,
  report,
  useCatalog,
  useConnection,
  cancelSessionRun,
  useSessions,
  useWorkbench,
} from './stores'
import Markdown from './Markdown'
import { copyText } from './browser-utils'
import PermissionSelector from './PermissionSelector'
import ModelPicker from './ModelPicker'
import ComposerMenu from './ComposerMenu'
import { buildComposerActions, IMAGE_ACCEPT } from './composer-actions'
import { modelThinkingLabel } from './model-catalog'
import { useUIPlugins } from './ui-plugins'
import { useSessionCapabilities } from './session-capabilities'
import { HbarAppUiSpotlight, HbarAppUiPromptComposer, HbarAppUiMessage } from 'hbar-app-ui'
import { getPromptCopy, getMessageCopy } from './app-ui-locale'
import { useComposerOperations, composerTarget, sendComposerInput, attachComposerFiles } from './composer-model'
import { useLocale } from './locale'
import { composerDraftKey } from './composer-draft'
import { ApprovalDecision, QuestionDecision } from './DecisionPanels'
const CodeEditor = lazy(() => import('./CodeEditor'))
const EMPTY_ARTIFACTS: ArtifactRef[] = []

function ToolResult({ block }: { block: Extract<ContentBlock, { type: 'tool_result' }> }) {
  const [open, setOpen] = useState(false),
    [diff, setDiff] = useState<'after' | 'before'>('after')
  const details = block.details as { before?: string; after?: string; path?: string } | undefined
  return (
    <HbarAppUiSpotlight className={`tool-result ${block.isError ? 'tool-failed' : ''}`}>
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
                  修改前
                </button>
                <button className={diff === 'after' ? 'selected' : ''} onClick={() => setDiff('after')}>
                  修改后
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
    </HbarAppUiSpotlight>
  )
}
function MessageView({ message }: { message: Message }) {
  const { locale } = useLocale()
  const copy = getMessageCopy(locale)
  const [copied, setCopied] = useState(false)
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return (
    <HbarAppUiMessage
      id={message.id}
      role={message.role}
      author={message.role === 'user' ? copy.user : copy.assistant}
      avatar={message.role === 'user' ? copy.userAvatar : copy.assistantAvatar}
      timestamp={new Date(message.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
      copyLabel={copy.copy}
      copied={copied}
      onCopy={
        text && message.role !== 'tool'
          ? () => {
              void copyText(text)
                .then(() => setCopied(true))
                .catch(report)
            }
          : undefined
      }
    >
      {message.content.map((block, index) => {
        if (block.type === 'text') return <Markdown key={index} text={block.text} />
        if (block.type === 'thinking')
          return (
            <details className="thinking" key={index}>
              <summary>{copy.thinking}</summary>
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
        if (block.type === 'tool_call')
          return (
            <div className="tool-call" key={index}>
              <Wrench size={13} />
              <span>{block.name}</span>
              <code>{String(block.args.path ?? block.args.command ?? '').slice(0, 160)}</code>
            </div>
          )
        return <ToolResult key={index} block={block} />
      })}
    </HbarAppUiMessage>
  )
}
export default function Chat({
  sessionId = '',
  onSettings,
  onTerminal,
}: {
  sessionId?: string
  onSettings(): void
  onTerminal?: () => void
}) {
  const { locale, t } = useLocale()
  const snapshot = useSessions((state) => state.snapshots[sessionId])
  const catalog = useCatalog((state) => state.data)
  const sessionInfo = catalog?.sessions.find((session) => session.id === sessionId) ?? snapshot?.session
  const composerDraft = useWorkbench((state) => state.drafts[composerDraftKey(sessionId, state.workspaceId)])
  const draft = composerDraft?.text ?? ''
  const images = composerDraft?.images ?? EMPTY_ARTIFACTS
  const files = composerDraft?.files ?? EMPTY_ARTIFACTS
  const modelId = useWorkbench((state) => state.modelId),
    thinkingLevel = useWorkbench((state) => state.thinkingLevel),
    approvalMode = useWorkbench((state) => state.approvalMode),
    workspaceId = useWorkbench((state) => state.workspaceId)
  const workspace = catalog?.workspaces.find((item) => item.id === (snapshot?.session.workspaceId ?? workspaceId))
  const contributedActions = useUIPlugins((state) => state.composerActions)
  const capabilityState = useSessionCapabilities((state) => state.sessions[sessionId])
  const composerConnection = useConnection((state) => state.client)
  const operation = useComposerOperations((state) => {
    const candidate = state.byTarget[composerTarget(workspaceId, sessionId)]
    return candidate?.source === composerConnection ? candidate : undefined
  })
  const busy = operation?.sending ?? false
  const uploading = operation?.uploading ?? false
  const [pickerAccept, setPickerAccept] = useState(IMAGE_ACCEPT)
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const scroll = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    pendingAttachmentKind = useRef<'image' | 'file'>('image'),
    stick = useRef(true)
  const messages = snapshot?.messages ?? []
  useEffect(() => {
    if (!workspace?.path) {
      setGitInfo(null)
      return
    }
    let connection: ReturnType<typeof client>
    try {
      connection = client()
    } catch {
      setGitInfo(null)
      return
    }
    let alive = true
    void connection
      .call('git.info', { cwd: workspace.path })
      .then((info) => {
        if (alive) setGitInfo(info)
      })
      .catch(() => {
        if (alive) setGitInfo(null)
      })
    return () => {
      alive = false
    }
  }, [workspace?.path])
  const virtual = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 170,
    getItemKey: (index) => messages[index]!.id,
    overscan: 5,
  })
  const activeRun = snapshot?.runs.find((run) => ['running', 'waiting_approval'].includes(run.status))
  const queued = snapshot?.runs.filter((run) => run.status === 'queued') ?? []
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
  async function send() {
    if (busy || uploading || sessionInfo?.archived || (!draft.trim() && !images.length && !files.length)) return
    if (!modelId) {
      onSettings()
      return
    }
    const accepted = await sendComposerInput({
      sessionId,
      workspaceId,
      modelId,
      input: { text: draft, images: [...images], files: [...files], thinking: thinkingLevel, approval: approvalMode },
    })
    if (accepted) stick.current = true
  }
  async function attach(selected: FileList | null) {
    if (!selected) return
    await attachComposerFiles({
      workspaceId,
      sessionId,
      files: [...selected],
      kind: pendingAttachmentKind.current,
      limitMessage: locale === 'zh-CN' ? '一条消息最多附加 12 个文件' : 'A message supports at most 12 attachments',
    })
    if (fileInput.current) fileInput.current.value = ''
  }
  function selectComposerAction(action: ComposerAction) {
    if (action.id === 'goal' || action.id === 'plan' || action.id === 'budget') {
      if (sessionId) useSessionCapabilities.getState().openDialog(sessionId, action.id)
      return
    }
    if (!action.execute) return
    if (action.id === 'add-image') pendingAttachmentKind.current = 'image'
    else if (action.id === 'add-file') pendingAttachmentKind.current = 'file'
    void Promise.resolve(
      action.execute({
        ...(sessionId ? { sessionId } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        openFilePicker: (options) => {
          if (fileInput.current) {
            const accept = options?.accept ?? (pendingAttachmentKind.current === 'file' ? '*/*' : IMAGE_ACCEPT)
            setPickerAccept(accept)
            fileInput.current.accept = accept
            fileInput.current.multiple = options?.multiple ?? true
            fileInput.current.click()
          }
        },
      }),
    ).catch(report)
  }
  return (
    <div className="chat-panel">
      <header className="session-header" data-testid="session-header">
        <div className="session-header-title">
          <span className="session-header-mark" aria-hidden="true">
            h
          </span>
          <h1>{sessionInfo?.title ?? 'Session'}</h1>
          <span className="session-runtime">Pi</span>
        </div>
        <div className="session-view-tabs" role="tablist" aria-label="会话视图">
          <button type="button" role="tab" aria-selected="true" className="selected">
            Chat
          </button>
          <button type="button" role="tab" aria-selected="false" onClick={() => onTerminal?.()} disabled={!onTerminal}>
            Terminal
          </button>
        </div>
        <button
          type="button"
          className="session-refresh"
          title="刷新会话"
          aria-label="刷新会话"
          disabled={!sessionId}
          onClick={() => void openSession(sessionId).catch(report)}
        >
          <RefreshCw size={15} />
        </button>
      </header>
      <div className="chat-context">
        <div>
          <GitBranch size={13} />
          <span>
            {catalog?.workspaces.find((w) => w.id === (snapshot?.session.workspaceId ?? workspaceId))?.name ??
              'Workspace'}
          </span>
          <span className="context-divider">/</span>
          <span>{sessionInfo?.title ?? '新会话'}</span>
        </div>
        <span className="session-state">
          <i className={activeRun ? 'running' : ''} />
          {activeRun ? (activeRun.status === 'waiting_approval' ? t('waitingApproval') : t('running')) : t('ready')}
        </span>
      </div>
      {snapshot?.hasOlder && (
        <button
          className="older-messages"
          onClick={() => {
            stick.current = false
            void loadOlder(sessionId).catch(report)
          }}
        >
          加载更早的消息
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
            <h1>新会话</h1>
            <div className="empty-context">
              <FileCode2 size={15} />
              {catalog?.workspaces.find((w) => w.id === workspaceId)?.path ?? '未选择工作区'}
            </div>
            {!catalog?.models.length && (
              <button className="text-command" onClick={onSettings}>
                配置模型
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
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}
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
                <details className="thinking">
                  <summary>思考过程</summary>
                  <Markdown text={stream.thinking} streaming />
                </details>
              )}
              <Markdown text={stream.text} streaming />
            </div>
          </article>
        ))}
        {lastRun && ['failed', 'interrupted', 'cancelled'].includes(lastRun.status) && (
          <div className={`run-outcome ${lastRun.status === 'cancelled' ? '' : 'danger'}`}>
            <Square size={12} />
            {lastRun.status === 'cancelled' ? '已停止' : lastRun.error}
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
              重新编辑
            </button>
          </div>
        )}
        <div className="conversation-tail" />
      </div>
      {!atBottom && (
        <button
          className="scroll-bottom"
          title="回到底部"
          aria-label="回到底部"
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
          <QuestionDecision key={request.requestId} request={request} sessionId={sessionId} />
        ))}
        {snapshot?.approvals.map((approval) => (
          <ApprovalDecision key={approval.id} approval={approval} sessionId={sessionId} />
        ))}
        {queued.length > 0 && (
          <div className="queue-strip">
            <LoaderCircle size={12} />
            <span>{queued.length} 条消息排队中</span>
            <button
              title="取消排队"
              aria-label="取消排队"
              onClick={() => {
                for (const run of queued) void client().call('run.cancel', { runId: run.id }).catch(report)
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}
        <HbarAppUiPromptComposer
          value={draft}
          labels={getPromptCopy(locale, Boolean(sessionInfo?.archived), Boolean(activeRun))}
          attachments={[
            ...images.map((image) => ({
              id: image.id,
              name: image.name,
              kind: 'image' as const,
              previewUrl: client().artifactUrl(image.id),
            })),
            ...files.map((file) => ({ id: file.id, name: file.name, kind: 'file' as const })),
          ]}
          disabled={sessionInfo?.archived}
          error={operation?.error}
          submitting={busy}
          uploading={uploading}
          canSubmit={Boolean(workspaceId && (draft.trim() || images.length || files.length))}
          canStop={Boolean(activeRun)}
          onChange={setDraft}
          onSubmit={() => {
            void send()
          }}
          onRemoveAttachment={(id, kind) =>
            updateComposerDraft(sessionId, (current) =>
              kind === 'image'
                ? { images: current.images.filter((item) => item.id !== id) }
                : { files: current.files.filter((item) => item.id !== id) },
            )
          }
          onStop={() => {
            if (activeRun) void cancelSessionRun(sessionId, activeRun.id).catch(report)
          }}
          context={
            <div className="composer-context-strip" aria-label="会话上下文">
              <span className="composer-context-location" title={workspace?.path ?? '未选择工作区'}>
                <FolderOpen size={14} />
                <span>{workspace?.name ?? 'Workspace'}</span>
              </span>
              <span className="composer-context-separator" aria-hidden="true" />
              <span className="composer-context-mode">Local</span>
              {gitInfo?.branch && (
                <span className="composer-context-branch" title="当前 Git 分支">
                  <GitBranch size={13} />
                  <span>{gitInfo.branch}</span>
                </span>
              )}
            </div>
          }
          controls={
            <>
              <ComposerMenu actions={composerActions} onSelect={selectComposerAction} />
              <input
                className="visually-hidden"
                ref={fileInput}
                type="file"
                accept={pickerAccept}
                multiple
                onChange={(event) => {
                  void attach(event.target.files)
                }}
              />
              <PermissionSelector />
            </>
          }
          modelPicker={<ModelPicker onSettings={onSettings} />}
        />
        <div className="composer-footer">
          <span className="composer-footer-model">
            {capabilityState?.mode === 'plan' ? 'Plan 模式' : '默认模式'}
            {capabilityState?.budget && (
              <em title="当前会话 token 预算">
                预算 {capabilityState.budget.remainingTokens.toLocaleString(locale)} /{' '}
                {capabilityState.budget.limit.toLocaleString(locale)}
              </em>
            )}
            <small>
              {modelId ? catalog?.models.find((model) => model.id === modelId)?.model : '未配置模型'} ·{' '}
              {modelThinkingLabel(thinkingLevel)}
            </small>
          </span>
          <span>{snapshot ? (snapshot.usage.input + snapshot.usage.output).toLocaleString(locale) : 0} tokens</span>
        </div>
      </div>
    </div>
  )
}
