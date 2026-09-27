import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenIconButton } from '@lumen/app-ui'
import { getSessionStopCopy, sessionStopButtonLabel } from '../apps/web/src/session-stop-copy'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'

test('Stop discovery uses the host platform, with deterministic Ctrl fallback', () => {
  for (const platform of ['', 'Win32', 'Windows', 'Linux x86_64', 'unknown']) {
    expect(sessionStopButtonLabel('zh-CN', platform)).toBe('停止 (Ctrl+.)')
    expect(sessionStopButtonLabel('en-US', platform)).toBe('Stop (Ctrl+.)')
  }
  for (const platform of ['MacIntel', 'macOS', 'Darwin', 'iPad', 'iPhone']) {
    expect(sessionStopButtonLabel('zh-CN', platform)).toBe('停止 (⌘.)')
    expect(sessionStopButtonLabel('en-US', platform)).toBe('Stop (⌘.)')
  }
  expect(sessionStopButtonLabel('en-US')).toBe('Stop (Ctrl+.)')
})

for (const locale of ['en-US', 'zh-CN'] satisfies readonly ShellLocale[]) {
  test(`${locale} distinguishes the request, uncertainty and every observed terminal result`, () => {
    const labels = getSessionStopCopy(locale)
    const messages = [
      labels.sending,
      labels.requested,
      labels.unknown,
      labels.checking,
      labels.cancelled,
      labels.completed,
      labels.runFailed,
      labels.interrupted,
    ]
    expect(new Set(messages).size).toBe(messages.length)
    for (const value of Object.values(labels)) {
      if (typeof value === 'string') expect(value.trim().length).toBeGreaterThan(0)
    }
    expect(labels.requested).toContain(locale === 'zh-CN' ? '等待' : 'Waiting')
    expect(labels.unknown).toContain(locale === 'zh-CN' ? '尚未确认' : 'unconfirmed')
    expect(labels.requested).not.toContain(labels.cancelled)
    expect(labels.unknown).not.toContain(labels.cancelled)
    expect(labels.failure('CANCELLED')).not.toBe(labels.cancelled)
    expect(labels.failure('EXECUTION_FAILED')).not.toBe(labels.runFailed)
  })

  test(`${locale} failure copy never discloses arbitrary, empty or very long diagnostic content`, () => {
    const labels = getSessionStopCopy(locale)
    const fallback = labels.failure('EXECUTION_FAILED')
    for (const code of [
      '',
      'private-token-D:/private/workspace',
      '<script>secret</script>',
      '敏感错误secret'.repeat(4096),
    ]) {
      expect(labels.failure(code)).toBe(fallback)
      expect(labels.failure(code).length).toBeLessThan(150)
    }
    for (const code of [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'DISCONNECTED',
      'CONNECTION_CLOSED',
      'TIMEOUT',
      'TIMED_OUT',
      'RESULT_UNKNOWN',
      'INVALID_OUTPUT',
      'NOT_FOUND',
      'BUSY',
      'CAPABILITY_UNAVAILABLE',
      'COMMAND_NOT_FOUND',
      'VERSION_MISMATCH',
      'CANCELLED',
      'DISPOSED',
    ]) {
      expect(labels.failure(code)).not.toContain(code)
      expect(labels.failure(code)).not.toBe(fallback)
    }
  })

  test(`${locale} shell copy keeps stable references and shares one host-owned notice bundle`, () => {
    const ctrl = getShellCopy(locale, 'Win32')
    const mac = getShellCopy(locale, 'MacIntel')
    expect(getShellCopy(locale, 'Linux x86_64')).toBe(ctrl)
    expect(getShellCopy(locale, 'Darwin')).toBe(mac)
    expect(mac).not.toBe(ctrl)
    expect(mac.shell).not.toBe(ctrl.shell)
    expect(mac.shell.stop).toBe(ctrl.shell.stop)
    expect(mac.shell.searchShortcut).toBe('⌘K')
    expect(mac.shell.commandShortcut).toBe('⌘⇧P')
    expect(ctrl.shell.searchShortcut).toBe('Ctrl K')
    expect(ctrl.shell.commandShortcut).toBe('Ctrl Shift P')
    expect(mac.session.runs).toBe(ctrl.session.runs)
    expect(mac.session.prompt.stop).toBe(sessionStopButtonLabel(locale, 'MacIntel'))
    expect(ctrl.session.prompt.stop).toBe(sessionStopButtonLabel(locale, 'Win32'))
    expect(ctrl.shell.stop.requested).toBe(getSessionStopCopy(locale).requested)
    expect(ctrl.session.prompt.send).toBe(mac.session.prompt.send)
    expect(ctrl.shell.stop.unknown).not.toBe(ctrl.shell.stop.cancelled)
  })

  test(`${locale} existing icon button exposes the complete host shortcut as title and accessible name`, () => {
    const label = sessionStopButtonLabel(locale, 'MacIntel')
    const html = renderToStaticMarkup(createElement(LumenIconButton, { label }))
    expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain(`title="${label}"`)
    const longLabel = `${label} ${getSessionStopCopy(locale).unknown.repeat(12)}`
    const longHtml = renderToStaticMarkup(createElement(LumenIconButton, { label: longLabel }))
    expect(longHtml).toContain(`aria-label="${longLabel}"`)
    expect(longHtml).toContain(`title="${longLabel}"`)
  })
}
