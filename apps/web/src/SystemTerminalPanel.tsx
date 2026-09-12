import { useEffect, useRef } from 'react'
import { TerminalSquare, X } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { client } from './stores'
import './SystemTerminalPanel.css'
import '@xterm/xterm/css/xterm.css'
import { useThemeSettings } from './theme-store'
import { useLocale } from './locale'

export default function SystemTerminalPanel({ workspaceId, onClose }: { workspaceId: string; onClose(): void }) {
  const viewport = useRef<HTMLDivElement>(null)
  const terminalId = useRef('')
  const theme = useThemeSettings((state) => state.profile)
  const { t } = useLocale()

  useEffect(() => {
    const host = viewport.current
    if (!host || !workspaceId) return
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: theme.typography.codeFontFamily,
      fontSize: theme.typography.codeSize,
      scrollback: 10_000,
      theme: {
        background: theme.colors.codeBackground,
        foreground: theme.colors.textPrimary,
        cursor: theme.colors.highlight,
        selectionBackground: `${theme.colors.primary}66`,
        black: theme.colors.background,
        brightBlack: theme.colors.textTertiary,
        blue: theme.colors.info,
        brightBlue: theme.colors.highlight,
        cyan: theme.colors.secondary,
        brightCyan: theme.colors.textPrimary,
        green: theme.colors.success,
        brightGreen: theme.colors.success,
        magenta: theme.colors.secondary,
        brightMagenta: theme.colors.highlight,
        red: theme.colors.error,
        brightRed: theme.colors.error,
        white: theme.colors.textSecondary,
        brightWhite: theme.colors.textPrimary,
        yellow: theme.colors.warning,
        brightYellow: theme.colors.highlight,
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
        terminal.write(`\r\n\r\n[hbar] ${t('shellExited')} ${code}.\r\n`)
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
        terminal.write(`[hbar] ${t('systemTerminal')}  ${info.cwd}\r\n`)
        resize()
      })
      .catch((error) => terminal.write(`\r\n[hbar] ${t('terminalOpenFailed')}: ${error instanceof Error ? error.message : String(error)}\r\n`))
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
  }, [t, theme, workspaceId])

  return (
    <section className="system-terminal-panel" aria-label={t('systemTerminal')}>
      <header className="system-terminal-toolbar">
        <span className="system-terminal-title">
          <TerminalSquare size={14} aria-hidden="true" />
          <strong>{t('systemTerminal')}</strong>
          <small>{t('interactiveShellCurrentWorkspace')}</small>
        </span>
        <button type="button" title={t('closeSystemTerminal')} aria-label={t('closeSystemTerminal')} onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="system-terminal-viewport" ref={viewport} />
    </section>
  )
}
