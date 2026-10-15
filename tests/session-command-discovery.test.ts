import { expect, test } from 'bun:test'
import { z } from 'zod'
import { createCommandRouter, defineCommand, describeCommand, type CommandDescriptor } from '@hbar/commands'
import { cliLocalCommands } from '@hbar/contracts/commands/cli-catalog'
import { HbarError } from '@hbar/contracts'
import { SessionCommandDiscovery, mergeSessionCommandCatalog } from '../apps/host/src/session-command-discovery'

function descriptor(id: string): CommandDescriptor {
  return describeCommand(
    defineCommand(
      {
        id,
        owner: 'discovery.fixture',
        version: 1,
        kind: 'query',
        execution: 'host',
        stateEffect: 'none',
        scope: 'global',
        category: 'discovery.fixture',
        titleKey: id,
        descriptionKey: id,
        surfaces: ['api', 'cli'],
      },
      z.strictObject({}),
      z.strictObject({}),
    ),
  )
}

function router(ids: readonly string[]) {
  const entries = ids.map(descriptor)
  return createCommandRouter({
    catalogs: () => [{ revision: 1, items: entries }],
    resolve: (id) => {
      const found = entries.find((entry) => entry.metadata.id === id)
      return found
        ? {
            describe: () => found,
            dispatch: async () => {
              throw new Error('Discovery executed a command')
            },
          }
        : undefined
    },
  })
}

test('session discovery enumerates the full public CLI/Host union once across small mixed-case pages', async () => {
  const ids = ['fixture.aB', 'fixture.aa', 'fixture.ab', 'fixture.bA', 'fixture.ba']
  const host = router(ids)
  const discovery = new SessionCommandDiscovery()
  const detach = discovery.attach(host)
  try {
    const expected = [
      ...new Set([
        ...ids,
        ...Object.values(cliLocalCommands)
          .filter((definition) => definition.metadata.visibility !== 'internal')
          .map((definition) => definition.metadata.id),
      ]),
    ].sort()
    const seen: string[] = []
    let after: string | undefined
    do {
      const page = await discovery.list({ limit: 3, ...(after ? { after } : {}) }, new AbortController().signal)
      expect(page.items.length).toBeLessThanOrEqual(3)
      seen.push(...page.items.map((item) => item.metadata.id))
      after = page.nextCursor
      expect(seen.length).toBeLessThan(10_000)
    } while (after)
    expect(seen).toEqual(expected)
    const local = await discovery.describe('app.openPanel', new AbortController().signal)
    expect(local.metadata.execution).toBe('client')
    expect((await discovery.describe('fixture.aB', new AbortController().signal)).metadata.execution).toBe('host')
    expect(Object.values(cliLocalCommands).some((definition) => definition.metadata.execution === 'platform')).toBe(
      true,
    )
    expect(
      (await discovery.list({ category: 'discovery.fixture' }, new AbortController().signal)).items.map(
        (item) => item.metadata.id,
      ),
    ).toEqual(ids)
  } finally {
    detach()
    discovery.close()
  }
})

test('byte-limited Host prefixes never let local definitions jump over unread Host IDs', () => {
  const first = descriptor('aaa.first')
  const page = mergeSessionCommandCatalog({ limit: 50 }, { revision: 1, items: [first], nextCursor: first.metadata.id })
  expect(page.items.map((item) => item.metadata.id)).toEqual(['aaa.first'])
  expect(page.nextCursor).toBe('aaa.first')
  const next = mergeSessionCommandCatalog(
    { after: page.nextCursor, limit: 200 },
    { revision: 1, items: [descriptor('zzz.last')] },
  )
  expect(next.items.some((item) => item.metadata.id === 'app.openPanel')).toBe(true)
  expect(next.items.at(-1)?.metadata.id).toBe('zzz.last')
  expect(() => mergeSessionCommandCatalog({}, { revision: 1, items: [first], nextCursor: 'zzz.skipped' })).toThrow(
    'cursor',
  )
  expect(() => mergeSessionCommandCatalog({ after: 'bbb.after' }, { revision: 1, items: [first] })).toThrow('advance')
})

test('startup discovery waits for the listener and settles cancellation, timeout, capacity and shutdown', async () => {
  const discovery = new SessionCommandDiscovery(25)
  const signal = new AbortController()
  const pending = discovery.list({ category: 'discovery.fixture' }, signal.signal)
  discovery.attach(router(['fixture.read']))
  expect((await pending).items[0]?.metadata.id).toBe('fixture.read')
  discovery.close()
  const waiting = new SessionCommandDiscovery(25)
  const controller = new AbortController()
  const aborted = waiting.describe('fixture.read', controller.signal).catch((error: unknown) => error)
  controller.abort(new HbarError('FIXTURE_CANCELLED', 'Cancelled discovery'))
  expect(await aborted).toMatchObject({ code: 'FIXTURE_CANCELLED' })
  await expect(waiting.list({}, new AbortController().signal)).rejects.toMatchObject({
    code: 'COMMAND_CATALOG_UNAVAILABLE',
  })
  const longWait = new SessionCommandDiscovery()
  const requests = Array.from({ length: 32 }, () =>
    longWait.list({}, new AbortController().signal).catch((error: unknown) => error),
  )
  await expect(longWait.list({}, new AbortController().signal)).rejects.toMatchObject({ code: 'COMMAND_CATALOG_BUSY' })
  longWait.close()
  expect(
    (await Promise.all(requests)).every((value) => value instanceof HbarError && value.code === 'HOST_SHUTTING_DOWN'),
  ).toBe(true)
  await expect(longWait.describe('fixture.read', new AbortController().signal)).rejects.toMatchObject({
    code: 'HOST_SHUTTING_DOWN',
  })
  waiting.close()
})

test('an old listener disposer cannot remove its replacement command router', async () => {
  const discovery = new SessionCommandDiscovery()
  const old = discovery.attach(router(['fixture.old']))
  const current = discovery.attach(router(['fixture.current']))
  old()
  expect((await discovery.describe('fixture.current', new AbortController().signal)).metadata.id).toBe(
    'fixture.current',
  )
  current()
  discovery.close()
})
