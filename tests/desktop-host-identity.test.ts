import { expect, test } from 'bun:test'
import { HbarError, type Device } from '@hbar/contracts'
import { desktopConnection, desktopConnectionToken, resolveDesktopDevice } from '../apps/host/src/desktop-connection.ts'

test('desktop connection records both live Host and supervisor identities without conflating them', () => {
  const connection = desktopConnection('http://127.0.0.1:4321', 'fixture-token', 'fixture-instance', true)
  expect(connection).toEqual({
    url: 'http://127.0.0.1:4321',
    token: 'fixture-token',
    instanceId: 'fixture-instance',
    pid: process.pid,
    supervisorPid: process.ppid,
  })
  expect(connection.supervisorPid).toBeGreaterThan(0)
  expect(connection.supervisorPid).not.toBe(connection.pid)
})

test('direct desktop Hosts preserve the legacy connection shape without a fabricated supervisor', () => {
  const connection = desktopConnection('http://127.0.0.1:4321', 'fixture-token', 'fixture-instance', false)
  expect(connection.pid).toBe(process.pid)
  expect(connection).not.toHaveProperty('supervisorPid')
})

test('desktop connection token parsing accepts only a bounded persisted credential', () => {
  expect(desktopConnectionToken({ token: 'persisted-token' })).toBe('persisted-token')
  expect(desktopConnectionToken({ token: '' })).toBeUndefined()
  expect(desktopConnectionToken({ token: 'x'.repeat(513) })).toBeUndefined()
  expect(desktopConnectionToken({ token: 42 })).toBeUndefined()
  expect(desktopConnectionToken(null)).toBeUndefined()
  expect(desktopConnectionToken('persisted-token')).toBeUndefined()
})

const fixtureDevice: Device = { id: 'device-a', name: 'hbar desktop', createdAt: 1, lastSeenAt: 1 }

test('desktop device resolution reuses valid credentials and replaces only revoked ones', async () => {
  const calls: string[] = []
  const auth = {
    async authenticate(token: string) {
      calls.push(`authenticate:${token}`)
      if (token === 'revoked') throw new HbarError('UNAUTHORIZED', 'revoked')
      if (token === 'storage-failure') throw new HbarError('STORAGE_CLOSED', 'storage unavailable')
      return fixtureDevice
    },
    async createDevice(name: string) {
      calls.push(`create:${name}`)
      return { token: 'new-token', device: { ...fixtureDevice, id: 'device-new' } }
    },
  }
  await expect(resolveDesktopDevice(auth, 'valid')).resolves.toEqual({ token: 'valid', device: fixtureDevice })
  await expect(resolveDesktopDevice(auth, 'revoked')).resolves.toMatchObject({ token: 'new-token' })
  await expect(resolveDesktopDevice(auth, undefined)).resolves.toMatchObject({ token: 'new-token' })
  await expect(resolveDesktopDevice(auth, 'storage-failure')).rejects.toMatchObject({ code: 'STORAGE_CLOSED' })
  expect(calls).toEqual([
    'authenticate:valid',
    'authenticate:revoked',
    'create:hbar desktop',
    'create:hbar desktop',
    'authenticate:storage-failure',
  ])
})
