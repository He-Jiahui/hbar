import { expect, test } from 'bun:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupNativeSessionFixture } from '../scripts/native-fixture-cleanup'

test('native cleanup retries only transient locks and retains its final failure', async () => {
  for (const code of ['EBUSY', 'EPERM', 'ENOTEMPTY', 'EIO']) {
    let attempts = 0
    let delays = 0
    const failure = Object.assign(new Error('Locked'), { code })
    let actual: unknown
    try {
      await cleanupNativeSessionFixture(join(tmpdir(), 'hbar-native-session-cleanup-fixture'), {
        remove: async () => {
          attempts++
          throw failure
        },
        delay: async () => {
          delays++
        },
      })
    } catch (error) {
      actual = error
    }
    expect(actual).toBe(failure)
    expect(attempts).toBe(code === 'EIO' ? 1 : 41)
    expect(delays).toBe(attempts - 1)
  }
})

test('native cleanup resolves a released lock and refuses broad paths before removal', async () => {
  let attempts = 0
  await cleanupNativeSessionFixture(join(tmpdir(), 'hbar-native-session-cleanup-fixture'), {
    remove: async () => {
      if (attempts++ < 2) throw Object.assign(new Error('Locked'), { code: 'EBUSY' })
    },
    delay: async () => {},
  })
  expect(attempts).toBe(3)
  let removed = false
  let failure: unknown
  try {
    await cleanupNativeSessionFixture(tmpdir(), {
      remove: async () => {
        removed = true
      },
    })
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(Error)
  expect(removed).toBe(false)
})
