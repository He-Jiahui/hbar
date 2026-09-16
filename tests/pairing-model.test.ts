import { afterEach, expect, spyOn, test } from 'bun:test'
import { HbarClient } from '../packages/client/src'
import type { HostInfo } from '../packages/contracts/src'
import { editPairing, submitPairing, usePairing } from '../apps/web/src/pairing-model'
import { useConnection } from '../apps/web/src/stores'

const original = useConnection.getState()
const mocks: { mockRestore(): void }[] = []
afterEach(() => {
  useConnection.setState(original)
  usePairing.setState({ code: '', name: 'hbar Web', busy: false, error: '' })
  for (const mock of mocks.splice(0)) mock.mockRestore()
})
function source() {
  const connection = new HbarClient('http://pairing.invalid')
  useConnection.setState({ client: connection, status: 'pairing' })
  editPairing('code', '1234 5678ignored9')
  editPairing('name', 'test device')
  return connection
}
test('invalid/empty names do not submit; failure retains drafts and permits retry', async () => {
  const connection = source(),
    pair = spyOn(connection, 'pair').mockRejectedValueOnce(new Error('expired'))
  mocks.push(pair)
  editPairing('name', ' ')
  await submitPairing()
  expect(pair).not.toHaveBeenCalled()
  editPairing('name', 'retained name')
  await submitPairing()
  expect(usePairing.getState()).toMatchObject({
    code: '12345678',
    name: 'retained name',
    error: 'expired',
    busy: false,
  })
  pair.mockResolvedValueOnce({} as HostInfo)
  await submitPairing()
  expect(pair).toHaveBeenCalledTimes(2)
  expect(usePairing.getState()).toMatchObject({ code: '', error: '', busy: false })
})
test('duplicate submits coalesce; changed Host aborts and ignores the previous response', async () => {
  const connection = source()
  let resolve!: (host: HostInfo) => void
  const pair = spyOn(connection, 'pair').mockReturnValueOnce(
    new Promise<HostInfo>((done) => {
      resolve = done
    }),
  )
  mocks.push(pair)
  const first = submitPairing(),
    second = submitPairing()
  expect(first).toBe(second)
  await Promise.resolve()
  expect(pair).toHaveBeenCalledTimes(1)
  const signal = pair.mock.calls[0]?.[2]
  editPairing('code', '00000000')
  expect(usePairing.getState().code).toBe('12345678')
  const next = new HbarClient('http://other.invalid')
  useConnection.setState({ client: next, host: null, status: 'pairing' })
  expect(signal?.aborted).toBe(true)
  editPairing('code', '87654321')
  resolve({} as HostInfo)
  await first
  expect(useConnection.getState().host).toBeNull()
  expect(usePairing.getState()).toMatchObject({ code: '87654321', busy: false, error: '' })
})
test('client cancellation prevents an obsolete HTTP result from reconnecting', async () => {
  const connection = new HbarClient('http://obsolete.invalid')
  let resolve!: (value: Response) => void
  const transport = spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done
      }),
    ),
    connect = spyOn(connection, 'connect')
  mocks.push(transport, connect)
  const controller = new AbortController(),
    request = connection.pair('12345678', 'old', controller.signal)
  controller.abort()
  resolve(Response.json({ token: 'obsolete' }))
  await expect(request).rejects.toThrow()
  expect(connect).not.toHaveBeenCalled()
})
