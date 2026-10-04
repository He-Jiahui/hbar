import type { HbarMessageBlocksProps } from '@hbar/app-react'
import { toolCallPresentationSchema, type ToolCallPresentation } from '@hbar/contracts'
import type { ShellLocale } from './shell-copy'

type Presenter = NonNullable<HbarMessageBlocksProps['describeTool']>
type Presentation = ReturnType<Presenter>

export const TOOL_SUMMARY_CODE_POINTS = 160
export const TOOL_TITLE_CODE_POINTS = 4000
export const TOOL_DISPLAY_SCAN_UNITS = 8192
export const TOOL_INCLUDE_ITEMS = 8

interface DisplayText {
  readonly text: string
  readonly truncated: boolean
}

interface Copy {
  readonly labels: Readonly<Record<ToolCallPresentation['kind'], string>>
  readonly requested: string
  readonly tool: string
  readonly toolCall: string
  readonly path: string
  readonly command: string
  readonly description: string
  readonly pattern: string
  readonly query: string
  readonly include: string
  readonly truncated: string
}

function copyFor(locale: ShellLocale): Copy {
  return locale === 'zh-CN'
    ? {
        labels: {
          'file-read': '读取文件',
          'file-write': '写入文件',
          'file-edit': '编辑文件',
          'directory-list': '列出目录',
          command: '运行命令',
          'text-search': '搜索文本',
          'file-search': '查找文件',
        },
        requested: '请求输入',
        tool: '工具',
        toolCall: '工具调用',
        path: '路径',
        command: '命令',
        description: '说明',
        pattern: '搜索内容',
        query: '文件名',
        include: '匹配模式',
        truncated: ' [已截断；展开输入可查看原值]',
      }
    : {
        labels: {
          'file-read': 'Read file',
          'file-write': 'Write file',
          'file-edit': 'Edit file',
          'directory-list': 'List directory',
          command: 'Run command',
          'text-search': 'Search text',
          'file-search': 'Find files',
        },
        requested: 'Requested input',
        tool: 'Tool',
        toolCall: 'Tool call',
        path: 'Path',
        command: 'Command',
        description: 'Description',
        pattern: 'Pattern',
        query: 'File name',
        include: 'Include patterns',
        truncated: ' [truncated; expand Input for the original]',
      }
}

/** Never evaluate an accessor or coerce an arbitrary argument into visible text. */
function ownData(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined
}

function ownString(value: unknown, key: string | undefined): string | undefined {
  if (key === undefined) return undefined
  const candidate = ownData(value, key)
  return typeof candidate === 'string' ? candidate : undefined
}

/** Validate a small JSON descriptor without allowing Zod to invoke supplied getters. */
function declaration(value: unknown): ToolCallPresentation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype) return null
  const record: Record<string, unknown> = {}
  let count = 0
  for (const key in value) {
    if (!Object.hasOwn(value, key) || ++count > 6) return null
    const property = Object.getOwnPropertyDescriptor(value, key)
    if (!property || !Object.hasOwn(property, 'value')) return null
    // defineProperty also makes a malicious __proto__ an ordinary key for strict validation.
    Object.defineProperty(record, key, { value: property.value, enumerable: true })
  }
  const parsed = toolCallPresentationSchema.safeParse(record)
  return parsed.success ? parsed.data : null
}

function isDisplayControl(point: number): boolean {
  return (
    point < 0x20 ||
    (point >= 0x7f && point <= 0x9f) ||
    point === 0x061c ||
    point === 0x200e ||
    point === 0x200f ||
    (point >= 0x202a && point <= 0x202e) ||
    (point >= 0x2066 && point <= 0x2069)
  )
}

/** Prefix scan is bounded independently of source size, including all-whitespace inputs. */
function display(value: string | undefined): DisplayText {
  if (value === undefined) return { text: '', truncated: false }
  let text = ''
  let points = 0
  let offset = 0
  let space = false
  while (offset < value.length && offset < TOOL_DISPLAY_SCAN_UNITS && points <= TOOL_TITLE_CODE_POINTS) {
    const point = value.codePointAt(offset)
    if (point === undefined) break
    const size = point > 0xffff ? 2 : 1
    if (offset + size > TOOL_DISPLAY_SCAN_UNITS) break
    offset += size
    const character = String.fromCodePoint(point)
    if (/\s/u.test(character)) {
      space = text.length > 0
      continue
    }
    const safe = isDisplayControl(point)
      ? `\\u${point.toString(16).padStart(4, '0')}`
      : point >= 0xd800 && point <= 0xdfff
        ? '\ufffd'
        : character
    if (space) {
      text += ' '
      points++
      space = false
    }
    text += safe
    points += safe === character ? 1 : safe.length
  }
  return { text, truncated: offset < value.length }
}

function limit(text: string, capacity: number, suffix: string, alreadyTruncated = false): string {
  // Only bounded, already extracted display strings reach this function.
  const points = Array.from(text)
  if (!alreadyTruncated && points.length <= capacity) return text
  return points.slice(0, Math.max(0, capacity - Array.from(suffix).length)).join('') + suffix
}

/** A bounded tail lookup avoids scanning a million-character path just to find its leaf. */
function basename(value: string | undefined): DisplayText {
  if (value === undefined) return display(undefined)
  let start = Math.max(0, value.length - TOOL_DISPLAY_SCAN_UNITS)
  const first = value.charCodeAt(start)
  const previous = value.charCodeAt(start - 1)
  if (start > 0 && first >= 0xdc00 && first <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff) start++
  const tail = value.slice(start)
  const withoutTrailingSeparators = tail.replace(/[/\\]+$/u, '')
  const bounded = withoutTrailingSeparators || tail
  const separator = Math.max(bounded.lastIndexOf('/'), bounded.lastIndexOf('\\'))
  const leaf = separator >= 0 ? bounded.slice(separator + 1) : bounded
  const result = display(leaf || bounded)
  return start > 0 && separator < 0 ? { text: `…${result.text}`, truncated: true } : result
}

function includes(value: unknown): DisplayText {
  if (!Array.isArray(value)) return display(undefined)
  const length = ownData(value, 'length')
  if (typeof length !== 'number') return display(undefined)
  const parts: string[] = []
  let truncated = length > TOOL_INCLUDE_ITEMS
  for (let index = 0; index < Math.min(length, TOOL_INCLUDE_ITEMS); index++) {
    const item = display(ownString(value, String(index)))
    if (item.text) parts.push(item.text)
    truncated ||= item.truncated
  }
  return { text: parts.join(', '), truncated }
}

function present(call: Parameters<Presenter>[0], copy: Copy): Presentation {
  const captured = declaration(ownData(call, 'presentation'))
  const name = display(ownString(call, 'name'))
  if (!captured)
    return {
      icon: 'tool',
      label: copy.toolCall,
      ...(name.text ? { summary: limit(name.text, TOOL_SUMMARY_CODE_POINTS, '…', name.truncated) } : {}),
      title: limit(name.text, TOOL_TITLE_CODE_POINTS, copy.truncated, name.truncated),
    }
  const args = ownData(call, 'args')
  const fields: string[] = []
  let truncated = name.truncated
  let summary: DisplayText = display(undefined)
  let summaryFormat: 'code' | 'text' = 'code'
  let icon: Presentation['icon'] = 'tool'
  let requestedCommand: string | undefined
  const field = (label: string, value: DisplayText) => {
    if (value.text) fields.push(`${label}: ${value.text}`)
    truncated ||= value.truncated
    return value
  }
  const path = (key: string | undefined) => {
    const raw = ownString(args, key)
    field(copy.path, display(raw))
    return basename(raw)
  }
  switch (captured.kind) {
    case 'file-read':
    case 'file-write':
    case 'file-edit':
    case 'directory-list':
      icon = (
        {
          'file-read': 'file',
          'file-write': 'file-write',
          'file-edit': 'file-edit',
          'directory-list': 'directory',
        } as const
      )[captured.kind]
      summary = path(captured.pathField)
      break
    case 'command': {
      icon = 'terminal'
      const rawCommand = ownString(args, captured.commandField)
      const command = field(copy.command, display(rawCommand))
      // Separate exact reading data from the bounded/sanitized compact summary.
      // Do not replace raw JSON or infer shell semantics from a tool's name.
      if (rawCommand && /\S/u.test(rawCommand.slice(0, TOOL_DISPLAY_SCAN_UNITS))) requestedCommand = rawCommand
      const description = field(copy.description, display(ownString(args, captured.descriptionField)))
      summary = description.text ? description : command
      if (description.text) summaryFormat = 'text'
      break
    }
    case 'text-search':
      icon = 'search'
      summary = field(copy.pattern, display(ownString(args, captured.patternField)))
      path(captured.pathField)
      break
    case 'file-search': {
      icon = 'search'
      const query = field(copy.query, display(ownString(args, captured.queryField)))
      const patterns = query.text
        ? display(undefined)
        : field(copy.include, includes(captured.includeField ? ownData(args, captured.includeField) : undefined))
      summary = query.text ? query : patterns
      path(captured.pathField)
      break
    }
  }
  const label = copy.labels[captured.kind]
  const title = [label, ...(name.text ? [`${copy.tool}: ${name.text}`] : []), copy.requested, ...fields].join(' · ')
  return {
    icon,
    label,
    title: limit(title, TOOL_TITLE_CODE_POINTS, copy.truncated, truncated),
    ...(requestedCommand !== undefined ? { command: requestedCommand } : {}),
    ...(summary.text
      ? { summary: limit(summary.text, TOOL_SUMMARY_CODE_POINTS, '…', summary.truncated), summaryFormat }
      : {}),
  }
}

/** Host locale adapter for captured requested-input semantics; never replaces raw JSON Input. */
export function createSessionToolPresenter(locale: ShellLocale): Presenter {
  const copy = copyFor(locale)
  return (call) => {
    try {
      return present(call, copy)
    } catch {
      // Non-JSON proxies can reject reflection. They must not break the message viewport.
      return { icon: 'tool' }
    }
  }
}
