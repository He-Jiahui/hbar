import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { emptyUsage, runSchema, sessionEventSchema } from '@hbar/contracts'
import { usageQueryInputSchema } from '@hbar/contracts/commands/usage'
import { Storage } from '@hbar/storage'
import { UsageService, type UsageReadInput } from '@hbar/usage'
import { IpcPeer, RuntimeValuePort } from '@hbar/runtime'

const inputSchema = z.object({
  scope: z.object({ kind: z.literal('session'), sessionId: z.string(), includeDescendants: z.boolean() }),
  from: z.number(),
  to: z.number(),
  limit: z.number(),
  after: z.object({ time: z.number(), eventId: z.string() }).optional(),
})
const pageSchema = z.object({
  items: z.array(
    z.object({
      event: sessionEventSchema,
      workspaceId: z.string(),
      parentSessionId: z.string().nullable(),
      run: runSchema.pick({ id: true, modelId: true, status: true, startedAt: true, endedAt: true }).nullable(),
    }),
  ),
  hasMore: z.boolean(),
  next: z.object({ time: z.number(), eventId: z.string() }).optional(),
})

test('real Worker usage pages cross unchanged managed IPC with 8MiB irrelevant data and retain every accounting event', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-usage-ipc-'))
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-usage-ipc-'))
    throw new Error('UNOWNED_USAGE_FIXTURE')
  const storage = new Storage(join(root, 'fixture.sqlite'))
  let right: IpcPeer | undefined
  const left = new IpcPeer({
    owner: { unitId: 'base', generation: 1, incarnation: 'usage-base' },
    remote: { unitId: 'usage', generation: 1, incarnation: 'usage-worker' },
    transport: {
      send(frame) {
        right?.receive(frame)
      },
    },
  })
  right = new IpcPeer({
    owner: left.remote,
    remote: left.owner,
    transport: {
      send(frame) {
        left.receive(frame)
      },
    },
  })
  const local = new RuntimeValuePort(left, { prefix: 'usage.fixture' })
  const remote = new RuntimeValuePort(right, { prefix: 'usage.fixture' })
  const failures: unknown[] = []
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'usage')
    const session = await storage.call('createSession', workspace.id)
    const foreign = await storage.call('createSession', workspace.id)
    const run = await storage.call(
      'enqueue',
      session.id,
      'usage-run',
      { text: 'x'.repeat(180000), images: [] },
      'fixture/model',
    )
    const descriptor = {
      attemptId: 'large-request',
      source: 'model',
      providerId: 'fixture',
      modelId: 'model',
      modelSelectionId: 'fixture/model',
      pricing: {
        available: false,
        currency: 'USD',
        inputPerMillion: 0,
        outputPerMillion: 0,
        cacheReadPerMillion: null,
        cacheWritePerMillion: null,
        source: 'provider-config',
        version: 'fixture',
        effectiveAt: null,
      },
    }
    // This field is not read by descriptor(); it must remain stored but never cross usage IPC.
    await storage.call(
      'append',
      session.id,
      'request.started',
      { ...descriptor, messages: 'x'.repeat(8 * 1024 * 1024) },
      run.id,
    )
    for (let index = 0; index < 260; index++)
      await storage.call('append', session.id, 'usage.recorded', { ...emptyUsage(), input: 1, output: 2 }, run.id)
    await storage.call('append', foreign.id, 'usage.recorded', { ...emptyUsage(), input: 999, output: 999 })
    remote.register('read', ([value]) => storage.call('usageEvents', inputSchema.parse(value)))
    let pages = 0
    const service = new UsageService({
      async read(input: UsageReadInput) {
        const result = pageSchema.parse(await local.call('read', [input]))
        pages++
        expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(513 * 1024)
        expect(JSON.stringify(result)).not.toContain('x'.repeat(1024))
        return result
      },
    })
    const report = await service.query(
      usageQueryInputSchema.parse({
        scope: { kind: 'session', sessionId: session.id, includeDescendants: false },
        from: 0,
        to: Date.now() + 1,
        maxSamples: 1000,
        maxBuckets: 1,
      }),
    )
    expect(pages).toBeGreaterThan(1)
    expect(report.gap).toBe(false)
    expect(report.totals.input).toBe(260)
    expect(report.totals.output).toBe(520)
  } catch (error) {
    failures.push(error)
  }
  local.dispose()
  remote.dispose()
  left.close()
  right?.close()
  try {
    await storage.close()
  } catch (error) {
    failures.push(error)
  }
  try {
    await rm(root, { recursive: true, force: true })
  } catch (error) {
    failures.push(error)
  }
  if (failures.length) throw new AggregateError(failures, 'Usage IPC fixture or cleanup failed', { cause: failures[0] })
})
