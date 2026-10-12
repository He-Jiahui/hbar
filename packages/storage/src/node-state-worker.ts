import { Database } from 'bun:sqlite'
import { parentPort, workerData } from 'node:worker_threads'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { nodeStateMethods, nodeStoredOperationSchema, type NodeStateMethod } from '@hbar/contracts/node-state'
import {
  NODE_LIMITS,
  nodeFloorSchema,
  nodeReceiptSchema,
  nodeAuditEntrySchema,
  type NodeReceipt,
} from '@hbar/contracts/node'

const configuration = z.strictObject({ path: z.string().min(1).max(4_000) }).parse(workerData)
const db = new Database(configuration.path, { create: true, strict: true })
db.exec('PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;')
const current = z.object({ user_version: z.number().int() }).parse(db.query('PRAGMA user_version').get()).user_version
if (current > 1) throw new Error('Unsupported workspace-node database version')
if (current === 0)
  db.transaction(() => {
    db.exec(`
    CREATE TABLE config(key TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
    CREATE TABLE operations(
      operationId TEXT PRIMARY KEY, argumentsDigest TEXT NOT NULL, kind TEXT NOT NULL,
      authority TEXT NOT NULL CHECK(json_valid(authority)), receipt TEXT NOT NULL CHECK(json_valid(receipt)),
      versions TEXT CHECK(versions IS NULL OR json_valid(versions)), updatedAt INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX operations_updated ON operations(updatedAt);
    CREATE TABLE audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,data TEXT NOT NULL CHECK(json_valid(data))) STRICT;
    PRAGMA user_version=1;
  `)
  }).immediate()
// A process lost across node restart has an unknown effect. Acceptance without start is safe to refuse/retry.
db.transaction(() => {
  for (const row of db
    .query<{ operationId: string; receipt: string }, []>(
      "SELECT operationId,receipt FROM operations WHERE json_extract(receipt,'$.state') IN ('accepted','started')",
    )
    .all()) {
    const receipt = nodeReceiptSchema.parse(JSON.parse(row.receipt))
    if (receipt.state === 'started')
      putReceipt(row.operationId, {
        state: 'lost',
        acceptedAt: receipt.acceptedAt,
        startedAt: receipt.startedAt,
        reason: 'restart',
      })
    else if (receipt.state === 'accepted')
      putReceipt(row.operationId, {
        state: 'settled',
        acceptedAt: receipt.acceptedAt,
        startedAt: null,
        settledAt: Date.now(),
        result: {
          text: 'The node restarted before execution started.',
          isError: true,
          details: {
            code: 'NODE_NOT_STARTED',
            exitCode: null,
            executionStarted: false,
            truncated: false,
            backend: 'none',
          },
        },
      })
  }
}).immediate()

function putReceipt(id: string, receipt: NodeReceipt): void {
  db.query('UPDATE operations SET receipt=?,updatedAt=? WHERE operationId=?').run(
    JSON.stringify(receipt),
    Date.now(),
    id,
  )
}
function operation(id: string) {
  const row = db
    .query<
      {
        operationId: string
        argumentsDigest: string
        kind: string
        authority: string
        receipt: string
        versions: string | null
      },
      [string]
    >('SELECT operationId,argumentsDigest,kind,authority,receipt,versions FROM operations WHERE operationId=?')
    .get(id)
  if (row === null) return null
  const authority: unknown = JSON.parse(row.authority)
  const receipt: unknown = JSON.parse(row.receipt)
  const versions: unknown = row.versions === null ? null : JSON.parse(row.versions)
  return nodeStoredOperationSchema.parse({ ...row, authority, receipt, versions })
}
function required(id: string) {
  const found = operation(id)
  if (!found) throw new HbarError('NOT_FOUND', 'Node execution receipt is absent')
  return found
}
function config(key: string): unknown {
  const row = db.query<{ value: string }, [string]>('SELECT value FROM config WHERE key=?').get(key)
  return row === null ? null : JSON.parse(row.value)
}
function saveConfig(key: string, value: unknown): void {
  db.query('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(
    key,
    JSON.stringify(value),
  )
}
function dispatch(method: NodeStateMethod, value: unknown): unknown {
  switch (method) {
    case 'ready':
      return { version: 1 }
    case 'floor.get': {
      const value = config('floor')
      return value === null ? null : nodeFloorSchema.parse(value)
    }
    case 'floor.set': {
      const input = nodeStateMethods[method].input.parse(value)
      saveConfig('floor', input)
      return input
    }
    case 'config.get':
      return config(nodeStateMethods[method].input.parse(value).key)
    case 'config.set': {
      const input = nodeStateMethods[method].input.parse(value)
      saveConfig(input.key, input.value)
      return { saved: true }
    }
    case 'operation.accept': {
      const input = nodeStateMethods[method].input.parse(value)
      return db
        .transaction(() => {
          const prior = operation(input.operationId)
          if (prior) {
            if (prior.argumentsDigest !== input.argumentsDigest)
              throw new HbarError('IDEMPOTENCY_CONFLICT', 'Operation key has different parameters')
            return { accepted: false, operation: prior }
          }
          db.query(
            "DELETE FROM operations WHERE updatedAt<? AND json_extract(receipt,'$.state') IN ('settled','lost')",
          ).run(Date.now() - NODE_LIMITS.receiptRetentionMs)
          const count = z
            .object({ count: z.number() })
            .parse(db.query('SELECT COUNT(*) AS count FROM operations').get()).count
          if (count >= NODE_LIMITS.receipts) throw new HbarError('NODE_BUSY', 'Node receipt capacity is full')
          const receipt: NodeReceipt = { state: 'accepted', acceptedAt: Date.now() }
          db.query(
            'INSERT INTO operations(operationId,argumentsDigest,kind,authority,receipt,versions,updatedAt) VALUES(?,?,?,?,?,NULL,?)',
          ).run(
            input.operationId,
            input.argumentsDigest,
            input.kind,
            JSON.stringify(input.authority),
            JSON.stringify(receipt),
            Date.now(),
          )
          return { accepted: true, operation: required(input.operationId) }
        })
        .immediate()
    }
    case 'operation.get':
      return operation(nodeStateMethods[method].input.parse(value).operationId)
    case 'operation.start': {
      const input = nodeStateMethods[method].input.parse(value)
      return db
        .transaction(() => {
          const current = required(input.operationId),
            receipt = current.receipt
          if (receipt.state === 'accepted')
            putReceipt(input.operationId, {
              state: 'started',
              acceptedAt: receipt.acceptedAt,
              startedAt: Date.now(),
            })
          return required(input.operationId)
        })
        .immediate()
    }
    case 'operation.settle': {
      const input = nodeStateMethods[method].input.parse(value)
      return db
        .transaction(() => {
          const current = required(input.operationId),
            receipt = current.receipt
          if (receipt.state === 'settled' || receipt.state === 'lost') return current
          if (receipt.state === 'absent') throw new HbarError('INVALID_STATE', 'Cannot settle absent execution')
          putReceipt(input.operationId, {
            state: 'settled',
            acceptedAt: receipt.acceptedAt,
            startedAt: receipt.state === 'started' ? receipt.startedAt : null,
            settledAt: Date.now(),
            result: input.result,
          })
          if (input.versions)
            db.query('UPDATE operations SET versions=? WHERE operationId=?').run(
              JSON.stringify(input.versions),
              input.operationId,
            )
          return required(input.operationId)
        })
        .immediate()
    }
    case 'operation.lost': {
      const input = nodeStateMethods[method].input.parse(value)
      const current = required(input.operationId),
        receipt = current.receipt
      if (receipt.state === 'started')
        putReceipt(input.operationId, {
          state: 'lost',
          acceptedAt: receipt.acceptedAt,
          startedAt: receipt.startedAt,
          reason: input.reason,
        })
      return required(input.operationId)
    }
    case 'operation.list':
      return db
        .query<{ operationId: string }, []>(
          "SELECT operationId FROM operations WHERE json_extract(receipt,'$.state') IN ('accepted','started') ORDER BY updatedAt LIMIT 64",
        )
        .all()
        .map((row) => required(row.operationId))
    case 'audit.append': {
      const input = nodeStateMethods[method].input.parse(value)
      const time = Date.now()
      const inserted = db.query('INSERT INTO audit(data) VALUES(?)').run(JSON.stringify({ ...input, time }))
      const result = nodeAuditEntrySchema.parse({ ...input, time, seq: Number(inserted.lastInsertRowid) })
      // Local retention is bounded. The remote protocol exposes no audit mutation method.
      db.query('DELETE FROM audit WHERE seq<=?').run(result.seq - 100_000)
      return result
    }
    case 'audit.list': {
      const input = nodeStateMethods[method].input.parse(value)
      return db
        .query<{ seq: number; data: string }, [number, number]>(
          'SELECT seq,data FROM audit WHERE seq>? ORDER BY seq LIMIT ?',
        )
        .all(input.after, input.limit)
        .map((row) =>
          nodeAuditEntrySchema.parse({
            ...z.record(z.string(), z.unknown()).parse(JSON.parse(row.data)),
            seq: row.seq,
          }),
        )
    }
    case 'close':
      db.close()
      return { closed: true }
  }
}
const requestSchema = z.strictObject({ id: z.number().int().positive(), method: z.string(), input: z.unknown() })
parentPort?.on('message', (value: unknown) => {
  let id: number | null = null
  try {
    const request = requestSchema.parse(value)
    id = request.id
    if (!Object.hasOwn(nodeStateMethods, request.method))
      throw new HbarError('METHOD_NOT_FOUND', 'Unknown node state operation')
    const method = request.method as NodeStateMethod
    const input = nodeStateMethods[method].input.parse(request.input)
    const output = nodeStateMethods[method].output.parse(dispatch(method, input))
    parentPort?.postMessage({ id, ok: true, output })
    if (method === 'close') parentPort?.close()
  } catch (error) {
    parentPort?.postMessage({
      id,
      ok: false,
      code: error instanceof HbarError ? error.code : 'NODE_STATE_ERROR',
      message: error instanceof Error ? error.message : 'Node state operation failed',
    })
  }
})
