import type { TerminalInfo } from '@hbar/contracts'

interface ManagedTerminal {
  info: TerminalInfo
  process: Bun.Subprocess
  terminal: Bun.Terminal
}

export interface SystemTerminalCallbacks {
  onOutput(data: string): void
  onExit(code: number | null, signal: string | null): void
}

/** Owns interactive shells for one Host process. A terminal is scoped to the
 * paired websocket that opened it; callers must dispose it when that socket
 * closes so an orphaned shell cannot outlive its client. */
export class SystemTerminalManager {
  private readonly terminals = new Map<string, ManagedTerminal>()
  private readonly decoder = new TextDecoder()

  open(workspaceId: string, cwd: string, cols: number, rows: number, callbacks: SystemTerminalCallbacks): TerminalInfo {
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
    let didExit = false
    const notifyExit = (code: number | null, signal: string | null) => {
      if (didExit) return
      didExit = true
      this.terminals.delete(id)
      callbacks.onExit(code, signal)
    }
    const terminal = new Bun.Terminal({
      cols,
      rows,
      name: 'xterm-256color',
      data: (_terminal, data) => callbacks.onOutput(this.decoder.decode(data, { stream: true })),
      exit: (_terminal, code, signal) => notifyExit(null, signal ?? (code === 0 ? null : `pty:${code}`)),
    })
    processRef = Bun.spawn(shell, {
      cwd,
      env,
      terminal,
      windowsHide: true,
    })
    const info: TerminalInfo = { id, workspaceId, cwd, shell: shell[0]!, cols, rows, startedAt }
    this.terminals.set(id, { info, process: processRef, terminal })
    void processRef.exited.then((code) => notifyExit(code, null))
    return info
  }

  list(ids: Iterable<string>): TerminalInfo[] {
    return [...ids].flatMap((id) => {
      const terminal = this.terminals.get(id)
      return terminal ? [terminal.info] : []
    })
  }

  write(id: string, data: string) {
    const terminal = this.terminals.get(id)
    if (!terminal) throw new Error('Terminal not found')
    terminal.terminal.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    const terminal = this.terminals.get(id)
    if (!terminal) throw new Error('Terminal not found')
    terminal.terminal.resize(cols, rows)
    terminal.info.cols = cols
    terminal.info.rows = rows
  }

  close(id: string) {
    const terminal = this.terminals.get(id)
    if (!terminal) return false
    this.terminals.delete(id)
    if (terminal.process.exitCode === null) terminal.process.kill()
    terminal.terminal.close()
    return true
  }

  closeAll(ids?: Iterable<string>) {
    const targets = ids ? [...ids] : [...this.terminals.keys()]
    for (const id of targets) this.close(id)
  }
}
