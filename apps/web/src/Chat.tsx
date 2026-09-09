import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  FileText,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Square,
  Wrench,
  X,
} from 'lucide-react'
import type { ArtifactRef, ContentBlock, GitInfo, Message, UserInput, UserInputRequest } from '@hbar/contracts'
import type { ComposerAction } from '@hbar/ui-sdk'
import {
  client,
  loadOlder,
  openSession,
  refreshCatalog,
  report,
  setApprovalMode,
  useCatalog,
  useSessions,
  useWorkbench,
} from './stores'
import Markdown from './Markdown'
import { copyText, newRequestId } from './browser-utils'
import PermissionSelector from './PermissionSelector'
import ModelPicker from './ModelPicker'
import ComposerMenu from './ComposerMenu'
import { buildComposerActions, IMAGE_ACCEPT } from './composer-actions'
import { modelThinkingLabel } from './model-catalog'
import { useUIPlugins } from './ui-plugins'
import SessionCapabilityDialog from './SessionCapabilityDialog'
import { useSessionCapabilities, type SessionCapabilityTab } from './session-capabilities'
const CodeEditor = lazy(() => import('./CodeEditor'))

function ToolResult({ block }: { block: Extract<ContentBlock, { type: 'tool_result' }> }) {
  const [open, setOpen] = useState(false),
    [diff, setDiff] = useState<'after' | 'before'>('after')
  const details = block.details as { before?: string; after?: string; path?: string } | undefined
  return (
    <div className={`tool-result ${block.isError ? 'tool-failed' : ''}`}>
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
    </div>
  )
}
function approvalSummary(tool: string, args: Record<string, unknown>): string {
  if (typeof args.path === 'string') return `${tool} · ${args.path}`
  if (typeof args.command === 'string') return `${tool} · ${args.command}`
  return tool
}
function UserInputPrompt({ request }: { request: UserInputRequest }) {
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
      setError('请回答所有问题')
      return
    }
    setError('')
    setSaving(true)
    try {
      const result = await client().call('user_input.resolve', { requestId: request.requestId, answers })
      if (!result.accepted) setError('问题已由其他客户端处理或已取消')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="user-input-prompt" aria-label="需要你的回答" aria-busy={saving}>
      <div className="user-input-heading">
        <strong>需要你的回答</strong>
        <span>{request.questions.length} 个问题</span>
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
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
              {question.options?.length ? question.isOther !== false && (
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
                    <strong>其他</strong>
                    {selected[question.id] === '__other__' && (
                      <input
                        autoFocus
                        aria-label={`${question.header} 其他答案`}
                        type={question.isSecret ? 'password' : 'text'}
                        value={other[question.id] ?? ''}
                        disabled={saving}
                        placeholder="填写其他答案"
                        onChange={(event) => setOther((current) => ({ ...current, [question.id]: event.target.value }))}
                      />
                    )}
                  </span>
                </label>
              ) : (
                <label className="user-input-option user-input-freeform">
                  <span>
                    <strong>填写答案</strong>
                    <input
                      aria-label={`${question.header} 答案`}
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
        <button type="button" className="button primary" disabled={saving} onClick={() => void submit()}>
          {saving ? <LoaderCircle size={14} className="spinning" /> : <Check size={14} />}
          提交回答
        </button>
      </div>
    </section>
  )
}
function MessageView({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false)
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return (
    <article className={`message message-${message.role}`} data-message-id={message.id}>
      {message.role !== 'tool' && (
        <div className="message-heading">
          <span className={`avatar ${message.role === 'user' ? 'avatar-user' : ''}`}>
            {message.role === 'user' ? 'U' : 'h'}
          </span>
          <span>{message.role === 'user' ? '你' : 'hbar'}</span>
          <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
      )}
      <div className="message-body">
        {message.content.map((block, index) => {
          if (block.type === 'text') return <Markdown key={index} text={block.text} />
          if (block.type === 'thinking')
            return (
              <details className="thinking" key={index}>
                <summary>思考过程</summary>
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
      </div>
      {text && message.role !== 'tool' && (
        <div className="message-actions">
          <button
            title="复制消息"
            aria-label="复制消息"
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
  onTerminal,
}: {
  sessionId?: string
  onSettings(): void
  onTerminal?: () => void
}) {
  const snapshot = useSessions((state) => state.snapshots[sessionId])
  const catalog = useCatalog((state) => state.data)
  const sessionInfo = catalog?.sessions.find((session) => session.id === sessionId) ?? snapshot?.session
  const draft = useWorkbench((state) => state.drafts[sessionId || 'new'] ?? '')
  const modelId = useWorkbench((state) => state.modelId),
    thinkingLevel = useWorkbench((state) => state.thinkingLevel),
    approvalMode = useWorkbench((state) => state.approvalMode),
    workspaceId = useWorkbench((state) => state.workspaceId)
  const workspace = catalog?.workspaces.find((item) => item.id === (snapshot?.session.workspaceId ?? workspaceId))
  const contributedActions = useUIPlugins((state) => state.composerActions)
  const capabilityState = useSessionCapabilities((state) => state.sessions[sessionId])
  const [capabilityDialog, setCapabilityDialog] = useState<SessionCapabilityTab | null>(null)
  const [images, setImages] = useState<ArtifactRef[]>([]),
    [files, setFiles] = useState<ArtifactRef[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false)
  const [pickerAccept, setPickerAccept] = useState(IMAGE_ACCEPT)
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const scroll = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    pendingAttachmentKind = useRef<'image' | 'file'>('image'),
    composing = useRef(false),
    stick = useRef(true)
  const pendingRequest = useRef<{ key: string; requestId: string } | null>(null)
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
  const setDraft = (text: string) =>
    useWorkbench.setState((state) => ({ drafts: { ...state.drafts, [sessionId || 'new']: text } }))
  async function send() {
    if (busy || uploading || sessionInfo?.archived || (!draft.trim() && !images.length && !files.length)) return
    if (!modelId) {
      onSettings()
      return
    }
    setBusy(true)
    try {
      let target = sessionId
      if (!target) {
        const created = await client().call('session.create', { workspaceId })
        target = created.id
        await refreshCatalog()
        await openSession(target)
      }
      const input: UserInput = { text: draft, images, files, thinking: thinkingLevel, approval: approvalMode }
      const key = JSON.stringify({ target, input, modelId, thinkingLevel })
      if (pendingRequest.current?.key !== key) pendingRequest.current = { key, requestId: newRequestId() }
      await client().call('run.start', {
        sessionId: target,
        requestId: pendingRequest.current.requestId,
        input,
        modelId,
      })
      pendingRequest.current = null
      setDraft('')
      setImages([])
      setFiles([])
      stick.current = true
      if (!snapshot) await openSession(target)
    } catch (error) {
      report(error)
    } finally {
      setBusy(false)
    }
  }
  async function attach(selected: FileList | null) {
    if (!selected) return
    const capacity = 12 - images.length - files.length
    if (capacity <= 0) {
      report(new Error('一条消息最多附加 12 个文件'))
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    setUploading(true)
    const uploadedImages: ArtifactRef[] = []
    const uploadedFiles: ArtifactRef[] = []
    try {
      for (const file of [...selected].slice(0, capacity)) {
        const artifact = await client().upload(file)
        if (pendingAttachmentKind.current === 'image' && artifact.mime.startsWith('image/'))
          uploadedImages.push(artifact)
        else uploadedFiles.push(artifact)
      }
    } catch (error) {
      report(error)
    } finally {
      if (uploadedImages.length) setImages((current) => [...current, ...uploadedImages])
      if (uploadedFiles.length) setFiles((current) => [...current, ...uploadedFiles])
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }
  function selectComposerAction(action: ComposerAction) {
    if (action.id === 'goal' || action.id === 'plan' || action.id === 'budget') {
      setCapabilityDialog(action.id)
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
          <button
            type="button"
            role="tab"
            aria-selected="false"
            onClick={() => onTerminal?.()}
            disabled={!onTerminal}
          >
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
          {activeRun ? (activeRun.status === 'waiting_approval' ? '等待批准' : '运行中') : '就绪'}
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
                setImages(lastRun.input.images)
                setFiles(lastRun.input.files ?? [])
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
          <UserInputPrompt key={request.requestId} request={request} />
        ))}
        {snapshot?.approvals.map((approval) => (
          <section className="approval" key={approval.id}>
            <div className="approval-heading">
              <ShieldCheck size={16} />
              <strong>批准工具调用</strong>
              <code>{approval.tool}</code>
            </div>
            <div className="approval-target">
              <strong>{approvalSummary(approval.tool, approval.args)}</strong>
              <details>
                <summary>查看参数</summary>
                <pre>{JSON.stringify(approval.args, null, 2)}</pre>
              </details>
            </div>
            <div className="approval-actions">
              <button
                className="button"
                onClick={() =>
                  void client().call('approval.resolve', { approvalId: approval.id, decision: 'denied' }).catch(report)
                }
              >
                <X size={14} />
                拒绝
              </button>
              <button
                className="button primary"
                onClick={() =>
                  void client().call('approval.resolve', { approvalId: approval.id, decision: 'allowed' }).catch(report)
                }
              >
                <Check size={14} />
                批准
              </button>
              <button
                className="button approval-remember"
                onClick={() => {
                  void (async () => {
                    if (!(await setApprovalMode('allow'))) return
                    await client().call('approval.resolve', { approvalId: approval.id, decision: 'allowed' })
                  })().catch(report)
                }}
              >
                <ShieldCheck size={14} />
                允许并记住
              </button>
            </div>
          </section>
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
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
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
          {(images.length > 0 || files.length > 0) && (
            <div className="attachment-strip">
              {images.map((image) => (
                <div className="attachment-chip" key={image.id}>
                  <img src={client().artifactUrl(image.id)} alt={image.name} />
                  <span>{image.name}</span>
                  <button
                    type="button"
                    title="移除图片"
                    aria-label="移除图片"
                    onClick={() => setImages((list) => list.filter((item) => item.id !== image.id))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {files.map((file) => (
                <div className="attachment-chip attachment-chip-file" key={`file:${file.id}`}>
                  <FileText size={18} className="attachment-chip-icon" aria-hidden="true" />
                  <span title={file.name}>{file.name}</span>
                  <button
                    type="button"
                    title={`移除文件 ${file.name}`}
                    aria-label={`移除文件 ${file.name}`}
                    onClick={() => setFiles((list) => list.filter((item) => item.id !== file.id))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            aria-label="消息"
            placeholder={sessionInfo?.archived ? '会话已归档' : '发送消息…'}
            disabled={sessionInfo?.archived}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              composing.current = false
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <div className="composer-toolbar">
            <div className="composer-left">
              <ComposerMenu actions={composerActions} onSelect={selectComposerAction} />
              <input
                className="visually-hidden"
                ref={fileInput}
                type="file"
                accept={pickerAccept}
                multiple
                onChange={(event) => void attach(event.target.files)}
              />
              {uploading && <LoaderCircle size={15} className="spinning composer-uploading" aria-label="上传中" />}
              <PermissionSelector />
            </div>
            <div className="composer-right">
              <ModelPicker onSettings={onSettings} />
              {activeRun && (
                <button
                  type="button"
                  className="stop-button"
                  title="停止运行"
                  aria-label="停止运行"
                  onClick={() => void client().call('run.cancel', { runId: activeRun.id }).catch(report)}
                >
                  <Square size={14} fill="currentColor" />
                </button>
              )}
              <button
                className="send-button"
                type="submit"
                title={activeRun ? '加入队列' : '发送'}
                aria-label="发送"
                disabled={
                  busy ||
                  uploading ||
                  sessionInfo?.archived ||
                  (!draft.trim() && !images.length && !files.length) ||
                  !workspaceId
                }
              >
                {busy ? <LoaderCircle size={17} className="spinning" /> : <ArrowUp size={18} />}
              </button>
            </div>
          </div>
        </form>
        <div className="composer-footer">
          <span className="composer-footer-model">
            {capabilityState?.mode === 'plan' ? 'Plan 模式' : '默认模式'}
            {capabilityState?.budget && (
              <em title="当前会话 token 预算">
                预算 {capabilityState.budget.remainingTokens.toLocaleString()} /{' '}
                {capabilityState.budget.limit.toLocaleString()}
              </em>
            )}
            <small>
              {modelId ? catalog?.models.find((model) => model.id === modelId)?.model : '未配置模型'} ·{' '}
              {modelThinkingLabel(thinkingLevel)}
            </small>
          </span>
          <span>{snapshot ? (snapshot.usage.input + snapshot.usage.output).toLocaleString() : 0} tokens</span>
        </div>
      </div>
      {capabilityDialog && sessionId && (
        <SessionCapabilityDialog
          sessionId={sessionId}
          initialTab={capabilityDialog}
          onClose={() => setCapabilityDialog(null)}
        />
      )}
    </div>
  )
}
