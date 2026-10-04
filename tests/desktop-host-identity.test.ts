import { expect, test } from 'bun:test'
import { desktopConnection } from '../apps/host/src/desktop-connection.ts'

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
