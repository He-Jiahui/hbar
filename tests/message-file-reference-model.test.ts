import { describe, expect, it } from 'bun:test'
import { messageFileReferenceLinks } from '../packages/app-react/src/message-file-reference-links'
import {
  parseMessageFileReference,
  splitMessageFileReferences,
} from '../packages/app-react/src/message-file-reference-model'

type TestRoot = Parameters<ReturnType<typeof messageFileReferenceLinks>>[0]
type TestElement = Extract<TestRoot['children'][number], { type: 'element' }>

function elements(root: TestRoot): TestElement[] {
  const result: TestElement[] = []
  const visit = (node: TestElement): void => {
    if (node.type !== 'element') return
    result.push(node)
    for (const child of node.children) if (child.type === 'element') visit(child)
  }
  for (const child of root.children) if (child.type === 'element') visit(child)
  return result
}

describe('message file reference parser', () => {
  it('reads workspace-relative paths and line/column suffixes', () => {
    expect(parseMessageFileReference('src/main.ts:2')).toEqual({ path: 'src/main.ts', line: 2 })
    expect(parseMessageFileReference('src/main.ts:2:7')).toEqual({ path: 'src/main.ts', line: 2, column: 7 })
    expect(parseMessageFileReference('.\\src\\main.ts:2')).toEqual({ path: 'src/main.ts', line: 2 })
    expect(parseMessageFileReference('./src/./main.ts')).toEqual({ path: 'src/main.ts' })
    expect(parseMessageFileReference('文档/说明.md')).toEqual({ path: '文档/说明.md' })
    expect(parseMessageFileReference('src/main.ts:2:2000001')).toBeNull()
    expect(parseMessageFileReference('src/main.ts:2000001')).toBeNull()
    expect(parseMessageFileReference(`src/${'a'.repeat(3994)}.ts`)).toBeNull()
  })

  it('rejects URLs, protocols, absolute paths, parent traversal, and unsafe syntax', () => {
    for (const value of [
      'https://example.com/src/main.ts',
      'file://src/main.ts',
      'mailto:src/main.ts',
      '/workspace/src/main.ts',
      'C:\\workspace\\src\\main.ts',
      '//server/share/main.ts',
      '../src/main.ts',
      'src/../main.ts',
      'src/main.ts\u0000',
      'console.log',
      'README',
    ])
      expect(parseMessageFileReference(value)).toBeNull()
  })

  it('requires a known file basename and avoids domain-like prefixes', () => {
    expect(parseMessageFileReference('src/main')).toBeNull()
    expect(parseMessageFileReference('Dockerfile')).toEqual({ path: 'Dockerfile' })
    expect(parseMessageFileReference('build/Makefile')).toEqual({ path: 'build/Makefile' })
    expect(parseMessageFileReference('src/main.c')).toEqual({ path: 'src/main.c' })
    expect(parseMessageFileReference('object.c')).toBeNull()
    expect(parseMessageFileReference('.env.local')).toEqual({ path: '.env.local' })
    expect(parseMessageFileReference('example.com')).toBeNull()
    expect(parseMessageFileReference('example.com/src/main.ts')).toBeNull()
  })

  it('splits prose while preserving the exact source text', () => {
    const value = '已修复 src/main.ts:2，然后查看 notes/readme.md。'
    const parts = splitMessageFileReferences(value)
    expect(parts).toEqual([
      { kind: 'text', value: '已修复 ' },
      { kind: 'file', value: 'src/main.ts:2', reference: { path: 'src/main.ts', line: 2 } },
      { kind: 'text', value: '，然后查看 ' },
      { kind: 'file', value: 'notes/readme.md', reference: { path: 'notes/readme.md' } },
      { kind: 'text', value: '。' },
    ])
    expect(parts.map((part) => part.value).join('')).toBe(value)
  })
  it('keeps oversized tokens and out-of-range locations as text without trimming a different target', () => {
    expect(parseMessageFileReference('src/main.ts:2000001')).toBeNull()
    expect(parseMessageFileReference('src/main.ts:2:2000001')).toBeNull()
    expect(parseMessageFileReference(`src/${'a'.repeat(4000)}.ts`)).toBeNull()
    const longPunctuation = '.'.repeat(20_000)
    expect(splitMessageFileReferences(longPunctuation)).toEqual([{ kind: 'text', value: longPunctuation }])
  })

  it('does not treat serialized plan newlines or arbitrary slash prose as files', () => {
    const plan = '# 先计划，再执行\n\n- 明确交互入口与当前状态。\n- 批准后在原始任务中实施，保留未发送草稿。'
    const value = `/tool exit_plan_mode ${JSON.stringify({ plan })}`
    expect(splitMessageFileReferences(value)).toEqual([{ kind: 'text', value }])
    expect(parseMessageFileReference('and/or')).toBeNull()
    expect(parseMessageFileReference('再执行\\n-')).toBeNull()
  })
})

describe('messageFileReferenceLinks', () => {
  it('links prose, complete inline code, and authored markdown targets', () => {
    const root: TestRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            { type: 'text', value: '见 src/main.ts:2、' },
            { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: 'src/app.ts:3:4' }] },
            { type: 'text', value: '，以及' },
            {
              type: 'element',
              tagName: 'a',
              properties: { href: 'src/index.ts:5' },
              children: [{ type: 'text', value: '入口' }],
            },
            { type: 'text', value: '。' },
          ],
        },
      ],
    }
    messageFileReferenceLinks()(root)
    const links = elements(root).filter((node) => node.tagName === 'a')
    expect(links).toHaveLength(3)
    expect(links.map((node) => node.properties.dataHbarFileKind)).toEqual(['prose', 'inline', 'authored'])
    expect(links[0]?.properties).toMatchObject({
      dataHbarFilePath: 'src/main.ts',
      dataHbarFileLine: 2,
      role: 'link',
      tabIndex: 0,
    })
    expect(links[1]?.properties).toMatchObject({ dataHbarFilePath: 'src/app.ts', dataHbarFileColumn: 4 })
    expect(links[2]?.properties.href).toBeUndefined()
  })

  it('does not link URL anchors, commands, or preformatted code', () => {
    const root: TestRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'a',
              properties: { href: 'https://example.com/src/main.ts' },
              children: [{ type: 'text', value: 'https://example.com/src/main.ts' }],
            },
            { type: 'text', value: ' ' },
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [{ type: 'text', value: 'bun test src/app.ts' }],
            },
          ],
        },
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: 'src/hidden.ts' }] },
          ],
        },
      ],
    }
    messageFileReferenceLinks()(root)
    const links = elements(root).filter((node) => node.tagName === 'a')
    expect(links).toHaveLength(1)
    expect(links[0]?.properties.href).toBe('https://example.com/src/main.ts')
  })

  it('does not create nested links and keeps the visible text', () => {
    const root: TestRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'a',
              properties: { href: 'src/main.ts' },
              children: [{ type: 'text', value: 'src/main.ts' }],
            },
            { type: 'text', value: ' and src/other.ts' },
          ],
        },
      ],
    }
    messageFileReferenceLinks()(root)
    const links = elements(root).filter((node) => node.tagName === 'a')
    expect(links).toHaveLength(2)
    expect(
      links.filter((node) => node.children.some((child) => child.type === 'element' && child.tagName === 'a')),
    ).toHaveLength(0)
    const text = elements(root)
      .flatMap((node) => node.children)
      .filter((node) => node.type === 'text')
      .map((node) => node.value)
      .join('')
    expect(text).toContain('src/main.ts')
    expect(text).toContain('src/other.ts')
  })
})
