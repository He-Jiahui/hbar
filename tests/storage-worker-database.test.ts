import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, mkdir, rm, readdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { createStorageDatabase, type StorageDatabase } from '../packages/storage/src/worker-database'
import {
  createStorageWorkerDiagnostics,
  type StorageWorkerDiagnosticMessage,
} from '../packages/storage/src/worker-diagnostics'
import type { StorageReply } from '../packages/storage/src/types'

function value(reply: StorageReply): unknown {
  if (!reply.ok) throw new Error(`${reply.code}: ${reply.error}`)
  return reply.result
}

test('independent real database factories isolate maintenance, records, diagnostics and close/reopen state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-factory-'))
  const opened: StorageDatabase[] = []
  const leftMessages: StorageWorkerDiagnosticMessage[] = []
  const rightMessages: StorageWorkerDiagnosticMessage[] = []
  const listenerCount = process.listenerCount('uncaughtExceptionMonitor')
  const open = (name: string, messages: StorageWorkerDiagnosticMessage[]): StorageDatabase => {
    const instance = createStorageDatabase(
      { path: join(root, name, 'state.sqlite') },
      {
        diagnostics: createStorageWorkerDiagnostics({
          enabled: true,
          fullCoverage: true,
          port: {
            postMessage: (message) => {
              messages.push(message)
            },
          },
        }),
      },
    )
    opened.push(instance)
    return instance
  }
  try {
    await mkdir(join(root, 'left'))
    await mkdir(join(root, 'right'))
    const left = open('left', leftMessages)
    const right = open('right', rightMessages)
    expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(listenerCount)
    value(left.handle({ id: 1, method: 'setSetting', args: ['factory-key', 'left'] }))
    value(right.handle({ id: 1, method: 'setSetting', args: ['factory-key', 'right'] }))
    expect(value(left.handle({ id: 2, method: 'getSetting', args: ['factory-key'] }))).toBe('left')
    expect(value(right.handle({ id: 2, method: 'getSetting', args: ['factory-key'] }))).toBe('right')
    const workspace = z
      .object({ id: z.string() })
      .parse(value(left.handle({ id: 3, method: 'createWorkspace', args: [root, 'fixture'] })))
    const session = z
      .object({ id: z.string() })
      .parse(value(left.handle({ id: 4, method: 'createSession', args: [workspace.id, 'isolated'] })))
    expect(value(right.handle({ id: 3, method: 'findSession', args: [session.id] }))).toBeNull()
    value(left.handle({ id: 5, method: 'append', args: [session.id, 'fixture.persisted', { marker: 'left-log' }] }))
    value(left.handle({ id: 6, method: 'chatDatabaseMaintenanceBegin', args: ['left-owner'] }))
    expect(left.handle({ id: 7, method: 'getSetting', args: ['factory-key'] })).toMatchObject({
      ok: false,
      code: 'BUSY',
    })
    expect(value(right.handle({ id: 4, method: 'getSetting', args: ['factory-key'] }))).toBe('right')
    value(left.handle({ id: 8, method: 'chatDatabaseMaintenanceEnd', args: ['left-owner'] }))
    value(left.handle({ id: 9, method: 'close', args: [] }))
    opened.splice(opened.indexOf(left), 1)
    expect(value(right.handle({ id: 5, method: 'getSetting', args: ['factory-key'] }))).toBe('right')
    const reopened = open('left', leftMessages)
    expect(value(reopened.handle({ id: 10, method: 'getSetting', args: ['factory-key'] }))).toBe('left')
    const events = z
      .array(z.object({ type: z.string() }))
      .parse(value(reopened.handle({ id: 11, method: 'events', args: [session.id, 0, 100] })))
    expect(events.some((event) => event.type === 'fixture.persisted')).toBe(true)
    expect(leftMessages.some((message) => message.operationId === 11)).toBe(true)
    expect(rightMessages.some((message) => message.operationId === 11)).toBe(false)
    expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(listenerCount)
  } finally {
    for (const instance of opened) instance.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function logFiles(root: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) result.push(...(await logFiles(path)))
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) result.push(path)
  }
  return result
}

test('failed real canonical-log recovery preserves its error and releases the connection for immediate reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-factory-recovery-'))
  const path = join(root, 'state.sqlite')
  const sessions = join(root, 'sessions')
  const diagnostics: StorageWorkerDiagnosticMessage[] = []
  const ports = {
    diagnostics: createStorageWorkerDiagnostics({
      enabled: true,
      fullCoverage: true,
      port: {
        postMessage: (message: StorageWorkerDiagnosticMessage) => {
          diagnostics.push(message)
        },
      },
    }),
  }
  let active: StorageDatabase | undefined
  try {
    active = createStorageDatabase({ path, sessions }, ports)
    const workspace = z
      .object({ id: z.string() })
      .parse(value(active.handle({ id: 1, method: 'createWorkspace', args: [root, 'fixture'] })))
    value(active.handle({ id: 2, method: 'createSession', args: [workspace.id, 'recoverable'] }))
    active.close()
    active = undefined
    const file = (await logFiles(sessions)).at(0)
    if (!file) throw new Error('Missing actual canonical session log')
    const original = await readFile(file)
    await writeFile(file, 'not valid canonical JSON\n')
    let primary: unknown
    try {
      active = createStorageDatabase({ path, sessions }, ports)
    } catch (error: unknown) {
      primary = error
    }
    expect(primary).toBeInstanceOf(Error)
    expect(primary instanceof Error ? primary.message : primary).toContain('SESSION_LOG_CORRUPTED')
    expect(primary).not.toBeInstanceOf(AggregateError)
    expect(
      diagnostics.some(
        ({ event }) => event.event === 'sqlite.recovery_failed' && event.errorCode === 'SESSION_LOG_CORRUPTED',
      ),
    ).toBe(true)
    expect(JSON.stringify(diagnostics)).not.toContain('not valid canonical JSON')
    // Renaming both ways detects an abandoned connection on Windows, where an open
    // SQLite handle can deny rename even when another connection could be opened.
    await rename(path, `${path}.probe`)
    await rename(`${path}.probe`, path)
    await writeFile(file, original)
    active = createStorageDatabase({ path, sessions }, ports)
    value(active.handle({ id: 3, method: 'setSetting', args: ['reopened', 'yes'] }))
    expect(value(active.handle({ id: 4, method: 'getSetting', args: ['reopened'] }))).toBe('yes')
  } finally {
    active?.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('canonical-write unknown outcome poisons only its factory and prevents replay while another database writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-factory-poison-'))
  const path = join(root, 'left.sqlite')
  const leftMessages: StorageWorkerDiagnosticMessage[] = []
  const left = createStorageDatabase(
    { path, sessions: join(root, 'left-sessions') },
    {
      diagnostics: createStorageWorkerDiagnostics({
        enabled: true,
        fullCoverage: true,
        port: {
          postMessage: (message) => {
            leftMessages.push(message)
          },
        },
      }),
    },
  )
  let right: StorageDatabase | undefined
  try {
    right = createStorageDatabase(
      { path: join(root, 'right.sqlite'), sessions: join(root, 'right-sessions') },
      {
        diagnostics: createStorageWorkerDiagnostics({ enabled: false }),
      },
    )
    const workspace = z
      .object({ id: z.string() })
      .parse(value(left.handle({ id: 1, method: 'createWorkspace', args: [root, 'fixture'] })))
    const session = z
      .object({ id: z.string() })
      .parse(value(left.handle({ id: 2, method: 'createSession', args: [workspace.id, 'before'] })))
    const setup = new Database(path, { create: false, strict: true })
    try {
      setup.exec(`
        CREATE TRIGGER fail_session_updated_projection
        BEFORE INSERT ON events WHEN NEW.type='session.updated'
        BEGIN SELECT RAISE(ABORT, 'fixture projection failure'); END;
        CREATE TRIGGER fail_event_reference_health
        BEFORE UPDATE ON chat_database_event_reference_health
        BEGIN SELECT RAISE(ABORT, 'fixture event health failure'); END;
      `)
    } finally {
      setup.close()
    }
    const failed = left.handle({
      id: 3,
      method: 'updateSession',
      args: [session.id, { title: 'after', expectedTitle: 'before' }],
    })
    expect(failed).toMatchObject({ ok: false, code: 'STORAGE_RESULT_UNKNOWN' })
    const files = await logFiles(join(root, 'left-sessions'))
    const before = await Promise.all(files.map((file) => readFile(file, 'utf8')))
    expect(before.join('')).toContain('session.updated')
    expect(
      left.handle({ id: 4, method: 'updateSession', args: [session.id, { title: 'must-not-replay' }] }),
    ).toMatchObject({ ok: false, code: 'STORAGE_RESULT_UNKNOWN' })
    expect(left.handle({ id: 5, method: 'append', args: [session.id, 'session.mustNotRun', {}] })).toMatchObject({
      ok: false,
      code: 'STORAGE_RESULT_UNKNOWN',
    })
    expect(await Promise.all(files.map((file) => readFile(file, 'utf8')))).toEqual(before)
    value(right.handle({ id: 1, method: 'setSetting', args: ['healthy', 'still-writable'] }))
    expect(value(right.handle({ id: 2, method: 'getSetting', args: ['healthy'] }))).toBe('still-writable')
    expect(leftMessages.filter(({ event }) => event.event === 'sqlite.request_outcome_unknown')).toHaveLength(1)
    expect(JSON.stringify(leftMessages)).not.toContain('fixture projection failure')
    expect(JSON.stringify(leftMessages)).not.toContain('fixture event health failure')
  } finally {
    right?.close()
    left.close()
    await rm(root, { recursive: true, force: true })
  }
})
