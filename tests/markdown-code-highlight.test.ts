import { describe, expect, test } from 'bun:test'
import {
  canHighlightCode,
  codeTokenRanges,
  highlightMarkdownCode,
  MAX_CODE_HIGHLIGHT_CHARACTERS,
  MAX_CODE_HIGHLIGHT_LINES,
  MAX_CODE_HIGHLIGHT_LINE_CHARACTERS,
  MAX_CODE_HIGHLIGHT_TOKENS,
  MAX_CODE_HIGHLIGHT_ACTIVE,
  MAX_CODE_HIGHLIGHT_PENDING,
} from '../packages/app-react/src/markdown-code-highlight'

describe('Markdown syntax is visual enrichment of one original source', () => {
  test('pinned local grammars expose reference reading roles without rewriting source', async () => {
    const samples = [
      { language: 'ts', source: '// 中文 note\r\nexport const result = "👩‍💻 é";\r\n\tconsole.log(result, 42);\r\n\r\n' },
      { language: 'python', source: '# note\nprint("hello", 42)\n' },
      { language: 'json', source: '{ "ready": true, "count": 42 }\n' },
      { language: 'sql', source: 'SELECT name FROM users WHERE id = 42;\n' },
      { language: 'rust', source: 'fn main() { println!("hello"); }\n' },
    ]
    for (const sample of samples) {
      const ranges = await highlightMarkdownCode(sample.source, sample.language, new AbortController().signal)
      expect(ranges).not.toBeNull()
      expect(ranges?.map((range) => sample.source.slice(range.start, range.end)).join('')).toBe(sample.source)
      expect(ranges?.some((range) => range.role !== 'plain')).toBe(true)
    }
    const ts = await highlightMarkdownCode(samples[0]?.source ?? '', 'typescript', new AbortController().signal)
    expect(ts?.some((range) => range.role === 'keyword')).toBe(true)
    expect(ts?.some((range) => range.role === 'comment')).toBe(true)
    expect(ts?.some((range) => range.role === 'string')).toBe(true)
    expect(ts?.some((range) => range.role === 'number')).toBe(true)
  })

  test('whole-source grammar keeps a comment across the folded twentieth line', async () => {
    const source = `/*\n${Array.from({ length: 22 }, (_, i) => `const hidden${i} = "still comment"`).join('\n')}\n*/\nexport const ready = true\n`
    const ranges = await highlightMarkdownCode(source, 'typescript', new AbortController().signal)
    const hidden = source.indexOf('const hidden21')
    expect(ranges?.find((range) => range.start <= hidden && range.end > hidden)?.role).toBe('comment')
    const exported = source.indexOf('export const')
    expect(ranges?.find((range) => range.start <= exported && range.end > exported)?.role).toBe('keyword')
    expect(ranges?.map((range) => source.slice(range.start, range.end)).join('')).toBe(source)
  })

  test('token offsets retain original CRLF, lone CR, tabs and final blank lines', () => {
    const source = '\tα\r\n\r\nβ\rγ\n\n'
    const ranges = codeTokenRanges(source, [
      [{ content: '\tα', offset: 0, color: '#b8533b' }],
      [],
      [{ content: 'β\rγ', offset: 6, color: '#437220' }],
      [],
    ])
    expect(ranges?.map((range) => source.slice(range.start, range.end)).join('')).toBe(source)
    expect(ranges?.[0]?.role).toBe('keyword')
    expect(codeTokenRanges('word', [[{ offset: 1, content: 'ord' }]])).toBeNull()
    expect(codeTokenRanges('word', [[{ offset: 0, content: 'wrong' }]])).toBeNull()
    expect(
      codeTokenRanges('word', [
        [
          { offset: 0, content: 'word' },
          { offset: 0, content: 'word' },
        ],
      ]),
    ).toBeNull()
    expect(codeTokenRanges('word', [[{ offset: NaN, content: 'word' }]])).toBeNull()
  })

  test('capacity boundaries reject highlighting, never truncate the caller source', async () => {
    const max = Array.from({ length: 16 }, () => 'x'.repeat(4095)).join('\n') + '\n'
    expect(max.length).toBe(MAX_CODE_HIGHLIGHT_CHARACTERS)
    expect(canHighlightCode(max)).toBe(true)
    expect(canHighlightCode(max + '\n')).toBe(false)
    expect(canHighlightCode('x'.repeat(MAX_CODE_HIGHLIGHT_LINE_CHARACTERS))).toBe(true)
    expect(canHighlightCode('x'.repeat(MAX_CODE_HIGHLIGHT_LINE_CHARACTERS + 1))).toBe(false)
    expect(canHighlightCode('x\n'.repeat(MAX_CODE_HIGHLIGHT_LINES - 1))).toBe(true)
    expect(canHighlightCode('x\n'.repeat(MAX_CODE_HIGHLIGHT_LINES))).toBe(false)
    const tokens = Array.from({ length: MAX_CODE_HIGHLIGHT_TOKENS }, (_, offset) => ({ offset, content: 'x' }))
    expect(codeTokenRanges('x'.repeat(tokens.length), [tokens])).not.toBeNull()
    expect(
      codeTokenRanges('x'.repeat(tokens.length + 1), [[...tokens, { offset: tokens.length, content: 'x' }]]),
    ).toBeNull()
    expect(await highlightMarkdownCode(max + '\n', 'ts', new AbortController().signal)).toBeNull()
    expect((max + '\n').length).toBe(MAX_CODE_HIGHLIGHT_CHARACTERS + 1)
  })

  test('unknown labels, missing language and cancellation fall back to plaintext', async () => {
    const source = '<script>not executed</script>\n'
    expect(await highlightMarkdownCode(source, '../../custom-grammar', new AbortController().signal)).toBeNull()
    expect(await highlightMarkdownCode(source, null, new AbortController().signal)).toBeNull()
    expect(await highlightMarkdownCode(source, 'x'.repeat(65), new AbortController().signal)).toBeNull()
    expect(await highlightMarkdownCode('', 'ts', new AbortController().signal)).toBeNull()
    const controller = new AbortController()
    const result = highlightMarkdownCode('const active = true', 'ts', controller.signal)
    controller.abort()
    expect(await result).toBeNull()
    expect(await highlightMarkdownCode(source, 'ts', controller.signal)).toBeNull()
  })

  test('bounded pending work cancels without losing capacity or publishing an old result', async () => {
    const controllers = Array.from(
      { length: MAX_CODE_HIGHLIGHT_ACTIVE + MAX_CODE_HIGHLIGHT_PENDING },
      () => new AbortController(),
    )
    const results = controllers.map((controller) =>
      highlightMarkdownCode('const capacity = true', 'ts', controller.signal),
    )
    const rejected = highlightMarkdownCode('const excess = true', 'ts', new AbortController().signal)
    controllers[MAX_CODE_HIGHLIGHT_ACTIVE]?.abort()
    const replacement = highlightMarkdownCode('const replacement = true', 'ts', new AbortController().signal)
    expect(await rejected).toBeNull()
    const settled = await Promise.all(results)
    expect(settled[MAX_CODE_HIGHLIGHT_ACTIVE]).toBeNull()
    expect(settled.filter((ranges) => ranges !== null)).toHaveLength(controllers.length - 1)
    expect(await replacement).not.toBeNull()
  })
})
