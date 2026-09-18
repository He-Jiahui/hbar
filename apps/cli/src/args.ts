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
  workspace?: string | undefined
  session?: string | undefined
  context?: string | undefined
  contextRevision?: string | undefined
  idempotencyKey?: string | undefined
  requestId?: string | undefined
  expectedRevision?: string | undefined
  inputJson?: string | undefined
  inputFile?: string | undefined
  text?: string | undefined
  expectedSha256?: string | undefined
  client?: string | undefined
  invocationId?: string | undefined
  timeout?: string | undefined
  instance?: string | undefined
  binding?: string | undefined
  scope?: string | undefined
  target?: string | undefined
  section?: string | undefined
  path?: string | undefined
  page?: string | undefined
  browserContext?: string | undefined
  app?: string | undefined
  deltaX?: string | undefined
  cwd?: string | undefined
  pathsJson?: string | undefined
  branch?: string | undefined
  cached?: boolean | undefined
  stage?: boolean | undefined
  force?: boolean | undefined
  createBranch?: boolean | undefined
  selector?: string | undefined
  fullPage: boolean
  valueJson?: string | undefined
  baselineJson?: string | undefined
  schemaVersion?: string | undefined
  tokenBudget?: string | undefined
  title?: string | undefined
  category?: string | undefined
  after?: string | undefined
  limit?: string | undefined
  model?: string | undefined
  thinking: ThinkingLevel
  thinkingExplicit: boolean
  approval: ApprovalMode
  outputFormat: 'text' | 'jsonl'
  demo: boolean
}

export const HELP = `hbar - Pi harness + Cordis workbench

Usage:
  hbar [message...]                 Open the current project TUI
  hbar repl                         Open the line-oriented command REPL
  hbar --headless --message <text> Run one request without a UI
  hbar serve                        Start a background Host
  hbar exec session.setBudget <tokens> --session <id|name> --idempotency-key <key>
  hbar exec session.getBudget --session <id|name>
  hbar exec receipt <idempotency-key> --session <id|name>
  hbar commands list [--category <category>] [--limit <1-200>]
  hbar commands describe <commandId>
  hbar exec app.setSession <id|name> --workspace <id|name> [--context <name>]
  hbar exec app.openPanel <panel> --client <clientId> [--session <id>]
  hbar exec settings.get|settings.set|settings.unset <path> --scope <scope>
  hbar exec approval.resolve <approvalId> <allowed|denied> --session <id|name>
  hbar exec questionnaire.answer <requestId> --input-json <answers> --session <id|name>
  hbar exec goal.get|goal.create|goal.set|goal.update|goal.clear --session <id|name>
  hbar exec plan.get|plan.update|plan.clear --session <id|name>
  hbar exec model.list
  hbar exec session.getModel|session.setModel|session.setThinkingLevel --session <id|name>
  hbar exec run.submit --message <text> --session <id|name> --idempotency-key <key>
  hbar exec operation.get|operation.cancel <operationId>
  hbar exec file.list|file.read|file.write [path] [--workspace <id|name>]
  hbar exec attachment.query <artifactId>
  hbar exec agent.create|agent.list|agent.cancel --session <id|name>
  hbar exec browser.status|browser.navigate|browser.snapshot|browser.close --session <id|name>
  hbar exec computer.status|computer.screenshot|computer.click|computer.type --session <id|name>
  hbar exec git.info|git.status|git.diff|git.log|git.diffToRemote [--cwd <path>]

Headless options:
  --message <text>                 Message (or read one message from stdin)
  --model <provider/model|id|name> Model selection
  --thinking <level>               off|minimal|low|medium|high|xhigh|max
  --approval <mode>                deny|allow|ask (default: deny)
  --project <path|name>             Project (default: current directory)
  --workspace <id|name>             Workspace for an application command
  --session <id|name>               Session to resume
  --context <name>                  Load/save a named local selection context
  --context-revision <revision>     Require this context revision when saving
  --output-format <text|jsonl>      Output format (default: text)

Paths:
  --data-root <path>                Data root override for this process
  --cache-root <path>               Cache root override for this process

Commands:
  repl
  session list|new|resume|fork|archive|export
  exec session.setBudget|session.getBudget|approval.resolve|questionnaire.answer|receipt
  exec goal.get|goal.create|goal.set|goal.update|goal.clear
  exec plan.get|plan.update|plan.clear
  commands list|describe
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
      workspace: { type: 'string' },
      session: { type: 'string' },
      context: { type: 'string' },
      'context-revision': { type: 'string' },
      'idempotency-key': { type: 'string' },
      'request-id': { type: 'string' },
      'expected-revision': { type: 'string' },
      'input-json': { type: 'string' },
      'input-file': { type: 'string' },
      text: { type: 'string' },
      'expected-sha256': { type: 'string' },
      client: { type: 'string' },
      'invocation-id': { type: 'string' },
      timeout: { type: 'string' },
      instance: { type: 'string' },
      binding: { type: 'string' },
      scope: { type: 'string' },
      target: { type: 'string' },
      section: { type: 'string' },
      path: { type: 'string' },
      page: { type: 'string' },
      'browser-context': { type: 'string' },
      app: { type: 'string' },
      'delta-x': { type: 'string' },
      cwd: { type: 'string' },
      'paths-json': { type: 'string' },
      branch: { type: 'string' },
      cached: { type: 'boolean' },
      stage: { type: 'boolean' },
      force: { type: 'boolean' },
      'create-branch': { type: 'boolean' },
      selector: { type: 'string' },
      'full-page': { type: 'boolean' },
      'value-json': { type: 'string' },
      'baseline-json': { type: 'string' },
      'schema-version': { type: 'string' },
      'token-budget': { type: 'string' },
      title: { type: 'string' },
      category: { type: 'string' },
      after: { type: 'string' },
      limit: { type: 'string' },
      'output-format': { type: 'string' },
      'data-root': { type: 'string' },
      'cache-root': { type: 'string' },
      demo: { type: 'boolean' },
    },
  })
  const values = parsed.values as Record<string, string | boolean | undefined>
  const positionals = parsed.positionals
  const known = new Set([
    'diagnose',
    'version',
    'serve',
    'attach',
    'session',
    'model',
    'plugins',
    'skills',
    'config',
    'completion',
    'repl',
    'tui',
    'exec',
    'commands',
  ])
  const command = positionals[0] && known.has(positionals[0]) ? positionals[0] : undefined
  const commandArgs = command ? positionals.slice(1) : []
  const freeMessage = command ? undefined : positionals.length ? positionals.join(' ') : undefined
  const thinking = (values.thinking ?? 'off') as ThinkingLevel
  if (!['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(thinking))
    throw new Error(`Invalid --thinking: ${thinking}`)
  const approval = (values.approval ?? (values.headless || command === 'exec' ? 'deny' : 'ask')) as ApprovalMode
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
    workspace: values.workspace as string | undefined,
    session: values.session as string | undefined,
    context: values.context as string | undefined,
    contextRevision: values['context-revision'] as string | undefined,
    idempotencyKey: values['idempotency-key'] as string | undefined,
    requestId: values['request-id'] as string | undefined,
    expectedRevision: values['expected-revision'] as string | undefined,
    inputJson: values['input-json'] as string | undefined,
    inputFile: values['input-file'] as string | undefined,
    text: values.text as string | undefined,
    expectedSha256: values['expected-sha256'] as string | undefined,
    client: values.client as string | undefined,
    invocationId: values['invocation-id'] as string | undefined,
    timeout: values.timeout as string | undefined,
    instance: values.instance as string | undefined,
    binding: values.binding as string | undefined,
    scope: values.scope as string | undefined,
    target: values.target as string | undefined,
    section: values.section as string | undefined,
    path: values.path as string | undefined,
    page: values.page as string | undefined,
    browserContext: values['browser-context'] as string | undefined,
    app: values.app as string | undefined,
    deltaX: values['delta-x'] as string | undefined,
    cwd: values.cwd as string | undefined,
    pathsJson: values['paths-json'] as string | undefined,
    branch: values.branch as string | undefined,
    cached: Boolean(values.cached),
    stage: Boolean(values.stage),
    force: Boolean(values.force),
    createBranch: Boolean(values['create-branch']),
    selector: values.selector as string | undefined,
    fullPage: Boolean(values['full-page']),
    valueJson: values['value-json'] as string | undefined,
    baselineJson: values['baseline-json'] as string | undefined,
    schemaVersion: values['schema-version'] as string | undefined,
    tokenBudget: values['token-budget'] as string | undefined,
    title: values.title as string | undefined,
    category: values.category as string | undefined,
    after: values.after as string | undefined,
    limit: values.limit as string | undefined,
    model: values.model as string | undefined,
    thinking,
    thinkingExplicit: values.thinking !== undefined,
    approval,
    outputFormat,
    demo: Boolean(values.demo),
  }
}
