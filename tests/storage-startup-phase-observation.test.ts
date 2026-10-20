import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { DiagnosticEvent } from '@hbar/contracts'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'
import {
  observeStorageStartupPhase,
  observeStorageStartupPhaseAsync,
} from '../packages/storage/src/startup-phase-observation'

for (const fail of [false, true]) {
  test('async startup telemetry waits for actual settlement and preserves its result: fail=' + fail, async () => {
    const events: Array<Parameters<Parameters<typeof observeStorageStartupPhase>[0]['emit']>[0]> = []
    let finish: () => void = () => undefined
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const primary = new Error('original async storage failure')
    const value = { retained: true }
    const result = observeStorageStartupPhaseAsync({ emit: (event) => events.push(event) }, 'recovery', async () => {
      await pending
      if (fail) throw primary
      return value
    }).then(
      (resolved) => resolved,
      (error: unknown) => error,
    )
    await Promise.resolve()
    expect(events).toHaveLength(0)
    finish()
    expect(await result).toBe(fail ? primary : value)
    expect(events.map((event) => event.event)).toEqual([
      'sqlite.startup_phase_wall_completed',
      'sqlite.startup_phase_process_cpu_completed',
    ])
    expect(events.every((event) => event.outcome === (fail ? 'failure' : 'success'))).toBe(true)
  })
}

test('startup telemetry cannot replace the original storage result when its observer fails', () => {
  const value = { retained: true }
  const diagnostics = {
    emit() {
      throw new Error('unavailable observer')
    },
  }
  expect(observeStorageStartupPhase(diagnostics, 'preflight.check', () => value)).toBe(value)
})

test('failed synchronous startup work retains its exact error and reports failed wall and process CPU facts', () => {
  const events: Array<Parameters<Parameters<typeof observeStorageStartupPhase>[0]['emit']>[0]> = []
  const primary = new Error('original storage failure')
  let caught: unknown
  try {
    observeStorageStartupPhase({ emit: (event) => events.push(event) }, 'preflight.check', () => {
      throw primary
    })
  } catch (error) {
    caught = error
  }
  expect(caught).toBe(primary)
  expect(events.map((event) => event.event)).toEqual([
    'sqlite.startup_phase_wall_completed',
    'sqlite.startup_phase_process_cpu_completed',
  ])
  for (const event of events) {
    expect(event.phase).toBe('preflight.check')
    expect(event.outcome).toBe('failure')
    expect(Number.isFinite(event.durationMs)).toBe(true)
    expect(event.durationMs).toBeGreaterThanOrEqual(0)
  }
})

for (const corruptIndex of [false, true]) {
  test(
    'real Worker recovery reports resource phases without changing its verdict: corruptIndex=' + corruptIndex,
    async () => {
      const parent = await realpath(tmpdir())
      const root = await mkdtemp(join(parent, 'hbar-startup-phase-observation-'))
      const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
      await ensurePathLayout(layout)
      let storage: Storage | undefined = new Storage(layout.database, layout)
      const events: DiagnosticEvent[] = []
      try {
        await storage.call('ready')
        const workspace = await storage.call('createWorkspace', root, 'startup phase fixture')
        const session = await storage.call('createSession', workspace.id, 'retained projection')
        await storage.call('append', session.id, 'diagnostic.note', { marker: 'retained' })
        await storage.close()
        storage = undefined
        const database = new Database(layout.database)
        let eventId: string
        try {
          const row = database
            .query<{ eventId: string }, [string]>(
              'SELECT eventId FROM session_event_index WHERE sessionId=? ORDER BY seq DESC LIMIT 1',
            )
            .get(session.id)
          if (!row) throw new Error('Missing indexed canonical event fixture')
          eventId = row.eventId
          if (corruptIndex)
            database.query('UPDATE session_event_index SET contentHash=? WHERE eventId=?').run('kept-invalid', eventId)
        } finally {
          database.close()
        }
        storage = new Storage(layout.database, layout, {
          diagnostics: { emit: (event) => events.push(event) },
          diagnosticsFullCoverage: true,
        })
        if (corruptIndex) await expect(storage.call('ready')).rejects.toThrow('SESSION_LOG_CORRUPTED')
        else await storage.call('ready')
        await storage.close()
        storage = undefined
        for (const name of ['sqlite.startup_phase_wall_completed', 'sqlite.startup_phase_process_cpu_completed']) {
          const observed = events.filter((event) => event.event === name && event.phase === 'recovery')
          expect(observed).toHaveLength(1)
          expect(observed[0]?.outcome).toBe(corruptIndex ? 'failure' : 'success')
          expect(Number.isFinite(observed[0]?.durationMs)).toBe(true)
          expect(observed[0]?.durationMs).toBeGreaterThanOrEqual(0)
        }
        expect(events.filter((event) => event.event === 'sqlite.recovery_completed')).toHaveLength(corruptIndex ? 0 : 1)
        if (corruptIndex) {
          const preserved = new Database(layout.database, { readonly: true, strict: true })
          try {
            expect(
              preserved
                .query<{ contentHash: string }, [string]>('SELECT contentHash FROM session_event_index WHERE eventId=?')
                .get(eventId)?.contentHash,
            ).toBe('kept-invalid')
          } finally {
            preserved.close()
          }
        }
      } finally {
        await storage?.close()
      }
      const actual = await realpath(root)
      if (dirname(actual) !== parent || !basename(actual).startsWith('hbar-startup-phase-observation-'))
        throw new Error('Unowned startup observation fixture')
      await rm(root, { recursive: true, force: true })
    },
  )
}
