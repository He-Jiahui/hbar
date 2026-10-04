import type { Database } from 'bun:sqlite'
import { HbarError, planStateSchema, runFailureSchema } from '@hbar/contracts'
import { usageRecordedDataSchema } from '@hbar/contracts/usage'
import {
  runBoardInputSchema,
  runBoardPageSchema,
  type RunBoardInput,
  type RunBoardPage,
} from '@hbar/contracts/commands/run-board'

type Row = Record<string, unknown>

function json(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new HbarError('INVALID_OUTPUT', 'Stored run board JSON is invalid')
  }
}

function runFromRow(row: Row) {
  const failure = typeof row.failure === 'string' ? runFailureSchema.safeParse(json(row.failure)) : null
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    requestId: String(row.requestId),
    modelId: String(row.modelId),
    status: row.status,
    createdAt: Number(row.createdAt),
    startedAt: row.startedAt === null ? null : Number(row.startedAt),
    endedAt: row.endedAt === null ? null : Number(row.endedAt),
    error: row.error === null ? null : String(row.error),
    ...(failure?.success ? { failure: failure.data } : {}),
  }
}

function emptyUsage(): NonNullable<RunBoardPage['items'][number]['usage']> {
  return {
    attempts: 0,
    runs: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    billableTokens: 0,
    cost: {
      value: 0,
      unit: 'USD' as const,
      availability: 'empty' as const,
      reason: null,
      source: 'usage.recorded',
      estimated: false,
      sampleCount: 0,
    },
  }
}

/** Read a stable, workspace-scoped page for the run board from canonical storage facts. */
export function readRunBoard(db: Database, input: RunBoardInput): RunBoardPage {
  const parsed = runBoardInputSchema.parse(input)
  return db.transaction(() => {
    const workspace = db
      .query<{ id: string; name: string }, [string]>('SELECT id,name FROM workspaces WHERE id=?')
      .get(parsed.workspaceId)
    if (!workspace) throw new HbarError('NOT_FOUND', 'Workspace not found')
    let selectedSessionTitle: string | null = null
    if (parsed.sessionId) {
      const session = db
        .query<{ id: string; title: string }, [string, string]>(
          'SELECT id,title FROM sessions WHERE id=? AND workspaceId=?',
        )
        .get(parsed.sessionId, parsed.workspaceId)
      if (!session) throw new HbarError('NOT_FOUND', 'Session not found in workspace')
      selectedSessionTitle = session.title
    }

    const revisionRow = db
      .query<{ revision: number | null }, [string]>(
        'SELECT COALESCE(SUM(seq),0) + COUNT(*) AS revision FROM sessions WHERE workspaceId=?',
      )
      .get(parsed.workspaceId)
    const revision = Number(revisionRow?.revision ?? 0)
    if (parsed.cursor && parsed.cursor.revision !== revision)
      throw new HbarError('INVALID_CURSOR', 'Run board cursor belongs to an older workspace revision')

    const statuses = parsed.statuses
    const params: (string | number)[] = [parsed.workspaceId]
    let where = 's.workspaceId=?'
    if (parsed.sessionId) {
      where += ' AND r.sessionId=?'
      params.push(parsed.sessionId)
    }
    if (statuses.length) {
      where += ` AND r.status IN (${statuses.map(() => '?').join(',')})`
      params.push(...statuses)
    }
    if (parsed.cursor) {
      where += ' AND (r.createdAt>? OR (r.createdAt=? AND r.id>?))'
      params.push(parsed.cursor.createdAt, parsed.cursor.createdAt, parsed.cursor.runId)
    }
    params.push(parsed.limit + 1)
    const rows = db
      .query(
        `SELECT r.id,r.sessionId,r.requestId,r.modelId,r.status,r.createdAt,r.startedAt,r.endedAt,r.error,r.failure,
                w.name AS workspaceName,s.title AS sessionTitle
         FROM runs r JOIN sessions s ON s.id=r.sessionId JOIN workspaces w ON w.id=s.workspaceId WHERE ${where}
         ORDER BY r.createdAt,r.id LIMIT ?`,
      )
      .all(...params) as Row[]
    const pageRows = rows.slice(0, parsed.limit)
    const runIds = pageRows.map((row) => String(row.id))
    const plans = new Map<string, ReturnType<typeof planStateSchema.parse> | null>()
    const usage = new Map<string, ReturnType<typeof emptyUsage>>()
    for (const runId of runIds) usage.set(runId, emptyUsage())

    if (runIds.length) {
      for (const row of db
        .query<Row, string[]>(
          `SELECT sessionId,runId,type,data,seq FROM events
           WHERE sessionId IN (SELECT sessionId FROM runs WHERE id IN (${runIds.map(() => '?').join(',')}))
             AND type IN ('plan.updated','plan.cleared') ORDER BY seq`,
        )
        .all(...runIds) as Row[]) {
        const sessionId = String(row.sessionId)
        const value = json(row.data) as Record<string, unknown>
        if (row.type === 'plan.cleared') plans.set(sessionId, null)
        else {
          const candidate = planStateSchema.safeParse(value.plan)
          if (candidate.success) plans.set(sessionId, candidate.data)
        }
      }
    }
    if (runIds.length) {
      for (const row of db
        .query<Row, string[]>(
          `SELECT runId,data FROM events WHERE runId IN (${runIds.map(() => '?').join(',')}) AND type='usage.recorded'`,
        )
        .all(...runIds) as Row[]) {
        const runId = String(row.runId)
        const parsedUsage = usageRecordedDataSchema.safeParse(json(row.data))
        if (!parsedUsage.success) continue
        const value = parsedUsage.data
        const target = usage.get(runId)
        if (!target) continue
        target.attempts += 1
        target.runs = 1
        target.input += value.input
        target.output += value.output
        target.cacheRead += value.cacheRead
        target.cacheWrite += value.cacheWrite
        target.billableTokens += Math.max(0, value.input - value.cacheRead) + value.output
        target.cost.value = (target.cost.value ?? 0) + value.cost
        target.cost.availability = 'available'
        target.cost.estimated ||= value.costEstimated
        target.cost.sampleCount = target.attempts
      }
    }

    const items = pageRows.map((row) => {
      const run = runFromRow(row)
      const runUsage = usage.get(run.id)
      return {
        workspaceName: typeof row.workspaceName === 'string' ? row.workspaceName : null,
        sessionTitle: typeof row.sessionTitle === 'string' ? row.sessionTitle : null,
        run: {
          ...run,
          workspaceName: String(row.workspaceName),
          sessionTitle: String(row.sessionTitle),
        },
        plan: plans.get(run.sessionId) ?? null,
        usage: runUsage && runUsage.attempts > 0 ? runUsage : null,
      }
    })
    const last = items.at(-1)?.run
    const nextCursor =
      rows.length > parsed.limit && last ? { revision, createdAt: last.createdAt, runId: last.id } : null
    return runBoardPageSchema.parse({
      workspaceId: parsed.workspaceId,
      sessionId: parsed.sessionId ?? null,
      workspaceName: workspace.name,
      sessionTitle: selectedSessionTitle ?? (pageRows[0] ? String(pageRows[0].sessionTitle) : null),
      revision,
      observedAt: Date.now(),
      items,
      nextCursor,
    })
  })()
}
