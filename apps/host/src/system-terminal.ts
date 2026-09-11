import type { TerminalInfo } from '@hbar/contracts'

interface ManagedTerminal {
  info: TerminalInfo
  owner: string
  process: Bun.Subprocess
  terminal: Bun.Terminal
  outputBuffer: string
  callbacks?: SystemTerminalCallbacks | undefined
}

export interface SystemTerminalCallbacks {
  onOutput(terminalId: string, data: string): void
  onExit(terminalId: string, code: number | null, signal: string | null): void
}

/** Owns interactive shells for one Host process. Terminals are scoped to the
 * paired device so a transient websocket reconnect can reattach safely. */
export class SystemTerminalManager {
  private readonly terminals = new Map<string, ManagedTerminal>()
  private readonly decoder = new TextDecoder()

  open(owner: string, workspaceId: string, cwd: string, cols: number, rows: number, callbacks: SystemTerminalCallbacks): TerminalInfo {
    const id = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const shell =
      process.platform === 'win32'
        ? ['powershell.exe', '-NoLogo', '-NoProfile']
        : [process.env.SHELL || '/bin/sh', '-i']
    const env: Record<string, string> = { TERM: 'xterm-256color', COLORTERM: 'truecolor' }
    const allowedEnvironment = new Set([
      'path',
      'pathext',
      'systemroot',
      'windir',
      'comspec',
      'temp',
      'tmp',
      'home',
      'userprofile',
      'appdata',
      'localappdata',
      'lang',
      'lc_all',
      'user',
      'logname',
      'shell',
    ])
    for (const [key, value] of Object.entries(process.env))
      if (value !== undefined && allowedEnvironment.has(key.toLowerCase())) env[key] = value
    let processRef: Bun.Subprocess
    let initialOutput = ''
    let didExit = false
    const notifyExit = (code: number | null, signal: string | null) => {
      if (didExit) return
      didExit = true
      this.terminals.delete(id)
      callbacks.onExit(id, code, signal)
    }
    const terminal = new Bun.Terminal({
      cols,
      rows,
      name: 'xterm-256color',
      data: (_terminal, data) => {
        const managed = this.terminals.get(id)
        const output = this.decoder.decode(data, { stream: true })
        if (!managed) {
          initialOutput = `${initialOutput}${output}`.slice(-128_000)
          return
        }
        managed.outputBuffer = `${managed.outputBuffer}${output}`.slice(-128_000)
        managed.callbacks?.onOutput(id, output)
      },
      exit: (_terminal, code, signal) => notifyExit(null, signal ?? (code === 0 ? null : `pty:${code}`)),
    })
    processRef = Bun.spawn(shell, {
      cwd,
      env,
      terminal,
      windowsHide: true,
    })
    const info: TerminalInfo = { id, workspaceId, cwd, shell: shell[0]!, cols, rows, startedAt }
    this.terminals.set(id, { info, owner, process: processRef, terminal, outputBuffer: initialOutput, callbacks })
    void processRef.exited.then((code) => notifyExit(code, null))
    return info
  }

  attach(owner: string, callbacks: SystemTerminalCallbacks): TerminalInfo[] {
    return [...this.terminals.values()].flatMap((terminal) => {
      if (terminal.owner !== owner) return []
      terminal.callbacks = callbacks
      if (terminal.outputBuffer) {
        const buffered = terminal.outputBuffer
        terminal.outputBuffer = ''
        queueMicrotask(() => callbacks.onOutput(terminal.info.id, buffered))
      }
      return [terminal.info]
    })
  }

  detach(owner: string, callbacks: SystemTerminalCallbacks) {
    for (const terminal of this.terminals.values())
      if (terminal.owner === owner && terminal.callbacks === callbacks) terminal.callbacks = undefined
  }

  list(owner: string): TerminalInfo[] {
    return [...this.terminals.values()].filter((terminal) => terminal.owner === owner).map((terminal) => terminal.info)
  }

  write(owner: string, id: string, data: string) {
    const terminal = this.terminals.get(id)
    if (!terminal || terminal.owner !== owner) throw new Error('Terminal not found')
    terminal.terminal.write(data)
  }

  resize(owner: string, id: string, cols: number, rows: number) {
    const terminal = this.terminals.get(id)
    if (!terminal || terminal.owner !== owner) throw new Error('Terminal not found')
    terminal.terminal.resize(cols, rows)
    terminal.info.cols = cols
    terminal.info.rows = rows
  }

  close(owner: string, id: string) {
    const terminal = this.terminals.get(id)
    if (!terminal || terminal.owner !== owner) return false
    this.terminals.delete(id)
    if (terminal.process.exitCode === null) terminal.process.kill()
    terminal.terminal.close()
    return true
  }

  closeAll(ids?: Iterable<string>) {
    const targets = ids ? [...ids] : [...this.terminals.keys()]
    for (const id of targets) {
      const terminal = this.terminals.get(id)
      if (!terminal) continue
      this.terminals.delete(id)
      if (terminal.process.exitCode === null) terminal.process.kill()
      terminal.terminal.close()
    }
  }
}
