import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import type { DiagnosticEvent } from '@hbar/contracts'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'

test('close during managed recovery joins scan Workers before ACK and preserves canonical bytes and projections', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-startup-cancel-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const initial = new Storage(layout.database, layout)
  try {
    await initial.ready(120_000)
  } finally {
    await initial.close()
  }
  const paths: string[] = []
  for (let file = 0; file < 9; file++) {
    const path = join(layout.sessions, file + '.jsonl')
    paths.push(path)
    await writeFile(
      path,
      Array.from(
        { length: 257 },
        (_, index) =>
          JSON.stringify({
            eventId: 'cancel-' + file + '-' + index,
            sessionId: 'cancel-' + file,
            seq: index + 1,
            runId: null,
            stepId: null,
            type: 'diagnostic.note',
            data: { text: '取消🌊'.repeat(200) },
            time: 1,
            version: 1,
          }) + '\n',
      ).join('') + '{"unfinished":',
    )
  }
  const hashes = async () =>
    Promise.all(
      paths.map(async (path) =>
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      ),
    )
  const before = await hashes()
  const events: DiagnosticEvent[] = []
  let recoveryStarted: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    recoveryStarted = resolve
  })
  const fatal: string[] = []
  const storage = new Storage(layout.database, layout, {
    diagnostics: {
      emit: (event) => {
        events.push(event)
        if (event.event === 'sqlite.recovery_started') recoveryStarted()
      },
    },
    diagnosticsFullCoverage: true,
    onFatal: (error) => {
      fatal.push(error.code)
    },
  })
  const ready = storage.ready(120_000).then(
    () => 'unexpected-ready',
    (error: unknown) => error,
  )
  try {
    await started
    await storage.close()
    const closed = await ready
    expect(closed).toBeInstanceOf(Error)
    expect(closed instanceof Error ? closed.message : '').toContain('closed')
    expect(fatal).toEqual([])
    const scanClose = events.findIndex((event) => event.event === 'sqlite.session_log_scan_workers_closed')
    const closeAck = events.findIndex((event) => event.event === 'storage.close' && event.outcome === 'success')
    expect(scanClose).toBeGreaterThanOrEqual(0)
    expect(closeAck).toBeGreaterThan(scanClose)
    expect(events[scanClose]?.queueDepth).toBe(0)
    expect(events.filter((event) => event.event === 'sqlite.recovery_completed')).toHaveLength(0)
    expect(await hashes()).toEqual(before)
    const database = new Database(layout.database, { readonly: true, strict: true })
    try {
      expect(
        database.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM session_event_index').get()?.count,
      ).toBe(0)
      expect(database.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM events').get()?.count).toBe(0)
    } finally {
      database.close()
    }
  } finally {
    await storage.close()
  }
  const actual = await realpath(root)
  const local = relative(await realpath(tmpdir()), actual)
  if (!local || isAbsolute(local) || local.startsWith('..') || !local.startsWith('hbar-storage-startup-cancel-'))
    throw new Error('Unowned startup cancellation fixture')
  await rm(actual, { recursive: true })
}, 20_000)
