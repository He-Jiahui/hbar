import { expect, test } from 'bun:test'
import { loadNativeConnection } from '../apps/web/src/native-connection'

test('ordinary Web clients do not invent native connection credentials', async () => {
  expect(await loadNativeConnection({}, 'http://127.0.0.1:4317')).toBeNull()
})

test('the Tauri bridge supplies a bounded same-origin local connection', async () => {
  const calls: string[] = []
  const connection = await loadNativeConnection(
    {
      __TAURI_INTERNALS__: {
        async invoke(command: string) {
          calls.push(command)
          return { url: 'http://127.0.0.1:4317/path-is-normalized', token: 'native-token', instanceId: 'host-1' }
        },
      },
    },
    'http://127.0.0.1:4317',
  )

  expect(calls).toEqual(['connection_info'])
  expect(connection).toEqual({ url: 'http://127.0.0.1:4317', token: 'native-token', instanceId: 'host-1' })
})

test('native credentials cannot cross origins or escape the loopback Host', async () => {
  const bridge = (url: string) => ({
    __TAURI_INTERNALS__: {
      async invoke() {
        return { url, token: 'native-token', instanceId: 'host-1' }
      },
    },
  })

  await expect(loadNativeConnection(bridge('http://127.0.0.1:4318'), 'http://127.0.0.1:4317')).rejects.toThrow(
    'does not match',
  )
  await expect(loadNativeConnection(bridge('https://example.test'), 'https://example.test')).rejects.toThrow(
    'does not match',
  )
  await expect(
    loadNativeConnection(
      {
        __TAURI_INTERNALS__: {
          async invoke() {
            return { url: 'http://127.0.0.1:4317', token: '', instanceId: 'host-1' }
          },
        },
      },
      'http://127.0.0.1:4317',
    ),
  ).rejects.toThrow('invalid')
})
