import {
  BoxRenderable,
  createCliRenderer,
  InputRenderable,
  MarkdownRenderable,
  ScrollBoxRenderable,
  SyntaxStyle,
  TextRenderable,
  type KeyEvent,
} from '@opentui/core'
import { randomUUID } from 'node:crypto'
import { readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Message, Run, Session, SessionEvent, SessionSnapshot, ThinkingLevel } from '@hbar/contracts'
import { BUILTIN_TERMINAL_COMMANDS, parseTerminalInput } from '@hbar/terminal'
import type { CliRuntime } from './runtime.ts'
import { selectModel, waitForRun } from './runtime.ts'

export const SLASH_COMMANDS = BUILTIN_TERMINAL_COMMANDS.map((command) => command.usage)

function blockText(message: Message) {
  return message.content
    .map((block) => {
      if (block.type === 'text') return block.text
      if (block.type === 'thinking') return `<details><summary>Thinking</summary>\n\n${block.text}\n\n</details>`
      if (block.type === 'image') return `![${block.artifact.name}](attachment:${block.artifact.id})`
      if (block.type === 'tool_call') return `\`\`\`json\n${JSON.stringify({ tool: block.name, args: block.args }, null, 2)}\n\`\`\``
      return `> ${block.isError ? 'Tool failed' : 'Tool result'} · ${block.name}\n>\n> ${block.text.replaceAll('\n', '\n> ')}`
    })
    .join('\n\n')
}

function transcript(snapshot: SessionSnapshot) {
  return snapshot.messages
    .map((message) => `### ${message.role === 'user' ? 'You' : message.role === 'assistant' ? 'hbar' : message.role}\n\n${blockText(message)}`)
    .join('\n\n---\n\n')
}

function eventStatus(event: SessionEvent) {
  if (event.type === 'tool.started') return `Tool: ${String((event.data as { name?: unknown }).name ?? 'unknown')}`
  if (event.type === 'approval.requested')
    return `Approval required: ${String((event.data as { tool?: unknown }).tool ?? 'tool')} · use /approve or /deny`
  if (event.type === 'run.settled')
    return `Run ${String((event.data as { run?: { status?: unknown } }).run?.status ?? 'settled')}`
  return event.type
}

export async function runTui(runtime: CliRuntime, prefill?: string) {
  const renderer = await createCliRenderer({
    targetFps: 30,
    maxFps: 60,
    useMouse: false,
    autoFocus: false,
    exitOnCtrlC: false,
    useKittyKeyboard: { events: process.platform === 'win32' },
    screenMode: 'alternate-screen',
    clearOnShutdown: true,
    backgroundColor: '#1e1f22',
  })
  const syntax = SyntaxStyle.fromStyles({
    default: { fg: '#bcbec4' },
    keyword: { fg: '#cf8e6d' },
    string: { fg: '#6aab73' },
    comment: { fg: '#7a7e85', italic: true },
    function: { fg: '#56a8f5' },
    type: { fg: '#c77dbb' },
  })
  const root = new BoxRenderable(renderer, {
    id: 'hbar-root',
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    backgroundColor: '#1e1f22',
  })
  const header = new TextRenderable(renderer, {
    id: 'hbar-header',
    height: 1,
    width: '100%',
    content: '',
    fg: '#bcbec4',
    bg: '#2b2d30',
  })
  const scroll = new ScrollBoxRenderable(renderer, {
    id: 'hbar-transcript',
    width: '100%',
    flexGrow: 1,
    scrollY: true,
    stickyScroll: true,
    stickyStart: 'bottom',
    padding: 1,
    backgroundColor: '#1e1f22',
  })
  const markdown = new MarkdownRenderable(renderer, {
    id: 'hbar-markdown',
    width: '100%',
    content: '',
    syntaxStyle: syntax,
    fg: '#bcbec4',
    conceal: true,
    streaming: false,
  })
  const status = new TextRenderable(renderer, {
    id: 'hbar-status',
    height: 1,
    width: '100%',
    content: 'Ready · /help',
    fg: '#8c9199',
    bg: '#25262a',
  })
  const inputBox = new BoxRenderable(renderer, {
    id: 'hbar-input-box',
    width: '100%',
    height: 3,
    border: true,
    borderColor: '#4b4d53',
    focusedBorderColor: '#5f9ed1',
    paddingX: 1,
    backgroundColor: '#2b2d30',
  })
  const input = new InputRenderable(renderer, {
    id: 'hbar-input',
    width: '100%',
    value: prefill ?? '',
    placeholder: 'Message hbar or type / for commands',
    backgroundColor: '#2b2d30',
    focusedBackgroundColor: '#2b2d30',
    textColor: '#dfe1e5',
    focusedTextColor: '#ffffff',
    maxLength: 200_000,
  })
  scroll.add(markdown)
  inputBox.add(input)
  root.add(header)
  root.add(scroll)
  root.add(status)
  root.add(inputBox)
  renderer.root.add(root)

  let session = runtime.session
  let modelId = runtime.modelId
  let thinking: ThinkingLevel = 'off'
  const runs = new Map<string, Run>()
  const lastInputs = new Map<string, string>()
  const streams = new Map<string, { text: string; thinking: string }>()
  let base = ''
  let closed = false
  let resolveClosed = () => {}
  const closedPromise = new Promise<void>((resolveDone) => {
    resolveClosed = resolveDone
  })

  const updateHeader = () => {
    const model = runtime.bootstrap.models.find((item) => item.id === modelId)
    header.content = ` hbar  ${runtime.project.name}  ›  ${session.title}  ·  ${model?.name ?? modelId}  ·  thinking:${thinking}`
  }
  const render = (note?: string) => {
    const activeStream = streams.get(session.id)
    const streamText = activeStream?.text ?? ''
    const streamThinking = activeStream?.thinking ?? ''
    const stream = streamText || streamThinking
      ? `\n\n---\n\n### hbar\n\n${streamThinking ? `> Thinking\n>\n> ${streamThinking.replaceAll('\n', '\n> ')}\n\n` : ''}${streamText}`
      : ''
    markdown.streaming = Boolean(streamText || streamThinking)
    markdown.content = `${base}${stream}${note ? `\n\n---\n\n${note}` : ''}`
    scroll.scrollTo(Number.MAX_SAFE_INTEGER)
    renderer.requestRender()
  }
  const load = async (next: Session) => {
    session = next
    const snapshot = await runtime.client.call('session.snapshot', { sessionId: session.id })
    base = transcript(snapshot)
    const activeRun = runs.get(session.id)
    const live = activeRun ? snapshot.streams.find((stream) => stream.runId === activeRun.id) : snapshot.streams.at(-1)
    if (live) streams.set(session.id, { text: live.text, thinking: live.thinking })
    else streams.delete(session.id)
    updateHeader()
    status.content = activeRun ? 'Running · Ctrl+C to stop' : 'Ready · /help'
    render()
  }
  const refreshCatalog = async () => {
    runtime.bootstrap = await runtime.client.call('system.bootstrap', {})
    updateHeader()
  }
  const close = async () => {
    if (closed) return
    closed = true
    runtime.close()
    renderer.destroy()
    syntax.destroy()
    resolveClosed()
  }
  const resolveApproval = async (decision: 'allowed' | 'denied', id?: string) => {
    const snapshot = await runtime.client.call('session.snapshot', { sessionId: session.id })
    const approval = id
      ? snapshot.approvals.find((item) => item.id === id)
      : snapshot.approvals.find((item) => item.status === 'pending')
    if (!approval) throw new Error('No pending approval found')
    await runtime.client.call('approval.resolve', { approvalId: approval.id, decision })
    status.content = decision === 'allowed' ? 'Approved' : 'Denied'
  }
  const send = async (text: string) => {
    const target = session
    if (runs.has(target.id)) throw new Error('This session already has an active run; use /stop or switch sessions')
    lastInputs.set(target.id, text)
    base = `${base}${base ? '\n\n---\n\n' : ''}### You\n\n${text}`
    streams.set(target.id, { text: '', thinking: '' })
    render()
    const run = await runtime.client.call('run.start', {
      sessionId: target.id,
      requestId: randomUUID(),
      input: { text, images: [], thinking, approval: 'ask' },
      modelId,
    })
    runs.set(target.id, run)
    status.content = 'Running · Ctrl+C to stop'
    try {
      const result = await waitForRun(runtime.client, target, run, 'silent', 'defer', {
        onDelta(delta) {
          const current = streams.get(target.id) ?? { text: '', thinking: '' }
          if (delta.operation === 'reset') {
            streams.set(target.id, { text: delta.text, thinking: delta.thinking })
          } else {
            streams.set(target.id, { text: current.text + delta.text, thinking: current.thinking + delta.thinking })
          }
          if (session.id === target.id) render()
        },
        onEvent(event) {
          if (session.id === target.id) status.content = eventStatus(event)
        },
      })
      streams.delete(target.id)
      await refreshCatalog()
      if (session.id === target.id) {
        base = transcript(result.snapshot)
        status.content = `Run ${result.run.status}`
        render()
      }
    } finally {
      runs.delete(target.id)
      streams.delete(target.id)
      input.focus()
    }
  }
  const switchSession = async (selector: string) => {
    await refreshCatalog()
    const next = runtime.bootstrap.sessions.find(
      (item) => item.workspaceId === runtime.project.id && (item.id === selector || item.title === selector),
    )
    if (!next) throw new Error(`Session not found: ${selector}`)
    await load(next)
  }
  const slash = async (command: string, args: string[]) => {
    const argument = args.join(' ')
    if (command === 'quit' || command === 'q') return close()
    if (command === 'help') return render(`### Commands\n\n${SLASH_COMMANDS.map((item) => `- \`${item}\``).join('\n')}`)
    if (command === 'clear') {
      base = ''
      return render()
    }
    if (command === 'new') return load(await runtime.client.call('session.create', { workspaceId: runtime.project.id }))
    if (command === 'sessions') {
      await refreshCatalog()
      const rows = runtime.bootstrap.sessions
        .filter((item) => item.workspaceId === runtime.project.id)
        .map((item) => `| ${item.id} | ${item.title.replaceAll('|', '\\|')} | ${item.archived ? 'archived' : 'active'} |`)
      return render(`### Sessions\n\n| ID | Title | State |\n| --- | --- | --- |\n${rows.join('\n')}`)
    }
    if (command === 'switch' || command === 'resume') return switchSession(argument)
    if (command === 'fork') return load(await runtime.client.call('session.fork', { sessionId: session.id }))
    if (command === 'archive') {
      session = await runtime.client.call('session.archive', { sessionId: session.id, archived: true })
      status.content = 'Session archived'
      return refreshCatalog()
    }
    if (command === 'model') {
      await refreshCatalog()
      if (!argument)
        return render(`### Models\n\n${runtime.bootstrap.models.map((item) => `- \`${item.id}\` · ${item.name} · ${item.model}`).join('\n')}`)
      modelId = selectModel(runtime.bootstrap, argument)
      return updateHeader()
    }
    if (command === 'thinking') {
      if (!['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(argument))
        throw new Error('Thinking must be off|minimal|low|medium|high|xhigh|max')
      thinking = argument as ThinkingLevel
      return updateHeader()
    }
    if (command === 'compact') {
      status.content = 'Compacting context...'
      const result = await runtime.client.call('context.compact', { sessionId: session.id, modelId })
      status.content = 'Context compacted'
      return render(`### Context summary\n\n${result.summary}`)
    }
    if (command === 'approve') return resolveApproval('allowed', args[0])
    if (command === 'deny') return resolveApproval('denied', args[0])
    if (command === 'stop') {
      const run = runs.get(session.id)
      if (!run) throw new Error('No active run in this session')
      await runtime.client.call('run.cancel', { runId: run.id })
      return
    }
    if (command === 'retry') {
      const lastInput = lastInputs.get(session.id)
      if (!lastInput) throw new Error('No prior input to retry')
      return send(lastInput)
    }
    if (command === 'export') {
      const events = await runtime.client.call('session.export', { sessionId: session.id })
      const path = resolve(argument || `hbar-${session.id}.jsonl`)
      await writeFile(path, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')
      return render(`Exported to \`${path}\``)
    }
    if (command === 'plugins') {
      const [action = 'list', idOrPath] = args
      if (action === 'install' && idOrPath)
        await runtime.client.call('plugin.install', { path: idOrPath, projectId: runtime.project.id })
      else if (action === 'enable' && idOrPath) await runtime.client.call('plugin.enable', { id: idOrPath })
      else if (action === 'disable' && idOrPath) await runtime.client.call('plugin.disable', { id: idOrPath })
      else if (action === 'doctor') return render(`\`\`\`json\n${JSON.stringify(await runtime.client.call('plugin.doctor', {}), null, 2)}\n\`\`\``)
      else if (action !== 'list') throw new Error('Use /plugins list|install|enable|disable|doctor')
      await refreshCatalog()
      return render(`### Plugins\n\n${runtime.bootstrap.plugins.map((item) => `- \`${item.id}\` · ${item.version} · ${item.status}`).join('\n')}`)
    }
    if (command === 'skills') {
      const skills = await readdir(resolve(runtime.layout.skills, 'global'), { withFileTypes: true }).catch(() => [])
      return render(`### Global skills\n\n${skills.filter((item) => item.isDirectory()).map((item) => `- ${item.name}`).join('\n') || 'No skills installed.'}`)
    }
    if (command === 'settings') {
      if (args[0] === 'approval' && ['deny', 'ask', 'allow'].includes(args[1] ?? '')) {
        await runtime.client.call('permission.set', { mode: args[1] as 'deny' | 'ask' | 'allow' })
        return render(`Default approval mode: \`${args[1]}\``)
      }
      return render(`\`\`\`json\n${JSON.stringify(await runtime.client.call('permission.get', {}), null, 2)}\n\`\`\``)
    }
    if (command === 'paths')
      return render(`\`\`\`json\n${JSON.stringify(await runtime.client.call('system.paths.get', {}), null, 2)}\n\`\`\``)
    if (command === 'diagnose')
      return render(`\`\`\`json\n${JSON.stringify(await runtime.client.call('system.diagnose', {}), null, 2)}\n\`\`\``)
    throw new Error(`Unknown command: /${command}`)
  }
  const submit = async () => {
    const value = input.value.trim()
    if (!value) return
    input.value = ''
    try {
      const parsed = parseTerminalInput(value)
      if (parsed.kind === 'command') await slash(parsed.invocation.command, parsed.invocation.args)
      else await send(parsed.text)
    } catch (error) {
      status.content = error instanceof Error ? error.message : String(error)
    }
    if (!closed) input.focus()
  }
  input.onSubmit = () => {
    void submit()
  }
  const keypress = (key: KeyEvent) => {
    if (key.ctrl && key.name === 'c') {
      key.preventDefault()
      const run = runs.get(session.id)
      if (run) void runtime.client.call('run.cancel', { runId: run.id })
      else if (input.value) input.value = ''
      else void close()
    } else if (key.ctrl && key.name === 'l') {
      key.preventDefault()
      base = ''
      render()
    } else if (key.ctrl && key.name === 'p') {
      key.preventDefault()
      void refreshCatalog().then(async () => {
        const sessions = runtime.bootstrap.sessions.filter(
          (item) => item.workspaceId === runtime.project.id && !item.archived,
        )
        const index = sessions.findIndex((item) => item.id === session.id)
        const next = sessions[(index + 1) % sessions.length]
        if (next) await load(next)
      })
    }
  }
  renderer.keyInput.on('keypress', keypress)
  await load(session)
  input.focus()
  renderer.requestRender()
  await closedPromise.finally(() => {
    renderer.keyInput.off('keypress', keypress)
    runtime.close()
  })
}
