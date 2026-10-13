import { describe, expect, test } from 'bun:test'
import type { SystemTerminalOutput, SystemTerminalTransport } from '@hbar/client'
import {
  terminalInputSchema,
  terminalOpenSchema,
  type RpcMethod,
  type RpcParams,
  type RpcResults,
  type WireNotification,
} from '@hbar/contracts'
import { SystemTerminalViewModel } from './system-terminal-model'

describe('SystemTerminalViewModel', () => {
  test('retries a B-local confirmation with the same operation and replays output received during open', async () => {
    const calls: Array<{ method: RpcMethod; params: unknown }> = []
    const listeners = new Set<(event: WireNotification) => void>()
    let opens = 0
    const client: SystemTerminalTransport = {
      async call<Method extends RpcMethod>(method: Method, params: RpcParams<Method>): Promise<RpcResults[Method]> {
        calls.push({ method, params })
        if (method === 'terminal.open') {
          terminalOpenSchema.parse(params)
          opens++
          if (opens === 1) throw Object.assign(new Error('pending'), { code: 'NODE_LOCAL_CONFIRMATION_PENDING' })
          for (const listener of listeners)
            listener({ method: 'terminal.output', params: { terminalId: 'terminal-1', data: 'ready', seq: 1 } })
          // The method branch associates this complete terminal-open result with terminal.open.
          return {
            id: 'terminal-1',
            workspaceId: 'workspace-1',
            cwd: '/engine',
            shell: 'remote-shell (bwrap)',
            cols: 80,
            rows: 24,
            startedAt: new Date(0).toISOString(),
          } as RpcResults[Method]
        }
        if (method === 'terminal.input' || method === 'terminal.close') return null as RpcResults[Method]
        throw new Error(`Unexpected terminal transport method: ${method}`)
      },
      onEvent(listener: (event: WireNotification) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const model = new SystemTerminalViewModel(client, 'workspace-1', 'session-bound')
    const outputs: string[] = []
    const stop = model.onOutput((output) => outputs.push(output.data))

    await model.open(80, 24)
    expect(model.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'NODE_LOCAL_CONFIRMATION_PENDING' })
    await model.open(120, 40)

    expect(calls.filter((call) => call.method === 'terminal.open')).toHaveLength(2)
    expect(calls[0]?.params).toMatchObject({ workspaceId: 'workspace-1', sessionId: 'session-bound' })
    expect(calls[1]?.params).toEqual(calls[0]?.params)
    expect(calls[0]?.params).toMatchObject({ cols: 80, rows: 24 })
    expect(model.getSnapshot()).toMatchObject({ phase: 'open', terminal: { id: 'terminal-1' } })
    expect(outputs).toEqual(['ready'])

    stop()
    model.dispose()
  })

  test('attaches transport listeners only after ownership starts and removes them on disposal', async () => {
    const listeners = new Set<(event: WireNotification) => void>()
    const transport: SystemTerminalTransport = {
      async call<Method extends RpcMethod>(method: Method, params: RpcParams<Method>): Promise<RpcResults[Method]> {
        if (method !== 'terminal.open') throw new Error(`Unexpected terminal transport method: ${method}`)
        terminalOpenSchema.parse(params)
        // This complete TerminalInfo belongs to the checked terminal.open branch.
        return {
          id: 'terminal-owned',
          workspaceId: 'workspace-1',
          cwd: '/engine',
          shell: 'remote-shell',
          cols: 80,
          rows: 24,
          startedAt: new Date(0).toISOString(),
        } as RpcResults[Method]
      },
      onEvent(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const discarded = new SystemTerminalViewModel(transport, 'workspace-1', 'session-1')
    expect(listeners.size).toBe(0)

    const owned = new SystemTerminalViewModel(transport, 'workspace-1', 'session-1')
    await owned.open(80, 24)
    expect(listeners.size).toBe(2)
    owned.dispose()
    expect(listeners.size).toBe(0)
    discarded.dispose()
  })

  test('bounds queued input and prevents queued frames from being sent after close', async () => {
    const events = new Set<(event: WireNotification) => void>()
    const sent: string[] = []
    const methods: string[] = []
    let releaseFirst: (() => void) | undefined
    const client: SystemTerminalTransport = {
      async call<Method extends RpcMethod>(method: Method, params: RpcParams<Method>): Promise<RpcResults[Method]> {
        methods.push(method)
        if (method === 'terminal.open') {
          terminalOpenSchema.parse(params)
          // The method branch associates this complete terminal-open result with terminal.open.
          return {
            id: 'terminal-1',
            workspaceId: 'workspace-1',
            cwd: '/engine',
            shell: 'remote-shell',
            cols: 80,
            rows: 24,
            startedAt: new Date(0).toISOString(),
          } as RpcResults[Method]
        }
        if (method === 'terminal.input') {
          const request = terminalInputSchema.parse(params)
          sent.push(request.data)
          if (sent.length === 1) await new Promise<void>((resolve) => (releaseFirst = resolve))
          return null as RpcResults[Method]
        }
        if (method === 'terminal.close') return null as RpcResults[Method]
        throw new Error(`Unexpected terminal transport method: ${method}`)
      },
      onEvent(listener: (event: WireNotification) => void) {
        events.add(listener)
        return () => events.delete(listener)
      },
    }
    const model = new SystemTerminalViewModel(client, 'workspace-1', 'session-1')
    await model.open(80, 24)
    model.write('first')
    await new Promise((resolve) => setTimeout(resolve, 0))
    model.write('queued')
    for (let index = 0; index < 31; index++) model.write('pending')
    expect(model.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'NODE_TERMINAL_INPUT_QUEUE_FULL' })
    const closing = model.close()
    releaseFirst?.()
    await closing
    expect(sent).toEqual(['first'])
    expect(methods.at(-1)).toBe('terminal.close')
    model.dispose()
  })

  test('completes close when an in-flight write fails after closing begins', async () => {
    const events = new Set<(event: WireNotification) => void>()
    const methods: string[] = []
    let rejectWrite: ((error: Error) => void) | undefined
    const client: SystemTerminalTransport = {
      async call<Method extends RpcMethod>(method: Method, params: RpcParams<Method>): Promise<RpcResults[Method]> {
        methods.push(method)
        if (method === 'terminal.open')
          return {
            id: 'terminal-1',
            workspaceId: 'workspace-1',
            cwd: '/engine',
            shell: 'remote-shell',
            cols: 80,
            rows: 24,
            startedAt: new Date(0).toISOString(),
          } as RpcResults[Method]
        if (method === 'terminal.input') {
          terminalInputSchema.parse(params)
          await new Promise<void>((_resolve, reject) => (rejectWrite = reject))
          return null as RpcResults[Method]
        }
        if (method === 'terminal.close') return null as RpcResults[Method]
        throw new Error(`Unexpected terminal transport method: ${method}`)
      },
      onEvent(listener: (event: WireNotification) => void) {
        events.add(listener)
        return () => events.delete(listener)
      },
    }
    const model = new SystemTerminalViewModel(client, 'workspace-1', 'session-1')
    await model.open(80, 24)
    model.write('fail')
    await new Promise((resolve) => setTimeout(resolve, 0))
    const closing = model.close()
    rejectWrite?.(new Error('write failed'))
    await closing
    expect(methods.slice(-2)).toEqual(['terminal.input', 'terminal.close'])
    expect(model.getSnapshot()).toMatchObject({ phase: 'closed', terminal: null })
    model.dispose()
  })

  test('caps empty pre-open frames and ignores output from other terminals', async () => {
    const events = new Set<(event: WireNotification) => void>()
    let resolveOpen: ((info: RpcResults['terminal.open']) => void) | undefined
    const client: SystemTerminalTransport = {
      async call<Method extends RpcMethod>(method: Method, _params: RpcParams<Method>): Promise<RpcResults[Method]> {
        if (method === 'terminal.open') {
          terminalOpenSchema.parse(_params)
          // The method branch associates the promise's terminal-open result with terminal.open.
          return (await new Promise<RpcResults['terminal.open']>(
            (resolve) => (resolveOpen = resolve),
          )) as RpcResults[Method]
        }
        if (method === 'terminal.close' || method === 'terminal.input') return null as RpcResults[Method]
        throw new Error(`Unexpected terminal transport method: ${method}`)
      },
      onEvent(listener: (event: WireNotification) => void) {
        events.add(listener)
        return () => events.delete(listener)
      },
    }
    const model = new SystemTerminalViewModel(client, 'workspace-1', 'session-1')
    const outputs: SystemTerminalOutput[] = []
    model.onOutput((output) => outputs.push(output))
    const opening = model.open(80, 24)
    for (let seq = 1; seq <= 300; seq++)
      for (const listener of events)
        listener({ method: 'terminal.output', params: { terminalId: `foreign-${seq}`, data: '', seq } })
    resolveOpen?.({
      id: 'terminal-1',
      workspaceId: 'workspace-1',
      cwd: '/engine',
      shell: 'remote-shell',
      cols: 80,
      rows: 24,
      startedAt: new Date(0).toISOString(),
    })
    await opening
    for (const listener of events)
      listener({ method: 'terminal.output', params: { terminalId: 'foreign-live', data: 'must not render', seq: 301 } })
    expect(outputs).toEqual([{ terminalId: 'terminal-1', data: '', reset: true }])
    model.dispose()
  })
})
