import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, toolOutcomeSchema } from '@hbar/contracts'
import { NODE_LIMITS, nodeCallAuthoritySchema, nodeIdSchema, nodeRootIdSchema } from '@hbar/contracts/node'

export const NODE_EXECUTION_INTENTS_SQL = `
CREATE TABLE node_execution_intents(
  operationId TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  runId TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  callId TEXT NOT NULL,
  name TEXT NOT NULL,
  argsJson TEXT NOT NULL,
  nodeId TEXT NOT NULL,
  rootId TEXT NOT NULL,
  nodePath TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('process','file')),
  authorityJson TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  UNIQUE(runId,callId)
) STRICT;
CREATE INDEX node_execution_intents_run_call ON node_execution_intents(runId,callId);
`

export const nodeExecutionIntentIdentitySchema = z.strictObject({
  workspaceId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160),
  runId: z.string().min(1).max(160),
  callId: z.string().min(1).max(160),
  operationId: z.string().min(1).max(330),
  name: z.string().min(1).max(160),
  args: z.unknown(),
  nodeId: nodeIdSchema,
  rootId: nodeRootIdSchema,
  nodePath: z.string().min(1).max(4_000),
  kind: z.enum(['process', 'file']),
  authority: nodeCallAuthoritySchema,
})

export type NodeExecutionIntentIdentity = z.infer<typeof nodeExecutionIntentIdentitySchema>
export interface NodeExecutionIntentPageInput {
  after?: string
  limit: number
  runIds?: readonly string[]
}
export const nodeExecutionIntentSettlementResultSchema = z.strictObject({
  text: z.string().max(NODE_LIMITS.outputBytes),
  isError: z.boolean().optional(),
  details: z.unknown().optional(),
  hostFailure: z.strictObject({ code: z.string().min(1).max(128), executionStarted: z.boolean() }).optional(),
  outcome: toolOutcomeSchema.optional(),
})
export type NodeExecutionIntentSettlementResult = z.infer<typeof nodeExecutionIntentSettlementResultSchema>
export interface NodeExecutionIntentSettlementInput {
  identity: NodeExecutionIntentIdentity
  result: NodeExecutionIntentSettlementResult
}
export interface NodeExecutionIntentSettlementReceipt {
  settled: true
  event: import('@hbar/contracts').SessionEvent
}
export interface NodeExecutionIntentRecord extends Omit<NodeExecutionIntentIdentity, 'authority'> {
  authority: z.infer<typeof nodeCallAuthoritySchema>
  createdAt: number
}
export interface NodeExecutionIntentPage {
  items: NodeExecutionIntentRecord[]
  nextCursor: string | null
}
export const NODE_EXECUTION_INTENT_PAGE_MAX_ITEMS = 100
export const NODE_EXECUTION_INTENT_PAGE_MAX_BYTES = 512 * 1024

export function createNodeExecutionIntentStorage(db: Database) {
  function checkedIdentity(raw: unknown): NodeExecutionIntentIdentity {
    const value = nodeExecutionIntentIdentitySchema.parse(raw)
    if (
      value.operationId !== `${value.runId}:${value.callId}` ||
      value.authority.sessionId !== value.sessionId ||
      value.authority.runId !== value.runId ||
      value.authority.callId !== value.callId
    )
      throw new HbarError(
        'EXECUTION_OWNER_MISMATCH',
        'Remote execution intent identity differs from its admitted tool call',
      )
    const argsJson = JSON.stringify(value.args)
    const argsBytes = new TextEncoder().encode(argsJson).byteLength
    if (argsBytes > NODE_EXECUTION_INTENT_PAGE_MAX_BYTES || (value.kind === 'process' && argsBytes > 64 * 1024))
      throw new HbarError('PAYLOAD_TOO_LARGE', 'Remote execution intent arguments exceed the recovery limit')
    return value
  }

  function assertCurrentBinding(value: NodeExecutionIntentIdentity): void {
    const bound = db
      .query<{ nodeId: string; rootId: string; nodePath: string }, [string, string]>(
        `SELECT l.nodeId,l.rootId,l.nodePath FROM sessions s
         JOIN node_workspace_locations l ON l.workspaceId=s.workspaceId
         WHERE s.id=? AND s.workspaceId=?`,
      )
      .get(value.sessionId, value.workspaceId)
    if (!bound || bound.nodeId !== value.nodeId || bound.rootId !== value.rootId || bound.nodePath !== value.nodePath)
      throw new HbarError(
        'WORKSPACE_SCOPE',
        'Remote execution intent differs from the persisted workspace root binding',
      )
  }

  function hasHistoricalBinding(value: NodeExecutionIntentIdentity): boolean {
    const run = db
      .query<{ id: string }, [string, string]>(
        'SELECT r.id FROM runs r JOIN sessions s ON s.id=r.sessionId WHERE r.id=? AND r.sessionId=?',
      )
      .get(value.runId, value.sessionId)
    if (!run) throw new HbarError('SESSION_LOG_CORRUPTED', 'Node execution history has no matching Run/session')
    const binding = db
      .query<{ nodeId: string; rootId: string; nodePath: string }, [string]>(
        'SELECT nodeId,rootId,nodePath FROM node_workspace_locations WHERE workspaceId=?',
      )
      .get(value.workspaceId)
    // A removed historical workspace/root cannot authorize recovery. Leave its
    // tool intent to the ordinary conservative unknown-effect recovery path.
    if (!binding) return false
    if (binding.nodeId !== value.nodeId || binding.rootId !== value.rootId || binding.nodePath !== value.nodePath)
      throw new HbarError(
        'SESSION_LOG_CORRUPTED',
        'Node execution history conflicts with its original workspace root pin',
      )
    return true
  }

  function persist(value: NodeExecutionIntentIdentity, createdAt: number, replay: boolean): void {
    const existing = db
      .query(
        `SELECT operationId,workspaceId,sessionId,runId,callId,name,argsJson,nodeId,rootId,nodePath,kind,authorityJson
         FROM node_execution_intents WHERE operationId=?`,
      )
      .get(value.operationId) as Record<string, unknown> | null
    if (existing) {
      const same =
        existing.workspaceId === value.workspaceId &&
        existing.sessionId === value.sessionId &&
        existing.runId === value.runId &&
        existing.callId === value.callId &&
        existing.name === value.name &&
        existing.argsJson === JSON.stringify(value.args) &&
        existing.nodeId === value.nodeId &&
        existing.rootId === value.rootId &&
        existing.nodePath === value.nodePath &&
        existing.kind === value.kind &&
        existing.authorityJson === JSON.stringify(value.authority)
      if (same) return
      if (replay)
        throw new HbarError(
          'SESSION_LOG_CORRUPTED',
          'A node execution operation ID changed identity in canonical JSONL',
        )
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'A node execution operation ID was already used')
    }
    db.query(
      `INSERT INTO node_execution_intents
        (operationId,workspaceId,sessionId,runId,callId,name,argsJson,nodeId,rootId,nodePath,kind,authorityJson,createdAt)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      value.operationId,
      value.workspaceId,
      value.sessionId,
      value.runId,
      value.callId,
      value.name,
      JSON.stringify(value.args),
      value.nodeId,
      value.rootId,
      value.nodePath,
      value.kind,
      JSON.stringify(value.authority),
      createdAt,
    )
  }
  return {
    /** Called inside toolStart's existing transaction so intent and tool.started commit together. */
    begin(raw: NodeExecutionIntentIdentity): void {
      const value = checkedIdentity(raw)
      assertCurrentBinding(value)
      persist(value, Date.now(), false)
    },
    /** Rebuilds the disposable projection from a validated canonical tool.started record. */
    restore(raw: NodeExecutionIntentIdentity, createdAt: number): void {
      const value = checkedIdentity(raw)
      if (!hasHistoricalBinding(value)) return
      persist(value, z.number().int().nonnegative().parse(createdAt), true)
    },
    validateSettlementIdentity(raw: unknown): NodeExecutionIntentIdentity {
      const value = checkedIdentity(raw)
      const row = db
        .query<Record<string, unknown>, [string]>(
          `SELECT workspaceId,sessionId,runId,callId,name,argsJson,nodeId,rootId,nodePath,kind,authorityJson
           FROM node_execution_intents WHERE operationId=?`,
        )
        .get(value.operationId)
      if (
        !row ||
        row.workspaceId !== value.workspaceId ||
        row.sessionId !== value.sessionId ||
        row.runId !== value.runId ||
        row.callId !== value.callId ||
        row.name !== value.name ||
        row.argsJson !== JSON.stringify(value.args) ||
        row.nodeId !== value.nodeId ||
        row.rootId !== value.rootId ||
        row.nodePath !== value.nodePath ||
        row.kind !== value.kind ||
        row.authorityJson !== JSON.stringify(value.authority)
      )
        throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Settlement identity differs from its durable node intent')
      assertCurrentBinding(value)
      return value
    },
    pendingPage(raw: NodeExecutionIntentPageInput): NodeExecutionIntentPage {
      const input = z
        .strictObject({
          after: z.string().min(1).max(330).optional(),
          limit: z.number().int().min(1).max(NODE_EXECUTION_INTENT_PAGE_MAX_ITEMS),
          runIds: z.array(z.string().min(1).max(160)).max(256).optional(),
        })
        .parse(raw)
      const runFilter = input.runIds?.length
        ? `AND i.runId IN (${input.runIds.map(() => '?').join(',')})`
        : input.runIds
          ? 'AND 0'
          : ''
      const rows = db
        .query(
          `SELECT i.* FROM node_execution_intents i
           JOIN tool_intents t ON t.id=i.operationId AND t.status='started'
           JOIN sessions s ON s.id=i.sessionId AND s.workspaceId=i.workspaceId
           JOIN runs r ON r.id=i.runId AND r.sessionId=i.sessionId
           JOIN node_workspace_locations l ON l.workspaceId=i.workspaceId
             AND l.nodeId=i.nodeId AND l.rootId=i.rootId AND l.nodePath=i.nodePath
           WHERE r.status IN ('running','waiting_approval','interrupted')
             AND (? IS NULL OR i.operationId>?) ${runFilter} ORDER BY i.operationId LIMIT ?`,
        )
        .all(input.after ?? null, input.after ?? null, ...(input.runIds ?? []), input.limit + 1) as Record<
        string,
        unknown
      >[]
      const items: NodeExecutionIntentRecord[] = []
      let responseBytes = 0
      let byteLimited = false
      for (const row of rows.slice(0, input.limit)) {
        const parsed = nodeExecutionIntentIdentitySchema.parse({
          workspaceId: row.workspaceId,
          sessionId: row.sessionId,
          runId: row.runId,
          callId: row.callId,
          operationId: row.operationId,
          name: row.name,
          args: JSON.parse(String(row.argsJson)) as unknown,
          nodeId: row.nodeId,
          rootId: row.rootId,
          nodePath: row.nodePath,
          kind: row.kind,
          authority: JSON.parse(String(row.authorityJson)) as unknown,
        })
        const item = { ...parsed, createdAt: z.number().int().nonnegative().parse(row.createdAt) }
        const itemBytes = new TextEncoder().encode(JSON.stringify(item)).byteLength
        if (responseBytes + itemBytes > NODE_EXECUTION_INTENT_PAGE_MAX_BYTES) {
          if (items.length === 0)
            throw new HbarError('PAYLOAD_TOO_LARGE', 'A pending node execution intent exceeds the recovery page limit')
          byteLimited = true
          break
        }
        responseBytes += itemBytes
        items.push(item)
      }
      return {
        items,
        nextCursor: rows.length > items.length || byteLimited ? (items.at(-1)?.operationId ?? null) : null,
      }
    },
  }
}
