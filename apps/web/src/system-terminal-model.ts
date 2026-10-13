import type { TerminalInfo } from '@hbar/contracts'
import { createSystemTerminalClient } from '@hbar/client'
import type { SystemTerminalOutput, SystemTerminalTransport } from '@hbar/client'

const maxPendingOutputBytes = 256 * 1024
const maxPendingOutputFrames = 256
const maxQueuedInputBytes = 64 * 1024
const maxQueuedInputFrames = 32

export interface SystemTerminalState {
  readonly phase: 'idle' | 'opening' | 'open' | 'closing' | 'closed' | 'error'
  readonly terminal: TerminalInfo | null
  readonly errorCode: string | null
}

/** Session-bound view model. A confirmation retry keeps the original operation key and arguments. */
export class SystemTerminalViewModel {
  private readonly terminalClient
  private operationId: string | null = null
  private pendingOpen: { readonly operationId: string; readonly cols: number; readonly rows: number } | null = null
  private readonly listeners = new Set<() => void>()
  private readonly outputListeners = new Set<(output: SystemTerminalOutput) => void>()
  private readonly pendingOutput: SystemTerminalOutput[] = []
  private pendingBytes = 0
  private droppedOutput = false
  private queuedInputBytes = 0
  private queuedInputFrames = 0
  private inputGeneration = 0
  private state: SystemTerminalState = { phase: 'idle', terminal: null, errorCode: null }
  private inputQueue = Promise.resolve()
  private stopExit: (() => void) | undefined
  private stopOutput: (() => void) | undefined
  private references = 0
  private disposed = false

  constructor(
    client: SystemTerminalTransport,
    private readonly workspaceId: string,
    private readonly sessionId: string,
  ) {
    this.terminalClient = createSystemTerminalClient(client)
  }

  private attachListeners(): void {
    if (this.disposed || this.stopExit || this.stopOutput) return
    this.stopExit = this.terminalClient.onExit((event) => {
      if (this.disposed) return
      if (event.terminalId !== this.state.terminal?.id) return
      this.operationId = null
      this.pendingOpen = null
      this.cancelQueuedInput()
      this.publish({ phase: 'closed', terminal: null, errorCode: null })
    })
    this.stopOutput = this.terminalClient.onOutput((output) => {
      if (output.terminalId === this.state.terminal?.id) {
        this.emitOutput(output)
        return
      }
      if (this.state.phase !== 'opening') return
      this.pendingOutput.push(output)
      this.pendingBytes += new TextEncoder().encode(output.data).byteLength
      while (
        (this.pendingBytes > maxPendingOutputBytes || this.pendingOutput.length > maxPendingOutputFrames) &&
        this.pendingOutput.length > 0
      ) {
        const removed = this.pendingOutput.shift()
        if (removed) this.pendingBytes -= new TextEncoder().encode(removed.data).byteLength
        this.droppedOutput = true
      }
    })
  }

  getSnapshot = (): SystemTerminalState => this.state

  retain(): () => void {
    this.attachListeners()
    this.references++
    let released = false
    return () => {
      if (released) return
      released = true
      queueMicrotask(() => {
        this.references--
        if (this.references === 0) this.dispose()
      })
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(state: SystemTerminalState): void {
    this.state = state
    for (const listener of this.listeners) listener()
    if (state.phase === 'open' && state.terminal) {
      if (this.droppedOutput) {
        this.emitOutput({ terminalId: state.terminal.id, data: '', reset: true })
        this.droppedOutput = false
      }
      for (const output of this.pendingOutput) if (output.terminalId === state.terminal.id) this.emitOutput(output)
      this.pendingOutput.length = 0
      this.pendingBytes = 0
    }
  }

  private emitOutput(output: SystemTerminalOutput): void {
    for (const listener of this.outputListeners) listener(output)
  }

  onOutput(listener: (output: SystemTerminalOutput) => void): () => void {
    this.outputListeners.add(listener)
    return () => this.outputListeners.delete(listener)
  }

  async open(cols: number, rows: number): Promise<void> {
    if (this.disposed || this.state.phase === 'opening' || this.state.phase === 'open') return
    this.attachListeners()
    const pendingOpen = (this.pendingOpen ??= {
      operationId: (this.operationId ??= crypto.randomUUID()),
      cols,
      rows,
    })
    this.publish({ phase: 'opening', terminal: null, errorCode: null })
    try {
      const terminal = await this.terminalClient.open({
        workspaceId: this.workspaceId,
        sessionId: this.sessionId,
        operationId: pendingOpen.operationId,
        cols: pendingOpen.cols,
        rows: pendingOpen.rows,
      })
      if (this.disposed) {
        await this.terminalClient.close(terminal.id).catch(() => undefined)
        return
      }
      this.operationId = null
      this.pendingOpen = null
      this.publish({ phase: 'open', terminal, errorCode: null })
    } catch (error) {
      if (this.disposed) return
      const errorCode =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN'
      this.publish({ phase: 'error', terminal: null, errorCode })
    }
  }

  write(data: string): void {
    const terminal = this.state.terminal
    if (this.disposed || this.state.phase !== 'open' || !terminal) return
    const byteLength = new TextEncoder().encode(data).byteLength
    if (this.queuedInputFrames + 1 > maxQueuedInputFrames || this.queuedInputBytes + byteLength > maxQueuedInputBytes) {
      this.cancelQueuedInput()
      this.publish({ phase: 'error', terminal, errorCode: 'NODE_TERMINAL_INPUT_QUEUE_FULL' })
      return
    }
    const generation = this.inputGeneration
    this.queuedInputFrames++
    this.queuedInputBytes += byteLength
    this.inputQueue = this.inputQueue
      .then(() => {
        if (
          this.disposed ||
          generation !== this.inputGeneration ||
          this.state.phase !== 'open' ||
          this.state.terminal?.id !== terminal.id
        )
          return
        return this.terminalClient.write(terminal.id, data)
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        this.cancelQueuedInput()
        const errorCode =
          error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
            ? error.code
            : 'UNKNOWN'
        if (!this.disposed && this.state.phase === 'open' && this.state.terminal?.id === terminal.id)
          this.publish({ phase: 'error', terminal, errorCode })
      })
      .finally(() => {
        if (generation !== this.inputGeneration) return
        this.queuedInputFrames = Math.max(0, this.queuedInputFrames - 1)
        this.queuedInputBytes = Math.max(0, this.queuedInputBytes - byteLength)
      })
  }

  resize(cols: number, rows: number): void {
    const terminal = this.state.terminal
    if (this.disposed || this.state.phase !== 'open' || !terminal) return
    void this.terminalClient.resize(terminal.id, cols, rows).catch(() => undefined)
  }

  async close(): Promise<void> {
    if (this.disposed || this.state.phase === 'closing') return
    const terminal = this.state.terminal
    this.operationId = null
    this.pendingOpen = null
    this.cancelQueuedInput()
    if (!terminal) {
      this.publish({ phase: 'idle', terminal: null, errorCode: null })
      return
    }
    this.publish({ phase: 'closing', terminal, errorCode: null })
    try {
      await this.inputQueue
      const beforeClose = this.getSnapshot()
      if (this.disposed || beforeClose.phase !== 'closing' || beforeClose.terminal?.id !== terminal.id) return
      await this.terminalClient.close(terminal.id)
      const afterClose = this.getSnapshot()
      if (this.disposed || afterClose.phase !== 'closing' || afterClose.terminal?.id !== terminal.id) return
      this.publish({ phase: 'closed', terminal: null, errorCode: null })
    } catch (error) {
      const afterError = this.getSnapshot()
      if (this.disposed || afterError.phase !== 'closing' || afterError.terminal?.id !== terminal.id) return
      const errorCode =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN'
      this.publish({ phase: 'error', terminal, errorCode })
    }
  }

  dispose(): void {
    this.disposed = true
    this.operationId = null
    this.pendingOpen = null
    this.cancelQueuedInput()
    this.stopExit?.()
    this.stopOutput?.()
    this.stopExit = undefined
    this.stopOutput = undefined
    const terminal = this.state.terminal
    if (terminal) void this.terminalClient.close(terminal.id).catch(() => undefined)
    this.listeners.clear()
    this.outputListeners.clear()
  }

  private cancelQueuedInput(): void {
    this.inputGeneration++
    this.queuedInputFrames = 0
    this.queuedInputBytes = 0
  }
}
