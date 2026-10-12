import { expect, test } from 'bun:test'
import { setTimeout as pause } from 'node:timers/promises'
import { NodeRpcPeer } from '@hbar/node-link'
import { nodeObservationMethods, nodeWorkspaceMethods } from '@hbar/contracts/node'

test('both node directions let an admitted process settle beyond the ordinary 30 second request deadline', async () => {
  const errors: unknown[] = []
  const closed: number[] = []
  const caller = new NodeRpcPeer({
    remote: nodeWorkspaceMethods,
    local: nodeObservationMethods,
    transport: {
      send: (text) => {
        void worker.receive(text).catch((error: unknown) => errors.push(error))
        return true
      },
      close: (code) => closed.push(code),
    },
    handle: async () => {
      throw new Error('No observation request is expected')
    },
  })
  const worker = new NodeRpcPeer({
    remote: nodeObservationMethods,
    local: nodeWorkspaceMethods,
    transport: {
      send: (text) => {
        void caller.receive(text).catch((error: unknown) => errors.push(error))
        return true
      },
      close: (code) => closed.push(code),
    },
    handle: async (_method, _input, signal) => {
      await pause(31_000, undefined, { signal })
      return {
        state: 'settled',
        acceptedAt: 1,
        startedAt: 2,
        settledAt: 3,
        result: {
          text: 'settled after 31 seconds',
          isError: false,
          details: { code: 0, exitCode: 0, truncated: false, executionStarted: true, backend: 'none' },
        },
      }
    },
  })
  try {
    const receipt = await caller.call('exec.start', {
      operationId: 'run:call',
      sessionId: 'session',
      runId: 'run',
      callId: 'call',
      rootId: 'engine',
      cwd: '.',
      command: 'fixture command',
      timeoutMs: 60_000,
      sandbox: null,
      admission: { kind: 'allow' },
    })
    expect(receipt).toMatchObject({ state: 'settled', result: { text: 'settled after 31 seconds' } })
    expect(closed).toEqual([])
    expect(errors).toEqual([])
  } finally {
    caller.close()
    worker.close()
  }
}, 40_000)
