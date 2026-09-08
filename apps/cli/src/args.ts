import { parseArgs } from 'node:util'
import type { ApprovalMode, ThinkingLevel } from '@hbar/contracts'

export interface CliArgs {
  command?: string | undefined
  commandArgs: string[]
  message?: string | undefined
  headless: boolean
  help: boolean
  dataRoot?: string | undefined
  cacheRoot?: string | undefined
  project?: string | undefined
  session?: string | undefined
  model?: string | undefined
  thinking: ThinkingLevel
  approval: ApprovalMode
  outputFormat: 'text' | 'jsonl'
  demo: boolean
}

export const HELP = `hbar - Pi harness + Cordis workbench

Usage:
  hbar [message...]                 Open the current project TUI
  hbar --headless --message <text> Run one request without a UI
  hbar serve                        Start a background Host

Headless options:
  --message <text>                 Message (or read one message from stdin)
  --model <provider/model|id|name> Model selection
  --thinking <level>               off|minimal|low|medium|high|xhigh|max
  --approval <mode>                deny|allow|ask (default: deny)
  --project <path|name>             Project (default: current directory)
  --session <id|name>               Session to resume
  --output-format <text|jsonl>      Output format (default: text)

Paths:
  --data-root <path>                Data root override for this process
  --cache-root <path>               Cache root override for this process

Commands:
  session list|new|resume|fork|archive|export
  model list|use
  plugins list|install|enable|disable|remove|inspect|doctor|lock
  skills list
  config paths|show
  diagnose, version, completion <powershell|bash|zsh>
`

export function parseCli(argv: string[] = Bun.argv.slice(2)): CliArgs {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      headless: { type: 'boolean' },
      message: { type: 'string' },
      model: { type: 'string' },
      thinking: { type: 'string' },
      approval: { type: 'string' },
      project: { type: 'string' },
      session: { type: 'string' },
      'output-format': { type: 'string' },
      'data-root': { type: 'string' },
      'cache-root': { type: 'string' },
      demo: { type: 'boolean' },
    },
  })
  const values = parsed.values as Record<string, string | boolean | undefined>
  const positionals = parsed.positionals
  const known = new Set(['diagnose', 'version', 'serve', 'attach', 'session', 'model', 'plugins', 'skills', 'config', 'completion', 'tui'])
  const command = positionals[0] && known.has(positionals[0]) ? positionals[0] : undefined
  const commandArgs = command ? positionals.slice(1) : []
  const freeMessage = command ? undefined : positionals.length ? positionals.join(' ') : undefined
  const thinking = (values.thinking ?? 'off') as ThinkingLevel
  if (!['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(thinking)) throw new Error(`Invalid --thinking: ${thinking}`)
  const approval = (values.approval ?? (values.headless ? 'deny' : 'ask')) as ApprovalMode
  if (!['deny', 'allow', 'ask'].includes(approval)) throw new Error(`Invalid --approval: ${approval}`)
  const outputFormat = (values['output-format'] ?? 'text') as 'text' | 'jsonl'
  if (!['text', 'jsonl'].includes(outputFormat)) throw new Error(`Invalid --output-format: ${outputFormat}`)
  return {
    command,
    commandArgs,
    message: (values.message as string | undefined) ?? freeMessage,
    headless: Boolean(values.headless),
    help: Boolean(values.help),
    dataRoot: values['data-root'] as string | undefined,
    cacheRoot: values['cache-root'] as string | undefined,
    project: values.project as string | undefined,
    session: values.session as string | undefined,
    model: values.model as string | undefined,
    thinking,
    approval,
    outputFormat,
    demo: Boolean(values.demo),
  }
}
