import { expect, test } from 'bun:test'
import { createRunCommandClient } from '@hbar/client'
import { HbarError, type RpcMethod, type RpcParams, type RpcResults } from '@hbar/contracts'
import type { ClientTransport } from '@hbar/client'

function fixture(result: () => Promise<unknown>) {
  const calls: unknown[] = []
  const transport: ClientTransport = {
    async call<M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResults[M]> {
      calls.push({ method, params })
      // Deliberately unchecked wire fixture: the real public Client must validate it.
      return (await result()) as RpcResults[M]
    },
  }
  return { client: createRunCommandClient(transport), calls }
}
const outcome = (promise: Promise<unknown>) => promise.catch((reason: unknown) => reason)

for (const code of ['DISCONNECTED', 'TIMEOUT', 'CONNECTION_CLOSED'])
  test(`cancellation lost ${code} response is unknown and is never retried by Client`, async () => {
    const f = fixture(() => Promise.reject(new HbarError(code, 'private transport data')))
    expect(await outcome(f.client.execute('operation.cancel', { operationId: 'op' }))).toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(f.calls).toHaveLength(1)
  })

for (const response of [
  null,
  {},
  { operationId: 'other', status: 'cancelRequested' },
  { operationId: 'op', status: 'running' },
])
  test(`cancellation malformed acknowledgement is unknown: ${JSON.stringify(response)}`, async () => {
    const f = fixture(() => Promise.resolve(response))
    expect(await outcome(f.client.execute('operation.cancel', { operationId: 'op' }))).toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(f.calls).toHaveLength(1)
  })

test('pre-abort does not dispatch; explicit Host rejection and valid cancelRequested remain distinct', async () => {
  const f = fixture(() => Promise.reject(new HbarError('NOT_FOUND', 'missing')))
  expect(
    await outcome(f.client.execute('operation.cancel', { operationId: 'op' }, { signal: AbortSignal.abort() })),
  ).toMatchObject({ code: 'CANCELLED' })
  expect(f.calls).toHaveLength(0)
  expect(await outcome(f.client.execute('operation.cancel', { operationId: 'op' }))).toMatchObject({
    code: 'NOT_FOUND',
  })
  const accepted = fixture(() => Promise.resolve({ operationId: 'op', status: 'cancelRequested' }))
  expect(await accepted.client.execute('operation.cancel', { operationId: 'op' })).toEqual({
    operationId: 'op',
    status: 'cancelRequested',
  })
  expect(accepted.calls).toHaveLength(1)
})
