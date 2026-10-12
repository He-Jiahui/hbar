import { Database } from 'bun:sqlite'
import { readContextCompactionMarkers } from './context-compaction-markers'
import {
  RUN_FILE_CHANGES_SQL,
  projectRunFileChanges,
  finishRunFileChanges,
  readRunFileChangesSummary,
  readRunFileChangePage,
  readRunFileChangeDiff,
  readRunFileChangeVersions,
} from './run-file-changes'
import { workerData, parentPort } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import {
  HbarError,
  artifactSchema,
  contentBlockSchema,
  emptyUsage,
  idSchema,
  inputSchema,
  providerSchema,
  runFailureSchema,
  runSchema,
  sessionEventSchema,
  settingScopeSchema,
} from '@hbar/contracts'
import { z } from 'zod'
import { executionOwnershipSchema } from '@hbar/contracts/runtime'
import {
  workspaceSchema,
  sessionSchema,
  workspaceActivityListInputSchema,
  workspaceActivityPageSchema,
  workspaceActivityCursorSchema,
  workspaceActivityItemSchema,
  sessionActivityListInputSchema,
  sessionActivityPageSchema,
  sessionActivityCursorSchema,
  workspaceListInputSchema,
  sessionListInputSchema,
} from '@hbar/contracts/directory'
import type {
  WorkspaceActivityListInput,
  WorkspaceActivityPage,
  SessionActivityListInput,
  SessionActivityPage,
} from '@hbar/contracts/directory'
import {
  queuedRunEditableInputSchema,
  queuedRunEditableSchema,
  queuedRunEditTextInputSchema,
  queuedRunEditTextReceiptSchema,
  queuedRunGuideInputSchema,
  queuedRunGuideReceiptSchema,
  queuedRunGuidanceSchema,
  queuedRunRemoveInputSchema,
  queuedRunRemoveReceiptSchema,
  runSteeringMessageSchema,
  runSteeringReadInputSchema,
  runSteeringReadResultSchema,
  runCommandRecordSchema,
} from '@hbar/contracts/commands/run'
import { USAGE_EVENT_TYPES } from '@hbar/usage'
import type { UsageReadInput, UsageReadRow } from '@hbar/usage'
import type {
  Approval,
  ContentBlock,
  Device,
  Message,
  Run,
  Session,
  SessionEvent,
  SessionSummary,
  Usage,
  Workspace,
} from '@hbar/contracts'
import type { StorageCall, StorageMethods, StorageReply, StoredSettingsLayer } from './types.ts'
import { STORAGE_RPC_METHODS } from './rpc-catalog'
import { createStorageWorkerDiagnostics, safeStorageErrorCode } from './worker-diagnostics.ts'
import { SessionLogWriter } from './session-log-writer.ts'
import { recordRecoveryDiagnostic, scanSessionLogs } from './session-log-recovery.ts'
import { readActiveOperations } from './active-operations.ts'
import { readQueuedUserRuns } from './queued-user-runs.ts'
import { RunSteeringRegistry } from './run-steering.ts'
import { createRuntimeState, RUNTIME_STATE_SQL, runtimeManualRecoverySchema } from './runtime-state'
import { GOAL_HISTORY_INDEX_SQL, readGoalHistory } from './goal-history.ts'
import { readSessionObservability } from './session-observability.ts'
import { beginContextCompaction, finishContextCompaction, readContextHistory } from './context-history'
import { contextCompactionRecordSchema } from '@hbar/contracts/context-history'
import { createNotificationStorage, NOTIFICATION_SCHEMA_SQL } from './notifications'
import { notificationFromSessionEvent, notificationFromScheduleOccurrence } from './notification-projection'
import { createPromptTemplateStorage, PROMPT_TEMPLATES_SQL } from './prompt-templates'
import { createScheduleStorage, SCHEDULES_SQL } from './schedules'
import { agentChildCountSql, agentMembershipSql, createSessionAgentDirectory } from './session-agent-directory'
import { createSandboxProfileStorage, SANDBOX_PROFILES_SQL } from './sandbox-profiles'
import { readRunBoard } from './run-board'
import { createWorkspaceOrganizationStorage, WORKSPACE_ORGANIZATION_SQL } from './workspace-organization.ts'
import { createWorkspaceDisplayNamesStorage, WORKSPACE_DISPLAY_NAMES_SQL } from './workspace-display-names.ts'
import { createWorkspaceFolderStorage, WORKSPACE_FOLDERS_SQL } from './workspace-folders'
import { createSessionSearchStorage, SESSION_SEARCH_SQL } from './session-search.ts'
import { CHAT_DATABASE_SQL } from './chat-database-schema'
import { createChatDatabaseProjection } from './chat-database-projection'
import { createChatDatabaseJournal } from './chat-database-journal'
import { createChatDatabaseAutomaticPlan } from './chat-database-automatic-plan'
import { createChatDatabaseTaskStorage } from './chat-database-tasks'
import { createChatDatabaseDeletionStorage } from './chat-database-deletion'
import { createChatDatabaseArtifactStorage } from './chat-database-artifacts'
import { createChatDatabaseResourceLedger } from './chat-database-resource-ledger'
import {
  createSessionLaunchTargetStorage,
  SESSION_LAUNCH_TARGET_RESOLUTION_SQL,
  SESSION_LAUNCH_TARGET_SQL,
  sessionLaunchTargetBindingSchema,
} from './session-launch-target.ts'
import {
  createSessionLaunchTargetPreparationStorage,
  SESSION_LAUNCH_TARGET_PREPARATION_OPERATION_SQL,
} from './session-launch-target-preparations.ts'
import { createSessionBranchTargetStorage, SESSION_BRANCH_TARGET_SQL, SESSION_BRANCH_TARGET_BRANCH_SQL } from './session-branch-target'
import {
  createSidebarDirectoryStorage,
  SIDEBAR_DIRECTORY_SCHEMA_SQL,
  SIDEBAR_CHILD_ACTIVITY_SCHEMA_SQL,
} from './sidebar-directory.ts'

const workerPathSchema = z.string().min(1).max(4_000)
const options = z.strictObject({
  path: workerPathSchema, sessions: workerPathSchema.optional(), diagnostics: workerPathSchema.optional(),
  settings: workerPathSchema.optional(), artifacts: workerPathSchema.optional(), cache: workerPathSchema.optional(),
  diagnosticsEnabled: z.boolean().optional(), diagnosticsFullCoverage: z.boolean().optional(), instanceId: z.string().min(1).max(160).optional(),
  preflight: z.boolean().optional(),
}).parse(workerData)
const preflight = options.preflight === true
const shadowMemory = preflight && !existsSync(options.path)
const sessionsRoot = options.sessions ?? join(dirname(options.path), 'sessions')
const diagnosticsRoot = options.diagnostics ?? join(dirname(options.path), 'diagnostics')
const settingsRoot = options.settings ?? join(dirname(options.path), 'settings')
const artifactsRoot = options.artifacts ?? join(dirname(options.path), 'artifacts')
const cacheRoot = options.cache ?? join(dirname(options.path), 'cache')
const logWriter = new SessionLogWriter(sessionsRoot)
const runSteering = new RunSteeringRegistry()
let databaseMaintenanceOwner: string | null = null
const databaseMaintenanceReads = new Set<string>(['ready', 'deviceByHash', 'devices', 'chatDatabaseOperationRead', 'chatDatabaseOperationReceipt', 'chatDatabasePreviewPage', 'chatDatabaseHistory', 'chatDatabaseResourceReceipt', 'chatDatabaseMaintenanceEnd', 'close'])
const workerDiagnostics = createStorageWorkerDiagnostics({
  enabled: options.diagnosticsEnabled ?? options.diagnostics !== undefined,
  ...(options.diagnosticsFullCoverage === undefined ? {} : { fullCoverage: options.diagnosticsFullCoverage }),
  ...(options.instanceId === undefined ? {} : { instanceId: options.instanceId }),
  port: parentPort,
})
let startupPhase: 'open' | 'configure' | 'migration' | 'recovery' | 'ready' = 'open'
process.on('uncaughtExceptionMonitor', () => {
  // This hook observes initialization failures before the worker exits. It does not
  // intercept or recover from the exception, so the parent still owns lifecycle state.
  workerDiagnostics.emit({
    event: 'sqlite.worker_uncaught',
    phase: startupPhase,
    level: 'fatal',
    outcome: 'failure',
    errorCode: 'SQLITE_WORKER_UNCAUGHT',
    workerState: 'failed',
  })
})
workerDiagnostics.emit({ event: 'sqlite.starting', phase: 'open', level: 'info', workerState: 'starting' })
startupPhase = 'open'
let db: Database
try {
  db = new Database(shadowMemory ? ':memory:' : options.path, { ...(preflight && !shadowMemory ? { readonly: true } : { create: true }), strict: true })
} catch (error) {
  workerDiagnostics.emit({
    event: 'sqlite.open_failed',
    phase: 'open',
    level: 'fatal',
    outcome: 'failure',
    errorCode: safeStorageErrorCode(error, 'SQLITE_OPEN_FAILED'),
    workerState: 'failed',
  })
  throw error
}
// Configure this connection's bounded wait before WAL recovery/configuration can contend with another opener.
startupPhase = 'configure'
try {
  db.exec('PRAGMA busy_timeout=5000;')
  if (!preflight || shadowMemory) db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;')
} catch (error) {
  workerDiagnostics.emit({
    event: 'sqlite.configure_failed',
    phase: 'configure',
    level: 'fatal',
    outcome: 'failure',
    errorCode: safeStorageErrorCode(error, 'SQLITE_CONFIG_FAILED'),
    workerState: 'failed',
  })
  throw error
}
function readSqliteFacts(): {
  sqliteVersion: string
  journalMode: 'delete' | 'truncate' | 'persist' | 'memory' | 'wal' | 'off' | 'unknown'
  synchronous: number
  busyTimeoutMs: number
  foreignKeys: boolean
  pageSize: number
  userVersion: number
} {
  const sqliteVersion = z.strictObject({ version: z.string().regex(/^\d+\.\d+(?:\.\d+)?$/).max(32) })
    .parse(db.query('SELECT sqlite_version() AS version').get()).version
  const journalMode = z.strictObject({ journal_mode: z.enum(['delete', 'truncate', 'persist', 'memory', 'wal', 'off']) })
    .parse(db.query('PRAGMA journal_mode').get()).journal_mode
  const synchronous = z.strictObject({ synchronous: z.number().int().min(0).max(3) })
    .parse(db.query('PRAGMA synchronous').get()).synchronous
  const busyTimeoutMs = z.strictObject({ timeout: z.number().int().min(0).max(2_147_483_647) })
    .parse(db.query('PRAGMA busy_timeout').get()).timeout
  const foreignKeys = z.strictObject({ foreign_keys: z.union([z.literal(0), z.literal(1)]) })
    .parse(db.query('PRAGMA foreign_keys').get()).foreign_keys === 1
  const pageSize = z.strictObject({ page_size: z.number().int().min(1).max(1_048_576) })
    .parse(db.query('PRAGMA page_size').get()).page_size
  const userVersion = z.strictObject({ user_version: z.number().int().min(0).max(1_000_000) })
    .parse(db.query('PRAGMA user_version').get()).user_version
  return { sqliteVersion, journalMode, synchronous, busyTimeoutMs, foreignKeys, pageSize, userVersion }
}
try {
  const facts = readSqliteFacts()
  workerDiagnostics.emit({
    event: 'sqlite.configured',
    phase: 'configure',
    level: 'info',
    outcome: 'success',
    workerState: 'starting',
    sqliteVersion: facts.sqliteVersion,
    runtimeVersion: Bun.version,
    databaseSchemaVersion: facts.userVersion,
    userVersion: facts.userVersion,
    journalMode: facts.journalMode,
    synchronous: facts.synchronous,
    busyTimeoutMs: facts.busyTimeoutMs,
    foreignKeys: facts.foreignKeys,
    pageSize: facts.pageSize,
  })
} catch (error) {
  workerDiagnostics.emit({
    event: 'sqlite.facts_failed',
    phase: 'configure',
    level: 'fatal',
    outcome: 'failure',
    errorCode: safeStorageErrorCode(error, 'SQLITE_FACTS_FAILED'),
    workerState: 'failed',
  })
  throw error
}
startupPhase = 'migration'
const WORKSPACE_ACTIVITY_SQL = `
  CREATE TABLE IF NOT EXISTS directory_activity_revision(
    id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0)
  );
  INSERT OR IGNORE INTO directory_activity_revision(id,revision) VALUES(1,0);
  CREATE INDEX IF NOT EXISTS sessions_workspace_archived_created_id
    ON sessions(workspaceId,archived,createdAt DESC,id ASC);
  CREATE INDEX IF NOT EXISTS sessions_workspace_archived_updated_id
    ON sessions(workspaceId,archived,updatedAt DESC,id ASC);
  CREATE TRIGGER IF NOT EXISTS directory_activity_workspace_insert
    AFTER INSERT ON workspaces
    BEGIN UPDATE directory_activity_revision SET revision=revision+1 WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS directory_activity_workspace_update
    AFTER UPDATE OF id,path,name,createdAt ON workspaces
    BEGIN UPDATE directory_activity_revision SET revision=revision+1 WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS directory_activity_workspace_delete
    AFTER DELETE ON workspaces
    BEGIN UPDATE directory_activity_revision SET revision=revision+1 WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS directory_activity_session_insert
    AFTER INSERT ON sessions
    BEGIN UPDATE directory_activity_revision SET revision=revision+1 WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS directory_activity_session_update
    AFTER UPDATE OF workspaceId,archived,createdAt,updatedAt ON sessions
    BEGIN UPDATE directory_activity_revision SET revision=revision+1 WHERE id=1; END;
  CREATE TRIGGER IF NOT EXISTS directory_activity_session_delete
    AFTER DELETE ON sessions
    BEGIN UPDATE directory_activity_revision SET revision=revision+1 WHERE id=1; END;
`
const LATEST_SCHEMA_VERSION = 25
const schemaVersion = z.object({ user_version: z.number().int().nonnegative() }).parse(db.query('PRAGMA user_version').get()).user_version
if (preflight && !shadowMemory && schemaVersion !== LATEST_SCHEMA_VERSION)
  throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Candidate Worker cannot apply a production migration')
const schemaStartedAt = performance.now()
if (schemaVersion > LATEST_SCHEMA_VERSION) throw new Error(`Unsupported database version ${schemaVersion}`)
if (schemaVersion === 0)
  db.transaction(() => {
    db.exec(`
    CREATE TABLE workspaces(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE sessions(id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, parentId TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, seq INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE events(eventId TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), seq INTEGER NOT NULL, runId TEXT, stepId TEXT, type TEXT NOT NULL, data TEXT NOT NULL, time INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, UNIQUE(sessionId,seq));
    CREATE TABLE messages(id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), runId TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, seq INTEGER NOT NULL, createdAt INTEGER NOT NULL, providerData TEXT);
    CREATE INDEX messages_session_seq ON messages(sessionId,seq);
    CREATE TABLE runs(id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), requestId TEXT NOT NULL, input TEXT NOT NULL, modelId TEXT NOT NULL, status TEXT NOT NULL, createdAt INTEGER NOT NULL, startedAt INTEGER, endedAt INTEGER, error TEXT, UNIQUE(sessionId,requestId));
    CREATE INDEX runs_session_status ON runs(sessionId,status,createdAt);
    CREATE TABLE approvals(id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, runId TEXT NOT NULL, callId TEXT NOT NULL, tool TEXT NOT NULL, args TEXT NOT NULL, status TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE tool_intents(id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, runId TEXT NOT NULL, callId TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE providers(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE artifacts(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE devices(id TEXT PRIMARY KEY, name TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL, lastSeenAt INTEGER NOT NULL);
    CREATE TABLE plugins(id TEXT NOT NULL, projectId TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL, config TEXT NOT NULL, path TEXT, PRIMARY KEY(id,projectId));
    CREATE TABLE compactions(sessionId TEXT NOT NULL, throughSeq INTEGER NOT NULL, summary TEXT NOT NULL, eventSeq INTEGER NOT NULL, PRIMARY KEY(sessionId,eventSeq));
    CREATE TABLE projects(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE session_log_files(path TEXT PRIMARY KEY, projectId TEXT NOT NULL, sessionId TEXT NOT NULL, firstSeq INTEGER NOT NULL, lastSeq INTEGER NOT NULL, size INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE session_event_index(eventId TEXT PRIMARY KEY, sessionId TEXT NOT NULL, seq INTEGER NOT NULL, logPath TEXT NOT NULL REFERENCES session_log_files(path), byteOffset INTEGER NOT NULL, byteLength INTEGER NOT NULL, contentHash TEXT NOT NULL, UNIQUE(sessionId,seq));
    CREATE INDEX session_event_index_session_seq ON session_event_index(sessionId,seq);
    CREATE TABLE path_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE settings_layers(id TEXT PRIMARY KEY, kind TEXT NOT NULL, targetId TEXT, schemaVersion INTEGER NOT NULL, revision INTEGER NOT NULL, valuesJson TEXT NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE settings_receipts(actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL, payloadHash TEXT NOT NULL, receiptJson TEXT NOT NULL, PRIMARY KEY(actorId,idempotencyKey));
    CREATE TABLE entity_command_receipts(actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL, commandId TEXT NOT NULL, payloadHash TEXT NOT NULL, resultJson TEXT NOT NULL, PRIMARY KEY(actorId,idempotencyKey));
    PRAGMA user_version=4;
  `)
  })()
if (schemaVersion === 1)
  db.transaction(() => {
    db.exec(`
      CREATE TABLE projects(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, createdAt INTEGER NOT NULL);
      INSERT OR IGNORE INTO projects SELECT id,path,name,createdAt FROM workspaces;
      CREATE TABLE session_log_files(path TEXT PRIMARY KEY, projectId TEXT NOT NULL, sessionId TEXT NOT NULL, firstSeq INTEGER NOT NULL, lastSeq INTEGER NOT NULL, size INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE TABLE session_event_index(eventId TEXT PRIMARY KEY, sessionId TEXT NOT NULL, seq INTEGER NOT NULL, logPath TEXT NOT NULL REFERENCES session_log_files(path), byteOffset INTEGER NOT NULL, byteLength INTEGER NOT NULL, contentHash TEXT NOT NULL, UNIQUE(sessionId,seq));
      CREATE INDEX session_event_index_session_seq ON session_event_index(sessionId,seq);
      CREATE TABLE path_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=2;
    `)
  })()
if (schemaVersion > 0 && schemaVersion < 3)
  db.transaction(() => {
    db.exec(`
      CREATE TABLE plugins_v3(id TEXT NOT NULL, projectId TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL, config TEXT NOT NULL, path TEXT, PRIMARY KEY(id,projectId));
      INSERT OR IGNORE INTO plugins_v3(id,projectId,enabled,config,path) SELECT id,'',enabled,config,path FROM plugins;
      DROP TABLE plugins;
      ALTER TABLE plugins_v3 RENAME TO plugins;
      PRAGMA user_version=3;
    `)
  })()
if (schemaVersion > 0 && schemaVersion <= 2)
  db.transaction(() => {
    db.exec(`
      CREATE TABLE settings_layers(id TEXT PRIMARY KEY, kind TEXT NOT NULL, targetId TEXT, schemaVersion INTEGER NOT NULL, revision INTEGER NOT NULL, valuesJson TEXT NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE TABLE settings_receipts(actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL, payloadHash TEXT NOT NULL, receiptJson TEXT NOT NULL, PRIMARY KEY(actorId,idempotencyKey));
      PRAGMA user_version=3;
    `)
  })()
if (schemaVersion > 0 && schemaVersion <= 3)
  db.transaction(() => {
    db.exec(`
      CREATE TABLE entity_command_receipts(actorId TEXT NOT NULL, idempotencyKey TEXT NOT NULL, commandId TEXT NOT NULL, payloadHash TEXT NOT NULL, resultJson TEXT NOT NULL, PRIMARY KEY(actorId,idempotencyKey));
      PRAGMA user_version=4;
    `)
  })()
if (schemaVersion < 5)
  db.transaction(() => {
    // Some repair/import flows can lower user_version while retaining columns
    // from a newer projection. Inspect the table before applying this additive
    // migration so startup remains safe and legacy error text is preserved.
    const columns = db.query<{ name: string }, []>('PRAGMA table_info(runs)').all()
    if (!columns.some((column) => column.name === 'failure')) db.exec('ALTER TABLE runs ADD COLUMN failure TEXT;')
    db.exec('PRAGMA user_version=5;')
  })()
if (schemaVersion < 6)
  db.transaction(() => {
    // As with the run failure field above, a repaired database may retain one
    // or both columns while carrying an older user_version marker. Apply only
    // the missing additions so the migration is safe to replay.
    const columns = new Set(
      db
        .query<{ name: string }, []>('PRAGMA table_info(approvals)')
        .all()
        .map((column) => column.name),
    )
    if (!columns.has('feedback')) db.exec('ALTER TABLE approvals ADD COLUMN feedback TEXT;')
    if (!columns.has('decidedBy')) db.exec('ALTER TABLE approvals ADD COLUMN decidedBy TEXT;')
    db.exec('PRAGMA user_version=6;')
  })()

if (schemaVersion < 7)
  db.transaction(() => {
    // Another Worker may already have completed this migration while this one waited for the write lock.
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current < 7 || current > LATEST_SCHEMA_VERSION) {
      if (current !== 6) throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
      db.exec(WORKSPACE_ORGANIZATION_SQL)
      db.exec('PRAGMA user_version=7;')
    }
  }).immediate()

if (schemaVersion < 8)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current === 7) {
      db.exec(WORKSPACE_DISPLAY_NAMES_SQL)
      db.exec('PRAGMA user_version=8;')
    } else if (current < 8 || current > LATEST_SCHEMA_VERSION) {
      throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
    }
  }).immediate()

if (schemaVersion < 9)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current === 8) {
      db.exec(SESSION_SEARCH_SQL)
      db.exec('PRAGMA user_version=9;')
    } else if (current < 9 || current > LATEST_SCHEMA_VERSION) {
      throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
    }
  }).immediate()

if (schemaVersion < 10)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current === 9) {
      db.exec(SESSION_LAUNCH_TARGET_SQL)
      db.exec('PRAGMA user_version=10;')
    } else if (current < 10 || current > LATEST_SCHEMA_VERSION) {
      throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
    }
  }).immediate()

if (schemaVersion < 11)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current === 10) {
      db.exec(SESSION_LAUNCH_TARGET_RESOLUTION_SQL)
      // Before cwd routing shipped, every accepted Run used the shared checkout. Freeze legacy history there.
      db.exec(`
        UPDATE session_launch_targets
        SET revision=revision+1,selectionJson='{"mode":"shared-current"}',updatedAt=CAST(unixepoch('subsec')*1000 AS INTEGER)
        WHERE sessionId IN (SELECT DISTINCT sessionId FROM runs)
          AND json_extract(selectionJson,'$.mode')<>'shared-current';
        INSERT OR IGNORE INTO session_launch_target_bindings
          (sessionId,revision,selectionJson,targetPath,branch,head,boundRunId,boundAt)
        SELECT s.id,COALESCE(t.revision,0),COALESCE(t.selectionJson,'{"mode":"shared-current"}'),w.path,NULL,NULL,
          (SELECT r.id FROM runs r WHERE r.sessionId=s.id ORDER BY r.createdAt,r.rowid LIMIT 1),
          (SELECT r.createdAt FROM runs r WHERE r.sessionId=s.id ORDER BY r.createdAt,r.rowid LIMIT 1)
        FROM sessions s JOIN workspaces w ON w.id=s.workspaceId LEFT JOIN session_launch_targets t ON t.sessionId=s.id
        WHERE EXISTS(SELECT 1 FROM runs r WHERE r.sessionId=s.id);
        PRAGMA user_version=11;
      `)
    } else if (current < 11 || current > LATEST_SCHEMA_VERSION) {
      throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
    }
  }).immediate()

if (schemaVersion < 12)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current === 11) {
      db.exec(SESSION_LAUNCH_TARGET_PREPARATION_OPERATION_SQL)
      db.exec('PRAGMA user_version=12;')
    } else if (current < 12 || current > LATEST_SCHEMA_VERSION) {
      throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
    }
  }).immediate()

if (schemaVersion < 13)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current === 12) {
      db.exec(WORKSPACE_ACTIVITY_SQL)
      db.exec('PRAGMA user_version=13;')
    } else if (current < 13 || current > LATEST_SCHEMA_VERSION) {
      throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
    }
  }).immediate()

if (schemaVersion < 14)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current === 13) {
      db.exec(SIDEBAR_DIRECTORY_SCHEMA_SQL)
      db.exec('PRAGMA user_version=14;')
    } else if (current < 14 || current > LATEST_SCHEMA_VERSION) {
      throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
    }
  }).immediate()

if (schemaVersion < 15)
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current === 14) {
      db.exec(SIDEBAR_CHILD_ACTIVITY_SCHEMA_SQL)
      db.exec('PRAGMA user_version=15;')
    } else if (current < 15 || current > LATEST_SCHEMA_VERSION) {
      throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
    }
  }).immediate()

for (const [version, sql] of [
  [16, NOTIFICATION_SCHEMA_SQL],
  [17, PROMPT_TEMPLATES_SQL],
  [18, SCHEDULES_SQL],
  [19, SANDBOX_PROFILES_SQL],
  [20, WORKSPACE_FOLDERS_SQL],
  [21, SESSION_BRANCH_TARGET_SQL],
  [22, SESSION_BRANCH_TARGET_BRANCH_SQL],
  [23, CHAT_DATABASE_SQL],
  [24, RUN_FILE_CHANGES_SQL],
  [25, RUNTIME_STATE_SQL + RUN_FILE_CHANGES_SQL],
] as const) {
  if (schemaVersion >= version) continue
  db.transaction(() => {
    const current = db.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version
    if (current === undefined) throw new HbarError('VERSION_MISMATCH', 'Could not read database migration state')
    if (current === version - 1) {
      if (version === 24 && !db.query<{ name: string }, []>('PRAGMA table_info(runs)').all().some(column => column.name === 'recovery'))
        db.exec('ALTER TABLE runs ADD COLUMN recovery TEXT')
      db.exec(sql)
      db.exec(`PRAGMA user_version=${version};`)
    } else if (current < version || current > LATEST_SCHEMA_VERSION) {
      throw new HbarError('VERSION_MISMATCH', 'Unsupported database migration state')
    }
  }).immediate()
}

const notifications = createNotificationStorage(db)
const promptTemplates = createPromptTemplateStorage(db)
const schedules = createScheduleStorage(db)
const sandboxProfiles = createSandboxProfileStorage(db)
const workspaceOrganization = createWorkspaceOrganizationStorage(db)
const workspaceDisplayNames = createWorkspaceDisplayNamesStorage(db)
const workspaceFolders = createWorkspaceFolderStorage(db)
const sidebarDirectory = createSidebarDirectoryStorage(db, {
  displayNames: workspaceDisplayNames.read,
  organization: workspaceOrganization.read,
})
const sessionAgentDirectory = createSessionAgentDirectory(db, sidebarDirectory.executionSummaries)
const sessionSearch = createSessionSearchStorage(
  db,
  () => new Map(workspaceDisplayNames.read().entries.map((entry) => [entry.workspaceId, entry.displayName])),
)
const chatDatabaseProjection = createChatDatabaseProjection(db, { readOnly: preflight && !shadowMemory })
const chatDatabaseResources = createChatDatabaseResourceLedger(db, sessionsRoot, artifactsRoot, cacheRoot, {
  claim: (...args) => chatDatabaseArtifacts.claim(...args),
  releaseClaim: (...args) => chatDatabaseArtifacts.releaseClaim(...args),
})
const chatDatabaseArtifacts = createChatDatabaseArtifactStorage(db, sessionsRoot, artifactsRoot, settingsRoot, chatDatabaseResources, { readOnly: preflight && !shadowMemory })
const chatDatabaseJournal = createChatDatabaseJournal(db)
const chatDatabaseAutomaticPlan = createChatDatabaseAutomaticPlan(db, chatDatabaseJournal)
const chatDatabaseTasks = createChatDatabaseTaskStorage(db)
const chatDatabaseDeletion = createChatDatabaseDeletionStorage(db, sessionsRoot, undefined, settingsRoot)
const sessionLaunchTarget = createSessionLaunchTargetStorage(db)
const sessionBranchTarget = createSessionBranchTargetStorage(db, (sessionId) => sessionLaunchTarget.read(sessionId).revision)
const sessionLaunchTargetPreparations = createSessionLaunchTargetPreparationStorage(db)

if (!preflight || shadowMemory) {
  db.exec('CREATE INDEX IF NOT EXISTS events_run_type ON events(runId,type);')
  db.exec('CREATE INDEX IF NOT EXISTS events_session_type_seq ON events(sessionId,type,seq);')
  db.exec(`CREATE INDEX IF NOT EXISTS events_guidance_run_seq ON events(sessionId,runId,seq)
  WHERE type='message.committed' AND json_extract(data,'$.queueGuidance.activeRunId') IS NOT NULL;`)
  db.exec('CREATE INDEX IF NOT EXISTS events_run_type_seq ON events(sessionId,runId,type,seq);')
  // Snapshot approval history joins the current message page by session/run and
  // tool call identity. Keep the lookup bounded without changing its status
  // filtering or page semantics.
  db.exec(
    'CREATE INDEX IF NOT EXISTS approvals_session_run_status_call_tool ON approvals(sessionId,runId,status,callId,tool);',
  )
  // Snapshot tool history keeps the newest event for each run/type/call group.
  // This partial expression index matches that grouping while excluding unrelated
  // events from the index and remains add-only for existing databases.
  db.exec(`CREATE INDEX IF NOT EXISTS events_tool_group_latest
  ON events(sessionId,runId,type,
    COALESCE(json_extract(data,'$.callId'),json_extract(data,'$.parentCallId')),seq DESC)
  WHERE type IN ('tool.execution','tool.sequence_progress');`)
  db.exec(`CREATE INDEX IF NOT EXISTS runs_sidebar_nonterminal ON runs(sessionId,status,id)
  WHERE status IN ('queued','running','waiting_approval');`)
  db.exec(GOAL_HISTORY_INDEX_SQL)
}

type Row = Record<string, unknown>
const parseJson = (value: string): unknown => JSON.parse(value) as unknown
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

type StoredSettings = import('./types.ts').StoredSettings

function settingsPath(scope: import('@hbar/contracts').SettingScope, targetId?: string): string {
  settingScopeSchema.parse(scope)
  if (scope === 'global') return join(settingsRoot, 'settings.json')
  if (!targetId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(targetId))
    throw new HbarError('INVALID_INPUT', `${scope} settings require a safe target id`)
  if (scope === 'session' && db.query('SELECT sessionId FROM chat_database_deleted_sessions WHERE sessionId=?').get(targetId))
    throw new HbarError('SESSION_DELETED', 'Settings for this deleted session cannot be read or recreated')
  return join(settingsRoot, scope === 'project' ? 'projects' : 'sessions', `${targetId}.json`)
}

function settingsRevision(values: Record<string, unknown>): string {
  return createHash('sha256').update(stableJson(values)).digest('hex')
}

function readSettings(scope: import('@hbar/contracts').SettingScope, targetId?: string): StoredSettings {
  const path = settingsPath(scope, targetId)
  if (!existsSync(path)) return { version: 1, revision: settingsRevision({}), values: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    throw new HbarError('SETTINGS_CORRUPTED', `Cannot read settings file: ${path}`, { cause: error })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new HbarError('SETTINGS_CORRUPTED', `Invalid settings file: ${path}`)
  const candidate = parsed as { version?: unknown; values?: unknown; revision?: unknown }
  if (candidate.version !== 1)
    throw new HbarError('SETTINGS_CORRUPTED', `Invalid settings file: ${path}`)
  // Version-1 installations created before layered settings existed contain
  // only `{ version: 1 }`; treat that shape as an empty global file.
  if (candidate.values === undefined) return { version: 1, revision: settingsRevision({}), values: {} }
  if (typeof candidate.values !== 'object' || candidate.values === null || Array.isArray(candidate.values))
    throw new HbarError('SETTINGS_CORRUPTED', `Invalid settings file: ${path}`)
  const values = candidate.values as Record<string, unknown>
  const revision = settingsRevision(values)
  if (candidate.revision !== undefined && candidate.revision !== revision)
    throw new HbarError('SETTINGS_CORRUPTED', `Settings revision does not match content: ${path}`)
  return { version: 1, revision, values }
}

function writeSettings(scope: import('@hbar/contracts').SettingScope, targetId: string | undefined, values: Record<string, unknown>, expectedRevision?: string): StoredSettings {
  try {
    return db.transaction(() => {
      const current = readSettings(scope, targetId)
      if (expectedRevision !== undefined && expectedRevision !== current.revision)
        throw new HbarError('SETTINGS_CONFLICT', 'Settings changed since they were read')
      const next: StoredSettings = { version: 1, revision: settingsRevision(values), values }
      const path = settingsPath(scope, targetId)
      chatDatabaseArtifacts.replaceLegacyValues(scope, targetId ?? null, next)
      mkdirSync(dirname(path), { recursive: true })
      const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
      try {
        writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
        renameSync(temporary, path)
      } finally {
        if (existsSync(temporary)) rmSync(temporary, { force: true })
      }
      return next
    }).immediate()
  } catch (reason) {
    chatDatabaseArtifacts.markLegacySettingsComplete(false)
    throw reason
  }
}

function entityPayloadHash(commandId: string, input: unknown): string {
  return createHash('sha256')
    .update(stableJson({ commandId, version: 1, input }))
    .digest('hex')
}
function entityCommandReceipt(
  actorId: string,
  idempotencyKey: string,
  commandId: string,
  payloadHash: string,
): Session | null {
  const row = db
    .query('SELECT commandId,payloadHash,resultJson FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?')
    .get(actorId, idempotencyKey) as { commandId: string; payloadHash: string; resultJson: string } | null
  if (!row) return null
  if (row.commandId !== commandId || row.payloadHash !== payloadHash)
    throw new HbarError('IDEMPOTENCY_CONFLICT', 'Entity command key was already used with different input')
  const result = z.record(z.string(), z.unknown()).parse(parseJson(row.resultJson))
  if (typeof result.deletedSessionId === 'string' || (typeof result.id === 'string' && db.query('SELECT sessionId FROM chat_database_deleted_sessions WHERE sessionId=?').get(result.id)))
    throw new HbarError('SESSION_DELETED', 'This request created a session that has been permanently deleted')
  return sessionSchema.parse(result)
}
function storeEntityCommandReceipt(
  actorId: string,
  idempotencyKey: string,
  commandId: string,
  payloadHash: string,
  result: Session,
) {
  db.query('INSERT INTO entity_command_receipts VALUES(?,?,?,?,?)').run(
    actorId,
    idempotencyKey,
    commandId,
    payloadHash,
    stableJson(result),
  )
}
function required<T>(row: T | null, kind: string): T {
  if (!row) throw new HbarError('NOT_FOUND', `${kind} not found`)
  return row
}
function sessionRow(row: Row | null): Session {
  const value = required(row, 'Session')
  return { ...value, archived: Boolean(value.archived) } as unknown as Session
}

function sessionSummary(id: string): SessionSummary {
  const session = sessionRow(db.query('SELECT * FROM sessions WHERE id=?').get(id) as Row | null)
  const active = db
    .query(
      "SELECT * FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval','queued') ORDER BY CASE status WHEN 'waiting_approval' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END, createdAt DESC LIMIT 1",
    )
    .get(id) as Row | null
  const latest = db.query('SELECT * FROM runs WHERE sessionId=? ORDER BY createdAt DESC LIMIT 1').get(id) as Row | null
  const run = active ? runRow(active) : latest ? runRow(latest) : null
  // Project only the fields needed for the activity label. Event payloads can
  // contain multi-megabyte tool results or model output; avoid materializing
  // and parsing those large payloads when computing a label.
  const activeEvents = active
    ? (db
        .query(
          "SELECT type, json_extract(data, '$.role') AS role, json_extract(data, '$.name') AS name FROM events WHERE sessionId=? AND runId=? ORDER BY seq DESC LIMIT 64",
        )
        .all(id, String(active.id)) as Array<{ type: string; role?: unknown; name?: unknown }>)
    : []
  const hasEvent = (type: string) => activeEvents.some((event) => event.type === type)
  const hasGoalEvent = activeEvents.some((event) => event.type.startsWith('goal.'))
  const latestTool = activeEvents.find((event) => event.type === 'tool.started')
  const hasAssistantOutput = activeEvents.some((event) => {
    if (event.type !== 'message.committed') return false
    return event.role === 'assistant'
  })
  const activity: SessionSummary['activity'] = active
    ? run?.status === 'waiting_approval'
      ? 'waiting_approval'
      : run?.status === 'queued'
        ? 'queued'
        : hasAssistantOutput
          ? 'output'
          : hasGoalEvent
            ? 'goal'
            : hasEvent('plan.updated')
              ? 'plan'
              : latestTool
                ? typeof latestTool.name === 'string' && /read|file/i.test(latestTool.name)
                  ? 'reading'
                  : 'tool'
                : 'thinking'
    : run?.status === 'failed' || run?.status === 'interrupted'
      ? 'failed'
      : run?.status === 'cancelled'
        ? 'cancelled'
        : run?.status === 'completed'
          ? 'completed'
          : 'idle'
  const response = db
    .query("SELECT createdAt FROM messages WHERE sessionId=? AND role='assistant' ORDER BY createdAt DESC LIMIT 1")
    .get(id) as { createdAt: number } | null
  return {
    sessionId: session.id,
    workspaceId: session.workspaceId,
    activity,
    activeRunId: active ? String(active.id) : null,
    lastResponseAt: response?.createdAt ?? null,
    updatedAt: session.updatedAt,
    seq: session.seq,
  }
}
function runRow(row: Row | null): Run {
  const value = required(row, 'Run')
  const { failure, recovery, ...fields } = value
  return runSchema.parse({
    ...fields,
    input: parseJson(z.string().parse(value.input)),
    fileChanges: readRunFileChangesSummary(db, z.string().parse(value.id)),
    ...(typeof failure === 'string' ? { failure: runFailureSchema.parse(parseJson(failure)) } : {}),
    ...(typeof recovery === 'string' ? { recovery: parseJson(recovery) } : {}),
  })
}
function queuedRunContentRevision(runId: string): number {
  const seq = db
    .query<{ seq: number | null }, [string]>(
      "SELECT MAX(seq) AS seq FROM events WHERE runId=? AND type IN ('run.queued','run.recoveryQueued','run.inputEdited')",
    )
    .get(runId)?.seq
  if (seq === null || seq === undefined)
    throw new HbarError('RUN_JOURNAL_MISSING', 'Queued Run has no content revision event')
  return seq
}
function queueGuidanceFromEvent(event: SessionEvent) {
  const data = z
    .object({
      id: idSchema,
      role: z.literal('user'),
      content: z.array(contentBlockSchema),
      queueGuidance: queuedRunGuidanceSchema,
    })
    .parse(event.data)
  const guidance = data.queueGuidance
  const { receipt, guidedRun } = guidance
  if (
    event.type !== 'message.committed' ||
    event.runId !== guidance.activeRunId ||
    receipt.activeRunId !== event.runId ||
    receipt.sessionId !== event.sessionId ||
    receipt.operationId !== guidedRun.id ||
    receipt.messageId !== data.id ||
    receipt.eventId !== event.eventId ||
    receipt.revision !== event.seq ||
    receipt.sessionSeq !== event.seq ||
    receipt.guidedAt !== event.time ||
    receipt.queueRevision !== guidance.expectedRevision ||
    guidedRun.sessionId !== event.sessionId ||
    guidedRun.status !== 'guided' ||
    guidedRun.startedAt !== null ||
    guidedRun.endedAt !== event.time ||
    guidedRun.error !== null ||
    guidedRun.failure !== undefined ||
    guidedRun.id === event.runId ||
    (guidedRun.input.source ?? 'user') !== 'user'
  )
    throw new HbarError('SESSION_LOG_CORRUPTED', 'Queue guidance identity or terminal state is invalid')
  const expectedContent: ContentBlock[] = [
    ...(guidedRun.input.text ? [{ type: 'text' as const, text: guidedRun.input.text }] : []),
    ...guidedRun.input.images.map((artifact) => ({ type: 'image' as const, artifact })),
    ...(guidedRun.input.files ?? []).map((artifact) => ({ type: 'file' as const, artifact })),
  ]
  if (
    stableJson(expectedContent) !== stableJson(data.content) ||
    guidance.payloadHash !==
      entityPayloadHash('queuedRun.guide', {
        sessionId: event.sessionId,
        operationId: guidedRun.id,
        activeRunId: event.runId,
        expectedRevision: guidance.expectedRevision,
      })
  )
    throw new HbarError('SESSION_LOG_CORRUPTED', 'Queue guidance content or receipt input hash is invalid')
  return guidance
}
const WORKSPACE_ACTIVITY_COLUMNS_SQL = `
  w.id,w.path,w.name,w.createdAt,
  (SELECT s.createdAt FROM sessions s
    WHERE s.workspaceId=w.id AND s.archived=0
    ORDER BY s.createdAt DESC,s.id ASC LIMIT 1) AS latestSessionCreatedAt,
  (SELECT s.updatedAt FROM sessions s
    WHERE s.workspaceId=w.id AND s.archived=0
    ORDER BY s.updatedAt DESC,s.id ASC LIMIT 1) AS latestSessionUpdatedAt
`

function parseWorkspaceActivityItem(value: unknown) {
  const row = z.record(z.string(), z.unknown()).parse(value)
  return workspaceActivityItemSchema.parse({
    workspace: {
      id: row.id,
      path: row.path,
      name: row.name,
      createdAt: row.createdAt,
    },
    latestSessionCreatedAt: row.latestSessionCreatedAt,
    latestSessionUpdatedAt: row.latestSessionUpdatedAt,
  })
}

function workspaceActivityPage(input: WorkspaceActivityListInput): WorkspaceActivityPage {
  const parsedInput = workspaceActivityListInputSchema.safeParse(input)
  if (!parsedInput.success) throw new HbarError('INVALID_INPUT', 'Invalid workspace activity query')
  const { sortBy, cursor, limit, includeWorkspaceIds = [] } = parsedInput.data
  const selectedTimestamp = sortBy === 'createdAt' ? 'latestSessionCreatedAt' : 'latestSessionUpdatedAt'
  return db.transaction(() => {
    const revisionRow = db
      .query<{ revision: number }, []>('SELECT revision FROM directory_activity_revision WHERE id=1')
      .get()
    if (!revisionRow || !Number.isSafeInteger(revisionRow.revision) || revisionRow.revision < 0)
      throw new HbarError('INVALID_STATE', 'Workspace activity revision is unavailable')
    const { revision } = revisionRow
    if (cursor && cursor.revision !== revision)
      throw new HbarError('STALE_CURSOR', 'Workspace activity changed; restart the listing')

    const pageRows = z.array(z.record(z.string(), z.unknown())).parse(
      db
        .query(
          `WITH activity AS MATERIALIZED (
               SELECT ${WORKSPACE_ACTIVITY_COLUMNS_SQL}
               FROM workspaces w
             )
             SELECT id,path,name,createdAt,latestSessionCreatedAt,latestSessionUpdatedAt,
                    ${selectedTimestamp} AS sortTimestamp
             FROM activity
             WHERE ? IS NULL
                OR ((? IS NULL AND sortTimestamp IS NULL AND id > ?)
                    OR (? IS NOT NULL AND (sortTimestamp IS NULL OR sortTimestamp < ?
                        OR (sortTimestamp = ? AND id > ?))))
             ORDER BY (sortTimestamp IS NULL) ASC,sortTimestamp DESC,id ASC
             LIMIT ?`,
        )
        .all(
          cursor?.workspaceId ?? null,
          cursor?.timestamp ?? null,
          cursor?.workspaceId ?? null,
          cursor?.timestamp ?? null,
          cursor?.timestamp ?? null,
          cursor?.timestamp ?? null,
          cursor?.workspaceId ?? null,
          limit + 1,
        ),
    )
    const pageItems = pageRows.slice(0, limit).map(parseWorkspaceActivityItem)
    const pageIds = new Set(pageItems.map((item) => item.workspace.id))
    const requestedIds = includeWorkspaceIds.filter((id) => !pageIds.has(id))
    const includedItems =
      requestedIds.length === 0
        ? []
        : z
            .array(z.record(z.string(), z.unknown()))
            .parse(
              db
                .query(
                  `SELECT ${WORKSPACE_ACTIVITY_COLUMNS_SQL}
                   FROM workspaces w
                   WHERE w.id IN (${requestedIds.map(() => '?').join(',')})
                   ORDER BY w.id`,
                )
                .all(...requestedIds),
            )
            .map(parseWorkspaceActivityItem)
    const lastItem = pageItems.at(-1)
    const nextCursor =
      pageRows.length > limit && lastItem
        ? workspaceActivityCursorSchema.parse({
            sortBy,
            revision,
            timestamp: sortBy === 'createdAt' ? lastItem.latestSessionCreatedAt : lastItem.latestSessionUpdatedAt,
            workspaceId: lastItem.workspace.id,
          })
        : null
    return workspaceActivityPageSchema.parse({ revision, items: pageItems, includedItems, nextCursor })
  })()
}

function sessionActivityPage(input: SessionActivityListInput, rootsOnly = false): SessionActivityPage {
  const parsedInput = sessionActivityListInputSchema.safeParse(input)
  if (!parsedInput.success) throw new HbarError('INVALID_INPUT', 'Invalid session activity query')
  const { workspaceId, sortBy, cursor, limit } = parsedInput.data
  const selectedTimestamp = sortBy === 'createdAt' ? 'createdAt' : 'updatedAt'
  return db.transaction(() => {
    const revisionRow = db
      .query<{ revision: number }, []>('SELECT revision FROM directory_activity_revision WHERE id=1')
      .get()
    if (!revisionRow || !Number.isSafeInteger(revisionRow.revision) || revisionRow.revision < 0)
      throw new HbarError('INVALID_STATE', 'Session activity revision is unavailable')
    const { revision } = revisionRow
    if (cursor && cursor.revision !== revision)
      throw new HbarError('STALE_CURSOR', 'Session activity changed; restart the listing')
    if (!db.query('SELECT id FROM workspaces WHERE id=?').get(workspaceId))
      throw new HbarError('NOT_FOUND', 'Workspace not found')

    const rows = z.array(z.record(z.string(), z.unknown())).parse(
      db
        .query(
          `SELECT * FROM sessions
             WHERE workspaceId=? AND archived=0
               ${rootsOnly ? `AND NOT (${agentMembershipSql('sessions')})` : ''}
               AND (? IS NULL OR ${selectedTimestamp}<?
                 OR (${selectedTimestamp}=? AND id>?))
             ORDER BY ${selectedTimestamp} DESC,id ASC
             LIMIT ?`,
        )
        .all(
          workspaceId,
          cursor?.timestamp ?? null,
          cursor?.timestamp ?? null,
          cursor?.timestamp ?? null,
          cursor?.sessionId ?? null,
          limit + 1,
        ),
    )
    const items = rows.slice(0, limit).map((row) => sessionSchema.parse({ ...row, archived: Boolean(row.archived) }))
    const lastItem = items.at(-1)
    const nextCursor =
      rows.length > limit && lastItem
        ? sessionActivityCursorSchema.parse({
            workspaceId,
            sortBy,
            revision,
            timestamp: lastItem[selectedTimestamp],
            sessionId: lastItem.id,
          })
        : null
    return sessionActivityPageSchema.parse({ revision, items, nextCursor })
  })()
}

function messageRow(row: Row): Message {
  return {
    ...row,
    content: z.array(contentBlockSchema).parse(parseJson(row.content as string)),
    providerData: row.providerData ? parseJson(row.providerData as string) : undefined,
  } as unknown as Message
}

/** Shared target/run checks for the read-only affordance and the atomic write. */
function messageForkTarget(sessionId: string, messageId: string): Message {
  const targetRow = db
    .query('SELECT * FROM messages WHERE id=? AND sessionId=?')
    .get(messageId, sessionId) as Row | null
  if (!targetRow) throw new HbarError('NOT_FOUND', 'Message not found in source session')
  const target = messageRow(targetRow)
  if (target.role !== 'user' && target.role !== 'assistant')
    throw new HbarError('INVALID_TARGET', 'Only completed user or final assistant messages can be forked')
  const runRowValue = db
    .query('SELECT * FROM runs WHERE id=? AND sessionId=?')
    .get(target.runId, sessionId) as Row | null
  if (!runRowValue || runRow(runRowValue).status !== 'completed')
    throw new HbarError('INVALID_TARGET', 'The target run must have completed successfully')
  if (
    db
      .query("SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval','queued') LIMIT 1")
      .get(sessionId)
  )
    throw new HbarError('BUSY', 'Fork after the source run has settled')

  const lastRow = db
    .query('SELECT * FROM messages WHERE sessionId=? AND runId=? ORDER BY seq DESC LIMIT 1')
    .get(sessionId, target.runId) as Row | null
  const lastMessage = lastRow ? messageRow(lastRow) : null
  const settled = db
    .query("SELECT seq FROM events WHERE sessionId=? AND runId=? AND type='run.settled' ORDER BY seq LIMIT 1")
    .get(sessionId, target.runId) as { seq: number } | null
  if (!settled || !lastMessage || lastMessage.seq >= settled.seq)
    throw new HbarError('INVALID_TARGET', 'The message must precede its run settlement')
  if (
    lastMessage.role !== 'assistant' ||
    !lastMessage.content.some((block) => block.type === 'text' && block.text.trim())
  )
    throw new HbarError('INVALID_TARGET', 'The completed turn has no final assistant reply')
  if (target.role === 'user') {
    if (!target.content.some((block) => block.type === 'text' && block.text.trim()))
      throw new HbarError('INVALID_TARGET', 'The user prompt has no visible text')
    if (
      db
        .query('SELECT id FROM messages WHERE sessionId=? AND runId=? AND seq<? LIMIT 1')
        .get(sessionId, target.runId, target.seq)
    )
      throw new HbarError('INVALID_TARGET', 'The user message must start its run')
    if (lastMessage.seq <= target.seq) throw new HbarError('INVALID_TARGET', 'The user turn has no committed response')
  } else if (lastMessage.id !== target.id) {
    throw new HbarError('INVALID_TARGET', 'The assistant reply is not the end of its run')
  }

  return target
}

function toolPrefixChecker() {
  const toolCalls = new Set<string>()
  const toolResults = new Set<string>()
  let unmatched = 0
  let duplicated = false
  return {
    add(message: Pick<Message, 'runId' | 'content'>) {
      for (const block of message.content) {
        if (block.type !== 'tool_call' && block.type !== 'tool_result') continue
        const key = JSON.stringify([message.runId, block.callId, block.name])
        const bucket = block.type === 'tool_call' ? toolCalls : toolResults
        const other = block.type === 'tool_call' ? toolResults : toolCalls
        if (bucket.has(key)) duplicated = true
        else {
          bucket.add(key)
          unmatched += other.has(key) ? -1 : 1
        }
      }
    },
    valid() {
      return !duplicated && unmatched === 0
    },
  }
}

function messageForkPrefix(sessionId: string, messageId: string): { target: Message; prefix: Message[] } {
  const target = messageForkTarget(sessionId, messageId)
  const prefix = (
    db.query('SELECT * FROM messages WHERE sessionId=? AND seq<=? ORDER BY seq').all(sessionId, target.seq) as Row[]
  ).map(messageRow)
  const checker = toolPrefixChecker()
  for (const message of prefix) checker.add(message)
  if (!checker.valid())
    throw new HbarError('INVALID_BOUNDARY', 'The message prefix contains unfinished or duplicate tool facts')
  return { target, prefix }
}
function eventRow(row: Row): SessionEvent {
  return sessionEventSchema.parse({ ...row, data: parseJson(row.data as string) })
}
function usageReadRow(row: Row): UsageReadRow {
  const event = eventRow({
    eventId: row.eventId,
    sessionId: row.sessionId,
    seq: row.seq,
    runId: row.runId,
    stepId: row.stepId,
    type: row.type,
    data: row.data,
    time: row.time,
    version: row.version,
  })
  const run = row.r_id
    ? runRow({
        id: row.r_id,
        sessionId: row.r_sessionId,
        requestId: row.r_requestId,
        input: row.r_input,
        modelId: row.r_modelId,
        status: row.r_status,
        createdAt: row.r_createdAt,
        startedAt: row.r_startedAt,
        endedAt: row.r_endedAt,
        error: row.r_error,
      })
    : null
  return {
    event,
    workspaceId: String(row.workspaceId),
    parentSessionId: row.parentSessionId ? String(row.parentSessionId) : null,
    run,
  }
}
function approvalRow(row: Row | null): Approval {
  const { feedback, decidedBy, ...value } = required(row, 'Approval')
  return {
    ...value,
    args: z.record(z.string(), z.unknown()).parse(parseJson(value.args as string)),
    ...(typeof feedback === 'string' ? { feedback } : {}),
    ...(typeof decidedBy === 'string' ? { decidedBy } : {}),
  } as unknown as Approval
}
function settingsLayerRow(row: Row): StoredSettingsLayer {
  return {
    id: row.id as string,
    kind: row.kind as string,
    targetId: (row.targetId as string | null) ?? null,
    schemaVersion: row.schemaVersion as number,
    revision: row.revision as number,
    values: z.record(z.string(), z.unknown()).parse(parseJson(row.valuesJson as string)),
  }
}
function indexEvent(projectId: string, event: SessionEvent, location: ReturnType<SessionLogWriter['append']>) {
  db.query(
    `
    INSERT INTO session_log_files VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(path) DO UPDATE SET
      firstSeq=MIN(firstSeq,excluded.firstSeq),lastSeq=MAX(lastSeq,excluded.lastSeq),
      size=MAX(size,excluded.size),updatedAt=excluded.updatedAt
  `,
  ).run(
    location.relativePath,
    projectId,
    event.sessionId,
    event.seq,
    event.seq,
    location.offset + location.length,
    event.time,
  )
  db.query('INSERT INTO session_event_index VALUES(?,?,?,?,?,?,?)').run(
    event.eventId,
    event.sessionId,
    event.seq,
    location.relativePath,
    location.offset,
    location.length,
    location.hash,
  )
}

// JSONL is committed first. SQLite is a query projection and can be rebuilt from it.
let eventLogWriteVersion = 0
function appendEvent(
  sessionId: string,
  type: string,
  data: unknown,
  runId?: string,
  stepId?: string,
  metadata?: { eventId?: string; time?: number },
): SessionEvent {
  const row = required(
    db
      .query(
        'SELECT sessions.*,workspaces.id AS projectId FROM sessions JOIN workspaces ON workspaces.id=sessions.workspaceId WHERE sessions.id=?',
      )
      .get(sessionId) as Row | null,
    'Session',
  )
  const s = sessionRow(row)
  const event: SessionEvent = {
    eventId: metadata?.eventId ?? crypto.randomUUID(),
    sessionId,
    seq: s.seq + 1,
    runId: runId ?? null,
    stepId: stepId ?? null,
    type,
    data,
    time: metadata?.time ?? Date.now(),
    version: 1,
  }
  chatDatabaseArtifacts.registerEvent(event.eventId, data, sessionId, row.projectId as string)
  eventLogWriteVersion++
  const location = logWriter.append(row.projectId as string, event)
  indexEvent(row.projectId as string, event, location)
  db.query('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)').run(
    event.eventId,
    sessionId,
    event.seq,
    event.runId,
    event.stepId,
    type,
    JSON.stringify(data),
    event.time,
    1,
  )
  chatDatabaseArtifacts.releaseCommittedToolUploads(data, sessionId)
  db.query('UPDATE sessions SET seq=?,updatedAt=? WHERE id=?').run(event.seq, event.time, sessionId)
  projectRunFileChanges(db, event)
  const notification = notificationFromSessionEvent(event, s.workspaceId)
  if (notification) notifications.insert(notification)
  return event
}
const runtimeState = createRuntimeState(db, {
  run: id => methods.run(id),
  append: appendEvent,
  cancelRequested: id => methods.cancelRequested(id),
  requestCancel: id => methods.requestCancel(id),
  reconcile: run => { methods.recover({ runIds: [run.id], preserveQueued: true, preserveApprovals: true, reconcileInterrupted: true }) },
  archived: id => methods.session(id).archived,
  restoreBinding: binding => sessionLaunchTarget.restoreBinding(binding),
  start(run, startedAt) {
    db.query("UPDATE runs SET status='running',startedAt=? WHERE id=?").run(startedAt, run.id)
    return methods.run(run.id)
  },
  queue(original, recovery, chain, manual) {
    const run: Run = {
      id: crypto.randomUUID(), sessionId: original.sessionId, requestId: recovery.recoveryId,
      input: original.input, modelId: original.modelId, status: 'queued', createdAt: Date.now(),
      startedAt: null, endedAt: null, error: null, recovery,
    }
    // The Session's first acceptance locks its checkout; recovery must retain that binding.
    const launchTarget = sessionLaunchTarget.bindToRun(run.sessionId, run.id, methods.workspace(methods.session(run.sessionId).workspaceId).path)
    db.query(`INSERT INTO runs(id,sessionId,requestId,input,modelId,status,createdAt,startedAt,endedAt,error,recovery)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(run.id, run.sessionId, run.requestId, JSON.stringify(run.input), run.modelId,
      run.status, run.createdAt, null, null, null, JSON.stringify(recovery))
    appendEvent(run.sessionId, 'run.recoveryQueued', {
      recoveryId: recovery.recoveryId, predecessorRunId: recovery.predecessorRunId,
      chain: { ...chain, currentRunId: run.id }, run,
      ...(manual ? { manual } : {}),
      launchTarget,
    }, run.id)
    return run
  },
})
const methods: StorageMethods = {
  runtimeExecutionClaim: runtimeState.claim,
  runtimeExecutionRelease: runtimeState.release,
  runtimeExecutionRevoke: runtimeState.revoke,
  runtimeExecutionRead: runtimeState.ownership,
  runtimeRecoveryPlan: runtimeState.planRecovery,
  runtimeRecoveryQueue: runtimeState.queueRecovery,
  runtimeRecoveryRead: runtimeState.readRecovery,
  runtimeRecoveryCancel: runtimeState.cancelRecovery,
  runtimeRecoveryChain: runtimeState.readChain,
  runtimeRecoveryHold: runtimeState.holdRecovery,
  runtimeRecoveryReconcile: runtimeState.reconcileRecovery,
  runtimeRecoveryAppend: runtimeState.appendRecovery,
  recoveryInputMessage(runId) {
    let run = methods.run(runId)
    const sessionId = run.sessionId
    const visited = new Set<string>()
    for (let index = 0; index < 33; index++) {
      if (visited.has(run.id) || run.sessionId !== sessionId)
        throw new HbarError('SESSION_LOG_CORRUPTED', 'Recovery input lineage is cyclic or belongs to another Session')
      visited.add(run.id)
      const row = db.query<Row, [string]>("SELECT * FROM messages WHERE runId=? AND role='user' ORDER BY seq LIMIT 1").get(run.id)
      if (row) return messageRow(row)
      if (!run.recovery) return null
      run = methods.run(run.recovery.predecessorRunId)
    }
    throw new HbarError('RECOVERY_TOTAL_LIMIT', 'Recovery input lineage exceeds its bounded history')
  },
  chatDatabaseMaintenanceBegin(operationId) {
    if (databaseMaintenanceOwner) throw new HbarError('BUSY', 'Database maintenance is already active')
    // VACUUM can renumber messages. Discovery restarts without deleting stable-ID FTS documents or queues.
    db.query('UPDATE session_search_progress SET lastMessageRowid=0 WHERE id=1').run()
    db.clearQueryCache()
    databaseMaintenanceOwner = operationId
  },
  chatDatabaseMaintenanceEnd(operationId) {
    if (databaseMaintenanceOwner !== operationId) throw new HbarError('COMMAND_CONFLICT', 'Database maintenance owner changed')
    databaseMaintenanceOwner = null
  },
  chatDatabaseDraftSync: chatDatabaseArtifacts.sync,
  chatDatabaseDraftList: chatDatabaseArtifacts.list,
  chatDatabaseInventoryBegin: chatDatabaseArtifacts.begin,
  chatDatabaseInventoryFinish: chatDatabaseArtifacts.finish,
  chatDatabaseInventoryRead: chatDatabaseArtifacts.inventory,
  chatDatabaseDraftBackfill: chatDatabaseArtifacts.backfill,
  chatDatabaseArtifactReserve: chatDatabaseArtifacts.reserve,
  chatDatabaseArtifactRenewUpload: chatDatabaseArtifacts.renewUpload,
  chatDatabaseArtifactEndUpload: chatDatabaseArtifacts.endUpload,
  chatDatabaseArtifactFinishUpload: chatDatabaseArtifacts.finishUpload,
  chatDatabaseArtifactReleaseUpload: chatDatabaseArtifacts.releaseUpload,
  chatDatabaseArtifactSeedLegacy: chatDatabaseArtifacts.seedLegacy,
  chatDatabaseLegacySettingsRefs: chatDatabaseArtifacts.legacySettings,
  chatDatabaseLegacySettingsComplete: chatDatabaseArtifacts.markLegacySettingsComplete,
  chatDatabaseReferenceHealth: chatDatabaseArtifacts.referenceHealth,
  chatDatabaseArtifactClaim: chatDatabaseArtifacts.claim,
  chatDatabaseArtifactEligibility: chatDatabaseArtifacts.eligibility,
  chatDatabaseArtifactHasCause: chatDatabaseArtifacts.hasCause,
  chatDatabaseResourceRemove: chatDatabaseResources.remove,
  chatDatabaseResourceReceipt: chatDatabaseResources.receipt,
  chatDatabaseArtifactReleaseClaim: chatDatabaseArtifacts.releaseClaim,
  chatDatabaseArtifactFinishReclaim: chatDatabaseArtifacts.finishReclaim,
  chatDatabaseArtifactReclaimReceipt: chatDatabaseArtifacts.reclaimReceipt,
  chatDatabaseOperationAccept: chatDatabaseJournal.accept,
  chatDatabaseOperationRead: chatDatabaseJournal.read,
  chatDatabaseOperationUpdate: chatDatabaseJournal.update,
  chatDatabaseOperationCancel: chatDatabaseJournal.cancel,
  chatDatabaseOperationReconcile: chatDatabaseJournal.reconcile,
  chatDatabaseOperationReceipt: chatDatabaseJournal.receipt,
  chatDatabasePreviewAppend: chatDatabaseJournal.appendItems,
  chatDatabasePreviewPage: chatDatabaseJournal.previewPage,
  chatDatabaseCandidates: chatDatabaseJournal.candidates,
  chatDatabaseRetainedChild: chatDatabaseJournal.retainedChild,
  chatDatabaseHistory: chatDatabaseJournal.history,
  chatDatabasePending: chatDatabaseJournal.pending,
  chatDatabasePreviewReset: chatDatabaseJournal.resetPreview,
  chatDatabaseAutomaticPlanStep: chatDatabaseAutomaticPlan.step,
  chatDatabaseAutomaticPlanRead: chatDatabaseAutomaticPlan.read,
  chatDatabaseAutomaticPlanPage: chatDatabaseAutomaticPlan.page,
  chatDatabaseTaskScopes: chatDatabaseTasks.scopes,
  chatDatabaseTaskRead: chatDatabaseTasks.get,
  chatDatabaseTaskSave: chatDatabaseTasks.save,
  chatDatabaseDeleteSession: chatDatabaseDeletion.remove,
  chatDatabaseUsageBackfill: chatDatabaseProjection.backfill,
  chatDatabaseUsage: chatDatabaseProjection.usage,
  chatDatabaseArtifactPage: chatDatabaseProjection.artifactPage,
  chatDatabaseLogPage: chatDatabaseProjection.logPage,
  ready: () => ({ version: LATEST_SCHEMA_VERSION }),
  notificationPage: (input) => notifications.page(input),
  notificationBySourceEvent: (sourceEventId) => notifications.bySourceEvent(sourceEventId),
  insertNotification: (record) => notifications.insert(record),
  markNotificationRead: (id, readAt, identity) => notifications.markRead(id, readAt, identity),
  markAllNotificationsRead: (readAt, identity) => notifications.markAllRead(readAt, identity),
  notificationPreferences: () => notifications.preferences(),
  setNotificationPreferences: (input, identity) => notifications.setPreferences(input, identity),
  notificationReceipt: (commandId, input, identity) => notifications.receipt(commandId, input, identity),
  promptTemplatePage: (input) => promptTemplates.list(input),
  promptTemplate: (id) => promptTemplates.get(id),
  savePromptTemplate: (input, identity) => promptTemplates.save(input, identity),
  deletePromptTemplate: (input, identity) => promptTemplates.delete(input, identity),
  promptTemplateReceipt: (commandId, input, identity) => promptTemplates.receipt(commandId, input, identity),
  sandboxProfiles: () => sandboxProfiles.list(),
  sandboxProfile: (id) => sandboxProfiles.get(id),
  saveSandboxProfile: (input, identity) => sandboxProfiles.save(input, identity),
  deleteSandboxProfile: (input, identity) => sandboxProfiles.delete(input, identity),
  sandboxProfileReceipt: (commandId, input, identity) => sandboxProfiles.receipt(commandId, input, identity),
  putSandboxSnapshot: (record) => sandboxProfiles.putSnapshot(record),
  sandboxSnapshot: (digest) => sandboxProfiles.snapshot(digest),
  schedulePage: (workspaceId, after, limit) => schedules.list(workspaceId, after, limit),
  schedule: (id) => schedules.get(id),
  createSchedule: (input, identity) => schedules.create(input, identity),
  updateSchedule: (input, identity) => schedules.update(input, identity),
  deleteSchedule: (id, expectedRevision, identity) => schedules.delete(id, expectedRevision, identity),
  scheduleReceipt: (commandId, input, identity) => schedules.receipt(commandId, input, identity),
  scheduleOccurrences: (id, after, limit) => schedules.occurrences(id, after, limit),
  claimScheduleOccurrence: (id, dueAt, now) => schedules.claim(id, dueAt, now),
  transitionScheduleOccurrence: (id, status, runId, error, sessionId) =>
    db.transaction(() => {
      const occurrence = schedules.transition(id, status, runId, error, sessionId)
      const notification = notificationFromScheduleOccurrence(occurrence)
      if (notification) notifications.insert(notification)
      return occurrence
    })(),
  enabledSchedules: (after, limit) => schedules.enabledSchedules(after, limit),
  activeScheduleOccurrences: (limit, after) => schedules.activeScheduleOccurrences(limit, after),
  scheduleRuntime: (id) => schedules.scheduleRuntime(id),
  recordScheduleCandidate: (id, dueAt, now) => schedules.recordCandidate(id, dueAt, now),
  runBoard: (input) => readRunBoard(db, input),
  searchIndexStatus: sessionSearch.indexStatus,
  searchIndexStep: sessionSearch.backfillStep,
  recentSessions: sessionSearch.recent,
  searchSessions: sessionSearch.search,
  workspaceDisplayNames: workspaceDisplayNames.read,
  workspaceFolders: workspaceFolders.read,
  workspaceFolderReceipt: workspaceFolders.receipt,
  applyWorkspaceFolders: workspaceFolders.apply,
  applyWorkspaceDisplayNames: workspaceDisplayNames.apply,
  workspaceDisplayNamesReceipt: workspaceDisplayNames.receipt,
  workspaceOrganization: workspaceOrganization.read,
  applyWorkspaceOrganization: workspaceOrganization.apply,
  workspaceOrganizationReceipt: workspaceOrganization.receipt,
  createWorkspace(path, name) {
    const existing = db.query('SELECT * FROM workspaces WHERE path=?').get(path)
    if (existing) return existing as Workspace
    const workspace: Workspace = { id: crypto.randomUUID(), path, name, createdAt: Date.now() }
    db.query('INSERT INTO workspaces VALUES(?,?,?,?)').run(workspace.id, path, name, workspace.createdAt)
    db.query('INSERT INTO projects VALUES(?,?,?,?)').run(workspace.id, path, name, workspace.createdAt)
    return workspace
  },
  workspaces: () => db.query('SELECT * FROM workspaces ORDER BY createdAt').all() as Workspace[],
  workspacePage(input) {
    const { after, limit } = workspaceListInputSchema.parse(input)
    const rows = z
      .array(workspaceSchema)
      .parse(
        db
          .query('SELECT * FROM workspaces WHERE (? IS NULL OR id > ?) ORDER BY id LIMIT ?')
          .all(after ?? null, after ?? null, limit + 1),
      )
    const items = rows.slice(0, limit)
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null }
  },
  workspaceSidebarPage: (input) => sidebarDirectory.workspaceSidebarPage(input),
  globalSessionActivityPage: (input) => sidebarDirectory.globalSessionActivityPage(input),
  sessionExecutionSnapshot: (input) => sidebarDirectory.sessionExecutionSnapshot(input),
  sessionAgentChildren: (input) => sessionAgentDirectory.children(input),
  sessionAgentAncestors: (sessionId) => sessionAgentDirectory.ancestors(sessionId),
  workspaceActivityPage: (input) => workspaceActivityPage(input),
  sessionActivityPage: (input) => sessionActivityPage(input),
  sidebarSessionActivityPage(input) {
    return db.transaction(() => {
      const page = sessionActivityPage(input, true)
      const summaries = sidebarDirectory.executionSummaries(page.items.map((item) => item.id))
      return {
        revision: page.revision,
        nextCursor: page.nextCursor,
        items: page.items.map((session) => {
          const execution = summaries.get(session.id)
          if (!execution) throw new HbarError('INVALID_STATE', 'Session execution summary is unavailable')
          const counts = z
            .object({ count: z.number().int().nonnegative().safe() })
            .parse(db.query(`SELECT ${agentChildCountSql('s')} AS count FROM sessions s WHERE s.id=?`).get(session.id))
          return { session, execution, agentChildCount: counts.count }
        }),
      }
    })()
  },
  sessionPage(input) {
    const { workspaceId, after, title, includeArchived, limit } = sessionListInputSchema.parse(input)
    methods.workspace(workspaceId)
    const rows = z
      .array(z.record(z.string(), z.unknown()))
      .parse(
        db
          .query(
            `SELECT * FROM sessions
      WHERE workspaceId = ? AND (? IS NULL OR id > ?) AND (? IS NULL OR title = ?)
      AND (? = 1 OR archived = 0) ORDER BY id LIMIT ?`,
          )
          .all(
            workspaceId,
            after ?? null,
            after ?? null,
            title ?? null,
            title ?? null,
            Number(includeArchived),
            limit + 1,
          ),
      )
      .map((row) => sessionSchema.parse({ ...row, archived: Boolean(row.archived) }))
    const items = rows.slice(0, limit)
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null }
  },
  findWorkspace(id) {
    const row = db.query('SELECT * FROM workspaces WHERE id=?').get(id)
    return row === null ? null : workspaceSchema.parse(row)
  },
  findSession(id) {
    const row = db.query('SELECT * FROM sessions WHERE id=?').get(id)
    if (row === null) return null
    const data = z.record(z.string(), z.unknown()).parse(row)
    return sessionSchema.parse({ ...data, archived: Boolean(data.archived) })
  },
  workspace: (id) => required(db.query('SELECT * FROM workspaces WHERE id=?').get(id), 'Workspace') as Workspace,
  createSession(workspaceId, title = 'New session', parentId) {
    return db.transaction(() => {
      const workspace = methods.workspace(workspaceId)
      if (parentId) methods.session(parentId)
      const session: Session = {
        id: crypto.randomUUID(),
        workspaceId,
        title,
        archived: false,
        parentId: parentId ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        seq: 0,
      }
      db.query('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)').run(
        session.id,
        workspaceId,
        title,
        0,
        session.parentId,
        session.createdAt,
        session.updatedAt,
        0,
      )
      appendEvent(session.id, 'session.created', { session, workspace })
      return methods.session(session.id)
    })()
  },
  createSessionCommand(input) {
    return db.transaction(() => {
      const commandId = 'session.create'
      const payloadHash = entityPayloadHash(commandId, { workspaceId: input.workspaceId, title: input.title ?? null })
      const prior = entityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash)
      if (prior) return prior
      const session = methods.createSession(input.workspaceId, input.title)
      storeEntityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash, session)
      return session
    })()
  },
  sessions: () =>
    (db.query('SELECT * FROM sessions ORDER BY updatedAt DESC LIMIT 2000').all() as Row[]).map(sessionRow),
  childSessions(parentId, after, limit = 200) {
    methods.session(parentId)
    return (
      db
        .query('SELECT * FROM sessions WHERE parentId=? AND (? IS NULL OR id>?) ORDER BY id LIMIT ?')
        .all(parentId, after ?? null, after ?? null, Math.min(Math.max(limit, 1), 200)) as Row[]
    ).map(sessionRow)
  },
  session: (id) => sessionRow(db.query('SELECT * FROM sessions WHERE id=?').get(id) as Row | null),
  sessionSummary: (id) => sessionSummary(id),
  sessionSummaries: (ids) => ids.map((id) => sessionSummary(id)),
  sessionLaunchTarget: sessionLaunchTarget.read,
  sessionLaunchTargetRuntime: sessionLaunchTarget.runtime,
  sessionBranchTargetOperation: sessionBranchTarget.read,
  pendingSessionBranchTargetOperation: sessionBranchTarget.pending,
  beginSessionBranchTarget: sessionBranchTarget.begin,
  finishSessionBranchTarget: sessionBranchTarget.finish,
  observeSessionBranchTargetRun: sessionBranchTarget.observeRunBranch,
  sessionLaunchTargetBindingForPath: sessionLaunchTarget.bindingForPath,
  activeSharedCheckoutPaths: sessionLaunchTarget.activeSharedCheckoutPaths,
  setSessionLaunchTarget: sessionLaunchTarget.set,
  sessionLaunchTargetReceipt: sessionLaunchTarget.receipt,
  startSessionLaunchTargetPreparation: sessionLaunchTargetPreparations.start,
  sessionLaunchTargetPreparation: sessionLaunchTargetPreparations.read,
  sessionLaunchTargetPreparationRecord: sessionLaunchTargetPreparations.record,
  pendingSessionLaunchTargetPreparations: sessionLaunchTargetPreparations.listPending,
  requestSessionLaunchTargetPreparationCancellation: sessionLaunchTargetPreparations.requestCancellation,
  transitionSessionLaunchTargetPreparation: sessionLaunchTargetPreparations.transition,
  beginSessionLaunchTargetPreparation: sessionLaunchTarget.beginPreparation,
  updateSessionLaunchTargetPreparation: sessionLaunchTarget.updatePreparation,
  updateSession(id, update) {
    return db.transaction(() => {
      const prior = methods.session(id)
      if (update.expectedTitle !== undefined) {
        if (prior.archived) throw new HbarError('SESSION_ARCHIVED', 'Restore the session before renaming it')
        if (prior.title !== update.expectedTitle && prior.title !== update.title)
          throw new HbarError('VERSION_CONFLICT', 'The session title changed after editing began')
        if (prior.title === update.title && (update.archived === undefined || update.archived === prior.archived))
          return { session: prior, event: null }
      }
      const updated: Session = {
        ...prior,
        title: update.title ?? prior.title,
        archived: update.archived ?? prior.archived,
        updatedAt: Date.now(),
      }
      const event = appendEvent(id, 'session.updated', { session: updated })
      db.query('UPDATE sessions SET title=?,archived=?,updatedAt=? WHERE id=?').run(
        updated.title,
        Number(updated.archived),
        updated.updatedAt,
        id,
      )
      return { session: methods.session(id), event }
    })()
  },
  moveSession(id, workspaceId) {
    return db.transaction(() => {
      const prior = methods.session(id)
      const target = methods.workspace(workspaceId)
      if (prior.workspaceId === target.id) {
        const latest = db.query('SELECT * FROM events WHERE sessionId=? ORDER BY seq DESC LIMIT 1').get(id) as Row | null
        return { session: prior, event: eventRow(required(latest, 'Session event')) }
      }
      const ongoing = db
        .query("SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval','queued') LIMIT 1")
        .get(id)
      if (ongoing) throw new HbarError('BUSY', 'Stop the session before moving it to another workspace')
      const updated: Session = { ...prior, workspaceId: target.id, updatedAt: Date.now() }
      const event = appendEvent(id, 'session.moved', { session: updated, previousWorkspaceId: prior.workspaceId })
      db.query('UPDATE sessions SET workspaceId=?,updatedAt=? WHERE id=?').run(updated.workspaceId, updated.updatedAt, id)
      return { session: methods.session(id), event }
    })()
  },
  append: (...args) => db.transaction(() => appendEvent(...args))(),
  events(sessionId, after, limit = 2000) {
    return (
      db
        .query('SELECT * FROM events WHERE sessionId=? AND seq>? ORDER BY seq LIMIT ?')
        .all(sessionId, after, limit) as Row[]
    ).map(eventRow)
  },
  goalHistory: (input) => readGoalHistory(db, input),
  usageEvents(input: UsageReadInput) {
    const limit = Math.min(Math.max(input.limit, 1), 2_000)
    const params: (string | number | null)[] = [...USAGE_EVENT_TYPES, input.from, input.to]
    let scope = ''
    if (input.scope.kind === 'workspace') {
      methods.workspace(input.scope.workspaceId)
      scope = 'AND s.workspaceId=?'
      params.push(input.scope.workspaceId)
    } else if (input.scope.kind === 'session') {
      methods.session(input.scope.sessionId)
      if (input.scope.includeDescendants) {
        scope = `AND e.sessionId IN (
          WITH RECURSIVE tree(id) AS (
            SELECT ? UNION ALL SELECT child.id FROM sessions child JOIN tree parent ON child.parentId=parent.id
          ) SELECT id FROM tree
        )`
      } else scope = 'AND e.sessionId=?'
      params.push(input.scope.sessionId)
    } else if (input.scope.kind === 'run') {
      methods.run(input.scope.runId)
      scope = 'AND e.runId=?'
      params.push(input.scope.runId)
    }
    let cursor = ''
    if (input.after) {
      cursor = 'AND (e.time>? OR (e.time=? AND e.eventId>?))'
      params.push(input.after.time, input.after.time, input.after.eventId)
    }
    params.push(limit + 1)
    const placeholders = USAGE_EVENT_TYPES.map(() => '?').join(',')
    const rows = db
      .query(
        `SELECT
          e.eventId,e.sessionId,e.seq,e.runId,e.stepId,e.type,e.data,e.time,e.version,
          s.workspaceId,s.parentId AS parentSessionId,
          r.id AS r_id,r.sessionId AS r_sessionId,r.requestId AS r_requestId,r.input AS r_input,
          r.modelId AS r_modelId,r.status AS r_status,r.createdAt AS r_createdAt,
          r.startedAt AS r_startedAt,r.endedAt AS r_endedAt,r.error AS r_error
        FROM events e
        JOIN sessions s ON s.id=e.sessionId
        LEFT JOIN runs r ON r.id=e.runId
        WHERE e.type IN (${placeholders}) AND e.time>=? AND e.time<? ${scope} ${cursor}
        ORDER BY e.time,e.eventId LIMIT ?`,
      )
      .all(...params) as Row[]
    const items = rows.slice(0, limit).map(usageReadRow)
    const last = items.at(-1)?.event
    return {
      items,
      hasMore: rows.length > limit,
      ...(rows.length > limit && last ? { next: { time: last.time, eventId: last.eventId } } : {}),
    }
  },
  commit: (...args) =>
    db.transaction(() => {
      const [sessionId, runId, role, content, messageId = crypto.randomUUID(), providerData] = args
      content.forEach((block) => contentBlockSchema.parse(block))
      const event = appendEvent(sessionId, 'message.committed', { id: messageId, role, content, providerData }, runId)
      const message: Message = { id: messageId, sessionId, runId, role, content, seq: event.seq, createdAt: event.time }
      db.query('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)').run(
        message.id,
        sessionId,
        runId,
        role,
        JSON.stringify(content),
        event.seq,
        event.time,
        providerData ? JSON.stringify(providerData) : null,
      )
      sessionSearch.queueMessage(message.id, sessionId, role, event.seq, content)
      return { message, event }
    })(),
  snapshot(sessionId, before, limit = 60) {
    const session = workerDiagnostics.readPhase('session', () => methods.session(sessionId))
    const { messages, hasOlder } = workerDiagnostics.readPhase('messages', () => {
      const rows = db
        .query('SELECT * FROM messages WHERE sessionId=? AND seq<? ORDER BY seq DESC LIMIT ?')
        .all(sessionId, before ?? Number.MAX_SAFE_INTEGER, limit + 1) as Row[]
      return { messages: rows.slice(0, limit).reverse().map(messageRow), hasOlder: rows.length > limit }
    })
    const approvals = workerDiagnostics.readPhase('pending-approvals', () =>
      (
        db
          .query("SELECT * FROM approvals WHERE sessionId=? AND status='pending' ORDER BY createdAt,id LIMIT 80")
          .all(sessionId) as Row[]
      ).map(approvalRow),
    )
    // Pending decisions keep priority; resolved facts belong only to this loaded
    // message page and retain their original session/Run/call/tool identity.
    if (messages.length && approvals.length < 80) {
      const pageIds = messages.map((message) => message.id)
      const completed = workerDiagnostics.readPhase(
        'resolved-approvals',
        () =>
          db
            .query(
              `
          SELECT DISTINCT approvals.* FROM approvals
          JOIN messages ON messages.sessionId=approvals.sessionId AND messages.runId=approvals.runId
          JOIN json_each(messages.content) AS block
            ON json_extract(block.value,'$.callId')=approvals.callId
            AND json_extract(block.value,'$.name')=approvals.tool
          WHERE approvals.sessionId=? AND approvals.status<>'pending'
            AND ((messages.role='assistant' AND json_extract(block.value,'$.type')='tool_call')
              OR (messages.role='tool' AND json_extract(block.value,'$.type')='tool_result'))
            AND messages.id IN (${pageIds.map(() => '?').join(',')})
          ORDER BY approvals.createdAt DESC,approvals.id LIMIT ?
        `,
            )
            .all(sessionId, ...pageIds, 80 - approvals.length) as Row[],
      )
      approvals.push(...completed.map(approvalRow))
    }
    const usage = workerDiagnostics.readPhase('usage', () => {
      const total = emptyUsage()
      for (const row of db
        .query("SELECT data FROM events WHERE sessionId=? AND type='usage.recorded'")
        .all(sessionId) as { data: string }[]) {
        const item = JSON.parse(row.data) as Usage
        for (const key of Object.keys(total) as (keyof Usage)[]) total[key] += item[key] ?? 0
      }
      return total
    })
    return {
      session,
      messages,
      hasOlder,
      runs: workerDiagnostics.readPhase('runs', () =>
        (db.query('SELECT * FROM runs WHERE sessionId=? ORDER BY createdAt DESC LIMIT 40').all(sessionId) as Row[]).map(
          runRow,
        ),
      ),
      approvals,
      userInputs: [],
      usage,
      contextHistory: workerDiagnostics.readPhase('context-history', () => readContextHistory(db, { sessionId })),
      contextCompactions: workerDiagnostics.readPhase('context-compactions', () =>
        readContextCompactionMarkers(db, sessionId, hasOlder ? (messages[0]?.seq ?? 0) : 0, before ?? session.seq + 1),
      ),
      cursor: session.seq,
      streams: [],
      toolObservedAt: Date.now(),
      toolEvents: workerDiagnostics.readPhase('tool-events', () =>
        (
          db
            .query(
              `
          WITH latest AS MATERIALIZED (
            SELECT seq FROM (
              SELECT seq, ROW_NUMBER() OVER (
                PARTITION BY runId,type,COALESCE(json_extract(data,'$.callId'),json_extract(data,'$.parentCallId'))
                ORDER BY seq DESC
              ) AS ordinal
              FROM events WHERE sessionId=? AND type IN ('tool.execution','tool.sequence_progress')
            ) WHERE ordinal=1 ORDER BY seq DESC LIMIT 1000
          )
          SELECT events.* FROM latest
          JOIN events ON events.sessionId=? AND events.seq=latest.seq
          ORDER BY events.seq DESC
        `,
            )
            .all(sessionId, sessionId) as Row[]
        )
          .reverse()
          .map(eventRow),
      ),
    }
  },
  activeOperations: (input) => readActiveOperations(db, input),
  queuedUserRuns: (input) => readQueuedUserRuns(db, input),
  queuedRunEditable(value) {
    const { sessionId, operationId } = queuedRunEditableInputSchema.parse(value)
    return db.transaction(() => {
      const row = db
        .query<Row, [string, string]>('SELECT * FROM runs WHERE id=? AND sessionId=?')
        .get(operationId, sessionId)
      if (!row) throw new HbarError('NOT_FOUND', 'Queued Run not found in session')
      const run = runRow(row)
      if (run.recovery || (run.input.source ?? 'user') !== 'user')
        throw new HbarError('FORBIDDEN', 'Only user queue items can be edited')
      if (run.status !== 'queued') throw new HbarError('COMMAND_CONFLICT', 'Queued Run has already started or settled')
      const result = queuedRunEditableSchema.parse({
        sessionId,
        operationId,
        revision: queuedRunContentRevision(operationId),
        text: run.input.text,
        attachmentCount: run.input.images.length + (run.input.files?.length ?? 0),
      })
      if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 800_000)
        throw new HbarError('INPUT_TOO_LARGE', 'Queued Run text exceeds the editable response limit')
      return result
    })()
  },
  openRunSteering(sessionId, runId) {
    const session = methods.session(sessionId)
    const run = methods.run(runId)
    if (run.sessionId !== session.id) throw new HbarError('NOT_FOUND', 'Run not found in session')
    if (run.status !== 'running') throw new HbarError('COMMAND_CONFLICT', 'Steering requires a running Run')
    const journaledStatus = db
      .query<{ status: string | null }, [string]>(
        "SELECT json_extract(data,'$.run.status') AS status FROM events WHERE runId=? AND type IN ('run.status','run.settled') ORDER BY seq DESC LIMIT 1",
      )
      .get(runId)?.status
    if (journaledStatus !== 'running')
      throw new HbarError('COMMAND_CONFLICT', 'Steering requires the durable active Run start boundary')
    if (session.archived || methods.cancelRequested(run.id))
      throw new HbarError('COMMAND_CONFLICT', 'Steering is unavailable for an archived or stopping Run')
    const result = runSteering.open(sessionId, runId)
    if (result === 'closed') throw new HbarError('COMMAND_CONFLICT', 'Steering gate is closed')
    if (result === 'conflict') throw new HbarError('COMMAND_CONFLICT', 'Another Run owns this steering gate')
    if (result === 'capacity') throw new HbarError('BUSY', 'Steering gate capacity is full')
  },
  closeRunSteering(sessionId, runId) {
    if (methods.run(runId).sessionId !== sessionId) throw new HbarError('NOT_FOUND', 'Run not found in session')
    const result = runSteering.close(sessionId, runId)
    if (result === 'conflict') throw new HbarError('COMMAND_CONFLICT', 'Another Run owns this steering gate')
  },
  readRunSteering(value) {
    return db
      .transaction(() => {
        const input = runSteeringReadInputSchema.parse(value)
        const run = methods.run(input.runId)
        if (run.sessionId !== input.sessionId) throw new HbarError('NOT_FOUND', 'Run not found in session')
        if (input.afterSeq > methods.session(input.sessionId).seq)
          throw new HbarError('COMMAND_CONFLICT', 'Steering cursor is ahead of the canonical Session sequence')
        if (run.status !== 'running' || methods.cancelRequested(run.id)) runSteering.close(input.sessionId, input.runId)
        if (!runSteering.isOpen(input.sessionId, input.runId))
          return runSteeringReadResultSchema.parse({
            sessionId: input.sessionId,
            runId: input.runId,
            messages: [],
            nextSeq: input.afterSeq,
            closed: true,
          })
        const rows = db
          .query<Row, [string, string, number, string]>(
            `SELECT * FROM events
         WHERE sessionId=? AND type='message.committed' AND runId=? AND seq>?
           AND json_extract(data,'$.queueGuidance.activeRunId') IS NOT NULL
           AND json_extract(data,'$.queueGuidance.activeRunId')=?
         ORDER BY seq LIMIT 21`,
          )
          .all(input.sessionId, input.runId, input.afterSeq, input.runId)
        const items = rows.slice(0, 20).map((row) => {
          const event = eventRow(row)
          queueGuidanceFromEvent(event)
          const data = z
            .object({ id: idSchema, role: z.literal('user'), content: z.array(contentBlockSchema) })
            .parse(event.data)
          return runSteeringMessageSchema.parse({
            id: data.id,
            sessionId: input.sessionId,
            runId: input.runId,
            role: data.role,
            content: data.content,
            seq: event.seq,
            createdAt: event.time,
          })
        })
        const nextSeq = items.at(-1)?.seq ?? input.afterSeq
        const closed = input.closeWhenEmpty && items.length === 0
        if (closed && runSteering.hasPending(input.sessionId, input.runId))
          throw new HbarError('COMMAND_CONFLICT', 'Steering cursor skipped pending messages')
        if (closed) runSteering.close(input.sessionId, input.runId)
        if (items.length)
          runSteering.acknowledge(
            input.sessionId,
            input.runId,
            items.map((item) => item.id),
          )
        return runSteeringReadResultSchema.parse({
          sessionId: input.sessionId,
          runId: input.runId,
          messages: items,
          nextSeq,
          closed,
        })
      })
      .immediate()
  },
  guideQueuedRun(input) {
    const request = queuedRunGuideInputSchema.parse(input.request)
    const actorId = z.string().min(1).max(160).parse(input.actorId)
    const idempotencyKey = z.string().min(1).max(128).parse(input.idempotencyKey)
    const commandId = 'queuedRun.guide'
    const payloadHash = entityPayloadHash(commandId, request)
    return db
      .transaction(() => {
        const prior = db
          .query<{ commandId: string; payloadHash: string; resultJson: string }, [string, string]>(
            'SELECT commandId,payloadHash,resultJson FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?',
          )
          .get(actorId, idempotencyKey)
        if (prior) {
          if (prior.commandId !== commandId || prior.payloadHash !== payloadHash)
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Queue guide key was used with different input')
          const receipt = queuedRunGuideReceiptSchema.parse(parseJson(prior.resultJson))
          const event = eventRow(
            required(
              db.query('SELECT * FROM events WHERE eventId=?').get(receipt.eventId) as Row | null,
              'Queue guide event',
            ),
          )
          queueGuidanceFromEvent(event)
          const message = messageRow(
            required(
              db.query('SELECT * FROM messages WHERE id=?').get(receipt.messageId) as Row | null,
              'Guided message',
            ),
          )
          return { receipt, event, message }
        }
        const queued = methods.run(request.operationId)
        if (queued.sessionId !== request.sessionId) throw new HbarError('NOT_FOUND', 'Queued Run not found in session')
        if (queued.status !== 'queued')
          throw new HbarError('COMMAND_CONFLICT', 'Queued Run has already started or settled')
        if (queued.recovery || (queued.input.source ?? 'user') !== 'user')
          throw new HbarError('FORBIDDEN', 'Only user queue items can be guided')
        const currentRevision = queuedRunContentRevision(queued.id)
        if (currentRevision !== request.expectedRevision)
          throw new HbarError('COMMAND_CONFLICT', 'Queued Run content changed')
        const active = methods.run(request.activeRunId)
        if (active.sessionId !== request.sessionId) throw new HbarError('NOT_FOUND', 'Active Run not found in session')
        if (active.status !== 'running') throw new HbarError('COMMAND_CONFLICT', 'Guidance requires a running Run')
        if (methods.session(request.sessionId).archived)
          throw new HbarError('ARCHIVED', 'Unarchive the Session before guiding')
        if (methods.cancelRequested(active.id)) throw new HbarError('COMMAND_CONFLICT', 'The active Run is stopping')
        if (!runSteering.canAdmit(request.sessionId, request.activeRunId))
          throw new HbarError('COMMAND_CONFLICT', 'Steering gate is closed or at capacity')
        if (!queued.input.text.trim() && !queued.input.images.length && !(queued.input.files?.length ?? 0))
          throw new HbarError('EMPTY_INPUT', 'Guided input must contain text or attachments')
        if (queued.input.images.length + (queued.input.files?.length ?? 0) > 12)
          throw new HbarError('FILE_LIMIT', 'Guided input has too many attachments')
        if (
          queued.modelId !== active.modelId ||
          queued.input.thinking !== active.input.thinking ||
          (queued.input.mode ?? 'default') !== (active.input.mode ?? 'default') ||
          (queued.input.approval ?? 'ask') !== (active.input.approval ?? 'ask')
        )
          throw new HbarError(
            'COMMAND_CONFLICT',
            'Guided input model, thinking, mode or approval differs from the active Run',
          )
        const messageId = crypto.randomUUID()
        const eventId = crypto.randomUUID()
        const guidedAt = Date.now()
        if (queued.failure !== undefined || queued.startedAt !== null)
          throw new HbarError('COMMAND_CONFLICT', 'Queued operation has already started or failed')
        const guidedRun: Run = { ...queued, status: 'guided', endedAt: guidedAt, error: null }
        const messageSeq = methods.session(request.sessionId).seq + 1
        const receipt = queuedRunGuideReceiptSchema.parse({
          commandId,
          commandVersion: 1,
          sessionId: request.sessionId,
          operationId: queued.id,
          activeRunId: request.activeRunId,
          idempotencyKey,
          status: 'accepted',
          operationStatus: 'guided',
          messageId,
          eventId,
          revision: messageSeq,
          sessionSeq: messageSeq,
          queueRevision: currentRevision,
          guidedAt,
        })
        const content: ContentBlock[] = [
          ...(queued.input.text ? [{ type: 'text' as const, text: queued.input.text }] : []),
          ...queued.input.images.map((artifact) => ({ type: 'image' as const, artifact })),
          ...(queued.input.files ?? []).map((artifact) => ({ type: 'file' as const, artifact })),
        ]
        const event = appendEvent(
          request.sessionId,
          'message.committed',
          {
            id: messageId,
            role: 'user',
            content,
            queueGuidance: {
              activeRunId: request.activeRunId,
              guidedRun,
              expectedRevision: currentRevision,
              receipt,
              actorId,
              payloadHash,
            },
          },
          request.activeRunId,
          undefined,
          { eventId, time: guidedAt },
        )
        queueGuidanceFromEvent(event)
        db.query("UPDATE runs SET status='guided',endedAt=?,error=NULL,failure=NULL WHERE id=?").run(
          guidedAt,
          queued.id,
        )
        db.query('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)').run(
          messageId,
          request.sessionId,
          request.activeRunId,
          'user',
          JSON.stringify(content),
          event.seq,
          guidedAt,
          null,
        )
        sessionSearch.queueMessage(messageId, request.sessionId, 'user', event.seq, content)
        db.query('INSERT INTO entity_command_receipts VALUES(?,?,?,?,?)').run(
          actorId,
          idempotencyKey,
          commandId,
          payloadHash,
          JSON.stringify(receipt),
        )
        runSteering.admit(request.sessionId, request.activeRunId, messageId)
        return {
          receipt,
          event,
          message: messageRow({
            id: messageId,
            sessionId: request.sessionId,
            runId: request.activeRunId,
            role: 'user',
            content: JSON.stringify(content),
            seq: event.seq,
            createdAt: guidedAt,
            providerData: null,
          }),
        }
      })
      .immediate()
  },
  queuedRunGuideReceipt(actorId, idempotencyKey, sessionId) {
    const row = db
      .query<{ commandId: string; resultJson: string }, [string, string]>(
        'SELECT commandId,resultJson FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?',
      )
      .get(actorId, idempotencyKey)
    if (!row) return null
    if (row.commandId !== 'queuedRun.guide')
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Key belongs to a different command')
    const receipt = queuedRunGuideReceiptSchema.parse(parseJson(row.resultJson))
    if (receipt.sessionId !== sessionId) throw new HbarError('IDEMPOTENCY_CONFLICT', 'Key belongs to another session')
    return receipt
  },
  editQueuedRunText(input) {
    const request = queuedRunEditTextInputSchema.parse(input.request)
    const actorId = z.string().min(1).max(160).parse(input.actorId)
    const idempotencyKey = z.string().min(1).max(128).parse(input.idempotencyKey)
    const commandId = 'queuedRun.editText'
    const payloadHash = entityPayloadHash(commandId, request)
    return db
      .transaction(() => {
        const prior = db
          .query<{ commandId: string; payloadHash: string; resultJson: string }, [string, string]>(
            'SELECT commandId,payloadHash,resultJson FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?',
          )
          .get(actorId, idempotencyKey)
        if (prior) {
          if (prior.commandId !== commandId || prior.payloadHash !== payloadHash)
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Queue edit key was used with different input')
          const receipt = queuedRunEditTextReceiptSchema.parse(parseJson(prior.resultJson))
          const event = eventRow(
            required(
              db.query('SELECT * FROM events WHERE eventId=?').get(receipt.eventId) as Row | null,
              'Queue edit event',
            ),
          )
          return { receipt, event }
        }
        const row = db
          .query<Row, [string, string]>('SELECT * FROM runs WHERE id=? AND sessionId=?')
          .get(request.operationId, request.sessionId)
        if (!row) throw new HbarError('NOT_FOUND', 'Queued Run not found in session')
        const run = runRow(row)
        if (run.recovery || (run.input.source ?? 'user') !== 'user')
          throw new HbarError('FORBIDDEN', 'Only user queue items can be edited')
        if (run.status !== 'queued')
          throw new HbarError('COMMAND_CONFLICT', 'Queued Run has already started or settled')
        if (queuedRunContentRevision(run.id) !== request.expectedRevision)
          throw new HbarError('COMMAND_CONFLICT', 'Queued Run content changed')
        const nextInput = inputSchema.parse({ ...run.input, text: request.text })
        db.query("UPDATE runs SET input=? WHERE id=? AND sessionId=? AND status='queued'").run(
          JSON.stringify(nextInput),
          run.id,
          run.sessionId,
        )
        const event = appendEvent(
          run.sessionId,
          'run.inputEdited',
          {
            operationId: run.id,
            expectedRevision: request.expectedRevision,
            text: request.text,
            queueEdit: { actorId, idempotencyKey, payloadHash },
          },
          run.id,
        )
        const receipt = queuedRunEditTextReceiptSchema.parse({
          commandId,
          commandVersion: 1,
          sessionId: run.sessionId,
          operationId: run.id,
          idempotencyKey,
          revision: event.seq,
          eventId: event.eventId,
          editedAt: event.time,
        })
        db.query('INSERT INTO entity_command_receipts VALUES(?,?,?,?,?)').run(
          actorId,
          idempotencyKey,
          commandId,
          payloadHash,
          JSON.stringify(receipt),
        )
        return { receipt, event }
      })
      .immediate()
  },
  queuedRunEditTextReceipt(actorId, idempotencyKey, sessionId) {
    const row = db
      .query<{ commandId: string; resultJson: string }, [string, string]>(
        'SELECT commandId,resultJson FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?',
      )
      .get(actorId, idempotencyKey)
    if (!row) return null
    if (row.commandId !== 'queuedRun.editText')
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Key belongs to a different command')
    const receipt = queuedRunEditTextReceiptSchema.parse(parseJson(row.resultJson))
    if (receipt.sessionId !== sessionId) throw new HbarError('IDEMPOTENCY_CONFLICT', 'Key belongs to another session')
    return receipt
  },
  removeQueuedRun(input) {
    const request = queuedRunRemoveInputSchema.parse(input.request)
    const actorId = z.string().min(1).max(160).parse(input.actorId)
    const idempotencyKey = z.string().min(1).max(128).parse(input.idempotencyKey)
    const commandId = 'queuedRun.remove'
    const payloadHash = entityPayloadHash(commandId, request)
    return db
      .transaction(() => {
        const prior = db
          .query<{ commandId: string; payloadHash: string; resultJson: string }, [string, string]>(
            'SELECT commandId,payloadHash,resultJson FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?',
          )
          .get(actorId, idempotencyKey)
        if (prior) {
          if (prior.commandId !== commandId || prior.payloadHash !== payloadHash)
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Queue removal key was used with different input')
          const receipt = queuedRunRemoveReceiptSchema.parse(parseJson(prior.resultJson))
          const event = eventRow(
            required(
              db.query('SELECT * FROM events WHERE eventId=?').get(receipt.eventId) as Row | null,
              'Queue removal event',
            ),
          )
          return { receipt, event }
        }
        const row = db
          .query<Row, [string, string]>('SELECT * FROM runs WHERE id=? AND sessionId=?')
          .get(request.operationId, request.sessionId)
        if (!row) throw new HbarError('NOT_FOUND', 'Queued Run not found in session')
        const run = runRow(row)
        if ((run.input.source ?? 'user') !== 'user')
          throw new HbarError('FORBIDDEN', 'Only user queue items can be removed')
        if (run.status !== 'queued')
          throw new HbarError('COMMAND_CONFLICT', 'Queued Run has already started or settled')
        const revision = db
          .query<{ seq: number | null }, [string]>(
            "SELECT MAX(seq) AS seq FROM events WHERE runId=? AND type IN ('run.queued','run.recoveryQueued','run.inputEdited')",
          )
          .get(run.id)?.seq
        if (revision === null || revision === undefined)
          throw new HbarError('RUN_JOURNAL_MISSING', 'Queued Run has no revision event')
        if (revision !== request.expectedRevision) throw new HbarError('COMMAND_CONFLICT', 'Queued Run content changed')
        const removedAt = Date.now()
        const failure = runFailureSchema.parse({ code: 'QUEUE_REMOVED', category: 'cancelled', retryable: false })
        db.query(
          "UPDATE runs SET status='cancelled',endedAt=?,error=NULL,failure=? WHERE id=? AND sessionId=? AND status='queued'",
        ).run(removedAt, JSON.stringify(failure), run.id, run.sessionId)
        const settled = methods.run(run.id)
        const event = appendEvent(
          run.sessionId,
          'run.settled',
          { run: settled, queueRemoval: { actorId, idempotencyKey, payloadHash } },
          run.id,
        )
        const receipt = queuedRunRemoveReceiptSchema.parse({
          commandId,
          commandVersion: 1,
          sessionId: run.sessionId,
          operationId: run.id,
          idempotencyKey,
          status: 'cancelled',
          eventId: event.eventId,
          sessionSeq: event.seq,
          removedAt: event.time,
        })
        db.query('INSERT INTO entity_command_receipts VALUES(?,?,?,?,?)').run(
          actorId,
          idempotencyKey,
          commandId,
          payloadHash,
          JSON.stringify(receipt),
        )
        return { receipt, event }
      })
      .immediate()
  },
  queuedRunRemoveReceipt(actorId, idempotencyKey, sessionId) {
    const row = db
      .query<{ commandId: string; resultJson: string }, [string, string]>(
        'SELECT commandId,resultJson FROM entity_command_receipts WHERE actorId=? AND idempotencyKey=?',
      )
      .get(actorId, idempotencyKey)
    if (!row) return null
    if (row.commandId !== 'queuedRun.remove')
      throw new HbarError('IDEMPOTENCY_CONFLICT', 'Key belongs to a different command')
    const receipt = queuedRunRemoveReceiptSchema.parse(parseJson(row.resultJson))
    if (receipt.sessionId !== sessionId) throw new HbarError('IDEMPOTENCY_CONFLICT', 'Key belongs to another session')
    return receipt
  },
  context(sessionId) {
    const compacted = db
      .query('SELECT * FROM compactions WHERE sessionId=? ORDER BY eventSeq DESC LIMIT 1')
      .get(sessionId) as { summary: string; throughSeq: number } | null
    return {
      summary: compacted?.summary ?? null,
      throughSeq: compacted?.throughSeq ?? 0,
      messages: (
        db
          .query('SELECT * FROM messages WHERE sessionId=? AND seq>? ORDER BY seq')
          .all(sessionId, compacted?.throughSeq ?? 0) as Row[]
      ).map(messageRow),
    }
  },
  contextHistory: (input) => readContextHistory(db, input),
  sessionObservability: (input) => readSessionObservability(db, input),
  compactionStart: (input) =>
    db.transaction(() => {
      const compaction = beginContextCompaction(db, input)
      return appendEvent(input.sessionId, 'context.compaction.started', { compaction }, input.runId ?? undefined)
    })(),
  compactionFinish: (record, completion) =>
    db.transaction(() => {
      const latest = db
        .query<{ data: string }, [string, string]>(
          "SELECT data FROM events WHERE sessionId=? AND json_extract(data,'$.compaction.id')=? ORDER BY seq DESC LIMIT 1",
        )
        .get(record.sessionId, record.id)
      const data = latest
        ? z.object({ compaction: contextCompactionRecordSchema }).parse(JSON.parse(latest.data) as unknown)
        : null
      if (!data || data.compaction.status !== 'running') return null
      const compaction = finishContextCompaction(db, data.compaction, completion)
      return appendEvent(record.sessionId, 'context.compaction.settled', { compaction }, record.runId ?? undefined)
    })(),
  compact: (sessionId, throughSeq, summary, modelId, telemetry) =>
    db.transaction(() => {
      const compaction = telemetry
        ? finishContextCompaction(db, telemetry.record, {
            status: 'completed',
            durationMs: telemetry.durationMs,
            afterTokens: telemetry.afterTokens,
            summaryTokens: telemetry.summaryTokens,
            retainedMessages: telemetry.retainedMessages,
            chunks: telemetry.chunks,
            errorCode: null,
          })
        : undefined
      const event = appendEvent(
        sessionId,
        'context.compacted',
        { throughSeq, summary, modelId, ...(compaction ? { compaction } : {}) },
        compaction?.runId ?? undefined,
      )
      db.query('INSERT INTO compactions VALUES(?,?,?,?)').run(sessionId, throughSeq, summary, event.seq)
      return event
    })(),
  fork: (sessionId, atSeq) =>
    db.transaction(() => {
      const parent = methods.session(sessionId)
      const boundary = atSeq ?? parent.seq
      const ongoing = db
        .query("SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval','queued')")
        .get(sessionId)
      if (ongoing) throw new HbarError('BUSY', 'Fork after the run has settled')
      if (
        atSeq &&
        !db.query("SELECT eventId FROM events WHERE sessionId=? AND seq=? AND type='run.settled'").get(sessionId, atSeq)
      )
        throw new HbarError('INVALID_BOUNDARY', 'A fork must end at a settled run')
      const child = methods.createSession(parent.workspaceId, `${parent.title} (fork)`, parent.id)
      appendEvent(child.id, 'session.forked', { parentId: parent.id, atSeq: boundary })
      for (const row of db
        .query('SELECT * FROM messages WHERE sessionId=? AND seq<=? ORDER BY seq')
        .all(sessionId, boundary) as Row[]) {
        const message = messageRow(row)
        methods.commit(
          child.id,
          message.runId,
          message.role,
          message.content,
          undefined,
          row.providerData ? JSON.parse(row.providerData as string) : undefined,
        )
      }
      return methods.session(child.id)
    })(),
  forkSessionCommand(input) {
    return db.transaction(() => {
      const commandId = 'session.fork'
      const payloadHash = entityPayloadHash(commandId, { sessionId: input.sessionId, atSeq: input.atSeq ?? null })
      const prior = entityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash)
      if (prior) return prior
      const session = methods.fork(input.sessionId, input.atSeq)
      storeEntityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash, session)
      return session
    })()
  },
  forkFromMessageCommand(input) {
    return db.transaction(() => {
      const commandId = 'session.forkFromMessage'
      const payloadHash = entityPayloadHash(commandId, {
        sessionId: input.sessionId,
        messageId: input.messageId,
      })
      const prior = entityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash)
      if (prior) return prior

      const parent = methods.session(input.sessionId)
      const { target, prefix } = messageForkPrefix(parent.id, input.messageId)

      const child = methods.createSession(parent.workspaceId, `${parent.title} (fork)`, parent.id)
      appendEvent(child.id, 'session.forked', {
        parentId: parent.id,
        sourceMessageId: target.id,
        sourceSeq: target.seq,
        boundary: 'message',
      })
      for (const message of prefix)
        methods.commit(child.id, message.runId, message.role, message.content, undefined, message.providerData)
      const session = methods.session(child.id)
      storeEntityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash, session)
      return session
    })()
  },
  forkFromMessageReceipt(input) {
    const commandId = 'session.forkFromMessage'
    const payloadHash = entityPayloadHash(commandId, { sessionId: input.sessionId, messageId: input.messageId })
    return entityCommandReceipt(input.actorId, input.idempotencyKey, commandId, payloadHash)
  },
  forkableMessages(input) {
    return db.transaction(() => {
      const parsed = z
        .object({
          sessionId: z.string().min(1).max(160),
          messageIds: z.array(z.string().min(1).max(160)).min(1).max(200),
        })
        .parse(input)
      methods.session(parsed.sessionId)
      const unique = new Map<
        string,
        {
          messageId: string
          eligible: boolean
          reason: 'ready' | 'not_found' | 'invalid_target' | 'busy' | 'invalid_boundary' | 'scan_limit'
        }
      >()
      const candidates = new Map<number, string[]>()
      for (const messageId of parsed.messageIds) {
        if (unique.has(messageId)) continue
        try {
          const target = messageForkTarget(parsed.sessionId, messageId)
          candidates.set(target.seq, [...(candidates.get(target.seq) ?? []), messageId])
          unique.set(messageId, { messageId, eligible: false, reason: 'scan_limit' })
        } catch (error) {
          if (!(error instanceof HbarError)) throw error
          const reason =
            error.code === 'NOT_FOUND'
              ? 'not_found'
              : error.code === 'BUSY'
                ? 'busy'
                : error.code === 'INVALID_BOUNDARY'
                  ? 'invalid_boundary'
                  : error.code === 'INVALID_TARGET'
                    ? 'invalid_target'
                    : null
          if (!reason) throw error
          unique.set(messageId, { messageId, eligible: false, reason })
        }
      }
      if (candidates.size > 0) {
        const checker = toolPrefixChecker()
        const lastSeq = Math.max(...candidates.keys())
        // One streaming read for all targets, capped independently of the total session history.
        for (const row of db
          .query('SELECT seq,runId,content FROM messages WHERE sessionId=? AND seq<=? ORDER BY seq LIMIT 50000')
          .iterate(parsed.sessionId, lastSeq) as IterableIterator<{ seq: number; runId: string; content: string }>) {
          checker.add({ runId: row.runId, content: z.array(contentBlockSchema).parse(parseJson(row.content)) })
          for (const messageId of candidates.get(row.seq) ?? [])
            unique.set(messageId, {
              messageId,
              eligible: checker.valid(),
              reason: checker.valid() ? 'ready' : 'invalid_boundary',
            })
        }
      }
      return { sessionId: parsed.sessionId, items: parsed.messageIds.map((id) => unique.get(id)!) }
    })()
  },
  enqueue: (sessionId, requestId, input, modelId, command, launchTarget) =>
    db.transaction(() => {
      const existing = db
        .query('SELECT * FROM runs WHERE sessionId=? AND requestId=?')
        .get(sessionId, requestId) as Row | null
      if (existing) {
        const prior = runRow(existing)
        if (launchTarget) sessionLaunchTarget.validateReplayBinding(sessionId, launchTarget)
        const queued = db
          .query<{ data: string }, [string]>("SELECT data FROM events WHERE runId=? AND type IN ('run.queued','run.recoveryQueued') ORDER BY seq LIMIT 1")
          .get(prior.id)
        if (!queued) throw new HbarError('RUN_JOURNAL_MISSING', 'Run acceptance event is unavailable')
        const original = runSchema.parse((parseJson(queued.data) as { run: unknown }).run)
        if (original.modelId !== modelId || stableJson(original.input) !== stableJson(input))
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'This request id was already used with different input')
        return prior
      }
      const owner = methods.session(sessionId)
      if (owner.archived) throw new HbarError('ARCHIVED', 'Unarchive the session before running')
      const run: Run = {
        id: crypto.randomUUID(),
        sessionId,
        requestId,
        input,
        modelId,
        status: 'queued',
        createdAt: Date.now(),
        startedAt: null,
        endedAt: null,
        error: null,
      }
      const retainedLaunchTarget = sessionLaunchTarget.bindToRun(sessionId, run.id, methods.workspace(owner.workspaceId).path, launchTarget)
      db.query(
        'INSERT INTO runs(id,sessionId,requestId,input,modelId,status,createdAt,startedAt,endedAt,error) VALUES(?,?,?,?,?,?,?,?,?,?)',
      ).run(run.id, sessionId, requestId, JSON.stringify(input), modelId, 'queued', run.createdAt, null, null, null)
      const queuedEvent = appendEvent(sessionId, 'run.queued', { run, launchTarget: retainedLaunchTarget, ...(command ? { command } : {}) }, run.id)
      return { ...run, queuedEvent }
    })(),
  runByRequest(sessionId, requestId) {
    const row = db.query('SELECT * FROM runs WHERE sessionId=? AND requestId=?').get(sessionId, requestId) as Row | null
    if (!row) {
      const manual = db.query<{ recordJson: string }, [string, string]>("SELECT recordJson FROM runtime_recovery WHERE json_extract(recordJson,'$.manual.requestId')=? AND json_extract(recordJson,'$.chain.sessionId')=? LIMIT 1").get(requestId, sessionId)
      if (!manual) return null
      const record = z.object({ run: runSchema.nullable(), manual: runtimeManualRecoverySchema }).parse(JSON.parse(manual.recordJson))
      return record.run ? { run: methods.run(record.run.id), command: record.manual.command } : null
    }
    const run = runRow(row)
    const event = db.query("SELECT data FROM events WHERE runId=? AND type IN ('run.queued','run.recoveryQueued') ORDER BY seq LIMIT 1").get(run.id) as {
      data: string
    } | null
    if (!event) throw new HbarError('RUN_JOURNAL_MISSING', 'Run acceptance event is unavailable')
    const data = JSON.parse(event.data) as { command?: unknown }
    return { run, command: data.command ? runCommandRecordSchema.parse(data.command) : null }
  },
  runByRequestInWorkspace(workspaceId, requestId) {
    const row = db
      .query(
        'SELECT runs.* FROM runs JOIN sessions ON sessions.id=runs.sessionId WHERE sessions.workspaceId=? AND runs.requestId=? LIMIT 1',
      )
      .get(workspaceId, requestId) as Row | null
    if (row) {
      const run = runRow(row)
      const event = db
        .query("SELECT data FROM events WHERE runId=? AND type IN ('run.queued','run.recoveryQueued') ORDER BY seq LIMIT 1")
        .get(run.id) as { data: string } | null
      if (!event) throw new HbarError('RUN_JOURNAL_MISSING', 'Run acceptance event is unavailable')
      const data = JSON.parse(event.data) as { command?: unknown }
      return { run, command: data.command ? runCommandRecordSchema.parse(data.command) : null }
    }
    const manual = db
      .query<{ recordJson: string }, [string, string]>(
        "SELECT runtime_recovery.recordJson FROM runtime_recovery JOIN sessions ON sessions.id=json_extract(runtime_recovery.recordJson,'$.chain.sessionId') WHERE sessions.workspaceId=? AND json_extract(runtime_recovery.recordJson,'$.manual.requestId')=? LIMIT 1",
      )
      .get(workspaceId, requestId)
    if (!manual) return null
    const record = z
      .object({ run: runSchema.nullable(), manual: runtimeManualRecoverySchema })
      .parse(JSON.parse(manual.recordJson))
    return record.run ? { run: methods.run(record.run.id), command: record.manual.command } : null
  },
  claim: (sessionId) =>
    db.transaction(() => {
      if (db.query("SELECT leaseId FROM runtime_execution_ownership WHERE sessionId=? AND state='active'").get(sessionId)) return null
      if (db.query("SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval')").get(sessionId))
        return null
      const row = db
        .query(
          "SELECT * FROM runs WHERE sessionId=? AND status='queued' ORDER BY CASE WHEN json_extract(input,'$.source')='goal' THEN 2 WHEN recovery IS NOT NULL THEN 1 ELSE 0 END,createdAt,rowid LIMIT 1",
        )
        .get(sessionId) as Row | null
      if (!row) return null
      db.query("UPDATE runs SET status='running',startedAt=? WHERE id=?").run(Date.now(), row.id as string)
      return methods.run(row.id as string)
    })(),
  nextQueuedRun(sessionId) {
    const row = db.query<Row, [string]>(
      "SELECT * FROM runs WHERE sessionId=? AND status='queued' ORDER BY CASE WHEN json_extract(input,'$.source')='goal' THEN 2 WHEN recovery IS NOT NULL THEN 1 ELSE 0 END,createdAt,rowid LIMIT 1",
    ).get(sessionId)
    return row ? runRow(row) : null
  },
  runtimeActiveRuns(after = '', limit = 256) {
    const cursor = z.string().max(160).parse(after)
    const take = z.number().int().min(1).max(256).parse(limit)
    return db.query<Row, [string, number]>("SELECT * FROM runs WHERE status IN ('running','waiting_approval') AND id>? ORDER BY id LIMIT ?").all(cursor, take).map(runRow)
  },
  runtimeUnreleasedExecutions(after = '', limit = 256) {
    const cursor = z.string().max(160).parse(after)
    const take = z.number().int().min(1).max(256).parse(limit)
    return db.query<{ leaseJson: string }, [string, number]>("SELECT leaseJson FROM runtime_execution_ownership WHERE state='active' AND leaseId>? ORDER BY leaseId LIMIT ?").all(cursor, take)
      .map(row => executionOwnershipSchema.parse(JSON.parse(row.leaseJson)))
  },
  run: (id) => runRow(db.query('SELECT * FROM runs WHERE id=?').get(id) as Row | null),
  runFileChanges(sessionId, runId, after, limit = 50) {
    if (methods.run(runId).sessionId !== sessionId)
      throw new HbarError('STALE_TARGET', 'Run belongs to another session')
    return { sessionId, runId, ...readRunFileChangePage(db, runId, after, Math.min(50, Math.max(1, limit))) }
  },
  runFileChangeDiff(sessionId, runId, path, offset) {
    if (methods.run(runId).sessionId !== sessionId)
      throw new HbarError('STALE_TARGET', 'Run belongs to another session')
    return { sessionId, runId, path, ...readRunFileChangeDiff(db, runId, path, offset) }
  },
  runFileChangeVersions(sessionId, runId) {
    if (methods.run(runId).sessionId !== sessionId)
      throw new HbarError('STALE_TARGET', 'Run belongs to another session')
    return readRunFileChangeVersions(db, runId)
  },
  undoRunFileChanges(sessionId, runId) {
    return db.transaction(() => {
      const run = methods.run(runId)
      if (run.sessionId !== sessionId) throw new HbarError('STALE_TARGET', 'Run belongs to another session')
      if (!run.fileChanges?.canUndo) throw new HbarError('UNDO_UNAVAILABLE', 'This Run has no reversible file changes')
      const fileChanges = { ...run.fileChanges, canUndo: false, undoneAt: Date.now() }
      return appendEvent(sessionId, 'run.filesUndone', { run: { ...run, fileChanges } }, runId)
    })()
  },
  requestCancel: (id) =>
    db.transaction(() => {
      const run = methods.run(id)
      if (['guided', 'completed', 'cancelled', 'failed'].includes(run.status))
        return { run, event: null }
      runSteering.close(run.sessionId, run.id)
      if (run.status === 'queued') {
        const event = methods.setRun(id, 'cancelled', 'Cancelled by user', {
          code: 'USER_CANCELLED',
          category: 'cancelled',
          retryable: false,
        })
        const cancelled = methods.run(id)
        return { run: cancelled, event }
      }
      const already = db
        .query("SELECT eventId FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1")
        .get(id)
      return {
        run,
        event: already ? null : appendEvent(run.sessionId, 'run.cancelRequested', { runId: id }, id),
      }
    })(),
  cancelRequested: (id) =>
    Boolean(db.query("SELECT eventId FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1").get(id)),
  setRun: (id, status, error, failure) =>
    db.transaction(() => {
      const run = methods.run(id)
      const settled = !['queued', 'running', 'waiting_approval'].includes(status)
      const parsedFailure = failure === undefined ? undefined : runFailureSchema.parse(failure)
      db.query('UPDATE runs SET status=?,error=?,endedAt=?,failure=? WHERE id=?').run(
        status,
        error ?? null,
        settled ? Date.now() : null,
        parsedFailure ? JSON.stringify(parsedFailure) : null,
        id,
      )
      if (settled) finishRunFileChanges(db, id, methods.session(run.sessionId).seq + 1)
      const event = appendEvent(run.sessionId, settled ? 'run.settled' : 'run.status', { run: methods.run(id) }, id)
      if (settled) runSteering.retire(run.sessionId, run.id)
      return event
    })(),
  reorderQueued: (sessionId, runIds) =>
    db.transaction(() => {
      const rows = db
        .query("SELECT id,createdAt FROM runs WHERE sessionId=? AND status='queued' ORDER BY createdAt,rowid")
        .all(sessionId) as { id: string; createdAt: number }[]
      const known = new Set(rows.map((row) => row.id))
      if (runIds.length !== rows.length || runIds.some((id) => !known.has(id)))
        throw new HbarError('INVALID_INPUT', 'Only all queued runs in this session can be reordered')
      const base = rows.length ? Math.min(...rows.map((row) => row.createdAt)) : Date.now()
      const events: SessionEvent[] = []
      for (const [index, id] of runIds.entries()) {
        db.query('UPDATE runs SET createdAt=? WHERE id=?').run(base + index, id)
        const run = methods.run(id)
        events.push(appendEvent(sessionId, 'run.status', { run }, id))
      }
      return events
    })(),
  queuedSessions: () =>
    (db.query("SELECT DISTINCT sessionId FROM runs WHERE status='queued'").all() as { sessionId: string }[]).map(
      (row) => row.sessionId,
    ),
  createApproval: (approval) =>
    db.transaction(() => {
      db.query(
        'INSERT INTO approvals(id,sessionId,runId,callId,tool,args,status,createdAt) VALUES(?,?,?,?,?,?,?,?)',
      ).run(
        approval.id,
        approval.sessionId,
        approval.runId,
        approval.callId,
        approval.tool,
        JSON.stringify(approval.args),
        approval.status,
        approval.createdAt,
      )
      return appendEvent(approval.sessionId, 'approval.requested', approval, approval.runId)
    })(),
  approval: (id) => approvalRow(db.query('SELECT * FROM approvals WHERE id=?').get(id) as Row | null),
  resolveApproval: (id, status) =>
    db.transaction(() => {
      const approval = methods.approval(id)
      if (approval.status !== 'pending') return null
      db.query('UPDATE approvals SET status=? WHERE id=?').run(status, id)
      approval.status = status
      return { approval, event: appendEvent(approval.sessionId, 'approval.resolved', approval, approval.runId) }
    })(),
  resolvePlanExit: (id, sessionId, runId, callId, decision, feedback, actorId) =>
    db.transaction(() => {
      const approval = methods.approval(id)
      if (
        approval.sessionId !== sessionId ||
        approval.runId !== runId ||
        approval.callId !== callId ||
        approval.tool !== 'exit_plan_mode'
      )
        throw new HbarError('PLAN_EXIT_TARGET', 'Plan exit request does not match the selected call')
      if (approval.status !== 'pending') throw new HbarError('PLAN_EXIT_SETTLED', 'Plan exit was already decided')
      const run = methods.run(runId)
      if (run.sessionId !== sessionId || run.input.mode !== 'plan' || run.status !== 'waiting_approval')
        throw new HbarError('PLAN_EXIT_UNAVAILABLE', 'The original Plan run is no longer waiting for approval')
      if (methods.cancelRequested(runId))
        throw new HbarError('PLAN_EXIT_CANCELLED', 'The original Plan run is being cancelled')
      const status = decision === 'implement' ? 'allowed' : 'denied'
      db.query('UPDATE approvals SET status=?,feedback=?,decidedBy=? WHERE id=?').run(
        status,
        feedback ?? null,
        actorId,
        id,
      )
      const resolved = methods.approval(id)
      // JSONL, not the SQLite projection, is the canonical journal. Both facts
      // must occupy one durable record so recovery cannot observe half an exit.
      const event = appendEvent(
        sessionId,
        'plan_exit.resolved',
        { approval: resolved, mode: decision === 'implement' ? 'default' : null, exitRunId: runId, callId },
        runId,
      )
      const modeEvent = decision === 'implement' ? event : null
      return { approval: resolved, event, modeEvent }
    })(),
  toolStart: (sessionId, runId, callId, name, args, presentation) =>
    db.transaction(() => {
      db.query('INSERT INTO tool_intents VALUES(?,?,?,?,?,?)').run(
        `${runId}:${callId}`,
        sessionId,
        runId,
        callId,
        name,
        'started',
      )
      return appendEvent(
        sessionId,
        'tool.started',
        { callId, name, args, ...(presentation ? { presentation } : {}) },
        runId,
      )
    })(),
  toolEnd: (sessionId, runId, callId, failed = false) =>
    db.transaction(() => {
      const result = db
        .query("UPDATE tool_intents SET status='settled' WHERE id=? AND status='started'")
        .run(`${runId}:${callId}`)
      return result.changes ? appendEvent(sessionId, 'tool.settled', { callId, failed }, runId) : null
    })(),
  recover: (scope) =>
    db.transaction(() => {
      const ids = scope ? new Set(z.array(z.string().min(1).max(160)).max(256).parse(scope.runIds)) : null
      const interruptedCompactions = db
        .query<{ data: string }, []>(
          `
        SELECT data FROM events AS start WHERE type='context.compaction.started'
          AND NOT EXISTS (SELECT 1 FROM events AS terminal WHERE terminal.sessionId=start.sessionId
            AND terminal.seq>start.seq AND terminal.type IN ('context.compacted','context.compaction.settled')
            AND json_extract(terminal.data,'$.compaction.id')=json_extract(start.data,'$.compaction.id'))
      `,
        )
        .all()
      for (const row of interruptedCompactions) {
        const parsed = z
          .object({ compaction: contextCompactionRecordSchema })
          .safeParse(JSON.parse(row.data) as unknown)
        if (parsed.success && (!ids || (parsed.data.compaction.runId !== null && ids.has(parsed.data.compaction.runId))))
          methods.compactionFinish(parsed.data.compaction, {
            status: 'interrupted',
            durationMs: null,
            afterTokens: null,
            summaryTokens: null,
            retainedMessages: null,
            chunks: 0,
            errorCode: 'HOST_INTERRUPTED',
          })
      }
      const active = (db.query(scope?.reconcileInterrupted
        ? "SELECT * FROM runs WHERE status IN ('running','waiting_approval','interrupted')"
        : "SELECT * FROM runs WHERE status IN ('running','waiting_approval')").all() as Row[]).map(
        runRow,
      ).filter(run => !ids || ids.has(run.id))
      for (const run of active) {
        const current = runtimeState.ownership(run.id)
        if (current?.state === 'active') {
          if (scope) throw new HbarError('EXECUTION_OWNER_ACTIVE', 'Revoke the fault owner before scoped recovery')
          runtimeState.revoke(current.lease.owner, [run.id])
        }
      }
      for (const run of active) {
        let unknownEffects = false
        const sequenceCalls = new Map<string, string>()
        const sequenceResults: string[] = []
        for (const row of db
          .query(
            "SELECT type,data FROM events WHERE runId=? AND type IN ('tool.sequence_call','tool.sequence_result') ORDER BY seq",
          )
          .all(run.id) as { type: string; data: string }[]) {
          const value: unknown = JSON.parse(row.data)
          if (row.type === 'tool.sequence_call') {
            const parsed = z.object({ callId: z.string(), parentCallId: z.string() }).safeParse(value)
            if (parsed.success) sequenceCalls.set(parsed.data.callId, parsed.data.parentCallId)
          } else {
            const parsed = z.object({ content: z.array(contentBlockSchema) }).safeParse(value)
            if (parsed.success)
              sequenceResults.push(
                ...parsed.data.content.flatMap((block) => (block.type === 'tool_result' ? [block.callId] : [])),
              )
          }
        }
        const settledCalls = new Set(
          (
            db.query("SELECT content FROM messages WHERE runId=? AND role='tool'").all(run.id) as { content: string }[]
          ).flatMap((row) =>
            (JSON.parse(row.content) as Message['content']).flatMap((block) =>
              block.type === 'tool_result' ? [block.callId] : [],
            ),
          ),
        )
        const pendingCalls = new Set(scope?.preserveApprovals ? db.query<{ callId: string }, [string]>(
          "SELECT callId FROM approvals WHERE runId=? AND status='pending'",
        ).all(run.id).map(approval => approval.callId) : [])
        for (const callId of sequenceResults) if (sequenceCalls.has(callId)) settledCalls.add(callId)
        for (const intent of db.query("SELECT * FROM tool_intents WHERE runId=? AND status='started'").all(run.id) as {
          callId: string
          name: string
        }[]) {
          if (settledCalls.has(intent.callId)) {
            methods.toolEnd(run.sessionId, run.id, intent.callId)
            continue
          }
          appendEvent(run.sessionId, 'tool.unknown', intent, run.id)
          unknownEffects = true
          const content: ContentBlock[] = [
            {
              type: 'tool_result',
              callId: intent.callId,
              name: intent.name,
              text: 'Host interrupted during execution. The effect may already have happened. Inspect state before retrying.',
              isError: true,
              outcome: { kind: 'unknown', executionStarted: true },
            },
          ]
          const parentCallId = sequenceCalls.get(intent.callId)
          if (parentCallId) appendEvent(run.sessionId, 'tool.sequence_result', { parentCallId, content }, run.id)
          else methods.commit(run.sessionId, run.id, 'tool', content)
          settledCalls.add(intent.callId)
        }
        // Complete the model protocol even when a crash occurred before approval/execution.
        for (const row of db.query("SELECT content FROM messages WHERE runId=? AND role='assistant'").all(run.id) as {
          content: string
        }[]) {
          for (const block of JSON.parse(row.content) as Message['content'])
            if (block.type === 'tool_call' && !settledCalls.has(block.callId) && !pendingCalls.has(block.callId)) {
              methods.commit(run.sessionId, run.id, 'tool', [
                {
                  type: 'tool_result',
                  callId: block.callId,
                  name: block.name,
                  text: 'Host interrupted before execution was recorded. This call was not retried.',
                  isError: true,
                  outcome: { kind: 'interrupted', executionStarted: false },
                },
              ])
              settledCalls.add(block.callId)
            }
        }
        db.query("UPDATE tool_intents SET status='unknown' WHERE runId=? AND status='started'").run(run.id)
        for (const approval of (scope?.preserveApprovals ? [] : db.query("SELECT id FROM approvals WHERE runId=? AND status='pending'").all(run.id)) as {
          id: string
        }[])
          methods.resolveApproval(approval.id, 'cancelled')
        if (run.status !== 'interrupted') methods.setRun(
          run.id,
          'interrupted',
          'Host stopped before this run settled. Inspect tool outcomes before resuming.',
          {
            code: unknownEffects ? 'EFFECT_UNKNOWN' : 'HOST_INTERRUPTED',
            category: unknownEffects ? 'result_unknown' : 'interrupted',
            retryable: false,
          },
        )
        for (const queued of (scope?.preserveQueued ? [] : db
          .query("SELECT id FROM runs WHERE sessionId=? AND status='queued'")
          .all(run.sessionId)) as { id: string }[])
          methods.setRun(
            queued.id,
            'interrupted',
            'Queued input retained; resume explicitly after inspecting the interrupted run.',
            { code: 'HOST_INTERRUPTED', category: 'interrupted', retryable: false },
          )
      }
      return active.length
    })(),
  saveProvider(provider) {
    providerSchema.parse(provider)
    db.query('INSERT OR REPLACE INTO providers VALUES(?,?)').run(provider.id, JSON.stringify(provider))
  },
  providers: () =>
    (db.query('SELECT data FROM providers').all() as { data: string }[]).map((row) =>
      providerSchema.parse(JSON.parse(row.data)),
    ),
  deleteProvider(id) {
    db.query('DELETE FROM providers WHERE id=?').run(id)
  },
  putArtifact(artifact) {
    db.query('INSERT OR IGNORE INTO artifacts VALUES(?,?)').run(artifact.id, JSON.stringify(artifact))
  },
  artifact(id) {
    const row = db.query<{ data: string }, [string]>('SELECT data FROM artifacts WHERE id=?').get(id)
    if (row) return artifactSchema.parse(JSON.parse(row.data))
    const recovered = chatDatabaseArtifacts.recoverUploadCandidate(id)
    if (recovered) return recovered
    throw new HbarError('NOT_FOUND', 'Artifact not found')
  },
  putDevice(device, tokenHash) {
    db.transaction(() => {
      db.query('INSERT INTO devices VALUES(?,?,?,?,?)').run(device.id, device.name, tokenHash, device.createdAt, device.lastSeenAt)
      chatDatabaseArtifacts.unknownDevice(device.id, false)
    }).immediate()
  },
  deviceByHash(hash) {
    return db.query('SELECT id,name,createdAt,lastSeenAt FROM devices WHERE tokenHash=?').get(hash) as Device | null
  },
  devices: () => db.query('SELECT id,name,createdAt,lastSeenAt FROM devices ORDER BY createdAt').all() as Device[],
  revokeDevice(id) {
    db.query('DELETE FROM devices WHERE id=?').run(id)
  },
  setPlugin(id, enabled, config, path, projectId) {
    db.query(
      'INSERT INTO plugins(id,projectId,enabled,config,path) VALUES(?,?,?,?,?) ON CONFLICT(id,projectId) DO UPDATE SET enabled=excluded.enabled,config=excluded.config,path=COALESCE(excluded.path,plugins.path)',
    ).run(id, projectId ?? '', Number(enabled), JSON.stringify(config), path ?? null)
  },
  setPlugins(plugins) {
    db.transaction(() => {
      for (const plugin of plugins) methods.setPlugin(plugin.id, plugin.enabled, plugin.config, plugin.path, plugin.projectId)
    })()
  },
  removePlugin(id, projectId) {
    if (projectId) db.query('DELETE FROM plugins WHERE id=? AND projectId=?').run(id, projectId)
    else db.query('DELETE FROM plugins WHERE id=? AND projectId=?').run(id, '')
  },
  plugins: () =>
    (
      db.query('SELECT * FROM plugins').all() as {
        id: string
        projectId: string
        enabled: number
        config: string
        path: string | null
      }[]
    ).map((row) => ({
      ...row,
      ...(row.projectId ? { projectId: row.projectId } : {}),
      enabled: Boolean(row.enabled),
      config: JSON.parse(row.config) as Record<string, unknown>,
    })),
  stats() {
    const result: Record<string, number> = {}
    for (const table of ['sessions', 'messages', 'events', 'runs', 'approvals'])
      result[table] = (db.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
    return result
  },
  getSetting(key) {
    const row = db.query('SELECT value FROM path_metadata WHERE key=?').get(key) as { value: string } | null
    return row?.value ?? null
  },
  setSetting(key, value) {
    db.query(
      'INSERT INTO path_metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ).run(key, value)
  },
  settingsLayers(ids) {
    if (ids.length > 16) throw new HbarError('INVALID_INPUT', 'Settings layer chain is too deep')
    const query = db.query('SELECT * FROM settings_layers WHERE id=?')
    return ids.flatMap((id) => {
      const row = query.get(id) as Row | null
      return row ? [settingsLayerRow(row)] : []
    })
  },
  settingsReceipt(actorId, idempotencyKey) {
    const row = db
      .query('SELECT payloadHash,receiptJson FROM settings_receipts WHERE actorId=? AND idempotencyKey=?')
      .get(actorId, idempotencyKey) as { payloadHash: string; receiptJson: string } | null
    return row
      ? {
          payloadHash: row.payloadHash,
          receipt: JSON.parse(row.receiptJson) as ReturnType<StorageMethods['commitSettings']>,
        }
      : null
  },
  commitSettings(input) {
    return db.transaction(() => {
      const prior = methods.settingsReceipt(input.actorId, input.idempotencyKey)
      if (prior) {
        if (prior.payloadHash !== input.payloadHash)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Settings idempotency key was already used')
        return prior.receipt
      }
      for (const [id, expected] of Object.entries(input.expectedRevisions)) {
        const row = db.query('SELECT revision FROM settings_layers WHERE id=?').get(id) as { revision: number } | null
        if ((row?.revision ?? 0) !== expected) throw new HbarError('REVISION_CONFLICT', `Settings layer changed: ${id}`)
      }
      const current = db.query('SELECT revision FROM settings_layers WHERE id=?').get(input.layer.id) as {
        revision: number
      } | null
      const revision = (current?.revision ?? 0) + 1
      db.query(
        `INSERT INTO settings_layers(id,kind,targetId,schemaVersion,revision,valuesJson,updatedAt)
         VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,targetId=excluded.targetId,
         schemaVersion=excluded.schemaVersion,revision=excluded.revision,valuesJson=excluded.valuesJson,updatedAt=excluded.updatedAt`,
      ).run(
        input.layer.id,
        input.layer.kind,
        input.layer.targetId,
        input.layer.schemaVersion,
        revision,
        stableJson(input.layer.values),
        Date.now(),
      )
      const receipt = { ...input.receipt, revision, values: input.layer.values }
      db.query('INSERT INTO settings_receipts VALUES(?,?,?,?)').run(
        input.actorId,
        input.idempotencyKey,
        input.payloadHash,
        stableJson(receipt),
      )
      return receipt
    })()
  },
  getSettings(scope, targetId) {
    return readSettings(scope, targetId)
  },
  setSettings(scope, targetId, values, expectedRevision) {
    return writeSettings(scope, targetId, values, expectedRevision)
  },
  deleteSetting(scope, targetId, key, expectedRevision) {
    const current = readSettings(scope, targetId)
    const values = { ...current.values }
    delete values[key]
    return writeSettings(scope, targetId, values, expectedRevision)
  },
  close() {
    chatDatabaseResources.close()
    db.close()
  },
}

function restoreProjection(event: SessionEvent) {
  chatDatabaseArtifacts.restoreEventMetadata(event.data)
  projectRunFileChanges(db, event)
  const data = event.data as Record<string, unknown>
  if (event.type === 'session.created') {
    const workspace = data.workspace as Workspace
    const session = data.session as Session
    if (workspace)
      db.query('INSERT OR IGNORE INTO workspaces VALUES(?,?,?,?)').run(
        workspace.id,
        workspace.path,
        workspace.name,
        workspace.createdAt,
      )
    if (workspace)
      db.query('INSERT OR IGNORE INTO projects VALUES(?,?,?,?)').run(
        workspace.id,
        workspace.path,
        workspace.name,
        workspace.createdAt,
      )
    if (session)
      db.query('INSERT OR IGNORE INTO sessions VALUES(?,?,?,?,?,?,?,?)').run(
        session.id,
        session.workspaceId,
        session.title,
        Number(session.archived),
        session.parentId,
        session.createdAt,
        session.updatedAt,
        0,
      )
  }
  const session = db
    .query<{ workspaceId: string }, [string]>('SELECT workspaceId FROM sessions WHERE id=?')
    .get(event.sessionId)
  if (!session) throw new Error(`SESSION_LOG_CORRUPTED event ${event.eventId} has no session.created record`)
  db.query('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)').run(
    event.eventId,
    event.sessionId,
    event.seq,
    event.runId,
    event.stepId,
    event.type,
    JSON.stringify(event.data),
    event.time,
    event.version,
  )
  db.query('UPDATE sessions SET seq=MAX(seq,?),updatedAt=MAX(updatedAt,?) WHERE id=?').run(
    event.seq,
    event.time,
    event.sessionId,
  )
  if (runtimeState.restore(event)) return
  if (event.type === 'session.updated' || event.type === 'session.moved') {
    const value = data.session as Session
    db.query('UPDATE sessions SET workspaceId=?,title=?,archived=?,updatedAt=? WHERE id=?').run(
      value.workspaceId,
      value.title,
      Number(value.archived),
      value.updatedAt,
      value.id,
    )
  } else if (event.type === 'message.committed') {
    if (data.queueGuidance !== undefined) {
      const guidance = queueGuidanceFromEvent(event)
      const prior = methods.run(guidance.guidedRun.id)
      const revision = db
        .query<{ seq: number | null }, [string, number]>(
          "SELECT MAX(seq) AS seq FROM events WHERE runId=? AND seq<? AND type IN ('run.queued','run.recoveryQueued','run.inputEdited')",
        )
        .get(prior.id, event.seq)?.seq
      if (
        prior.status !== 'queued' ||
        prior.sessionId !== event.sessionId ||
        revision !== guidance.expectedRevision ||
        stableJson({ ...prior, status: 'guided', endedAt: event.time, error: null }) !== stableJson(guidance.guidedRun)
      )
        throw new HbarError('SESSION_LOG_CORRUPTED', 'Queue guidance has no matching queued revision')
      const active = methods.run(guidance.activeRunId)
      if (active.sessionId !== event.sessionId || active.status !== 'running' || methods.cancelRequested(active.id))
        throw new HbarError('SESSION_LOG_CORRUPTED', 'Queue guidance has no matching active Run')
      db.query("UPDATE runs SET status='guided',endedAt=?,error=NULL,failure=NULL WHERE id=?").run(event.time, prior.id)
      db.query('INSERT INTO entity_command_receipts VALUES(?,?,?,?,?)').run(
        guidance.actorId,
        guidance.receipt.idempotencyKey,
        'queuedRun.guide',
        guidance.payloadHash,
        JSON.stringify(guidance.receipt),
      )
    }
    db.query('INSERT OR IGNORE INTO messages VALUES(?,?,?,?,?,?,?,?)').run(
      String(data.id),
      event.sessionId,
      event.runId ?? '',
      String(data.role),
      JSON.stringify(data.content),
      event.seq,
      event.time,
      data.providerData === undefined ? null : JSON.stringify(data.providerData),
    )
    sessionSearch.queueMessage(
      String(data.id),
      event.sessionId,
      String(data.role),
      event.seq,
      z.array(contentBlockSchema).parse(data.content),
    )
  } else if (['run.queued', 'run.status', 'run.settled', 'run.filesUndone'].includes(event.type)) {
    const run = runSchema.parse(data.run)
    if (event.type === 'run.queued' && data.launchTarget !== undefined) {
      const binding = sessionLaunchTargetBindingSchema.parse(data.launchTarget)
      if (binding.sessionId !== event.sessionId)
        throw new HbarError('SESSION_LOG_CORRUPTED', 'Canonical checkout belongs to another Session')
      sessionLaunchTarget.restoreBinding(binding)
    }
    db.query(
      `
      INSERT INTO runs(id,sessionId,requestId,input,modelId,status,createdAt,startedAt,endedAt,error,failure,recovery) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,startedAt=excluded.startedAt,endedAt=excluded.endedAt,error=excluded.error,failure=excluded.failure,recovery=excluded.recovery
    `,
    ).run(
      run.id,
      run.sessionId,
      run.requestId,
      JSON.stringify(run.input),
      run.modelId,
      run.status,
      run.createdAt,
      run.startedAt,
      run.endedAt,
      run.error,
      run.failure ? JSON.stringify(runFailureSchema.parse(run.failure)) : null,
      run.recovery ? JSON.stringify(run.recovery) : null,
    )
    if (event.type === 'run.settled') finishRunFileChanges(db, run.id, event.seq)
    if (event.type === 'run.settled' && data.queueRemoval !== undefined) {
      const removal = z
        .strictObject({
          actorId: z.string().min(1).max(160),
          idempotencyKey: z.string().min(1).max(128),
          payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(data.queueRemoval)
      const receipt = queuedRunRemoveReceiptSchema.parse({
        commandId: 'queuedRun.remove',
        commandVersion: 1,
        sessionId: run.sessionId,
        operationId: run.id,
        idempotencyKey: removal.idempotencyKey,
        status: 'cancelled',
        eventId: event.eventId,
        sessionSeq: event.seq,
        removedAt: event.time,
      })
      db.query('INSERT OR IGNORE INTO entity_command_receipts VALUES(?,?,?,?,?)').run(
        removal.actorId,
        removal.idempotencyKey,
        'queuedRun.remove',
        removal.payloadHash,
        JSON.stringify(receipt),
      )
    }
  } else if (event.type === 'run.inputEdited') {
    const edited = z
      .strictObject({
        operationId: z.string().min(1),
        expectedRevision: z.number().int().nonnegative(),
        text: z.string().trim().min(1).max(200_000),
        queueEdit: z.strictObject({
          actorId: z.string().min(1).max(160),
          idempotencyKey: z.string().min(1).max(128),
          payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      })
      .parse(data)
    if (event.runId !== edited.operationId) throw new Error('SESSION_LOG_CORRUPTED queue edit target mismatch')
    const row = db
      .query<Row, [string, string]>('SELECT * FROM runs WHERE id=? AND sessionId=?')
      .get(edited.operationId, event.sessionId)
    if (!row) throw new Error('SESSION_LOG_CORRUPTED queue edit has no Run')
    const run = runRow(row)
    const priorRevision = db
      .query<{ seq: number | null }, [string, number]>(
        "SELECT MAX(seq) AS seq FROM events WHERE runId=? AND seq<? AND type IN ('run.queued','run.recoveryQueued','run.inputEdited')",
      )
      .get(run.id, event.seq)?.seq
    if (run.status !== 'queued' || (run.input.source ?? 'user') !== 'user' || priorRevision !== edited.expectedRevision)
      throw new Error('SESSION_LOG_CORRUPTED queue edit violated queued user revision')
    const input = inputSchema.parse({ ...run.input, text: edited.text })
    db.query('UPDATE runs SET input=? WHERE id=?').run(JSON.stringify(input), run.id)
    const receipt = queuedRunEditTextReceiptSchema.parse({
      commandId: 'queuedRun.editText',
      commandVersion: 1,
      sessionId: event.sessionId,
      operationId: run.id,
      idempotencyKey: edited.queueEdit.idempotencyKey,
      revision: event.seq,
      eventId: event.eventId,
      editedAt: event.time,
    })
    db.query('INSERT OR IGNORE INTO entity_command_receipts VALUES(?,?,?,?,?)').run(
      edited.queueEdit.actorId,
      edited.queueEdit.idempotencyKey,
      'queuedRun.editText',
      edited.queueEdit.payloadHash,
      JSON.stringify(receipt),
    )
  } else if (event.type === 'approval.requested') {
    const approval = event.data as Approval
    db.query(
      'INSERT OR IGNORE INTO approvals(id,sessionId,runId,callId,tool,args,status,createdAt,feedback,decidedBy) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ).run(
      approval.id,
      approval.sessionId,
      approval.runId,
      approval.callId,
      approval.tool,
      JSON.stringify(approval.args),
      approval.status,
      approval.createdAt,
      approval.feedback ?? null,
      approval.decidedBy ?? null,
    )
  } else if (event.type === 'plan_exit.resolved') {
    const result = z
      .object({
        approval: z.object({
          id: z.string().min(1),
          sessionId: z.string().min(1),
          runId: z.string().min(1),
          callId: z.string().min(1),
          tool: z.literal('exit_plan_mode'),
          status: z.enum(['allowed', 'denied']),
          feedback: z.string().max(4_000).nullable().optional(),
          decidedBy: z.string().min(1),
        }),
        mode: z.literal('default').nullable(),
        exitRunId: z.string().min(1),
        callId: z.string().min(1),
      })
      .parse(event.data)
    const approval = result.approval
    if (
      approval.sessionId !== event.sessionId ||
      approval.runId !== event.runId ||
      result.exitRunId !== approval.runId ||
      result.callId !== approval.callId ||
      (approval.status === 'allowed') !== (result.mode === 'default')
    )
      throw new Error(`SESSION_LOG_CORRUPTED invalid Plan exit identity or mode in ${event.eventId}`)
    const pending = methods.approval(approval.id)
    if (
      pending.sessionId !== approval.sessionId ||
      pending.runId !== approval.runId ||
      pending.callId !== approval.callId ||
      pending.tool !== approval.tool ||
      pending.status !== 'pending'
    )
      throw new Error(`SESSION_LOG_CORRUPTED Plan exit has no matching pending approval in ${event.eventId}`)
    db.query('UPDATE approvals SET status=?,feedback=?,decidedBy=? WHERE id=?').run(
      approval.status,
      approval.feedback ?? null,
      approval.decidedBy,
      approval.id,
    )
  } else if (event.type === 'approval.resolved') {
    const approval = event.data as Approval
    db.query('UPDATE approvals SET status=?,feedback=?,decidedBy=? WHERE id=?').run(
      approval.status,
      approval.feedback ?? null,
      approval.decidedBy ?? null,
      approval.id,
    )
  } else if (event.type === 'context.compacted') {
    db.query('INSERT OR IGNORE INTO compactions VALUES(?,?,?,?)').run(
      event.sessionId,
      Number(data.throughSeq),
      String(data.summary),
      event.seq,
    )
  } else if (event.type === 'tool.started') {
    db.query('INSERT OR IGNORE INTO tool_intents VALUES(?,?,?,?,?,?)').run(
      `${event.runId}:${String(data.callId)}`,
      event.sessionId,
      event.runId,
      String(data.callId),
      String(data.name),
      'started',
    )
  }
  const notification = notificationFromSessionEvent(event, session.workspaceId)
  if (notification) notifications.insert(notification)
}

function reconcileSessionLogs() {
  const scan = scanSessionLogs(sessionsRoot, chatDatabaseDeletion.excluded)
  if (scan.truncated.length) recordRecoveryDiagnostic(diagnosticsRoot, { truncated: scan.truncated })
  const scanned = new Map(scan.events.map((item) => [item.event.eventId, item]))
  for (const indexed of db
    .query('SELECT eventId,logPath,byteOffset,byteLength,contentHash FROM session_event_index')
    .all() as {
    eventId: string
    logPath: string
    byteOffset: number
    byteLength: number
    contentHash: string
  }[]) {
    if (!existsSync(join(sessionsRoot, indexed.logPath)))
      throw new Error(`SESSION_LOG_CORRUPTED indexed log is missing: ${indexed.logPath}`)
    const item = scanned.get(indexed.eventId)
    if (
      !item ||
      item.relativePath !== indexed.logPath ||
      item.offset !== indexed.byteOffset ||
      item.length !== indexed.byteLength ||
      item.hash !== indexed.contentHash
    )
      throw new Error(`SESSION_LOG_CORRUPTED indexed event does not match JSONL: ${indexed.eventId}`)
  }
  let restored = 0
  for (const item of scan.events) {
    if (db.query('SELECT eventId FROM session_event_index WHERE eventId=?').get(item.event.eventId)) continue
    db.transaction(() => {
      const projectId = item.relativePath.split('/')[0]!
      db.query(
        `
        INSERT INTO session_log_files VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(path) DO UPDATE SET
          firstSeq=MIN(firstSeq,excluded.firstSeq),lastSeq=MAX(lastSeq,excluded.lastSeq),
          size=MAX(size,excluded.size),updatedAt=excluded.updatedAt
      `,
      ).run(
        item.relativePath,
        projectId,
        item.event.sessionId,
        item.event.seq,
        item.event.seq,
        item.offset + item.length,
        item.event.time,
      )
      restoreProjection(item.event)
      db.query('INSERT INTO session_event_index VALUES(?,?,?,?,?,?,?)').run(
        item.event.eventId,
        item.event.sessionId,
        item.event.seq,
        item.relativePath,
        item.offset,
        item.length,
        item.hash,
      )
    })()
    restored++
  }
  if (restored) recordRecoveryDiagnostic(diagnosticsRoot, { restored })
}

if (!preflight) {
startupPhase = 'recovery'
const recoveryStartedAt = performance.now()
workerDiagnostics.emit({ event: 'sqlite.recovery_started', phase: 'recovery', level: 'info', workerState: 'starting' })
try {
  chatDatabaseDeletion.reconcile()
  if (chatDatabaseDeletion.recoveryIssues.length) recordRecoveryDiagnostic(diagnosticsRoot, { deletedLogIssues: chatDatabaseDeletion.recoveryIssues })
  db.exec('UPDATE chat_database_event_reference_health SET complete=1 WHERE id=1')
  reconcileSessionLogs()
} catch (error) {
  workerDiagnostics.emit({
    event: 'sqlite.recovery_failed',
    phase: 'recovery',
    level: 'fatal',
    outcome: 'failure',
    errorCode: safeStorageErrorCode(error, 'SQLITE_RECOVERY_FAILED'),
    workerState: 'failed',
  })
  throw error
}
workerDiagnostics.emit({
  event: 'sqlite.recovery_completed',
  phase: 'recovery',
  level: 'info',
  outcome: 'success',
  workerState: 'starting',
  durationMs: Math.max(0, performance.now() - recoveryStartedAt),
})

startupPhase = 'ready'
try {
  const facts = readSqliteFacts()
  workerDiagnostics.emit({
    event: 'sqlite.ready',
    phase: 'ready',
    level: 'info',
    outcome: 'success',
    workerState: 'ready',
    durationMs: Math.max(0, performance.now() - schemaStartedAt),
    sqliteVersion: facts.sqliteVersion,
    runtimeVersion: Bun.version,
    databaseSchemaVersion: facts.userVersion,
    userVersion: facts.userVersion,
    journalMode: facts.journalMode,
    synchronous: facts.synchronous,
    busyTimeoutMs: facts.busyTimeoutMs,
    foreignKeys: facts.foreignKeys,
    pageSize: facts.pageSize,
  })
  if (schemaVersion !== facts.userVersion) {
    workerDiagnostics.emit({
      event: 'sqlite.schema_migrated',
      phase: 'migration',
      level: 'info',
      outcome: 'success',
      workerState: 'ready',
      durationMs: Math.max(0, performance.now() - schemaStartedAt),
      databaseSchemaVersion: facts.userVersion,
      userVersion: facts.userVersion,
    })
  }
} catch (error) {
  workerDiagnostics.emit({
    event: 'sqlite.ready_failed',
    phase: 'ready',
    level: 'fatal',
    outcome: 'failure',
    errorCode: safeStorageErrorCode(error, 'SQLITE_READY_FAILED'),
    workerState: 'failed',
  })
  throw error
}

}
function protectedRunId(method: keyof StorageMethods, args: readonly unknown[]): string | undefined {
  if (method === 'setRun') return z.string().parse(args[0])
  if (method === 'commit' || method === 'toolStart' || method === 'toolEnd') return z.string().parse(args[1])
  if (method === 'append') return args[3] === undefined ? undefined : z.string().parse(args[3])
  if (method === 'createApproval') return z.object({ runId: z.string() }).parse(args[0]).runId
  return undefined
}

parentPort!.on('message', ({ id, method, args, authority }: StorageCall) => {
  const startedAt = performance.now()
  let reply: StorageReply
  workerDiagnostics.started(id, String(method))
  let draftVersion: number | null = null
  let logVersion = eventLogWriteVersion
  try {
    if (preflight) {
      if (method === 'ready') {
        if (STORAGE_RPC_METHODS.some(name => typeof methods[name] !== 'function')) throw new HbarError('STORAGE_CONTRACT_INVALID', 'Candidate Worker did not construct every declared storage method')
        const integrity = z.object({ quick_check: z.literal('ok') }).safeParse(db.query('PRAGMA quick_check(1)').get())
        if (!integrity.success) throw new HbarError('STORAGE_INTEGRITY_UNKNOWN', 'Candidate Worker cannot confirm database integrity')
      } else if (method === 'close') db.close()
      else throw new HbarError('RUNTIME_PREPARING', 'Candidate Worker accepts readiness and disposal only')
      parentPort!.postMessage({ id, ok: true, result: method === 'ready' ? methods.ready() : undefined } satisfies StorageReply)
      return
    }
    draftVersion = chatDatabaseArtifacts.writeVersion()
    logVersion = eventLogWriteVersion
    if (databaseMaintenanceOwner && !databaseMaintenanceReads.has(method)) throw new HbarError('BUSY', 'Chat database is in global maintenance')
    if (!Object.hasOwn(methods, method)) throw new Error('Unknown storage operation')
    const protectedId = protectedRunId(method, args)
    if (authority && ['commit', 'append', 'toolStart', 'toolEnd'].includes(method) && args[0] !== authority.sessionId)
      throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Execution writes must belong to their leased Session')
    if (authority && method === 'createApproval' && args[0].sessionId !== authority.sessionId)
      throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Approval Session does not match its execution lease')
    if (authority) runtimeState.assert(authority, protectedId, !['setRun', 'commit', 'toolStart'].includes(method))
    else if (protectedId && runtimeState.ownership(protectedId))
      throw new HbarError('EXECUTION_AUTHORITY_REQUIRED', 'Managed execution writes must carry their durable lease')
    const fn = methods[method] as (...args: unknown[]) => unknown
    reply = { id, ok: true, result: workerDiagnostics.withOperation(id, String(method), () => fn(...args)) }
    if (databaseMaintenanceOwner && method !== 'close') db.clearQueryCache()
    workerDiagnostics.operation(id, String(method), startedAt, 'success')
  } catch (error) {
    workerDiagnostics.emit({
      event: 'sqlite.request_error_caught',
      phase: 'catch',
      level: 'error',
      method: String(method),
      storageRequestId: id,
      operationId: id,
      outcome: 'failure',
      sampled: true,
    })
    if (draftVersion !== null && draftVersion !== chatDatabaseArtifacts.writeVersion()) chatDatabaseArtifacts.invalidateDraftJournal()
    if (logVersion !== eventLogWriteVersion) db.exec('UPDATE chat_database_event_reference_health SET complete=0 WHERE id=1')
    reply = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof HbarError ? error.code : error instanceof Error && error.message.includes('CHAT_DATABASE_ARTIFACT_CLAIMED') ? 'ARTIFACT_RESERVED' : error instanceof Error && error.message.includes('CHAT_DATABASE_ARTIFACT_DELETED') ? 'ARTIFACT_UNAVAILABLE' : 'STORAGE_ERROR',
    }
    workerDiagnostics.emit({
      event: 'sqlite.request_reply_built',
      phase: 'reply',
      level: 'debug',
      method: String(method),
      storageRequestId: id,
      operationId: id,
      outcome: 'failure',
      sampled: true,
    })
    workerDiagnostics.operation(id, String(method), startedAt, 'failure', error)
  }
  parentPort!.postMessage(reply)
})
