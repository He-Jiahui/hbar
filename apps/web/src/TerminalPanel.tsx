import { newRequestId } from './browser-utils'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CircleStop, LoaderCircle, Plus, Send, TerminalSquare, X } from 'lucide-react'
import type { Approval, ContentBlock, Message, ThinkingLevel } from '@hbar/contracts'
import {
  BUILTIN_TERMINAL_COMMANDS,
  CommandRegistry,
  parseTerminalInput,
  type CommandInvocation,
  type TerminalCommand,
} from '@hbar/terminal'
import {
  client,
  openSession,
  refreshCatalog,
  report,
  selectModel,
  selectThinkingLevel,
  useCatalog,
  useSessions,
  useWorkbench,
} from './stores'
import { useUIPlugins } from './ui-plugins'
import Markdown from './Markdown'
import { modelThinkingLabel, modelThinkingLevels } from './model-catalog'
import GlassSurface from './react-bits/GlassSurface'
import GlareButton from './react-bits/GlareButton'
import SpotlightCard from './react-bits/SpotlightCard'

interface TerminalContext {
  dispatch(invocation: CommandInvocation): Promise<void>
}

const builtins = new CommandRegistry<TerminalContext>()
for (const command of BUILTIN_TERMINAL_COMMANDS)
  builtins.register(command, (invocation, context) => context.dispatch(invocation))

function block(block: ContentBlock, key: number) {
  if (block.type === 'text') return <Markdown key={key} text={block.text} />
  if (block.type === 'thinking')
    return (
      <details className="terminal-thinking rb-terminal-thinking-surface" key={key}>
        <summary>思考过程</summary>
        <GlassSurface className="terminal-thinking-glass" width="100%" height="100%" aria-hidden="true" />
        <Markdown text={block.text} />
      </details>
    )
  if (block.type === 'image')
    return (
      <img
        className="terminal-image"
        key={key}
        src={client().artifactUrl(block.artifact.id)}
        alt={block.artifact.name}
      />
    )
  if (block.type === 'file')
    return (
      <a
        className="terminal-file"
        key={key}
        href={client().artifactUrl(block.artifact.id)}
        target="_blank"
        rel="noreferrer"
      >
        {block.artifact.name}
      </a>
    )
  if (block.type === 'tool_call')
    return <pre key={key}>{JSON.stringify({ tool: block.name, args: block.args }, null, 2)}</pre>
  return (
    <details
      className={`${block.isError ? 'terminal-tool failed' : 'terminal-tool'} rb-terminal-tool-surface`}
      key={key}
    >
      <summary>
        {block.name} · {block.isError ? '失败' : '完成'}
      </summary>
      <GlassSurface className="terminal-tool-glass" width="100%" height="100%" aria-hidden="true" />
      <pre>{block.text}</pre>
    </details>
  )
}

function TranscriptMessage({ message }: { message: Message }) {
  return (
    <article className={`terminal-message terminal-${message.role}`}>
      <header>{message.role === 'assistant' ? 'hbar' : message.role === 'user' ? 'You' : message.role}</header>
      <div>{message.content.map(block)}</div>
    </article>
  )
}

function approvalMarkdown(approval: Approval) {
  return `### 等待审批\n\n工具：\`${approval.tool}\`\n\n\`/approve ${approval.id}\` 或 \`/deny ${approval.id}\``
}

export default function TerminalPanel({ onSettings, onClose }: { onSettings(): void; onClose(): void }) {
  const catalog = useCatalog((state) => state.data)
  const workspaceId = useWorkbench((state) => state.workspaceId)
  const sessionId = useWorkbench((state) => state.activeSession)
  const modelId = useWorkbench((state) => state.modelId)
  const thinkingLevel = useWorkbench((state) => state.thinkingLevel)
  const approvalMode = useWorkbench((state) => state.approvalMode)
  const snapshot = useSessions((state) => state.snapshots[sessionId])
  const pluginCommands = useUIPlugins((state) => state.terminalCommands)
  const [input, setInput] = useState('')
  const [entries, setEntries] = useState<string[]>([])
  const [completion, setCompletion] = useState(0)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [resolvingApprovals, setResolvingApprovals] = useState<Set<string>>(() => new Set())
  const history = useRef<string[]>([])
  const lastMessage = useRef('')
  const scroll = useRef<HTMLDivElement>(null)
  const resolvingApprovalIds = useRef(new Set<string>())
  const activeRun = snapshot?.runs.find((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
  const sessions = catalog?.sessions.filter((session) => session.workspaceId === workspaceId && !session.archived) ?? []
  const commands = useMemo<TerminalCommand[]>(
    () => [...builtins.list(), ...pluginCommands].sort((a, b) => a.id.localeCompare(b.id)),
    [pluginCommands],
  )
  const candidates = useMemo(() => {
    if (!input.startsWith('/') || input.includes(' ')) return []
    const prefix = input.slice(1).toLowerCase()
    return commands.filter((command) => command.id.toLowerCase().includes(prefix)).slice(0, 10)
  }, [commands, input])

  useEffect(() => {
    const openCommands = () => {
      setInput('/')
      setCompletion(0)
    }
    window.addEventListener('hbar:terminal-commands', openCommands)
    return () => window.removeEventListener('hbar:terminal-commands', openCommands)
  }, [])

  const write = (markdown: string) => {
    setEntries((current) => [...current, markdown])
    queueMicrotask(() => scroll.current?.scrollTo({ top: scroll.current.scrollHeight }))
  }
  const chooseSession = async (id: string) => {
    await openSession(id)
    write(`已切换到 Session \`${id}\``)
  }
  const resolveApproval = async (decision: 'allowed' | 'denied', id?: string) => {
    const approval = id
      ? snapshot?.approvals.find((item) => item.id === id)
      : snapshot?.approvals.find((item) => item.status === 'pending')
    if (!approval) throw new Error('没有待处理的审批')
    if (resolvingApprovalIds.current.has(approval.id)) return
    resolvingApprovalIds.current.add(approval.id)
    setResolvingApprovals((current) => new Set(current).add(approval.id))
    try {
      await client().call('approval.resolve', { approvalId: approval.id, decision })
    } finally {
      resolvingApprovalIds.current.delete(approval.id)
      setResolvingApprovals((current) => {
        if (!current.has(approval.id)) return current
        const next = new Set(current)
        next.delete(approval.id)
        return next
      })
    }
  }
  const dispatch = async ({ command, args }: CommandInvocation) => {
    const argument = args.join(' ')
    if (command === 'help') {
      write(`### 终端命令\n\n${commands.map((item) => `- \`${item.usage}\`：${item.description}`).join('\n')}`)
      return
    }
    if (command === 'new') {
      if (!workspaceId) throw new Error('请先选择项目')
      const created = await client().call('session.create', { workspaceId })
      await refreshCatalog()
      await chooseSession(created.id)
      return
    }
    if (command === 'sessions') {
      write(
        `### Sessions\n\n${sessions.map((item) => `- \`${item.id}\` · ${item.title}`).join('\n') || '没有 Session'}`,
      )
      return
    }
    if (command === 'switch') {
      const target = sessions.find((item) => item.id === argument || item.title === argument)
      if (!target) throw new Error(`找不到 Session：${argument}`)
      await chooseSession(target.id)
      return
    }
    if (!sessionId) throw new Error('请先创建或选择 Session')
    if (command === 'fork') {
      const created = await client().call('session.fork', { sessionId })
      await refreshCatalog()
      await chooseSession(created.id)
    } else if (command === 'archive') {
      await client().call('session.archive', { sessionId, archived: true })
      await refreshCatalog()
      write('当前 Session 已归档')
    } else if (command === 'model') {
      if (!argument)
        write(
          `### Models\n\n${catalog?.models.map((item) => `- \`${item.id}\` · ${item.providerName} / ${item.modelName} · ${item.model}`).join('\n') ?? ''}`,
        )
      else {
        const target = catalog?.models.find((item) =>
          [item.id, item.name, item.modelName, item.model, `${item.providerName}/${item.model}`].some(
            (candidate) => candidate === argument,
          ),
        )
        if (!target) throw new Error(`找不到模型：${argument}`)
        selectModel(target.id)
        write(`已切换到模型 \`${target.providerName} / ${target.model}\``)
      }
    } else if (command === 'thinking') {
      const target = catalog?.models.find((item) => item.id === modelId)
      const levels = target ? modelThinkingLevels(target) : ['off' as const]
      if (!levels.includes(argument as ThinkingLevel))
        throw new Error('无效的 thinking 级别')
      selectThinkingLevel(argument as ThinkingLevel)
      write(`思考等级：${modelThinkingLabel(argument as ThinkingLevel)}`)
    } else if (command === 'compact') {
      const result = await client().call('context.compact', { sessionId, modelId })
      write(`### 上下文摘要\n\n${result.summary}`)
    } else if (command === 'approve') await resolveApproval('allowed', args[0])
    else if (command === 'deny') await resolveApproval('denied', args[0])
    else if (command === 'stop') {
      if (!activeRun) throw new Error('当前 Session 没有运行')
      await client().call('run.cancel', { runId: activeRun.id })
    } else if (command === 'retry') {
      if (!lastMessage.current) throw new Error('没有可重试的消息')
      await sendMessage(lastMessage.current)
    } else if (command === 'export') {
      const events = await client().call('session.export', { sessionId })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(
        new Blob([`${events.map((event) => JSON.stringify(event)).join('\n')}\n`], { type: 'application/x-ndjson' }),
      )
      link.download = argument || `hbar-${sessionId}.jsonl`
      link.click()
      URL.revokeObjectURL(link.href)
    } else if (command === 'plugins') {
      const [action = 'list', id] = args
      if (action === 'enable' && id) await client().call('plugin.enable', { id })
      else if (action === 'disable' && id) await client().call('plugin.disable', { id })
      else if (action === 'remove' && id) await client().call('plugin.remove', { id })
      else if (action === 'doctor')
        write(`\`\`\`json\n${JSON.stringify(await client().call('plugin.doctor', {}), null, 2)}\n\`\`\``)
      else if (action !== 'list') throw new Error('使用 /plugins list|enable|disable|remove|doctor')
      if (action === 'list')
        write(
          `### Plugins\n\n${catalog?.plugins.map((item) => `- \`${item.id}\` · ${item.version} · ${item.status}`).join('\n') ?? ''}`,
        )
      await refreshCatalog()
    } else if (command === 'skills') {
      const paths = await client().call('system.paths.get', {})
      write(`全局技能目录：\`${paths.skills}\\global\``)
    } else if (command === 'settings') onSettings()
    else if (command === 'paths')
      write(`\`\`\`json\n${JSON.stringify(await client().call('system.paths.get', {}), null, 2)}\n\`\`\``)
    else if (command === 'diagnose')
      write(`\`\`\`json\n${JSON.stringify(await client().call('system.diagnose', {}), null, 2)}\n\`\`\``)
    else if (command === 'clear') setEntries([])
    else if (command === 'quit') onClose()
  }
  const sendMessage = async (text: string) => {
    let targetSessionId = sessionId
    if (!targetSessionId) {
      if (!workspaceId) throw new Error('请先选择项目')
      const created = await client().call('session.create', { workspaceId })
      targetSessionId = created.id
      await refreshCatalog()
      await openSession(created.id)
    }
    if (activeRun) throw new Error('当前 Session 正在运行，可先切换 Session 或 /stop')
    lastMessage.current = text
    await client().call('run.start', {
      sessionId: targetSessionId,
      requestId: newRequestId(),
      modelId,
      input: { text, images: [], thinking: thinkingLevel, approval: approvalMode },
    })
  }
  const submit = async () => {
    const value = input.trim()
    if (!value) return
    setInput('')
    setCompletion(0)
    history.current.push(value)
    setHistoryIndex(-1)
    try {
      const parsed = parseTerminalInput(value)
      if (parsed.kind === 'message') await sendMessage(parsed.text)
      else {
        const handled = await builtins.execute(parsed.invocation, { dispatch })
        if (!handled) {
          const plugin = pluginCommands.find(
            (item) => item.id === parsed.invocation.command || item.id.endsWith(`:${parsed.invocation.command}`),
          )
          if (!plugin) throw new Error(`未知命令：/${parsed.invocation.command}`)
          await plugin.execute({ sessionId, workspaceId, writeMarkdown: write, setInput }, parsed.invocation.args)
        }
      }
    } catch (error) {
      write(`> 错误：${error instanceof Error ? error.message : String(error)}`)
      report(error)
    }
  }
  return (
    <section className="terminal-panel">
      <header className="terminal-toolbar">
        <GlassSurface className="terminal-toolbar-glass" width="100%" height="100%" aria-hidden="true" />
        <TerminalSquare size={15} />
        <select
          aria-label="终端 Session"
          value={sessionId}
          onChange={(event) => void chooseSession(event.target.value).catch(report)}
        >
          <option value="">选择 Session</option>
          {sessions.map((item) => (
            <option value={item.id} key={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <button
          title="新建 Session"
          aria-label="新建 Session"
          onClick={() => void dispatch({ command: 'new', args: [], source: '/new' }).catch(report)}
        >
          <Plus size={14} />
        </button>
        <span />
        <select
          aria-label="终端推理级别"
          value={thinkingLevel}
          onChange={(event) => selectThinkingLevel(event.target.value as ThinkingLevel)}
        >
          {(catalog?.models.find((item) => item.id === modelId)
            ? modelThinkingLevels(catalog.models.find((item) => item.id === modelId)!)
            : ['off' as const]
          ).map((level) => (
            <option value={level} key={level}>
              {modelThinkingLabel(level)}
            </option>
          ))}
        </select>
        {activeRun && (
          <button
            title="停止运行"
            aria-label="停止运行"
            onClick={() => void client().call('run.cancel', { runId: activeRun.id }).catch(report)}
          >
            <CircleStop size={14} />
          </button>
        )}
      </header>
      <div className="terminal-transcript" ref={scroll}>
        {snapshot?.messages.map((message) => (
          <TranscriptMessage message={message} key={message.id} />
        ))}
        {snapshot?.streams.map((stream) => (
          <article className="terminal-message terminal-assistant terminal-stream" key={stream.id}>
            <header>hbar</header>
            {stream.thinking && (
              <details className="terminal-thinking rb-terminal-thinking-surface">
                <summary>思考过程</summary>
                <GlassSurface className="terminal-thinking-glass" width="100%" height="100%" aria-hidden="true" />
                <Markdown text={stream.thinking} streaming />
              </details>
            )}
            <Markdown text={stream.text} streaming />
          </article>
        ))}
        {snapshot?.approvals.map((approval) => (
          <div
            className="terminal-entry terminal-approval rb-terminal-decision"
            key={approval.id}
            aria-busy={resolvingApprovals.has(approval.id)}
          >
            <GlassSurface className="terminal-approval-glass" width="100%" height="100%" aria-hidden="true" />
            <Markdown text={approvalMarkdown(approval)} />
            <div>
              <button
                className="button"
                disabled={resolvingApprovals.has(approval.id)}
                onClick={() => void resolveApproval('denied', approval.id).catch(report)}
              >
                {resolvingApprovals.has(approval.id) ? <LoaderCircle size={13} className="spinning" /> : <X size={13} />}
                拒绝
              </button>
              <GlareButton
                className="button primary"
                disabled={resolvingApprovals.has(approval.id)}
                onClick={() => void resolveApproval('allowed', approval.id).catch(report)}
                glareColor="color-mix(in srgb, var(--hbar-ok) 62%, transparent)"
              >
                {resolvingApprovals.has(approval.id) ? <LoaderCircle size={13} className="spinning" /> : <Check size={13} />}
                批准
              </GlareButton>
            </div>
          </div>
        ))}
        {entries.map((entry, index) => (
          <SpotlightCard
            className="terminal-entry terminal-command-entry"
            key={`${index}:${entry.slice(0, 20)}`}
            spotlightColor="color-mix(in srgb, var(--rb-accent) 18%, transparent)"
          >
            <Markdown text={entry} />
          </SpotlightCard>
        ))}
      </div>
      <div className="terminal-composer">
        <GlassSurface className="terminal-composer-glass" width="100%" height="100%" aria-hidden="true" />
        {candidates.length > 0 && (
          <div className="terminal-completions rb-terminal-completions" role="listbox" aria-label="命令补全">
            <GlassSurface className="terminal-completions-glass" width="100%" height="100%" aria-hidden="true" />
            {candidates.map((candidate, index) => (
              <SpotlightCard
                as="button"
                className={index === completion ? 'selected' : ''}
                role="option"
                aria-selected={index === completion}
                key={candidate.id}
                spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
                onMouseDown={(event) => {
                  event.preventDefault()
                  setInput(`/${candidate.id} `)
                }}
              >
                <code>/{candidate.id}</code>
                <span>{candidate.description}</span>
              </SpotlightCard>
            ))}
          </div>
        )}
        <textarea
          aria-label="终端输入"
          value={input}
          placeholder="输入消息或 /命令"
          onChange={(event) => {
            setInput(event.target.value)
            setCompletion(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            } else if (event.key === 'Tab' && candidates[completion]) {
              event.preventDefault()
              setInput(`/${candidates[completion]!.id} `)
            } else if (event.key === 'ArrowDown' && candidates.length) {
              event.preventDefault()
              setCompletion((completion + 1) % candidates.length)
            } else if (event.key === 'ArrowUp' && candidates.length) {
              event.preventDefault()
              setCompletion((completion - 1 + candidates.length) % candidates.length)
            } else if (event.ctrlKey && event.key.toLowerCase() === 'l') {
              event.preventDefault()
              setEntries([])
            } else if (event.ctrlKey && event.key.toLowerCase() === 'c' && activeRun) {
              event.preventDefault()
              void client().call('run.cancel', { runId: activeRun.id }).catch(report)
            } else if (event.ctrlKey && event.key.toLowerCase() === 'p' && sessions.length) {
              event.preventDefault()
              const index = sessions.findIndex((item) => item.id === sessionId)
              const next = sessions[(index + 1) % sessions.length]
              if (next) void chooseSession(next.id).catch(report)
            } else if (event.key === 'ArrowUp' && !candidates.length && history.current.length) {
              event.preventDefault()
              const next = Math.min(history.current.length - 1, historyIndex + 1)
              setHistoryIndex(next)
              setInput(history.current.at(-1 - next) ?? '')
            }
          }}
        />
        <GlareButton
          className="terminal-send"
          title="执行"
          aria-label="执行"
          disabled={!input.trim()}
          onClick={() => void submit()}
        >
          <Send size={15} />
        </GlareButton>
      </div>
    </section>
  )
}
