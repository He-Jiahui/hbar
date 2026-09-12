import { newRequestId } from './browser-utils'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, LoaderCircle, Send, TerminalSquare, X } from 'lucide-react'
import { DEFAULT_THINKING_LEVELS, type Approval, type ApprovalMode, type ContentBlock, type Message, type ThinkingLevel } from '@hbar/contracts'
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
  setApprovalMode,
  useCatalog,
  useSessions,
  useWorkbench,
} from './stores'
import { useUIPlugins } from './ui-plugins'
import Markdown from './Markdown'
import { modelThinkingLabel } from './model-catalog'
import GlassSurface from './react-bits/GlassSurface'
import GlareButton from './react-bits/GlareButton'
import { FloatingSurface } from './FloatingLayer'
import { useLocale, type LocaleMessageKey } from './locale'

interface TerminalContext {
  dispatch(invocation: CommandInvocation): Promise<void>
}

const builtins = new CommandRegistry<TerminalContext>()
for (const command of BUILTIN_TERMINAL_COMMANDS)
  builtins.register(command, (invocation, context) => context.dispatch(invocation))

function block(block: ContentBlock, key: number, labels: { thinking: string; failed: string; completed: string }) {
  if (block.type === 'text') return <Markdown key={key} text={block.text} />
  if (block.type === 'thinking')
    return (
      <details className="terminal-thinking rb-terminal-thinking-surface" key={key}>
        <summary>{labels.thinking}</summary>
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
        {block.name} · {block.isError ? labels.failed : labels.completed}
      </summary>
      <GlassSurface className="terminal-tool-glass" width="100%" height="100%" aria-hidden="true" />
      <pre>{block.text}</pre>
    </details>
  )
}

function TranscriptMessage({ message }: { message: Message }) {
  const { t } = useLocale()
  return (
    <article className={`terminal-message terminal-${message.role}`}>
      <header>{message.role === 'assistant' ? 'hbar' : message.role === 'user' ? 'You' : message.role}</header>
      <div>{message.content.map((item, index) => block(item, index, { thinking: t('thinkingProcess'), failed: t('failed'), completed: t('completed') }))}</div>
    </article>
  )
}

function approvalMarkdown(approval: Approval, t: (key: LocaleMessageKey) => string) {
  return `### ${t('approvalPending')}\n\n${t('toolLabel')}\`${approval.tool}\`\n\n\`/approve ${approval.id}\` ${t('approveOrDeny')} \`/deny ${approval.id}\``
}

interface ConsoleCandidate {
  key: string
  value: string
  label: string
  description: string
  kind: 'command' | 'argument'
}

export default function TerminalPanel({
  embedded = false,
  onSelectSession,
  onClose,
}: {
  embedded?: boolean
  onSelectSession?(sessionId: string): void
  onClose(): void
}) {
  const { locale, t } = useLocale()
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
  const [completionsOpen, setCompletionsOpen] = useState(false)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [resolvingApprovals, setResolvingApprovals] = useState<Set<string>>(() => new Set())
  const history = useRef<string[]>([])
  const lastMessage = useRef('')
  const scroll = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const resolvingApprovalIds = useRef(new Set<string>())
  const activeRun = snapshot?.runs.find((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
  const sessions = catalog?.sessions.filter((session) => session.workspaceId === workspaceId && !session.archived) ?? []
  const commands = useMemo<TerminalCommand[]>(
    () => [...builtins.list(), ...pluginCommands].sort((a, b) => a.id.localeCompare(b.id)),
    [pluginCommands],
  )
  const candidates = useMemo<ConsoleCandidate[]>(() => {
    const thinkingMatch = input.match(/^\/thinking(?:\s+(.*))?$/i)
    if (thinkingMatch && (input.includes(' ') || input.toLowerCase() === '/thinking')) {
      const prefix = (thinkingMatch[1] ?? '').toLowerCase()
      return DEFAULT_THINKING_LEVELS
        .filter((level) => level.startsWith(prefix))
        .map((level) => ({
          key: `thinking:${level}`,
          value: `/thinking ${level}`,
          label: level,
          description: modelThinkingLabel(level, locale),
          kind: 'argument',
        }))
    }
    const modelMatch = input.match(/^\/model\s+(.*)$/i)
    if (modelMatch) {
      const prefix = (modelMatch[1] ?? '').toLowerCase()
      return (catalog?.models ?? [])
        .filter((model) =>
          [model.id, model.name, model.modelName, model.model, model.providerName].some((value) =>
            value.toLowerCase().includes(prefix),
          ),
        )
        .slice(0, 10)
        .map((model) => ({
          key: `model:${model.id}`,
          value: `/model ${model.id}`,
          label: model.modelName,
          description: model.providerName,
          kind: 'argument',
        }))
    }
    const settingsMatch = input.match(/^\/settings\s+approval(?:\s+(.*))?$/i)
    if (settingsMatch) {
      const prefix = (settingsMatch[1] ?? '').toLowerCase()
      return (['allow', 'ask', 'deny'] as const)
        .filter((mode) => mode.startsWith(prefix))
        .map((mode) => ({
          key: `approval:${mode}`,
          value: `/settings approval ${mode}`,
          label: mode,
          description: mode === 'allow' ? t('approvalAllowDescription') : mode === 'deny' ? t('approvalDenyDescription') : t('approvalAskDescription'),
          kind: 'argument',
        }))
    }
    if (
      (/^\/plugins\s*$/i.test(input) || /^\/plugins\s+[^\s]+$/i.test(input)) &&
      !/^\/plugins\s+(enable|disable|remove|inspect)\s+/i.test(input)
    ) {
      const prefix = (input.match(/^\/plugins\s*([^\s]*)$/i)?.[1] ?? '').toLowerCase()
      return ['list', 'install', 'enable', 'disable', 'remove', 'inspect', 'doctor', 'lock']
        .filter((action) => action.startsWith(prefix))
        .map((action) => ({
          key: `plugins:${action}`,
          value: `/plugins ${action}`,
          label: action,
          description:
            action === 'inspect'
              ? t('pluginManifest')
              : action === 'lock'
                ? t('pluginLockfile')
                : action === 'doctor'
                  ? t('pluginDoctor')
                  : t('pluginManagementAction'),
          kind: 'argument' as const,
        }))
    }
    const pluginTargetMatch = input.match(/^\/plugins\s+(enable|disable|remove|inspect)\s+([^\s]*)$/i)
    if (pluginTargetMatch) {
      const action = pluginTargetMatch[1]!.toLowerCase()
      const prefix = pluginTargetMatch[2]!.toLowerCase()
      return (catalog?.plugins ?? [])
        .filter((plugin) => plugin.id.toLowerCase().includes(prefix))
        .slice(0, 10)
        .map((plugin) => ({
          key: `plugin:${action}:${plugin.id}`,
          value: `/plugins ${action} ${plugin.id}`,
          label: plugin.id,
          description: `${plugin.version} · ${plugin.status}`,
          kind: 'argument' as const,
        }))
    }
    if (!input.startsWith('/') || input.includes(' ')) return []
    const prefix = input.slice(1).toLowerCase()
    return commands
      .filter((command) => command.id.toLowerCase().includes(prefix))
      .slice(0, 10)
      .map((command) => ({
        key: `command:${command.id}`,
        value: `/${command.id}`,
        label: `/${command.id}`,
        description: command.description,
        kind: 'command',
      }))
  }, [catalog?.models, catalog?.plugins, commands, input, locale, t])

  useEffect(() => {
    const openCommands = () => {
      setInput('/')
      setCompletion(0)
      setCompletionsOpen(true)
    }
    window.addEventListener('hbar:terminal-commands', openCommands)
    return () => window.removeEventListener('hbar:terminal-commands', openCommands)
  }, [])

  const write = (markdown: string) => {
    setEntries((current) => [...current, markdown])
    queueMicrotask(() => scroll.current?.scrollTo({ top: scroll.current.scrollHeight }))
  }
  const chooseSession = async (id: string) => {
    onSelectSession?.(id)
    await openSession(id)
    write(`${t('sessionSwitched')}\`${id}\``)
  }
  const resolveApproval = async (decision: 'allowed' | 'denied', id?: string) => {
    const approval = id
      ? snapshot?.approvals.find((item) => item.id === id)
      : snapshot?.approvals.find((item) => item.status === 'pending')
    if (!approval) throw new Error(t('noPendingApproval'))
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
      write(`### ${t('consoleCommands')}\n\n${commands.map((item) => `- \`${item.usage}\`：${item.description}`).join('\n')}`)
      return
    }
    if (command === 'new') {
      if (!workspaceId) throw new Error(t('selectProjectFirst'))
      const created = await client().call('session.create', { workspaceId })
      await refreshCatalog()
      await chooseSession(created.id)
      return
    }
    if (command === 'sessions') {
      const projectSessions = catalog?.sessions.filter((item) => item.workspaceId === workspaceId) ?? []
      write(
        `### Sessions\n\n| ID | Title | State |\n| --- | --- | --- |\n${
          projectSessions
            .map(
              (item) =>
                `| ${item.id} | ${item.title.replaceAll('|', '\\|')} | ${item.archived ? 'archived' : 'active'} |`,
            )
            .join('\n') || `| — | ${t('noSession')} | — |`
        }`,
      )
      return
    }
    if (command === 'switch') {
      const target = catalog?.sessions.find(
        (item) => item.workspaceId === workspaceId && (item.id === argument || item.title === argument),
      )
      if (!target) throw new Error(`${t('sessionNotFound')}${argument}`)
      await chooseSession(target.id)
      return
    }
    if (
      !sessionId &&
      !['model', 'thinking', 'plugins', 'skills', 'settings', 'paths', 'diagnose', 'clear', 'quit'].includes(command)
    )
      throw new Error(t('createOrSelectSession'))
    if (command === 'fork') {
      const created = await client().call('session.fork', { sessionId })
      await refreshCatalog()
      await chooseSession(created.id)
    } else if (command === 'archive') {
      await client().call('session.archive', { sessionId, archived: true })
      await refreshCatalog()
      write(t('sessionArchivedNotice'))
    } else if (command === 'model') {
      if (!argument)
        write(
          `### ${t('modelList')}\n\n${catalog?.models.map((item) => `- \`${item.id}\` · ${item.providerName} / ${item.modelName} · ${item.model}`).join('\n') ?? ''}`,
        )
      else {
        const normalized = argument.toLocaleLowerCase()
        const target = catalog?.models.find((item) =>
          [
            item.id,
            item.name,
            item.modelName,
            item.model,
            `${item.id}/${item.model}`,
            `${item.providerName}/${item.model}`,
          ].some((candidate) => candidate === argument || candidate.toLocaleLowerCase() === normalized),
        )
        if (!target) throw new Error(`${t('modelNotFound')}${argument}`)
        selectModel(target.id)
        write(`${t('modelSwitched')}\`${target.providerName} / ${target.model}\``)
      }
    } else if (command === 'thinking') {
      if (!DEFAULT_THINKING_LEVELS.includes(argument as ThinkingLevel)) throw new Error(t('invalidThinkingLevel'))
      selectThinkingLevel(argument as ThinkingLevel)
      write(`${t('thinkingLevelNotice')}${modelThinkingLabel(argument as ThinkingLevel, locale)}`)
    } else if (command === 'compact') {
      const result = await client().call('context.compact', { sessionId, modelId })
      write(`### ${t('contextSummary')}\n\n${result.summary}`)
    } else if (command === 'approve') await resolveApproval('allowed', args[0])
    else if (command === 'deny') await resolveApproval('denied', args[0])
    else if (command === 'stop') {
      const currentRun = useSessions
        .getState()
        .snapshots[sessionId]?.runs.find((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
      if (!currentRun) throw new Error(t('sessionNotRunning'))
      await client().call('run.cancel', { runId: currentRun.id })
    } else if (command === 'retry') {
      if (!lastMessage.current) throw new Error(t('noMessageToRetry'))
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
      if (action === 'install' && id)
        await client().call('plugin.install', {
          path: id,
          ...(workspaceId ? { projectId: workspaceId } : {}),
        })
      else if (action === 'enable' && id) await client().call('plugin.enable', { id })
      else if (action === 'disable' && id) await client().call('plugin.disable', { id })
      else if (action === 'remove' && id) await client().call('plugin.remove', { id })
      else if (action === 'inspect' && id) {
        const plugin = catalog?.plugins.find((item) => item.id === id)
        if (!plugin) throw new Error(`${t('pluginNotFound')}${id}`)
        write(`\`\`\`json\n${JSON.stringify(plugin, null, 2)}\n\`\`\``)
        return
      } else if (action === 'lock') {
        write(`\`\`\`json\n${JSON.stringify(await client().call('plugin.lock', {}), null, 2)}\n\`\`\``)
        return
      }
      else if (action === 'doctor')
        write(`\`\`\`json\n${JSON.stringify(await client().call('plugin.doctor', {}), null, 2)}\n\`\`\``)
      else if (action !== 'list')
        throw new Error(t('pluginUsage'))
      if (action === 'list')
        write(
          `### ${t('pluginsList')}\n\n${catalog?.plugins.map((item) => `- \`${item.id}\` · ${item.version} · ${item.status}`).join('\n') ?? ''}`,
        )
      await refreshCatalog()
    } else if (command === 'skills') {
      const skills = await client().call('system.skills.list', {})
      write(
        `### ${t('skillsList')}\n\n${skills.map((skill) => `- \`${skill.id}\``).join('\n') || t('noSkillsInstalled')}`,
      )
    } else if (command === 'settings') {
      if (!args.length) {
        const model = catalog?.models.find((item) => item.id === modelId)
        let persistedApproval = approvalMode
        try {
          persistedApproval = (await client().call('permission.get', {})).mode
        } catch {
          // The local store remains the useful value while a reconnect is in progress.
        }
        write(
          `\`\`\`text\nsettings\napproval: ${persistedApproval}\nthinking: ${thinkingLevel}\nmodel: ${model?.name ?? modelId ?? t('unconfigured')}\n\n${t('availableSettingsCommands')}\n  /settings approval allow\n  /settings approval ask\n  /settings approval deny\n\`\`\``,
        )
      } else if (args[0] === 'approval' && ['allow', 'ask', 'deny'].includes(args[1] ?? '')) {
        const mode = args[1] as ApprovalMode
        if (!(await setApprovalMode(mode))) throw new Error(t('permissionSaveFailed'))
        write(`approval: \`${mode}\``)
      } else throw new Error(t('settingsUsage'))
    } else if (command === 'paths')
      write(`\`\`\`json\n${JSON.stringify(await client().call('system.paths.get', {}), null, 2)}\n\`\`\``)
    else if (command === 'diagnose')
      write(`\`\`\`json\n${JSON.stringify(await client().call('system.diagnose', {}), null, 2)}\n\`\`\``)
    else if (command === 'clear') setEntries([])
    else if (command === 'quit') onClose()
  }
  const sendMessage = async (text: string) => {
    let targetSessionId = useWorkbench.getState().activeSession
    if (!targetSessionId) {
      if (!workspaceId) throw new Error(t('selectProjectFirst'))
      const created = await client().call('session.create', { workspaceId })
      targetSessionId = created.id
      await refreshCatalog()
      await openSession(created.id)
    }
    const currentRun = useSessions
      .getState()
      .snapshots[targetSessionId]?.runs.find((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
    if (currentRun) throw new Error(t('sessionRunningNotice'))
    lastMessage.current = text
    await client().call('run.start', {
      sessionId: targetSessionId,
      requestId: newRequestId(),
      modelId,
      input: { text, images: [], thinking: thinkingLevel, approval: approvalMode },
    })
  }
  const submit = async (source = input) => {
    const value = source.trim()
    if (!value) return
    setInput('')
    setCompletion(0)
    setCompletionsOpen(false)
    history.current.push(value)
    setHistoryIndex(-1)
    try {
      const parsed = parseTerminalInput(value)
      if (parsed.kind === 'command') write(`\`$ ${value}\``)
      if (parsed.kind === 'message') await sendMessage(parsed.text)
      else {
        const handled = await builtins.execute(parsed.invocation, { dispatch })
        if (!handled) {
          const plugin = pluginCommands.find(
            (item) => item.id === parsed.invocation.command || item.id.endsWith(`:${parsed.invocation.command}`),
          )
          if (!plugin) throw new Error(`${t('unknownCommand')}${parsed.invocation.command}`)
          await plugin.execute({ sessionId, workspaceId, writeMarkdown: write, setInput }, parsed.invocation.args)
        }
      }
    } catch (error) {
      write(`> ${t('errorPrefix')}${error instanceof Error ? error.message : String(error)}`)
      report(error)
    }
  }
  return (
    <section className={`terminal-panel ${embedded ? 'terminal-embedded' : ''}`}>
      {!embedded && (
        <header className="terminal-toolbar">
          <GlassSurface className="terminal-toolbar-glass" width="100%" height="100%" aria-hidden="true" />
          <TerminalSquare size={15} />
          <strong className="command-console-title">{t('commandConsole')}</strong>
          <span className="terminal-toolbar-context">
            {sessions.find((item) => item.id === sessionId)?.title ?? t('unselectedSession')} · {thinkingLevel}
          </span>
          <button title={t('closeSystemTerminal')} aria-label={t('closeSystemTerminal')} onClick={onClose}>
            <X size={14} />
          </button>
        </header>
      )}
      <div className="terminal-transcript" ref={scroll}>
        {snapshot?.messages.map((message) => (
          <TranscriptMessage message={message} key={message.id} />
        ))}
        {snapshot?.streams.map((stream) => (
          <article className="terminal-message terminal-assistant terminal-stream" key={stream.id}>
            <header>hbar</header>
            {stream.thinking && (
              <details className="terminal-thinking rb-terminal-thinking-surface">
                <summary>{t('thinkingProcess')}</summary>
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
            <Markdown text={approvalMarkdown(approval, t)} />
            <div>
              <button
                className="button"
                disabled={resolvingApprovals.has(approval.id)}
                onClick={() => void resolveApproval('denied', approval.id).catch(report)}
              >
                {resolvingApprovals.has(approval.id) ? (
                  <LoaderCircle size={13} className="spinning" />
                ) : (
                  <X size={13} />
                )}
                {t('chatDeny')}
              </button>
              <GlareButton
                className="button primary"
                disabled={resolvingApprovals.has(approval.id)}
                onClick={() => void resolveApproval('allowed', approval.id).catch(report)}
                glareColor="color-mix(in srgb, var(--hbar-ok) 62%, transparent)"
              >
                {resolvingApprovals.has(approval.id) ? (
                  <LoaderCircle size={13} className="spinning" />
                ) : (
                  <Check size={13} />
                )}
                {t('chatApprove')}
              </GlareButton>
            </div>
          </div>
        ))}
        {entries.map((entry, index) => (
          <div className="terminal-entry terminal-command-entry" key={`${index}:${entry.slice(0, 20)}`}>
            <Markdown text={entry} />
          </div>
        ))}
      </div>
      <div className="terminal-composer" ref={composerRef}>
        <GlassSurface className="terminal-composer-glass" width="100%" height="100%" aria-hidden="true" />
        <FloatingSurface
          anchorRef={composerRef}
          open={completionsOpen && candidates.length > 0}
          onClose={() => setCompletionsOpen(false)}
          placement="above"
          className="terminal-completions"
          role="listbox"
          aria-label={t('commandCompletion')}
        >
            <div className="terminal-completions-prompt">{t('completionHint')}</div>
            {candidates.map((candidate, index) => (
              <button
                type="button"
                className={index === completion ? 'selected' : ''}
                role="option"
                aria-selected={index === completion}
                key={candidate.key}
                onMouseDown={(event) => {
                  event.preventDefault()
                  setInput(candidate.kind === 'command' ? `${candidate.value} ` : candidate.value)
                }}
              >
                <code>{index === completion ? '›' : ' '} {candidate.label}</code>
                <span>{candidate.description}</span>
              </button>
            ))}
        </FloatingSurface>
        <textarea
          ref={inputRef}
          aria-label={t('consoleInput')}
          value={input}
          placeholder={t('inputMessageOrCommand')}
          onFocus={() => {
            if (candidates.length > 0) setCompletionsOpen(true)
          }}
          onChange={(event) => {
            setInput(event.target.value)
            setCompletion(0)
            setCompletionsOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && candidates[completion]?.kind === 'argument') {
              event.preventDefault()
              void submit(candidates[completion]!.value)
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            } else if (event.key === 'Tab' && candidates[completion]) {
              event.preventDefault()
              const candidate = candidates[completion]!
              setInput(candidate.kind === 'command' ? `${candidate.value} ` : candidate.value)
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
              setCompletionsOpen(true)
            }
          }}
        />
        <GlareButton
          className="terminal-send"
          title={t('execute')}
          aria-label={t('execute')}
          disabled={!input.trim()}
          onClick={() => void submit()}
        >
          <Send size={15} />
        </GlareButton>
      </div>
    </section>
  )
}
