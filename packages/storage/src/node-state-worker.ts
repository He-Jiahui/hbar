import { Database } from 'bun:sqlite'
import { parentPort, workerData } from 'node:worker_threads'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import {
  nodeStateMethods,
  nodeStoredOperationSchema,
  nodeConsoleDeviceSchema,
  nodeConsoleInviteSchema,
  type NodeStateMethod,
} from '@hbar/contracts/node-state'
import { nodeLocalConfirmationSchema } from '@hbar/contracts/node-confirmations'
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
if (current > 4) throw new Error('Unsupported workspace-node database version')
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
if (current < 2)
  db.transaction(() => {
    db.exec(
      'ALTER TABLE operations ADD COLUMN target TEXT CHECK(target IS NULL OR json_valid(target)); PRAGMA user_version=2;',
    )
  }).immediate()
if (current < 3)
  db.transaction(() => {
    db.exec(`
      CREATE TABLE console_devices(
        deviceId TEXT PRIMARY KEY,
        publicKey TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL CHECK(json_valid(data))
      ) STRICT;
      CREATE TABLE console_invites(
        inviteId TEXT PRIMARY KEY,
        codeDigest TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL CHECK(json_valid(data))
      ) STRICT;
      CREATE TABLE console_pairing_attempts(
        sourceKey TEXT PRIMARY KEY,
        windowStartedAt INTEGER NOT NULL,
        attempts INTEGER NOT NULL CHECK(attempts>=0)
      ) STRICT;
      PRAGMA user_version=3;
    `)
  }).immediate()
if (current < 4)
  db.transaction(() => {
    db.exec(`
      CREATE TABLE local_confirmations(
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        operationId TEXT NOT NULL,
        state TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        data TEXT NOT NULL CHECK(json_valid(data))
      ) STRICT;
      CREATE INDEX local_confirmations_operation ON local_confirmations(operationId,seq);
      CREATE INDEX local_confirmations_state_created ON local_confirmations(state,createdAt);
      PRAGMA user_version=4;
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
        target: string | null
        authority: string
        receipt: string
        versions: string | null
      },
      [string]
    >('SELECT operationId,argumentsDigest,kind,target,authority,receipt,versions FROM operations WHERE operationId=?')
    .get(id)
  if (row === null) return null
  const authority: unknown = JSON.parse(row.authority)
  const target: unknown = row.target === null ? null : JSON.parse(row.target)
  const receipt: unknown = JSON.parse(row.receipt)
  const versions: unknown = row.versions === null ? null : JSON.parse(row.versions)
  return nodeStoredOperationSchema.parse({ ...row, target, authority, receipt, versions })
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
function consoleDevice(deviceId: string) {
  const row = db.query<{ data: string }, [string]>('SELECT data FROM console_devices WHERE deviceId=?').get(deviceId)
  return row ? nodeConsoleDeviceSchema.parse(JSON.parse(row.data)) : null
}
function insertConsoleDevice(device: ReturnType<typeof nodeConsoleDeviceSchema.parse>): void {
  db.query('INSERT INTO console_devices(deviceId,publicKey,data) VALUES(?,?,?)').run(
    device.deviceId,
    device.publicKey,
    JSON.stringify(device),
  )
}
function updateConsoleDevice(device: ReturnType<typeof nodeConsoleDeviceSchema.parse>): void {
  const changed = db
    .query('UPDATE console_devices SET data=? WHERE deviceId=? AND publicKey=?')
    .run(JSON.stringify(device), device.deviceId, device.publicKey)
  if (changed.changes !== 1) throw new HbarError('INVALID_STATE', 'B console device identity changed unexpectedly')
}
function dispatch(method: NodeStateMethod, value: unknown): unknown {
  switch (method) {
    case 'ready':
      return { version: 4 }
    case 'floor.get': {
      const value = config('floor')
      return value === null ? null : nodeFloorSchema.parse(value)
    }
    case 'floor.set': {
      const input = nodeStateMethods[method].input.parse(value)
      db.transaction(() => {
        const revision = Number(config('floorRevision') ?? 0)
        if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
          throw new HbarError('INVALID_STATE', 'Node floor revision is invalid or exhausted')
        saveConfig('floor', input)
        saveConfig('floorRevision', revision + 1)
      }).immediate()
      return input
    }
    case 'floor.snapshot': {
      return db
        .transaction(() => ({
          floor: nodeFloorSchema.nullable().parse(config('floor')),
          revision: Number(config('floorRevision') ?? 0),
        }))
        .immediate()
    }
    case 'floor.update': {
      const input = nodeStateMethods[method].input.parse(value)
      const updated = db
        .transaction(() => {
          const revision = Number(config('floorRevision') ?? 0)
          if (revision !== input.expectedRevision) return null
          const nextRevision = revision + 1
          if (!Number.isSafeInteger(nextRevision))
            throw new HbarError('INVALID_STATE', 'Node floor revision is exhausted')
          saveConfig('floor', input.floor)
          saveConfig('floorRevision', nextRevision)
          return { floor: input.floor, revision: nextRevision }
        })
        .immediate()
      if (!updated) throw new HbarError('NODE_POLICY_CONFLICT', 'Node floor changed since it was read')
      return updated
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
            'INSERT INTO operations(operationId,argumentsDigest,kind,authority,receipt,versions,updatedAt,target) VALUES(?,?,?,?,?,NULL,?,?)',
          ).run(
            input.operationId,
            input.argumentsDigest,
            input.kind,
            JSON.stringify(input.authority),
            JSON.stringify(receipt),
            Date.now(),
            JSON.stringify(input.target),
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
    case 'console.devices.list':
      return db
        .query<{ data: string }, []>(
          "SELECT data FROM console_devices ORDER BY json_extract(data,'$.createdAt'),deviceId LIMIT 256",
        )
        .all()
        .map((row) => nodeConsoleDeviceSchema.parse(JSON.parse(row.data)))
    case 'console.device.get':
      return consoleDevice(nodeStateMethods[method].input.parse(value).deviceId)
    case 'console.device.revoke': {
      const input = nodeStateMethods[method].input.parse(value)
      const current = consoleDevice(input.deviceId)
      if (!current) return null
      const revoked = nodeConsoleDeviceSchema.parse({ ...current, revokedAt: current.revokedAt ?? input.revokedAt })
      updateConsoleDevice(revoked)
      return revoked
    }
    case 'console.device.touch': {
      const input = nodeStateMethods[method].input.parse(value)
      const current = consoleDevice(input.deviceId)
      if (!current || current.revokedAt !== null) return null
      const touched = nodeConsoleDeviceSchema.parse({
        ...current,
        lastSeenAt: Math.max(current.lastSeenAt ?? 0, input.lastSeenAt),
      })
      updateConsoleDevice(touched)
      return touched
    }
    case 'console.pairing.create': {
      const input = nodeStateMethods[method].input.parse(value)
      return db
        .transaction(() => {
          db.query(
            "DELETE FROM console_invites WHERE json_extract(data,'$.expiresAt')<? OR json_extract(data,'$.consumedAt')<?",
          ).run(input.createdAt - 24 * 60 * 60_000, input.createdAt - 24 * 60 * 60_000)
          const active = z
            .object({ count: z.number() })
            .parse(
              db
                .query(
                  "SELECT COUNT(*) AS count FROM console_invites WHERE json_extract(data,'$.expiresAt')>? AND json_extract(data,'$.consumedAt') IS NULL",
                )
                .get(input.createdAt),
            ).count
          if (active >= 8) throw new HbarError('RATE_LIMIT', 'Too many active console pairing invitations')
          const recent = z
            .object({ count: z.number() })
            .parse(
              db
                .query("SELECT COUNT(*) AS count FROM console_invites WHERE json_extract(data,'$.createdAt')>? ")
                .get(input.createdAt - 15 * 60_000),
            ).count
          if (recent >= 8) throw new HbarError('RATE_LIMIT', 'Console pairing invitation rate limit reached')
          const retained = z
            .object({ count: z.number() })
            .parse(db.query('SELECT COUNT(*) AS count FROM console_invites').get()).count
          if (retained >= 256) throw new HbarError('NODE_BUSY', 'B console invitation capacity is full')
          const invite = nodeConsoleInviteSchema.parse({
            ...input,
            expiresAt: input.createdAt + 5 * 60_000,
            consumedAt: null,
            deviceId: null,
          })
          db.query('INSERT INTO console_invites(inviteId,codeDigest,data) VALUES(?,?,?)').run(
            invite.inviteId,
            invite.codeDigest,
            JSON.stringify(invite),
          )
          return invite
        })
        .immediate()
    }
    case 'console.pairing.consume': {
      const input = nodeStateMethods[method].input.parse(value)
      return db
        .transaction(() => {
          const row = db
            .query<{ data: string }, [string]>('SELECT data FROM console_invites WHERE codeDigest=?')
            .get(input.codeDigest)
          const invite = row ? nodeConsoleInviteSchema.parse(JSON.parse(row.data)) : null
          if (!invite || invite.consumedAt !== null || invite.expiresAt <= input.now)
            throw new HbarError('PAIRING_CODE_INVALID', 'The B console pairing code is invalid or expired')
          const prior = db
            .query<{ deviceId: string; publicKey: string }, [string, string]>(
              'SELECT deviceId,publicKey FROM console_devices WHERE deviceId=? OR publicKey=? LIMIT 1',
            )
            .get(input.deviceId, input.publicKey)
          if (prior) throw new HbarError('DEVICE_ALREADY_PAIRED', 'This B console device key is already registered')
          const count = z
            .object({ count: z.number() })
            .parse(db.query('SELECT COUNT(*) AS count FROM console_devices').get()).count
          if (count >= 256) throw new HbarError('NODE_BUSY', 'B console device capacity is full')
          const device = nodeConsoleDeviceSchema.parse({
            deviceId: input.deviceId,
            name: input.name,
            publicKey: input.publicKey,
            role: invite.role,
            roots: invite.roots,
            createdAt: input.now,
            lastSeenAt: input.now,
            revokedAt: null,
          })
          insertConsoleDevice(device)
          const consumed = nodeConsoleInviteSchema.parse({
            ...invite,
            consumedAt: input.now,
            deviceId: device.deviceId,
          })
          db.query('UPDATE console_invites SET data=? WHERE inviteId=?').run(JSON.stringify(consumed), invite.inviteId)
          return device
        })
        .immediate()
    }
    case 'console.pairing.attempt': {
      const input = nodeStateMethods[method].input.parse(value)
      return db
        .transaction(() => {
          db.query('DELETE FROM console_pairing_attempts WHERE windowStartedAt<?').run(input.now - 24 * 60 * 60_000)
          const row = db
            .query<{ windowStartedAt: number; attempts: number }, [string]>(
              'SELECT windowStartedAt,attempts FROM console_pairing_attempts WHERE sourceKey=?',
            )
            .get(input.sourceKey)
          const freshWindow = !row || input.now - row.windowStartedAt >= 15 * 60_000
          const windowStartedAt = freshWindow ? input.now : row.windowStartedAt
          const attempts = freshWindow ? 0 : row.attempts
          const sourceCount = z
            .object({ count: z.number() })
            .parse(db.query('SELECT COUNT(*) AS count FROM console_pairing_attempts').get()).count
          const allowed = attempts < 5 && (!!row || sourceCount < 4_096)
          if (allowed)
            db.query(
              'INSERT INTO console_pairing_attempts(sourceKey,windowStartedAt,attempts) VALUES(?,?,?) ON CONFLICT(sourceKey) DO UPDATE SET windowStartedAt=excluded.windowStartedAt,attempts=excluded.attempts',
            ).run(input.sourceKey, windowStartedAt, attempts + 1)
          return { allowed }
        })
        .immediate()
    }
    case 'local-confirmation.list': {
      const input = nodeStateMethods[method].input.parse(value)
      const rows = input.includeResolved
        ? db.query<{ data: string }, []>('SELECT data FROM local_confirmations ORDER BY seq DESC LIMIT 64').all()
        : db
            .query<{ data: string }, []>(
              "SELECT data FROM local_confirmations WHERE state IN ('waiting','approved') ORDER BY seq DESC LIMIT 64",
            )
            .all()
      return rows.map((row) => nodeLocalConfirmationSchema.parse(JSON.parse(row.data)))
    }
    case 'local-confirmation.get': {
      const input = nodeStateMethods[method].input.parse(value)
      const row = db.query<{ data: string }, [string]>('SELECT data FROM local_confirmations WHERE id=?').get(input.id)
      return row ? nodeLocalConfirmationSchema.parse(JSON.parse(row.data)) : null
    }
    case 'local-confirmation.latest': {
      const input = nodeStateMethods[method].input.parse(value)
      const row = db
        .query<{ data: string }, [string]>(
          'SELECT data FROM local_confirmations WHERE operationId=? ORDER BY seq DESC LIMIT 1',
        )
        .get(input.operationId)
      return row ? nodeLocalConfirmationSchema.parse(JSON.parse(row.data)) : null
    }
    case 'local-confirmation.create': {
      const input = nodeStateMethods[method].input.parse(value)
      return db
        .transaction(() => {
          const count = z
            .object({ count: z.number() })
            .parse(
              db.query("SELECT COUNT(*) AS count FROM local_confirmations WHERE state IN ('waiting','approved')").get(),
            ).count
          if (count >= 64) throw new HbarError('NODE_BUSY', 'Local confirmation queue is full')
          const entry = nodeLocalConfirmationSchema.parse(input.entry)
          db.query('INSERT INTO local_confirmations(id,operationId,state,createdAt,data) VALUES(?,?,?,?,?)').run(
            entry.id,
            entry.identity.operationId,
            entry.state,
            entry.createdAt,
            JSON.stringify(entry),
          )
          db.exec(`
            DELETE FROM local_confirmations WHERE state NOT IN ('waiting','approved')
              AND seq NOT IN (
                SELECT seq FROM local_confirmations
                WHERE state NOT IN ('waiting','approved') ORDER BY seq DESC LIMIT 192
              )
          `)
          return entry
        })
        .immediate()
    }
    case 'local-confirmation.resolve': {
      const input = nodeStateMethods[method].input.parse(value)
      return db
        .transaction(() => {
          const row = db
            .query<{ data: string }, [string]>(
              "SELECT data FROM local_confirmations WHERE id=? AND state IN ('waiting','approved')",
            )
            .get(input.id)
          if (!row) return null
          const entry = nodeLocalConfirmationSchema.parse(JSON.parse(row.data))
          const updated = nodeLocalConfirmationSchema.parse({
            ...entry,
            state: input.state,
            resolvedAt: input.now,
            resolvedByDeviceId: input.deviceId,
          })
          db.query('UPDATE local_confirmations SET state=?,data=? WHERE id=?').run(
            updated.state,
            JSON.stringify(updated),
            updated.id,
          )
          return updated
        })
        .immediate()
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
