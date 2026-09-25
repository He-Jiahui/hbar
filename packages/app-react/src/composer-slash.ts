export type LocalSlashCommand = 'model' | 'settings'

/** Only an entire standalone composer command is a local action. */
export function localSlashCommand(text: string, available: readonly LocalSlashCommand[]): LocalSlashCommand | null {
  const value = text.trim()
  if (value === '/model' && available.includes('model')) return 'model'
  if (value === '/settings' && available.includes('settings')) return 'settings'
  return null
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
  return [...new Set(available)].filter((command) => command.startsWith(normalized)).slice(0, 2)
}

export function slashTokenAt(text: string, cursor: number): { from: number; to: number; term: string } | null {
  const before = text.slice(Math.max(0, cursor - 42), cursor)
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(before)
  if (!match || match[1]!.length > 32) return null
  const from = cursor - match[1]!.length - 1
  if (from > 0 && !/\s/.test(text[from - 1]!)) return null
  return { from, to: cursor, term: match[1]! }
}
