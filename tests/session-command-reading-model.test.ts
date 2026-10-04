import { expect, test } from 'bun:test'
import {
  MAX_COMMAND_READING_CHARACTERS,
  projectCommandReading,
} from '../packages/app-react/src/session-command-reading-model'

test('ordinary output preserves original CRLF, whitespace, tabs and Unicode without a needless raw toggle', () => {
  for (const raw of ['', 'one', '雪 👩‍💻\t\r\nnext\r\n', '\n \t\n', '[32m is ordinary text'])
    expect(projectCommandReading(raw)).toEqual({ text: raw, changed: false })
})

test('terminal controls are a plain-text projection, not links, HTML or a cursor emulator', () => {
  const cases = [
    ['\u001b[32mgreen\u001b[0m', 'green'],
    ['\u001b[2K\u001b[1Aready', 'ready'],
    ['\u001b]0;window title\u0007done', 'done'],
    ['\u001b]8;;https://example.invalid\u001b\\<text>\u001b]8;;\u001b\\', '<text>'],
    ['\u001bPpayload\u001b\\done', 'done'],
    ['\u001bXpayload\u009cdone', 'done'],
    ['\u001b^payload\u001b\\\u001b_payload\u0007done', 'done'],
    ['\u009b31m\u009dtitle\u009cdone\u009b0m', 'done'],
    ['\u001b(Bready', 'ready'],
    ['\u0000bell\u0007back\bform\fend\u007f', 'bellbackformend'],
  ] as const
  for (const [raw, text] of cases) {
    expect(projectCommandReading(raw)).toEqual({ text, changed: true })
    expect(raw).not.toBe(text)
  }
})

test('lone CR shows the last progress frame per line while ordinary CRLF and later diagnostics survive', () => {
  const cases = [
    ['Downloading\r10%\r100%', '100%'],
    ['first\nold\rnew\r\nlast\rfinal\n', 'first\nnew\r\nfinal\n'],
    ['old\r\u001b[32m雪 👩‍💻\u001b[0m\r\nend', '雪 👩‍💻\r\nend'],
    ['old\r', ''],
  ] as const
  for (const [raw, text] of cases) expect(projectCommandReading(raw)).toEqual({ text, changed: true })
})

test('incomplete or malformed escapes fail back to the whole original, never swallow diagnostic text', () => {
  for (const raw of [
    '\u001b',
    '\u001b[',
    '\u001b[12',
    '\u001b[12\nIMPORTANT',
    '\u001b]missing terminator',
    '\u001bPunterminated',
    '\u001b(\n',
    '\u001b[32mvalid\u001b]incomplete',
  ])
    expect(projectCommandReading(raw)).toEqual({ text: raw, changed: false })
})

test('visual capacity falls back without altering complete source, including the exact boundary', () => {
  const exact = '\u001b[32m' + 'x'.repeat(MAX_COMMAND_READING_CHARACTERS - 5)
  expect(projectCommandReading(exact)).toEqual({ text: exact.slice(5), changed: true })
  const oversized = exact + 'END'
  expect(projectCommandReading(oversized)).toEqual({ text: oversized, changed: false })
  const repeated = '\u001b[2Kold\r雪\r\n'.repeat(5_000)
  expect(projectCommandReading(repeated)).toEqual({ text: '雪\r\n'.repeat(5_000), changed: true })
})
