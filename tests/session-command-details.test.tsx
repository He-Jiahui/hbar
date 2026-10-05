import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionToolDetails } from '../packages/app-react/src/session-tool-details'
import {
  commandOutputWindow,
  COMMAND_OUTPUT_PREVIEW_CHARACTERS,
} from '../packages/app-react/src/session-command-output-model'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SessionToolRow } from '../packages/app-react/src/session-message-model'

test('command reading removes terminal progress/control frames without replacing the raw Copy source', async () => {
  const row: SessionToolRow = {
    kind: 'tool',
    id: 'control-output',
    name: 'custom-command',
    call: { type: 'tool_call', callId: 'control-output', name: 'custom-command', args: { command: 'echo hello' } },
    result: {
      type: 'tool_result',
      callId: 'control-output',
      name: 'custom-command',
      text: 'Downloading\r100%\r\n\u001b[32mdone\u001b[0m\r\n',
      isError: false,
      outcome: { kind: 'succeeded', executionStarted: true },
    },
  }
  const html = renderToStaticMarkup(
    <SessionToolDetails
      row={row}
      presentation={{ icon: 'terminal', command: 'echo hello' }}
      labels={getShellCopy('zh-CN').session.messageBlocks}
      sessionId="s"
      messageId="m"
    />,
  )
  expect(html).not.toContain('Downloading')
  expect(html).not.toContain('[32m')
  const readable: string[] = []
  await new HTMLRewriter()
    .on('[data-command-output]', {
      text(chunk) {
        readable.push(chunk.text)
      },
    })
    .transform(new Response(html))
    .text()
  expect(readable.join('')).toBe('100%\r\ndone\r\n')
})

test('success output windows twelve original lines and preserves CRLF, lone CR and Unicode boundaries', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    for (const lines of [0, 1, 12, 13]) {
      const text = Array.from({ length: lines }, (_, i) => `line-${i + 1}`).join(newline)
      const window = commandOutputWindow(text)
      expect(window.collapsible).toBe(lines > 12)
      expect(window.hiddenLines).toBe(Math.max(0, lines - 12))
      expect(text.slice(0, window.previewEnd) + text.slice(window.previewEnd)).toBe(text)
    }
    const terminated = Array.from({ length: 12 }, () => 'line').join(newline) + newline
    expect(commandOutputWindow(terminated).collapsible).toBe(false)
  }
  const astral = 'x'.repeat(COMMAND_OUTPUT_PREVIEW_CHARACTERS - 1) + '👩‍💻END'
  const window = commandOutputWindow(astral)
  expect(window.previewEnd).toBe(COMMAND_OUTPUT_PREVIEW_CHARACTERS - 1)
  expect(astral.slice(window.previewEnd)).toBe('👩‍💻END')
  const crlf = 'x'.repeat(COMMAND_OUTPUT_PREVIEW_CHARACTERS - 1) + '\r\nEND'
  expect(commandOutputWindow(crlf).previewEnd).toBe(COMMAND_OUTPUT_PREVIEW_CHARACTERS - 1)
  expect(commandOutputWindow('x'.repeat(COMMAND_OUTPUT_PREVIEW_CHARACTERS)).collapsible).toBe(false)
  expect(commandOutputWindow('x'.repeat(COMMAND_OUTPUT_PREVIEW_CHARACTERS + 1)).collapsible).toBe(true)
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`control-only and incomplete diagnostics never pretend that the original result was empty: ${locale}`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const row: SessionToolRow = {
      kind: 'tool',
      id: 'controls',
      name: 'exec',
      call: { type: 'tool_call', callId: 'controls', name: 'exec', args: { command: 'echo' } },
    }
    const render = (text: string) =>
      renderToStaticMarkup(
        <SessionToolDetails
          row={{ ...row, result: { type: 'tool_result', callId: 'controls', name: 'exec', text, isError: false } }}
          presentation={{ icon: 'terminal', command: 'echo' }}
          labels={labels}
          sessionId="s"
          messageId="m"
        />,
      )
    const controls = render('\u001b[32m\u001b[0m')
    expect(controls).toContain(labels.emptyReadingOutput)
    expect(controls).toContain(labels.showRawOutput)
    expect(controls).toContain(labels.toolResultCopy.copy)
    const incomplete = render('\u001b]unterminated IMPORTANT')
    expect(incomplete).toContain('unterminated IMPORTANT')
    expect(incomplete).not.toContain(labels.emptyReadingOutput)
    expect(incomplete).not.toContain('hbar-session-command-view-toggle')
  })
  test(`command, complete original arguments and output are one reading surface: ${locale}`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const command = 'echo "雪"\r\nnext'
    for (const outcome of ['succeeded', 'failed', 'denied', 'cancelled', 'interrupted', 'unknown'] as const) {
      const row: SessionToolRow = {
        kind: 'tool',
        id: 'tool:original',
        name: 'custom-command',
        call: {
          type: 'tool_call',
          callId: 'original',
          name: 'custom-command',
          args: { script: command, timeout: 123, extra: 'original-option' },
        },
        result: {
          type: 'tool_result',
          callId: 'original',
          name: 'custom-command',
          text: 'output\r\n'.repeat(20) + 'END',
          isError: outcome !== 'succeeded',
          outcome: { kind: outcome, executionStarted: outcome === 'succeeded' || outcome === 'failed' },
        },
      }
      const html = renderToStaticMarkup(
        <SessionToolDetails
          row={row}
          presentation={{ icon: 'terminal', command }}
          labels={labels}
          sessionId="s"
          messageId="m"
        />,
      )
      expect(html).toContain('hbar-session-command')
      expect(html).toContain(labels.command)
      expect(html).toContain(labels.originalInput)
      expect(html).toContain('original-option')
      expect(html).toContain('123')
      expect(html).toContain('END')
      expect(html).toContain(labels.toolResultCopy.copy)
      expect(html.includes('data-command-output-tail')).toBe(outcome === 'succeeded')
      if (outcome === 'failed') expect(html).toContain(labels.errorOutput)
    }
  })
  test(`empty/pending/legacy tools do not invent command or output semantics: ${locale}`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const row: SessionToolRow = {
      kind: 'tool',
      id: 'one',
      name: 'shell',
      call: { type: 'tool_call', callId: 'one', name: 'shell', args: { command: 'echo true' } },
    }
    const render = (value: SessionToolRow, command?: string) =>
      renderToStaticMarkup(
        <SessionToolDetails
          row={value}
          presentation={command === undefined ? { icon: 'tool' } : { icon: 'terminal', command }}
          labels={labels}
          sessionId="s"
          messageId="m"
        />,
      )
    expect(render(row)).not.toContain('hbar-session-command')
    expect(render(row, 'echo true')).not.toContain('data-command-output')
    const empty = render(
      { ...row, result: { type: 'tool_result', callId: 'one', name: 'shell', text: '', isError: false } },
      'echo true',
    )
    expect(empty).toContain(labels.emptyOutput)
    expect(empty).not.toContain('data-copy-status')
  })
}
