export type LocalSlashCommand = 'model' | 'settings' | 'goal' | 'agent' | `agent ${string}` | 'agents' | 'cost' | 'help'
const unsupportedGoalArguments = new Set(['status', 'pause', 'resume', 'complete'])

/** Execute only a fully typed, selected, Host-enabled slash item on the configured send key. */
export function shouldSubmitExactSlashOnSend(input: {
  readonly text: string
  readonly activeTerm: string
  readonly selectedCommand: LocalSlashCommand | undefined
  readonly availableCommands: readonly LocalSlashCommand[]
  readonly submitCommands: readonly LocalSlashCommand[]
  readonly sendShortcut: boolean
}): boolean {
  const command = input.selectedCommand
  return Boolean(
    input.sendShortcut &&
    command &&
    input.activeTerm === command &&
    input.availableCommands.includes(command) &&
    input.submitCommands.includes(command) &&
    input.text.trim() === `/${command}`,
  )
}

/** Only an entire standalone composer command is a local action. */
export function localSlashCommand(text: string, available: readonly LocalSlashCommand[]): LocalSlashCommand | null {
  const value = text.trim()
  if (value === '/model' && available.includes('model')) return 'model'
  if (value === '/settings' && available.includes('settings')) return 'settings'
  if (value === '/agents' && available.includes('agents')) return 'agents'
  if (value === '/cost' && available.includes('cost')) return 'cost'
  if (value === '/help' && available.includes('help')) return 'help'
  if (/^\/goal(?:\s|$)/.test(value) && available.includes('goal')) return 'goal'
  // `/agent` is a parent-session prompt. Keep it in the suggestion catalog for
  // completion, but let the normal Run path preserve its text and attachments.
  return null
}

export function localAgentSlash(text: string): { profileId: string; objective: string } | null {
  const match = /^\/agent\s+(\S+)\s+([\s\S]+)$/.exec(text.trim())
  if (!match) return null
  const objective = match[2]!.trim()
  return objective ? { profileId: match[1]!, objective } : null
}

export function localGoalSlash(text: string): { action: 'set'; objective: string } | { action: 'clear' } | null {
  const value = text.trim()
  const match = /^\/goal\s+([\s\S]+)$/.exec(value)
  if (!match) return null
  const objective = match[1]!.trim()
  if (objective === 'clear') return { action: 'clear' }
  if (unsupportedGoalArguments.has(objective) || objective.startsWith('--tokens')) return null
  return objective ? { action: 'set', objective } : null
}

export function localSlashCanSubmit(input: {
  readonly draftStatus: 'idle' | 'submitting' | 'unknown' | 'failed' | undefined
  readonly modelPending: boolean
  readonly intentPending: boolean
  readonly permissionLocked: boolean
}): boolean {
  return (
    input.draftStatus !== undefined &&
    input.draftStatus !== 'submitting' &&
    input.draftStatus !== 'unknown' &&
    !input.modelPending &&
    !input.intentPending &&
    !input.permissionLocked
  )
}

export function slashMatches(term: string, available: readonly LocalSlashCommand[]): readonly LocalSlashCommand[] {
  const normalized = term.toLocaleLowerCase()
  return [...new Set(available)].filter((command) => command.startsWith(normalized)).slice(0, 24)
}

export function slashTokenAt(text: string, cursor: number): { from: number; to: number; term: string } | null {
  const before = text.slice(Math.max(0, cursor - 42), cursor)
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(before)
  if (!match || match[1]!.length > 32) return null
  const from = cursor - match[1]!.length - 1
  if (from > 0 && !/\s/.test(text[from - 1]!)) return null
  return { from, to: cursor, term: match[1]! }
}
