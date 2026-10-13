import { describe, expect, test } from 'bun:test'
import type { RpcMethod, RpcParams, RpcResults, WireNotification } from '@hbar/contracts'
import { createSystemTerminalClient, createSystemTerminalOutputConsumer } from './system-terminal'

describe('createSystemTerminalClient', () => {
  test('opens with the exact bound session and forwards output cursor resets', async () => {
    const calls: Array<{ method: RpcMethod; params: unknown }> = []
    const listeners = new Set<(event: WireNotification) => void>()
    const transport = {
      call: async <M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResults[M]> => {
        calls.push({ method, params })
        if (method !== 'terminal.open') throw new Error(`Unexpected RPC method: ${method}`)
        const result = {
          id: 'terminal-1',
          workspaceId: 'workspace-1',
          cwd: 'C:/workspace',
          shell: 'powershell.exe',
          cols: 100,
          rows: 30,
          startedAt: '2026-10-12T00:00:00.000Z',
        }
        // The method check binds this complete TerminalInfo result to terminal.open.
        return result as RpcResults[M]
      },
      onEvent: (listener: (event: WireNotification) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const client = createSystemTerminalClient(transport)
    await client.open({
      workspaceId: 'workspace-1',
      sessionId: 'session-7',
      operationId: 'terminal-open-1',
      cols: 100,
      rows: 30,
    })
    expect(calls[0]).toEqual({
      method: 'terminal.open',
      params: {
        workspaceId: 'workspace-1',
        sessionId: 'session-7',
        operationId: 'terminal-open-1',
        cols: 100,
        rows: 30,
      },
    })

    const outputs: unknown[] = []
    const unsubscribe = client.onOutput((output) => outputs.push(output))
    for (const listener of listeners)
      listener({ method: 'terminal.output', params: { terminalId: 'terminal-1', data: 'gap', seq: 12, reset: true } })
    expect(outputs).toEqual([{ terminalId: 'terminal-1', data: 'gap', seq: 12, reset: true }])
    unsubscribe()
    expect(listeners.size).toBe(0)
  })

  test('clears stale display content on reset and ignores duplicate sequence frames', () => {
    const writes: string[] = []
    let clears = 0
    let gaps = 0
    const consumer = createSystemTerminalOutputConsumer({
      display: {
        clear: () => clears++,
        write: (data) => writes.push(data),
      },
      onGap: () => gaps++,
      afterSeq: 4,
    })
    expect(consumer.accept({ terminalId: 'terminal-1', seq: 12, reset: true, data: 'gap' })).toBe(true)
    expect(consumer.accept({ terminalId: 'terminal-1', seq: 12, data: 'duplicate' })).toBe(false)
    expect(consumer.accept({ terminalId: 'terminal-1', seq: 13, data: 'tail' })).toBe(true)
    expect({ clears, gaps, cursor: consumer.cursor, writes }).toEqual({
      clears: 1,
      gaps: 1,
      cursor: 13,
      writes: ['gap', 'tail'],
    })
  })
})
