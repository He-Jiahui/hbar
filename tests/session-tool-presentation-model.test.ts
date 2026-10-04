import { expect, test } from 'bun:test'
import type { HbarMessageBlocksProps } from '@hbar/app-react'
import type { ToolCallPresentation } from '@hbar/contracts'
import {
  createSessionToolPresenter,
  TOOL_DISPLAY_SCAN_UNITS,
  TOOL_INCLUDE_ITEMS,
  TOOL_SUMMARY_CODE_POINTS,
  TOOL_TITLE_CODE_POINTS,
} from '../apps/web/src/session-tool-presentation'

type Call = Parameters<NonNullable<HbarMessageBlocksProps['describeTool']>>[0]

/** Intentionally malformed non-JSON fixtures exercise the defensive presentation boundary. */
function call(presentation: unknown, args: unknown = {}, name = 'custom_tool'): Call {
  const value: Call = { type: 'tool_call', callId: 'original-call', name, args: {} }
  Object.defineProperty(value, 'presentation', { value: presentation, enumerable: true, configurable: true })
  Object.defineProperty(value, 'args', { value: args, enumerable: true, configurable: true })
  return value
}

const read = { version: 1, kind: 'file-read', pathField: 'target' } satisfies ToolCallPresentation
const command = {
  version: 1,
  kind: 'command',
  commandField: 'script',
  descriptionField: 'purpose',
} satisfies ToolCallPresentation
const find = {
  version: 1,
  kind: 'file-search',
  queryField: 'needle',
  includeField: 'globs',
  pathField: 'root',
} satisfies ToolCallPresentation
const en = createSessionToolPresenter('en-US')
const zh = createSessionToolPresenter('zh-CN')
const points = (value: string | undefined) => Array.from(value ?? '').length
const generic = (name = 'custom_tool') =>
  ({ icon: 'tool', label: 'Tool call', summary: name, title: name }) satisfies ReturnType<typeof en>

test('localizes all seven captured families without relying on the raw tool name', () => {
  const cases = [
    [read, 'file', 'Read file', '读取文件'],
    [{ ...read, kind: 'file-write' }, 'file-write', 'Write file', '写入文件'],
    [{ ...read, kind: 'file-edit' }, 'file-edit', 'Edit file', '编辑文件'],
    [{ ...read, kind: 'directory-list' }, 'directory', 'List directory', '列出目录'],
    [command, 'terminal', 'Run command', '运行命令'],
    [{ version: 1, kind: 'text-search', patternField: 'needle' }, 'search', 'Search text', '搜索文本'],
    [find, 'search', 'Find files', '查找文件'],
  ] as const
  for (const [declaration, icon, english, chinese] of cases) {
    const input = call(declaration, { target: 'folder/file.ts', script: 'echo hello', needle: 'value' }, 'plugin.foo')
    for (const [present, label, requested] of [
      [en, english, 'Requested input'],
      [zh, chinese, '请求输入'],
    ] as const) {
      const result = present(input)
      expect(result.icon).toBe(icon)
      expect(result.label).toBe(label)
      expect(result.title).toContain('plugin.foo')
      expect(result.title).toContain(requested)
      expect(Object.hasOwn(result, 'input')).toBe(false)
    }
  }
})

test('unknown, legacy, unsupported versions and non-strict metadata remain exactly generic', () => {
  for (const metadata of [
    undefined,
    null,
    {},
    [],
    { ...read, version: 2 },
    { ...read, kind: 'future-family' },
    { ...read, extra: 'not allowed' },
    { ...read, pathField: '__proto__' },
    { ...read, pathField: 'nested.path' },
    { version: 1, kind: 'file-search' },
    { ...read, a: 1, b: 2, c: 3, d: 4 },
  ]) {
    expect(en(call(metadata, { path: 'real/path', command: 'echo forged' }, 'read_file'))).toEqual(generic('read_file'))
  }
  expect(en(call(undefined, { presentation: read, target: 'spoof.ts' }, 'read_file'))).toEqual(generic('read_file'))
})

test('generic tool tags are localized and describe only the original bounded tool name', () => {
  const original = call(undefined, { path: 'not-declared.txt', description: 'untrusted description' }, 'git_log')
  expect(en(original)).toEqual(generic('git_log'))
  expect(zh(original)).toEqual({ ...generic('git_log'), label: '工具调用' })
  const long = call(undefined, {}, 'tool_'.repeat(1000))
  expect(points(en(long).summary)).toBe(TOOL_SUMMARY_CODE_POINTS)
  expect(points(en(long).title)).toBeLessThanOrEqual(TOOL_TITLE_CODE_POINTS)
  expect(long.name.length).toBe(5000)
})

test('reads declared custom fields only and preserves full original inputs and object identities', () => {
  const nested = Object.freeze({ outcome: 'succeeded' })
  const args = Object.freeze({
    target: 'desired/file.txt',
    path: 'wrong/else.txt',
    body: 'x'.repeat(1_000_000),
    nested,
  })
  const metadata = Object.freeze({ ...read })
  const input = Object.freeze(call(metadata, args, 'not_a_builtin'))
  const before = JSON.stringify(input)
  expect(en(input).summary).toBe('file.txt')
  expect(en(input).title).toContain('desired/file.txt')
  expect(en(input).title).not.toContain('wrong/else.txt')
  expect(JSON.stringify(input)).toBe(before)
  expect(input.args).toBe(args)
  expect(input.presentation).toBe(metadata)
  expect(Object.hasOwn(en(input), 'input')).toBe(false)
})

test('both path separators and duplicate basenames retain distinct requested full targets', () => {
  const posix = en(call(read, { target: '/project/first/shared.ts' }))
  const windows = en(call(read, { target: 'D:\\other\\second\\shared.ts' }))
  expect(posix.summary).toBe('shared.ts')
  expect(windows.summary).toBe('shared.ts')
  expect(posix.title).toContain('/project/first/shared.ts')
  expect(windows.title).toContain('D:\\other\\second\\shared.ts')
  expect(posix.title).not.toBe(windows.title)
  expect(en(call(read, { target: 'mixed\\folder/file.ts' })).summary).toBe('file.ts')
  expect(en(call({ ...read, kind: 'directory-list' }, { target: 'D:\\folder\\' })).summary).toBe('folder')
  expect(en(call(read, { target: '/' })).summary).toBe('/')
})

test('empty, absent, wrong-type or whitespace paths never invent a current-directory target', () => {
  for (const target of [undefined, null, '', ' \r\n\t ', 0, false, {}, ['file.txt']]) {
    const result = en(call({ ...read, kind: 'directory-list' }, { target }))
    expect(result.icon).toBe('directory')
    expect(result.summary).toBeUndefined()
    expect(result.title).not.toContain('Path:')
    expect(Object.hasOwn(result, 'summaryFormat')).toBe(false)
  }
  expect(en(call(read, { target: 'a' })).summary).toBe('a')
})

test('declared description wins as prose while the exact requested command stays inspectable', () => {
  const described = en(call(command, { script: 'printf "hello"\r\nnext', purpose: '  List   current\tfiles ' }))
  expect(described.summary).toBe('List current files')
  expect(described.summaryFormat).toBe('text')
  expect(described.title).toContain('Command: printf "hello" next')
  expect(described.title).toContain('Description: List current files')
  expect(described.command).toBe('printf "hello"\r\nnext')
  for (const purpose of ['', ' \r\n ', 4, {}, null]) {
    const result = en(call(command, { script: 'printf "hello"', purpose, description: 'undeclared hint' }))
    expect(result.summary).toBe('printf "hello"')
    expect(result.summaryFormat).toBe('code')
    expect(result.command).toBe('printf "hello"')
  }
  expect(
    en(call({ version: 1, kind: 'command', commandField: 'script' }, { script: 'echo yes', purpose: 'ignored' }))
      .summary,
  ).toBe('echo yes')
})

test('command reading requires a captured field and never guesses, invokes or truncates the source', () => {
  const source = 'echo 雪\r\n' + 'x'.repeat(20_000)
  const original = call(command, { script: source, timeout: 123 })
  expect(en(original).command).toBe(source)
  expect(original.args.script).toBe(source)
  for (const script of [undefined, '', ' \r\n\t ', false, 42, {}, []])
    expect(en(call(command, { script })).command).toBeUndefined()
  expect(en(call(undefined, { script: source }, 'shell')).command).toBeUndefined()
  let invoked = 0
  const args = Object.defineProperty({}, 'script', {
    get: () => {
      invoked++
      return source
    },
  })
  expect(en(call(command, args)).command).toBeUndefined()
  expect(invoked).toBe(0)
})

test('text search shows only its declared pattern and requested optional path', () => {
  const metadata = { version: 1, kind: 'text-search', patternField: 'regex', pathField: 'where' }
  const result = zh(call(metadata, { regex: 'foo.*bar', where: 'C:\\项目', pattern: 'wrong' }))
  expect(result.summary).toBe('foo.*bar')
  expect(result.summaryFormat).toBe('code')
  expect(result.title).toContain('路径: C:\\项目')
  expect(result.title).not.toContain('wrong')
})

test('file query precedes include fallback; include item access is bounded at eight', () => {
  let accessed = 0
  const globs = Array.from({ length: TOOL_INCLUDE_ITEMS }, (_, index) => `pattern-${index}`)
  Object.defineProperty(globs, '8', {
    get: () => {
      accessed++
      throw new Error('must not read ninth')
    },
  })
  globs.length = 1_000_000
  const query = en(call(find, { needle: 'config', globs, root: '/work' }))
  expect(query.summary).toBe('config')
  expect(query.title).not.toContain('pattern-')
  const fallback = en(call(find, { needle: ' ', globs, root: '/work' }))
  expect(fallback.summary).toContain('pattern-7')
  expect(fallback.summary).toEndWith('…')
  expect(fallback.title).toContain('[truncated; expand Input for the original]')
  expect(accessed).toBe(0)
  for (const count of [0, 1, 8, 9]) {
    const items = Array.from({ length: count }, (_, index) => `p${index}`)
    const result = en(call(find, { globs: items }))
    expect(result.summary).toBe(count === 0 ? undefined : items.slice(0, 8).join(', ') + (count > 8 ? '…' : ''))
  }
})

test('wrong include types, sparse values and array accessors are not coerced', () => {
  let invoked = 0
  const items: unknown[] = [null, 1, {}, 'good', ' ']
  Object.defineProperty(items, '5', {
    get: () => {
      invoked++
      return 'getter value'
    },
  })
  expect(en(call(find, { globs: items })).summary).toBe('good')
  expect(en(call(find, { globs: 'not-an-array' })).summary).toBeUndefined()
  expect(invoked).toBe(0)
})

test('summary boundaries are 160 code points including ellipsis, without splitting surrogate pairs', () => {
  for (const count of [0, 1, TOOL_SUMMARY_CODE_POINTS, TOOL_SUMMARY_CODE_POINTS + 1]) {
    const result = en(call(command, { script: '😀'.repeat(count) }))
    expect(result.summary).toBe(
      count === 0 ? undefined : '😀'.repeat(Math.min(count, 159)) + (count > 160 ? '…' : count === 160 ? '😀' : ''),
    )
    expect(points(result.summary)).toBeLessThanOrEqual(TOOL_SUMMARY_CODE_POINTS)
    expect(result.summary ?? '').not.toContain('\ufffd')
  }
})

test('titles remain at most 4000 code points including localized truncation notices', () => {
  for (const present of [en, zh]) {
    for (const length of [1, 3900, 4000, 4001, 1_000_000]) {
      const result = present(call(command, { script: '😀'.repeat(length) }))
      expect(points(result.title)).toBeLessThanOrEqual(TOOL_TITLE_CODE_POINTS)
      expect(result.title).toContain('custom_tool')
      expect(result.title ?? '').not.toContain('\ufffd')
      if (length >= 4000) expect(result.title).toMatch(/truncated|已截断/u)
    }
  }
})

test('8192-unit scanning is bounded even for whitespace and a pair straddling the boundary', () => {
  const inside = en(call(command, { script: ' '.repeat(TOOL_DISPLAY_SCAN_UNITS - 2) + '😀' }))
  expect(inside.summary).toBe('😀')
  const split = en(call(command, { script: ' '.repeat(TOOL_DISPLAY_SCAN_UNITS - 1) + '😀' }))
  expect(split.summary).toBeUndefined()
  expect(split.title).toContain('truncated')
  const outside = en(call(command, { script: ' '.repeat(1_000_000) + 'NOT_SCANNED' }))
  expect(outside.summary).toBeUndefined()
  expect(outside.title).toContain('truncated')
  expect(outside.title).not.toContain('NOT_SCANNED')
})

test('long path uses a bounded tail for a real leaf and marks incomplete head inspection', () => {
  const path = `${'prefix/'.repeat(160_000)}actual-file😀.ts`
  const result = en(call(read, { target: path }))
  expect(result.summary).toBe('actual-file😀.ts')
  expect(result.title).toContain('prefix/')
  expect(result.title).toContain('truncated')
  const noSeparator = en(call(read, { target: 'x'.repeat(1_000_000) }))
  expect(noSeparator.summary).toStartWith('…')
  expect(noSeparator.summary).toEndWith('…')
  expect(points(noSeparator.summary)).toBe(160)
  const splitPair = en(call(read, { target: 'prefix😀' + 'x'.repeat(TOOL_DISPLAY_SCAN_UNITS - 1) }))
  expect(splitPair.summary ?? '').not.toContain('\ufffd')
  expect(points(splitPair.summary)).toBe(160)
})

test('line breaks and dangerous directional controls cannot create spoofed lines or reversed targets', () => {
  const result = en(call(command, { script: 'first\r\nsecond\tthird\u202efake\u2066x\u2069\u061c\u0000\u001b' }))
  expect(result.summary).toBe('first second third\\u202efake\\u2066x\\u2069\\u061c\\u0000\\u001b')
  for (const control of ['\r', '\n', '\t', '\u202e', '\u2066', '\u2069', '\u061c', '\u0000', '\u001b']) {
    expect(result.title).not.toContain(control)
  }
  expect(en(call(command, { script: '<img src=x onerror=alert(1)>' })).summary).toBe('<img src=x onerror=alert(1)>')
  expect(en(call(command, { script: '\ud800ok\udfff' })).summary).toBe('\ufffdok\ufffd')
})

test('call, descriptor, args and inherited properties never invoke getters or coercion', () => {
  let invoked = 0
  const getter = () => {
    invoked++
    throw new Error('getter must not execute')
  }
  const args = { toString: getter }
  Object.defineProperty(args, 'target', { get: getter, enumerable: true })
  expect(en(call(read, args)).summary).toBeUndefined()
  const inheritedArgs: unknown = Object.create({ target: 'inherited.ts' })
  expect(en(call(read, inheritedArgs)).summary).toBeUndefined()
  const accessorDeclaration = { version: 1, kind: 'file-read' }
  Object.defineProperty(accessorDeclaration, 'pathField', { get: getter, enumerable: true })
  expect(en(call(accessorDeclaration, {}))).toEqual(generic())
  const inheritedDeclaration: unknown = Object.create(read)
  expect(en(call(inheritedDeclaration))).toEqual(generic())
  const getterCall = call(undefined)
  Object.defineProperty(getterCall, 'presentation', { get: getter, enumerable: true })
  expect(en(getterCall)).toEqual(generic())
  const inheritedCall = call(undefined)
  Reflect.deleteProperty(inheritedCall, 'presentation')
  Object.setPrototypeOf(inheritedCall, { presentation: read })
  expect(en(inheritedCall)).toEqual(generic())
  expect(invoked).toBe(0)
})

test('rejected proxy reflection fails generic without escaping into message rendering', () => {
  const proxy = new Proxy(
    {},
    {
      getOwnPropertyDescriptor: () => {
        throw new Error('not JSON')
      },
    },
  )
  expect(en(call(read, proxy))).toEqual({ icon: 'tool' })
})
