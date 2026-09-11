import { useEffect, useRef } from 'react'
import { TerminalSquare, X } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { client } from './stores'
import './SystemTerminalPanel.css'
import '@xterm/xterm/css/xterm.css'

export default function SystemTerminalPanel({ workspaceId, onClose }: { workspaceId: string; onClose(): void }) {
  const viewport = useRef<HTMLDivElement>(null)
  const terminalId = useRef('')

  useEffect(() => {
    const host = viewport.current
    if (!host || !workspaceId) return
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
      fontSize: 13,
      scrollback: 10_000,
      theme: {
        background: '#0a0a0a',
        foreground: '#e8e8e8',
        cursor: '#b19eef',
        selectionBackground: '#8b7dff55',
        black: '#0a0a0a',
        brightBlack: '#666666',
        blue: '#8da7ff',
        brightBlue: '#a9baff',
        cyan: '#78dce8',
        brightCyan: '#9af1f5',
        green: '#70d49b',
        brightGreen: '#98f2bc',
        magenta: '#c7a4ff',
        brightMagenta: '#d8c3ff',
        red: '#f08b9b',
        brightRed: '#ffb0bc',
        white: '#e8e8e8',
        brightWhite: '#ffffff',
        yellow: '#e8c779',
        brightYellow: '#ffe49b',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    const connection = client()
    let disposed = false
    let resizeFrame = 0
    const resize = () => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        if (disposed) return
        fit.fit()
        const id = terminalId.current
        if (id) void connection.call('terminal.resize', { terminalId: id, cols: terminal.cols, rows: terminal.rows }).catch(() => {})
      })
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()
    const input = terminal.onData((data) => {
      const id = terminalId.current
      if (id) void connection.call('terminal.input', { terminalId: id, data }).catch(() => {})
    })
    const events = connection.onEvent((event) => {
      if (event.method === 'terminal.output' && event.params.terminalId === terminalId.current) terminal.write(event.params.data)
      if (event.method === 'terminal.exit' && event.params.terminalId === terminalId.current) {
        const code = event.params.code === null ? 'unknown' : String(event.params.code)
        terminal.write(`\r\n\r\n[hbar] shell exited with code ${code}.\r\n`)
      }
    })
    void connection
      .call('terminal.open', { workspaceId, cols: terminal.cols, rows: terminal.rows })
      .then((info) => {
        if (disposed) {
          void connection.call('terminal.close', { terminalId: info.id }).catch(() => {})
          return
        }
        terminalId.current = info.id
        terminal.write(`\x1b[1;35mhbar system terminal\x1b[0m  ${info.cwd}\r\n`)
        resize()
      })
      .catch((error) => terminal.write(`\r\n[hbar] unable to open shell: ${error instanceof Error ? error.message : String(error)}\r\n`))
    return () => {
      disposed = true
      cancelAnimationFrame(resizeFrame)
      resizeObserver.disconnect()
      input.dispose()
      events()
      const id = terminalId.current
      if (id) void connection.call('terminal.close', { terminalId: id }).catch(() => {})
      terminal.dispose()
    }
  }, [workspaceId])

  return (
    <section className="system-terminal-panel" aria-label="系统终端">
      <header className="system-terminal-toolbar">
        <span className="system-terminal-title">
          <TerminalSquare size={14} aria-hidden="true" />
          <strong>系统终端</strong>
          <small>交互式 Shell · 当前工作区</small>
        </span>
        <button type="button" title="关闭系统终端" aria-label="关闭系统终端" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="system-terminal-viewport" ref={viewport} />
    </section>
  )
}
