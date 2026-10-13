import type { RpcMethod, RpcParams, RpcResults, TerminalInfo, WireNotification } from '@hbar/contracts'

export interface SystemTerminalTransport {
  call<Method extends RpcMethod>(method: Method, params: RpcParams<Method>): Promise<RpcResults[Method]>
  onEvent(listener: (event: WireNotification) => void): () => void
}

export interface SystemTerminalDisplay {
  clear(): void
  write(data: string): void
}

export interface SystemTerminalOutput {
  readonly terminalId: string
  readonly data: string
  readonly seq?: number | undefined
  readonly reset?: boolean | undefined
}

/** Applies remote sequence resets before output is rendered into an xterm-compatible display. */
export function createSystemTerminalOutputConsumer(input: {
  readonly display: SystemTerminalDisplay
  readonly onGap?: (() => void) | undefined
  readonly afterSeq?: number | undefined
}) {
  let cursor = input.afterSeq ?? 0
  return {
    get cursor() {
      return cursor
    },
    accept(output: SystemTerminalOutput): boolean {
      if (output.reset) {
        input.display.clear()
        input.onGap?.()
        if (output.seq !== undefined) cursor = output.seq
        if (output.data) input.display.write(output.data)
        return true
      }
      if (output.seq !== undefined && output.seq <= cursor) return false
      if (output.seq !== undefined) cursor = output.seq
      input.display.write(output.data)
      return true
    },
  }
}

/** Session-bound terminal calls for workspace tools. Remote opens must name their active session. */
export function createSystemTerminalClient(transport: SystemTerminalTransport) {
  return {
    open(input: {
      workspaceId: string
      sessionId: string
      operationId: string
      cols?: number
      rows?: number
    }): Promise<TerminalInfo> {
      return transport.call('terminal.open', input)
    },
    write(terminalId: string, data: string): Promise<null> {
      return transport.call('terminal.input', { terminalId, data })
    },
    resize(terminalId: string, cols: number, rows: number): Promise<null> {
      return transport.call('terminal.resize', { terminalId, cols, rows })
    },
    close(terminalId: string): Promise<null> {
      return transport.call('terminal.close', { terminalId })
    },
    list(): Promise<TerminalInfo[]> {
      return transport.call('terminal.list', {})
    },
    onOutput(listener: (output: SystemTerminalOutput) => void): () => void {
      return transport.onEvent((event: WireNotification) => {
        if (event.method !== 'terminal.output') return
        listener(event.params)
      })
    },
    onExit(listener: (event: { terminalId: string; code: number | null; signal: string | null }) => void): () => void {
      return transport.onEvent((event: WireNotification) => {
        if (event.method !== 'terminal.exit') return
        listener(event.params)
      })
    },
  }
}
