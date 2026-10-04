import { expect, test } from 'bun:test'
import { describeCommand } from '@hbar/commands'
import { createCommandCatalogClient, type ClientTransport } from '@hbar/client'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import { surfaceCommands } from '@hbar/contracts/commands'

test('generic catalog client preserves descriptor version, request identity and idempotency', async () => {
  const calls: { method: string; params: unknown }[] = []
  const transport = {
    call(method: string, params: unknown) {
      calls.push({ method, params })
      if (method === 'command.catalog') return Promise.resolve({ revision: 3, items: [] })
      return Promise.resolve({ ok: true })
    },
  } as unknown as ClientTransport
  const client = createCommandCatalogClient(transport)
  expect(await client.list({ limit: 200, after: 'mode.get' })).toEqual({ revision: 3, items: [] })
  const descriptor = describeCommand(budgetCommands['session.setBudget'])
  await expect(client.execute(descriptor, { sessionId: 'session-1', tokens: 12 })).rejects.toMatchObject({
    code: 'INVALID_INPUT',
  })
  expect(
    await client.execute(
      descriptor,
      { sessionId: 'session-1', tokens: 12 },
      { requestId: 'request-1', idempotencyKey: 'idempotency-1', version: 1 },
    ),
  ).toEqual({ ok: true })
  expect(calls).toEqual([
    { method: 'command.catalog', params: { limit: 200, after: 'mode.get' } },
    {
      method: 'command.execute',
      params: {
        protocol: 1,
        requestId: 'request-1',
        commandId: 'session.setBudget',
        commandVersion: 1,
        idempotencyKey: 'idempotency-1',
        input: { sessionId: 'session-1', tokens: 12 },
      },
    },
  ])
  await expect(
    client.execute(descriptor, { sessionId: 'session-1', tokens: 12 }, { version: 2, idempotencyKey: 'key' }),
  ).rejects.toMatchObject({ code: 'VERSION_MISMATCH' })
  await expect(
    client.execute(describeCommand(surfaceCommands['app.openPanel']), { panelId: 'status' }),
  ).rejects.toThrow('only executes Host')
})
