import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'
import { createRuntimeControllerServices } from '../apps/host/src/runtime-controller-services'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import {
  CommandRegistry,
  createCommandRouter,
  defineCommand,
  describeCommand,
  MAX_COMMAND_CATALOG_BYTES,
  type CommandDescriptor,
  type CommandRoute,
} from '@hbar/commands'

function definition(id: string, extra: { hidden?: boolean; category?: string; description?: string } = {}) {
  return defineCommand(
    {
      id,
      version: 1,
      owner: 'routing.fixture',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: extra.category ?? 'routing.fixture',
      titleKey: id,
      descriptionKey: id,
      scope: 'global',
      visibility: extra.hidden ? 'internal' : 'public',
      surfaces: ['api', 'cli'],
    },
    z.strictObject({ text: z.string().describe(extra.description ?? 'Text') }),
    z.strictObject({ value: z.string() }),
  )
}

function fixtures(ids: readonly string[]) {
  const registry = new CommandRegistry({ execution: 'host' })
  const routes = new Map<string, CommandRoute>()
  for (const id of ids) {
    const item = definition(id)
    registry.register(item, ({ text }, context) => ({ value: `${context.actorId ?? 'missing'}:${text}` }))
    routes.set(id, {
      describe: () => registry.describe(id),
      dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
    })
  }
  const router = createCommandRouter({
    catalogs: () => [registry.list({ limit: 500, includeInternal: true })],
    resolve: (id) => routes.get(id),
  })
  return { registry, routes, router }
}

test('public routing uses one cursor order across mixed-case names without gaps or duplicates', () => {
  const ids = ['fixture.aB', 'fixture.aa', 'fixture.ab', 'fixture.bA', 'fixture.ba']
  const { registry, router } = fixtures(ids)
  try {
    for (const limit of [1, 2, 3, 5]) {
      const seen: string[] = []
      let after: string | undefined
      do {
        const page = router.list({ limit, ...(after ? { after } : {}) })
        expect(page.revision).toBe(registry.revision)
        seen.push(...page.items.map(({ metadata }) => metadata.id))
        after = page.nextCursor
      } while (after)
      expect(seen).toEqual(ids)
    }
    expect(router.list({ after: 'fixture.zz' }).items).toEqual([])
    expect(() => router.list({ limit: 201 })).toThrow()
    expect(() => router.describe('fixture.unknown')).toThrow('not registered')
  } finally {
    registry.dispose()
  }
})

test('routing keeps the actor outside input and retains owner schema/version failures', async () => {
  const { registry, router } = fixtures(['fixture.read'])
  const invocation = {
    protocol: 1,
    requestId: 'route-request',
    commandId: 'fixture.read',
    commandVersion: 1,
    input: { text: 'hello' },
  }
  try {
    expect(await router.execute(invocation, 'host-run-actor')).toEqual({ value: 'host-run-actor:hello' })
    await expect(router.execute({ ...invocation, actorId: 'spoofed' }, 'host-run-actor')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    await expect(router.execute(invocation, '')).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(router.execute({ ...invocation, commandVersion: 2 }, 'actor')).rejects.toMatchObject({
      code: 'VERSION_MISMATCH',
    })
    await expect(router.execute({ ...invocation, input: { text: 4 } }, 'actor')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    await expect(
      router.execute({ ...invocation, input: { text: 'x'.repeat(262_144) } }, 'actor'),
    ).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' })
    registry.dispose()
    await expect(router.execute(invocation, 'actor')).rejects.toMatchObject({ code: 'DISPOSED' })
  } finally {
    registry.dispose()
  }
})

test('catalogs hide internal commands and deduplicate IDs using the currently resolved owner', async () => {
  const base = definition('fixture.read')
  let descriptor = describeCommand(base)
  const hidden = describeCommand(definition('fixture.hidden', { hidden: true }))
  let invoked = 0
  const router = createCommandRouter({
    catalogs: () => [
      { revision: 1, items: [descriptor, hidden] },
      { revision: 2, items: [descriptor] },
    ],
    resolve: (id) =>
      id === descriptor.metadata.id || id === hidden.metadata.id
        ? {
            describe: () => (id === hidden.metadata.id ? hidden : descriptor),
            dispatch: async () => ({ invoked: ++invoked }),
          }
        : undefined,
  })
  expect(router.list().items.map(({ metadata }) => metadata.id)).toEqual(['fixture.read'])
  expect(router.list().revision).toBe(3)
  expect(router.describe('fixture.hidden').metadata.visibility).toBe('internal')
  expect(router.list({ category: 'absent' }).items).toEqual([])
  descriptor = describeCommand(definition('fixture.read', { category: 'routing.other' }))
  expect(router.describe('fixture.read').metadata.category).toBe('routing.other')
  expect(router.list({ category: 'routing' }).items).toHaveLength(1)
  const invocation = {
    protocol: 1,
    requestId: 'new-generation',
    commandId: 'fixture.read',
    commandVersion: 1,
    input: { text: '' },
  }
  expect(await router.execute(invocation, 'actor')).toEqual({ invoked: 1 })
})

test('catalog pages stop at byte capacity and keep a usable cursor for the next descriptor', () => {
  const items = Array.from({ length: 8 }, (_, index) =>
    describeCommand(definition(`fixture.large${index}`, { description: '字'.repeat(30_000) })),
  )
  const byId = new Map(items.map((item) => [item.metadata.id, item]))
  const router = createCommandRouter({
    catalogs: () => [{ revision: 1, items }],
    resolve: (id) => {
      const descriptor = byId.get(id)
      return descriptor ? { describe: () => descriptor, dispatch: async () => null } : undefined
    },
  })
  const seen: string[] = []
  let after: string | undefined
  do {
    const page = router.list({ limit: 200, ...(after ? { after } : {}) })
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.length).toBeLessThan(8)
    expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThanOrEqual(MAX_COMMAND_CATALOG_BYTES)
    seen.push(...page.items.map(({ metadata }) => metadata.id))
    after = page.nextCursor
  } while (after)
  expect(seen).toEqual(items.map(({ metadata }) => metadata.id))
})

test('catalog source, descriptor and identity bounds fail explicitly', () => {
  const descriptor = describeCommand(definition('fixture.read'))
  const resolve = () => ({ describe: () => descriptor, dispatch: async () => null })
  expect(() =>
    createCommandRouter({
      catalogs: () => Array.from({ length: 129 }, () => ({ revision: 0, items: [] })),
      resolve,
    }).list(),
  ).toThrow('source capacity')
  expect(() => createCommandRouter({ catalogs: () => [{ revision: -1, items: [] }], resolve }).list()).toThrow(
    'revision',
  )
  expect(() =>
    createCommandRouter({
      catalogs: () => [{ revision: 1, items: Array.from({ length: 10_001 }, () => descriptor) }],
      resolve,
    }).list(),
  ).toThrow('capacity')
  const oversized: CommandDescriptor = {
    ...descriptor,
    inputSchema: { description: 'x'.repeat(MAX_COMMAND_CATALOG_BYTES) },
  }
  expect(() =>
    createCommandRouter({
      catalogs: () => [],
      resolve: () => ({ describe: () => oversized, dispatch: async () => null }),
    }).describe('fixture.read'),
  ).toThrow('routing bounds')
  expect(() => createCommandRouter({ catalogs: () => [], resolve }).describe('fixture.wrong')).toThrow(
    'another identity',
  )
})

test('the live Host port and authenticated RPC share discovery, actor identity and a persistent receipt', async () => {
  const prefix = 'hbar-command-routing-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const operator = await host.auth.createDevice('router fixture')
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`, operator.token)
  try {
    await client.connect()
    let after: string | undefined
    const ids: string[] = []
    do {
      const query = { limit: 7, ...(after ? { after } : {}) }
      const remote = await client.call('command.catalog', query)
      expect(remote).toEqual(host.commands.list(query))
      for (const item of remote.items) {
        expect(item.metadata.visibility).not.toBe('internal')
        ids.push(item.metadata.id)
      }
      after = remote.nextCursor
      expect(ids.length).toBeLessThan(10_000)
    } while (after)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('file.write')
    expect(ids).toContain('session.setBudget')
    expect(ids).toContain('system.paths.get')
    expect(ids).toContain('node.list')
    expect(await client.call('command.describe', { commandId: 'session.setBudget' })).toEqual(
      host.commands.describe('session.setBudget'),
    )
    const workspace = (await client.call('system.bootstrap', {})).workspaces[0]
    if (!workspace) throw new Error('Router fixture has no workspace')
    const session = await createWorkspaceSessionCommandClient(client).execute(
      'session.create',
      {
        workspaceId: workspace.id,
        title: 'Shared command receipt',
      },
      { idempotencyKey: 'router-session' },
    )
    const invocation = {
      protocol: 1 as const,
      requestId: 'router-budget',
      commandId: 'session.setBudget',
      commandVersion: 1,
      idempotencyKey: 'router-budget',
      input: { sessionId: session.id, tokens: 1000 },
    }
    const direct = budgetCommands['session.setBudget'].output.parse(
      await host.commands.execute(invocation, operator.device.id),
    )
    expect(await client.call('command.execute', invocation)).toEqual(direct)
    expect(
      await client.call('command.getReceipt', {
        commandId: 'session.setBudget',
        sessionId: session.id,
        idempotencyKey: 'router-budget',
      }),
    ).toEqual(direct)
  } finally {
    client.disconnect()
    await host.close()
    await kernel.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})

test('stable Host commands do not consult an unavailable Controller catalog', async () => {
  const prefix = 'hbar-command-routing-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let unavailable = false
  const application = createRuntimeControllerServices({
    catalog() {
      if (unavailable) throw new Error('Controller fixture is unavailable')
      return { revision: 0, items: [] }
    },
    call: async () => {
      throw new Error('Stable Host commands must not invoke the Controller')
    },
    start: async () => {},
    stop: async () => {},
  })
  const host = await startServer(kernel, {
    port: 0,
    controller: {
      application,
      dispatch: async () => {
        throw new Error('This test uses the trusted in-process Host port')
      },
    },
  })
  try {
    unavailable = true
    expect(host.commands.describe('system.paths.get').metadata.execution).toBe('host')
    const result = await host.commands.execute(
      {
        protocol: 1,
        requestId: 'stable-host-routing',
        commandId: 'system.paths.get',
        commandVersion: 1,
        input: {},
      },
      'host-fixture-actor',
    )
    expect(result).toHaveProperty('dataRoot', join(root, 'data'))
    expect(() => host.commands.list()).toThrow('Controller fixture is unavailable')
  } finally {
    await host.close()
    await kernel.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})
