import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { sessionEventPageInputSchema, sessionEventPageSchema } from '@hbar/contracts'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { AUTONOMY_DECISION_MODE_SETTING } from '@hbar/contracts/autonomy'
import { encodePath } from '@hbar/schema-core'
import { Storage, type StoragePort } from '@hbar/storage'

async function removeOwned(root: string): Promise<void> {
  const path = relative(resolve(tmpdir()), resolve(root))
  if (path.startsWith('..') || !path.startsWith('hbar-automation-paging-'))
    throw new Error('Refuse unowned automation fixture removal')
  await rm(root, { recursive: true, force: true })
}

test('Kernel restoration reads past two thousand canonical events and retains the latest automation controls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-automation-paging-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  let kernel: Kernel | undefined
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'automation replay')
    const session = await storage.call('createSession', workspace.id)
    await storage.call('append', session.id, 'automation.changed', {
      sessionId: session.id,
      unattended: true,
      goalEnabled: true,
    })
    for (let index = 0; index < 2_001; index++)
      await storage.call('append', session.id, 'automation.historyMarker', { index })
    const last = await storage.call('append', session.id, 'automation.changed', {
      sessionId: session.id,
      unattended: true,
      goalEnabled: false,
    })
    expect(last.seq).toBeGreaterThan(2_000)
    const eventPages: {
      afterSeq: number
      types: string[]
      throughSeq: number
      totalEventCount: number
      matchingEventCount: number
    }[] = []
    const port: StoragePort = {
      async call(method, ...args) {
        const result = await storage.call(method, ...args)
        if (method === 'readEventPage') {
          const input = sessionEventPageInputSchema.parse(args[0])
          const page = sessionEventPageSchema.parse(result)
          eventPages.push({
            afterSeq: input.afterSeq,
            types: input.types,
            throughSeq: page.throughSeq,
            totalEventCount: page.totalEventCount,
            matchingEventCount: page.matchingEventCount,
          })
        }
        return result
      },
      close: async () => {},
    }
    kernel = await Kernel.create({
      home: join(root, 'data'),
      demo: true,
      lifecycle: 'managed',
      secrets: new MemorySecrets(),
      profile: { createStorage: async () => port },
    })
    expect(await kernel.automationGet(session.id)).toMatchObject({ unattended: true, goalEnabled: false })
    const settings = new SettingsService(storage)
    const policy = await settings.decisionPolicy(session.id)
    expect(policy).toMatchObject({ policy: { mode: 'recommended' }, source: 'session' })
    const modePath = [{ kind: 'field' as const, name: AUTONOMY_DECISION_MODE_SETTING }]
    const migrated = await settings.get({ kind: 'session', targetId: session.id })
    expect(migrated.resolution.reports[encodePath(modePath)]?.effectiveValue).toBe('recommended')
    await settings.apply({
      schemaVersion: 1,
      scope: migrated.scope,
      baselineRevisions: migrated.revisions,
      changes: [{ op: 'unset', path: modePath }],
      actorId: 'fixture',
      idempotencyKey: 'inherit-after-migration',
    })
    expect(await kernel.automationGet(session.id)).toMatchObject({ unattended: false })
    await kernel.automationSet(session.id, undefined, true)
    expect((await settings.decisionPolicy(session.id)).policy.mode).toBe('wait_user')
    expect(eventPages).toContainEqual({
      afterSeq: 0,
      types: ['automation.changed'],
      throughSeq: last.seq,
      totalEventCount: last.seq,
      matchingEventCount: 2,
    })
    expect(kernel.active.size).toBe(0)
    expect((await storage.call('events', session.id, last.seq, 128)).map((event) => event.type)).toEqual([
      'automation.changed',
    ])
  } finally {
    await kernel?.close()
    await storage.close()
    await removeOwned(root)
  }
}, 60_000)
