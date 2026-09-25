import { CommandError, type CommandExecutor } from '@hbar/commands'
import { activeOperationsPageSchema, type ActiveOperationsPage } from '@hbar/contracts/commands/run'

export interface TabActiveOperation {
  readonly sessionId: string
  readonly operationId: string
  readonly status: ActiveOperationsPage['items'][number]['status']
}
export const MAX_TAB_CLOSE_OPERATIONS = 256
export const TAB_CLOSE_CONCURRENCY = 4

export function tabCloseError(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

export async function visitTabCloseTargets<Value>(
  values: readonly Value[],
  signal: AbortSignal,
  visit: (value: Value) => Promise<void>,
): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(TAB_CLOSE_CONCURRENCY, values.length) }, async () => {
      while (next < values.length) {
        signal.throwIfAborted()
        const value = values[next++]
        if (value !== undefined) await visit(value)
      }
    }),
  )
}

async function sessionActivity(run: CommandExecutor, sessionId: string, signal: AbortSignal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const operations: TabActiveOperation[] = []
      let cursor: ActiveOperationsPage['nextCursor'] = null
      let revision: number | undefined
      let total: number | undefined
      const seen = new Set<string>()
      for (let index = 0; index < 3; index++) {
        signal.throwIfAborted()
        const parsed = activeOperationsPageSchema.safeParse(
          await run.execute(
            'session.activeOperations',
            { sessionId, ...(cursor ? { cursor } : {}), limit: 100 },
            { signal },
          ),
        )
        if (!parsed.success || parsed.data.sessionId !== sessionId)
          throw new CommandError('INVALID_OUTPUT', 'Activity query returned a different session or invalid data')
        const page = parsed.data
        if (page.totalActive > MAX_TAB_CLOSE_OPERATIONS)
          throw new CommandError('ACTIVITY_LIMIT', 'Too many operations for a single tab-close confirmation')
        if (
          (revision !== undefined && revision !== page.sessionSeq) ||
          (total !== undefined && total !== page.totalActive)
        )
          throw new CommandError('ACTIVITY_CHANGED', 'Activity changed during pagination')
        revision = page.sessionSeq
        total = page.totalActive
        for (const item of page.items) {
          if (seen.has(item.operationId))
            throw new CommandError('INVALID_OUTPUT', 'Activity query repeated an operation')
          seen.add(item.operationId)
          operations.push({ sessionId, operationId: item.operationId, status: item.status })
        }
        if (!page.nextCursor) {
          if (operations.length !== total) throw new CommandError('INVALID_OUTPUT', 'Activity query was incomplete')
          return operations
        }
        if (
          page.nextCursor.sessionSeq !== revision ||
          page.nextCursor.afterOperationId !== page.items.at(-1)?.operationId
        )
          throw new CommandError('INVALID_OUTPUT', 'Activity query returned an invalid cursor')
        cursor = page.nextCursor
      }
      throw new CommandError('ACTIVITY_LIMIT', 'Activity query exceeded the page bound')
    } catch (reason) {
      if (tabCloseError(reason) !== 'ACTIVITY_CHANGED' || attempt === 2) throw reason
    }
  }
  throw new CommandError('ACTIVITY_CHANGED', 'Activity could not be read consistently')
}

export async function readTabActivity(
  run: CommandExecutor,
  sessionIds: readonly string[],
  signal: AbortSignal,
): Promise<readonly TabActiveOperation[]> {
  const ids = [...new Set(sessionIds)]
  if (ids.length > 32) throw new CommandError('ACTIVITY_LIMIT', 'Too many sessions for one confirmation')
  const operations: TabActiveOperation[] = []
  await visitTabCloseTargets(ids, signal, async (id) => {
    const current = await sessionActivity(run, id, signal)
    if (operations.length + current.length > MAX_TAB_CLOSE_OPERATIONS)
      throw new CommandError('ACTIVITY_LIMIT', 'Too many operations for a single tab-close confirmation')
    operations.push(...current)
  })
  return operations
}
