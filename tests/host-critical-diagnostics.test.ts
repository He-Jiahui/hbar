import { expect, test } from 'bun:test'
import { mkdtemp, readFile, realpath, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { diagnosticEventSchema } from '@hbar/contracts'
import { createHostRuntimeDiagnostics, type HostRuntimeDiagnostics } from '../apps/host/src/runtime-diagnostics'
async function fixture(
  action: (root: string, own: (runtime: HostRuntimeDiagnostics) => HostRuntimeDiagnostics) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-critical-diagnostics-'))
  const owned: HostRuntimeDiagnostics[] = []
  let failed = false,
    primary: unknown
  const cleanup: unknown[] = []
  try {
    await action(root, (runtime) => {
      owned.push(runtime)
      return runtime
    })
  } catch (error) {
    failed = true
    primary = error
  }
  for (const runtime of owned) {
    try {
      await runtime.close()
    } catch (error) {
      cleanup.push(error)
    }
  }
  try {
    const resolved = await realpath(root),
      temporary = await realpath(tmpdir())
    if (
      dirname(resolved).toLowerCase() !== temporary.toLowerCase() ||
      !basename(resolved).startsWith('hbar-critical-diagnostics-')
    )
      throw new Error('Refusing unowned fixture cleanup')
    await rm(resolved, { recursive: true, force: true })
  } catch (error) {
    cleanup.push(error)
  }
  if (failed) {
    if (cleanup.length)
      throw new AggregateError([primary, ...cleanup], 'Diagnostic fixture operation and cleanup failed', {
        cause: primary,
      })
    throw primary
  }
  if (cleanup.length) throw new AggregateError(cleanup, 'Diagnostic fixture cleanup failed')
}
async function until(check: () => boolean) {
  const end = Date.now() + 2000
  while (!check()) {
    if (Date.now() >= end) throw new Error('Journal fixture progress deadline')
    await Bun.sleep(1)
  }
}
test('fixed critical failure survives ordinary rotations and excludes nonprojected canary fields', () =>
  fixture(async (root, own) => {
    const runtime = own(
      createHostRuntimeDiagnostics({
        root,
        maxBytes: 1024,
        retention: 1,
        enabled: true,
        fullCoverage: true,
        instanceId: 'fixed-instance',
      }),
    )
    runtime.emit({
      event: 'host.runtime_driver_callback',
      level: 'error',
      phase: 'source_logical_settled',
      method: 'driver.callback.emit',
      errorCode: 'IPC_TIMEOUT',
      outcome: 'failure',
      runId: crypto.randomUUID(),
      rpcId: crypto.randomUUID(),
      admissionLane: 'leaf',
      admissionActive: 2,
      admissionUnconfirmed: 1,
      queueDepth: 8,
      budgetMs: 30000,
      remainingBudgetMs: 0,
      modelSelectionId: 'EXCLUDED_CANARY',
    })
    for (let batch = 0; batch < 24; batch++) {
      for (let index = 0; index < 12; index++)
        runtime.emit({
          event: 'host.ordinary',
          level: 'debug',
          outcome: 'success',
          requestId: 'ordinary-' + batch + '-' + index,
        })
      await until(() => runtime.snapshot().queued === 0)
    }
    await runtime.close()
    const ordinary = (await readdir(root)).filter(
      (name) => name === 'hbar-host-diagnostics.jsonl' || /^hbar-host-diagnostics\.jsonl\.[0-9]+$/.test(name),
    )
    const bodies = await Promise.all(ordinary.map((name) => readFile(join(root, name), 'utf8')))
    expect(bodies.join('')).not.toContain('EXCLUDED_CANARY')
    const critical = await readFile(runtime.criticalFilePath, 'utf8')
    expect(critical).not.toContain('EXCLUDED_CANARY')
    const records = critical
      .trim()
      .split('\n')
      .map((line) => diagnosticEventSchema.parse(JSON.parse(line) as unknown))
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      event: 'host.runtime_driver_callback',
      phase: 'source_logical_settled',
      admissionLane: 'leaf',
      admissionActive: 2,
      admissionUnconfirmed: 1,
      queueDepth: 8,
      budgetMs: 30000,
      remainingBudgetMs: 0,
      errorCode: 'IPC_TIMEOUT',
    })
    expect(runtime.criticalSnapshot()).toMatchObject({ closed: true, queued: 0, dropped: 0, writeFailures: 0 })
    expect(critical).not.toContain('host.ordinary')
  }))
test('critical fixed allowlist rejects unrelated error floods and reports bounded queue drops', () =>
  fixture(async (root, own) => {
    const runtime = own(createHostRuntimeDiagnostics({ root, enabled: true, fullCoverage: true }))
    runtime.emit({ event: 'host.unrelated', level: 'fatal', outcome: 'failure' })
    expect(runtime.criticalSnapshot().queued).toBe(0)
    for (let index = 0; index < 400; index++)
      runtime.emit({
        event: 'host.runtime_entry_call_timeout',
        level: 'error',
        outcome: 'failure',
        phase: 'queued',
        errorCode: 'RUNTIME_CALL_TIMEOUT',
        pending: index,
      })
    expect(runtime.criticalSnapshot().queued).toBeLessThanOrEqual(128)
    expect(runtime.criticalSnapshot().ringEntries).toBeLessThanOrEqual(128)
    expect(runtime.criticalSnapshot().dropped).toBeGreaterThan(0)
    await runtime.close(2000)
    expect(runtime.snapshot().closed).toBe(true)
    expect(runtime.criticalSnapshot().closed).toBe(true)
    const critical = await readFile(runtime.criticalFilePath, 'utf8')
    expect(critical).not.toContain('host.unrelated')
  }))
test('both bounded writers expose write failures without propagating them into callers', () =>
  fixture(async (root, own) => {
    const blocked = join(root, 'not-directory')
    await writeFile(blocked, 'owned fixture')
    const runtime = own(createHostRuntimeDiagnostics({ root: blocked, enabled: true }))
    expect(() =>
      runtime.emit({
        event: 'host.runtime_entry_stop',
        level: 'error',
        outcome: 'failure',
        errorCode: 'RUNTIME_ENTRY_STOP',
      }),
    ).not.toThrow()
    const receipt = await runtime.close(2000)
    expect(receipt.normal.writeFailures).toBeGreaterThan(0)
    expect(receipt.critical.writeFailures).toBeGreaterThan(0)
    expect(receipt.writeFailures).toBe(receipt.normal.writeFailures + receipt.critical.writeFailures)
    expect(runtime.snapshot().writeFailures).toBeGreaterThan(0)
    expect(runtime.criticalSnapshot().writeFailures).toBeGreaterThan(0)
    expect(runtime.criticalSnapshot().queued).toBe(0)
  }))
test('one bounded close starts both journals and reports both closed without a second serial drain budget', () =>
  fixture(async (root, own) => {
    const runtime = own(createHostRuntimeDiagnostics({ root, enabled: true, fullCoverage: true }))
    for (let index = 0; index < 400; index++)
      runtime.emit({
        event: 'host.runtime_driver_callback',
        level: 'error',
        outcome: 'failure',
        errorCode: 'IPC_TIMEOUT',
      })
    await runtime.close(1)
    expect(runtime.snapshot().closed).toBe(true)
    expect(runtime.criticalSnapshot().closed).toBe(true)
    expect(runtime.snapshot().queued).toBe(0)
    expect(runtime.criticalSnapshot().queued).toBe(0)
    expect(runtime.criticalSnapshot().dropped).toBeGreaterThan(0)
  }))

test('critical journal preserves explicit disabled coverage and the existing error always-on contract', () =>
  fixture(async (root, own) => {
    const runtime = own(createHostRuntimeDiagnostics({ root, enabled: false, fullCoverage: false }))
    runtime.emit({
      event: 'host.runtime_driver_callback',
      level: 'debug',
      outcome: 'failure',
      phase: 'source_logical_settled',
    })
    expect(runtime.criticalSnapshot().queued).toBe(0)
    runtime.emit({
      event: 'host.runtime_driver_callback',
      level: 'error',
      outcome: 'failure',
      errorCode: 'IPC_TIMEOUT',
    })
    const receipt = await runtime.close()
    expect(receipt.normal.enabled).toBe(false)
    expect(receipt.critical.enabled).toBe(false)
    expect(receipt.normal.fullCoverage).toBe(false)
    expect(receipt.critical.fullCoverage).toBe(false)
    expect(receipt.closed).toBe(true)
    expect(receipt.critical.closed).toBe(true)
    const text = await readFile(runtime.criticalFilePath, 'utf8')
    expect(text.trim().split('\n')).toHaveLength(1)
    expect(text).toContain('IPC_TIMEOUT')
    expect(text).not.toContain('source_logical_settled')
  }))
