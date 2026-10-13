import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { LumenButton, LumenContentText, LumenFrame, LumenIcon } from '@lumen/app-ui'
import { Play, Square } from 'lucide-react'
import type { HbarClient } from '@hbar/client'
import { createSystemTerminalOutputConsumer } from '@hbar/client'
import type { SystemTerminalCopy } from './system-terminal-copy'
import { SystemTerminalViewModel } from './system-terminal-model'
import './SystemTerminalPanel.css'
import '@xterm/xterm/css/xterm.css'

function requiredTerminalToken(host: HTMLElement, name: string): string {
  const value = getComputedStyle(host).getPropertyValue(name).trim()
  if (!value) throw new Error(`System Terminal is missing theme token ${name}`)
  return value
}

function resolveTerminalColor(host: HTMLElement, value: string): string {
  const probe = document.createElement('span')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.color = value
  if (!probe.style.color) throw new Error('System Terminal theme color is invalid')
  host.append(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  if (!resolved) throw new Error('System Terminal theme color could not be resolved')
  return resolved
}

export function SystemTerminalPanel({
  client,
  workspaceId,
  sessionId,
  connected,
  canOpen,
  labels,
  onClose,
}: {
  readonly client: HbarClient
  readonly workspaceId: string | null
  readonly sessionId: string | null
  readonly connected: boolean
  readonly canOpen: boolean
  readonly labels: SystemTerminalCopy
  readonly onClose: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const [outputReset, setOutputReset] = useState(false)
  const model = useMemo(
    () => new SystemTerminalViewModel(client, workspaceId ?? '', sessionId ?? ''),
    [client, sessionId, workspaceId],
  )
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot)
  const copy = useMemo(() => {
    if (state.phase === 'opening' || state.phase === 'closing') return labels.waiting
    if (state.errorCode === 'NODE_LOCAL_CONFIRMATION_PENDING') return labels.confirmationPending
    if (state.errorCode === 'NODE_TERMINAL_INPUT_QUEUE_FULL') return labels.inputOverflow
    if (state.errorCode) return labels.operationError(state.errorCode)
    if (state.phase === 'closed') return labels.exited
    if (!workspaceId || !sessionId) return labels.invalidScope
    if (!connected) return labels.disconnected
    if (!canOpen) return labels.unavailable
    return null
  }, [canOpen, connected, labels, sessionId, state, workspaceId])
  const canStart = connected && canOpen && Boolean(workspaceId && sessionId) && state.phase !== 'opening'

  useEffect(() => model.retain(), [model])

  useEffect(() => {
    if (state.phase === 'opening') setOutputReset(false)
  }, [state.phase])

  useEffect(() => {
    const terminal = terminalRef.current
    if (state.phase === 'open' && terminal) model.resize(terminal.cols, terminal.rows)
  }, [model, state.phase, state.terminal?.id])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const computed = getComputedStyle(host)
    const terminalFontSize = Number.parseFloat(computed.fontSize)
    const terminalFontFamily = computed.fontFamily.trim()
    if (!Number.isFinite(terminalFontSize) || terminalFontSize <= 0)
      throw new Error('System Terminal resolved font-size is invalid')
    if (!terminalFontFamily) throw new Error('System Terminal resolved font-family is empty')
    const contrast = requiredTerminalToken(host, '--lumen-contrast')
    const ink = requiredTerminalToken(host, '--lumen-ink')
    const accent = requiredTerminalToken(host, '--lumen-accent')
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      scrollback: 5_000,
      fontFamily: terminalFontFamily,
      fontSize: terminalFontSize,
      lineHeight: 1.2,
      theme: {
        background: resolveTerminalColor(host, contrast),
        foreground: resolveTerminalColor(host, ink),
        cursor: resolveTerminalColor(host, accent),
        selectionBackground: resolveTerminalColor(host, `color-mix(in srgb, ${accent} 24%, ${contrast})`),
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    terminalRef.current = terminal
    const output = createSystemTerminalOutputConsumer({
      display: {
        clear: () => terminal.clear(),
        write: (data) => terminal.write(data),
      },
      onGap: () => setOutputReset(true),
    })
    const stopOutput = model.onOutput((frame) => output.accept(frame))
    const input = terminal.onData((data) => model.write(data))
    const resize = terminal.onResize(({ cols, rows }) => model.resize(cols, rows))
    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* The viewport can be hidden while its tool pane is closed. */
      }
    })
    observer.observe(host)
    return () => {
      observer.disconnect()
      stopOutput()
      input.dispose()
      resize.dispose()
      terminalRef.current = null
      terminal.dispose()
    }
  }, [model])

  const open = useCallback(() => {
    const terminal = terminalRef.current
    return model.open(Math.max(2, terminal?.cols ?? 80), Math.max(2, terminal?.rows ?? 24))
  }, [model])
  const close = useCallback(async () => {
    await model.close()
    if (model.getSnapshot().phase === 'closed' || model.getSnapshot().phase === 'idle') onClose()
  }, [model, onClose])

  return (
    <LumenFrame className="hbar-system-terminal-panel">
      <header className="hbar-system-terminal-toolbar">
        <LumenContentText context="section.title">{labels.title}</LumenContentText>
        {state.terminal ? (
          <LumenButton size="s" variant="text" indicator="none" onClick={() => void close()}>
            <LumenIcon icon={Square} tier="sm" />
            <LumenContentText context="control.label">{labels.close}</LumenContentText>
          </LumenButton>
        ) : (
          <LumenButton size="s" variant="text" indicator="none" disabled={!canStart} onClick={() => void open()}>
            <LumenIcon icon={Play} tier="sm" />
            <LumenContentText context="control.label">
              {state.errorCode === 'NODE_LOCAL_CONFIRMATION_PENDING' ? labels.retry : labels.open}
            </LumenContentText>
          </LumenButton>
        )}
      </header>
      {copy ? (
        <LumenContentText className="hbar-system-terminal-message" context="feedback.message" role="status">
          {copy}
        </LumenContentText>
      ) : null}
      {outputReset ? (
        <LumenContentText className="hbar-system-terminal-message" context="feedback.message" role="status">
          {labels.outputReset}
        </LumenContentText>
      ) : null}
      <div ref={hostRef} className="hbar-system-terminal-viewport" aria-label={labels.title} />
    </LumenFrame>
  )
}
