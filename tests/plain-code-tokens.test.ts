import { expect, test } from 'bun:test'
import { plainCodeTokenRanges, serializedReadingLanguage } from '../packages/app-react/src/plain-code-tokens'
import {
  MAX_CODE_HIGHLIGHT_CHARACTERS,
  MAX_CODE_HIGHLIGHT_LINES,
  MAX_CODE_HIGHLIGHT_LINE_CHARACTERS,
} from '../packages/app-react/src/markdown-code-highlight'

test('lexical source colors distinguish JSON, paths, URLs and log levels without rewriting text', () => {
  const source =
    '{"path":"C:\\项目\\file.ts","ready":true,"count":42}\r\nERROR: missing ./src/file.ts:12\r\nWARN: inspect https://example.invalid/文档?q=1\nDEBUG: é 🐙'
  const ranges = plainCodeTokenRanges(source)
  expect(ranges).not.toBeNull()
  expect(ranges?.map((range) => source.slice(range.start, range.end)).join('')).toBe(source)
  for (const role of ['property', 'string', 'keyword', 'number', 'path', 'link', 'deleted', 'type', 'comment']) {
    expect(ranges?.some((range) => range.role === role)).toBe(true)
  }
  expect(serializedReadingLanguage('{"path":"file.ts","count":42}')).toBe('json')
  expect(serializedReadingLanguage('[1,2,3]')).toBe('json')
  for (const plain of ['', 'ERROR: { failed }', '{"unfinished":', '42', '"quoted"', '[INFO] successful'])
    expect(serializedReadingLanguage(plain)).toBeNull()
  const literalHtml = 'ERROR: ./src/file.ts <script>alert(1)</script>'
  expect(
    plainCodeTokenRanges(literalHtml)
      ?.filter((range) => range.role === 'path')
      .map((range) => literalHtml.slice(range.start, range.end)),
  ).toEqual(['./src/file.ts'])
})

test('plain and adversarial content retains exact source and bounded highlighting capacity', () => {
  for (const source of [
    'plain 未着色词汇',
    '<script>alert(1)</script>',
    '"'.repeat(1000),
    '\\"'.repeat(1000),
    'const 👩‍💻 = true;\r\n',
    '',
  ]) {
    const ranges = plainCodeTokenRanges(source)
    expect(ranges ? ranges.map((range) => source.slice(range.start, range.end)).join('') : source).toBe(source)
  }
  for (const source of [
    'x'.repeat(MAX_CODE_HIGHLIGHT_CHARACTERS + 1),
    '\n'.repeat(MAX_CODE_HIGHLIGHT_LINES),
    'x'.repeat(MAX_CODE_HIGHLIGHT_LINE_CHARACTERS + 1),
    Array.from({ length: 500 }, () => '1 '.repeat(12)).join('\n'),
  ]) {
    expect(plainCodeTokenRanges(source)).toBeNull()
  }
  expect(plainCodeTokenRanges('x'.repeat(MAX_CODE_HIGHLIGHT_LINE_CHARACTERS))).not.toBeNull()
})
