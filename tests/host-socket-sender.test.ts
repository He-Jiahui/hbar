import { expect, test } from 'bun:test'
import { sendSocketFrame, type SocketWritePort } from '../apps/host/src/socket-sender'

test('a failed socket and failed close cannot prevent another client receiving its frame', () => {
  let delivered = ''
  const failing: SocketWritePort = {
    readyState: 1,
    getBufferedAmount: () => 0,
    send() {
      throw new Error('transport fixture')
    },
    close() {
      throw new Error('close fixture')
    },
  }
  const healthy: SocketWritePort = {
    readyState: 1,
    getBufferedAmount: () => 0,
    send(data) {
      delivered = data
    },
    close() {},
  }
  for (const socket of [failing, healthy]) sendSocketFrame(socket, { event: 'committed' })
  expect(JSON.parse(delivered)).toEqual({ event: 'committed' })
})

test('a slow socket gets the recovery close code and never accepts the new frame', () => {
  let code = 0
  const socket: SocketWritePort = {
    readyState: 1,
    getBufferedAmount: () => 4 * 1024 * 1024 + 1,
    send() {
      throw new Error('must not send')
    },
    close(value) {
      code = value
    },
  }
  expect(sendSocketFrame(socket, {})).toBe(0)
  expect(code).toBe(1013)
})

test('an unserializable response closes only its connection for reconciliation', () => {
  let code = 0
  const socket: SocketWritePort = {
    readyState: 1,
    getBufferedAmount: () => 0,
    send() {
      throw new Error('must not send')
    },
    close(value) {
      code = value
    },
  }
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  expect(sendSocketFrame(socket, cyclic)).toBe(0)
  expect(code).toBe(1011)
})
