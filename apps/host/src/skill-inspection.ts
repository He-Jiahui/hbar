import { lstat, open, opendir, realpath } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type {
  SkillDescriptor,
  SkillDetail,
  SkillFileEntry,
  SkillFileReadResult,
} from '@hbar/contracts/commands/extensions'

const MAX_SKILLS = 10_000
const MAX_SCANNED_ENTRIES = 2_000
const MAX_DEPTH = 8
const MAX_FILES = 200
const MAX_TEXT_BYTES = 256 * 1024
const MAX_IN_FLIGHT = 8

const textExtensions = new Set([
  '.bat',
  '.c',
  '.cc',
  '.cfg',
  '.conf',
  '.cpp',
  '.css',
  '.csv',
  '.fish',
  '.go',
  '.graphql',
  '.h',
  '.hpp',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsonl',
  '.jsx',
  '.kt',
  '.less',
  '.md',
  '.mdx',
  '.patch',
  '.ps1',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svelte',
  '.svg',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
])
const textNames = new Set(['Dockerfile', 'LICENSE', 'Makefile', 'README'])

interface SkillRecord extends SkillDescriptor {
  readonly directory: string
}

interface ReadTextResult {
  readonly text: string
  readonly truncated: boolean
}

interface ParsedEntry {
  readonly displayName: string
  readonly description: string
  readonly body: string
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = process.platform === 'win32' ? left.toLowerCase() : left
  const normalizedRight = process.platform === 'win32' ? right.toLowerCase() : right
  return normalizedLeft === normalizedRight
}

function within(root: string, target: string): boolean {
  const value = relative(root, target)
  return value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value))
}

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new HbarError('CANCELLED', 'Skill inspection was cancelled')
}

function rethrowFs(error: unknown, message: string): never {
  const code = errorCode(error)
  if (code === 'EACCES' || code === 'EPERM') throw new HbarError('FORBIDDEN', message)
  throw new HbarError('SKILL_DISCOVERY_FAILED', message)
}

function isHiddenOrReserved(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules' || name === '.git'
}

function isAllowedTextPath(path: string): boolean {
  const name = path.split(/[\\/]/).at(-1) ?? ''
  return name === 'SKILL.md' || textNames.has(name) || textExtensions.has(extname(name).toLowerCase())
}

function pathSegments(value: string): string[] {
  if (!value || value.length > 4_000 || isAbsolute(value) || value.startsWith('/') || value.startsWith('\\'))
    throw new HbarError('INVALID_INPUT', 'Skill file path must be relative')
  const segments = value.split(/[\\/]/)
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        isHiddenOrReserved(segment) ||
        segment.includes(':') ||
        [...segment].some((character) => character.charCodeAt(0) < 0x20 || character === '\u007f'),
    )
  )
    throw new HbarError('FORBIDDEN', 'Skill file path is outside the readable skill files')
  return segments
}

interface ParsedYaml {
  readonly valid: boolean
  readonly name?: string
  readonly description?: string
}

interface YamlParser {
  readonly parse: (source: string) => unknown
}

function parseYamlStrings(source: string): ParsedYaml {
  const runtimeValue: unknown = Reflect.get(globalThis, 'Bun')
  if (!isRecord(runtimeValue)) return { valid: false }
  const yamlValue: unknown = runtimeValue.YAML
  if (!isYamlParser(yamlValue)) return { valid: false }
  let value: unknown
  try {
    value = yamlValue.parse(source)
  } catch {
    return { valid: false }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isRecord(value)) return { valid: false }
  const name =
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 256 ? value.name : undefined
  const description =
    typeof value.description === 'string' && value.description.length <= 8_000 ? value.description : undefined
  return { valid: true, ...(name === undefined ? {} : { name }), ...(description === undefined ? {} : { description }) }
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isYamlParser(value: unknown): value is YamlParser {
  return isRecord(value) && typeof value.parse === 'function'
}

function parseEntry(source: string, fallbackName: string): ParsedEntry {
  const withoutBom = source.startsWith('\uFEFF') ? source.slice(1) : source
  if (!withoutBom.startsWith('---')) return { displayName: fallbackName, description: '', body: source }
  const firstLineEnd = withoutBom.indexOf('\n')
  if (firstLineEnd < 0 || withoutBom.slice(0, firstLineEnd).trim() !== '---')
    return { displayName: fallbackName, description: '', body: source }
  const frontmatterStart = firstLineEnd + 1
  const closingMatch = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(withoutBom.slice(frontmatterStart))
  if (!closingMatch || closingMatch.index === undefined)
    return { displayName: fallbackName, description: '', body: source }
  const closingStart = frontmatterStart + closingMatch.index
  const frontmatter = withoutBom.slice(frontmatterStart, closingStart)
  const bodyStart = closingStart + closingMatch[0].length
  const metadata = parseYamlStrings(frontmatter)
  if (!metadata.valid) return { displayName: fallbackName, description: '', body: source }
  return {
    displayName: metadata.name ?? fallbackName,
    description: metadata.description ?? '',
    body: withoutBom.slice(bodyStart),
  }
}

async function withPermit<T>(active: { value: number }, signal: AbortSignal | undefined, operation: () => Promise<T>) {
  checkSignal(signal)
  if (active.value >= MAX_IN_FLIGHT) throw new HbarError('BUSY', 'Skill inspection capacity is exhausted')
  active.value++
  try {
    return await operation()
  } finally {
    active.value--
  }
}

export interface SkillInspectionService {
  list(signal?: AbortSignal): Promise<SkillDescriptor[]>
  inspect(id: string, signal?: AbortSignal): Promise<SkillDetail | null>
  readFile(id: string, path: string, signal?: AbortSignal): Promise<SkillFileReadResult | null>
}

export function createSkillInspectionService(skillsRoot: string): SkillInspectionService {
  const active = { value: 0 }
  async function canonicalRoot(): Promise<string | null> {
    const root = resolve(skillsRoot)
    let info
    try {
      info = await lstat(root)
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null
      return rethrowFs(error, 'Global skill discovery root cannot be read')
    }
    if (info.isSymbolicLink()) throw new HbarError('FORBIDDEN', 'Global skill discovery root cannot be a symbolic link')
    if (!info.isDirectory())
      throw new HbarError('SKILL_DISCOVERY_FAILED', 'Global skill discovery root is not a directory')
    return realpath(root).catch((error: unknown) => {
      if (errorCode(error) === 'ENOENT') return null
      return rethrowFs(error, 'Global skill discovery root cannot be read')
    })
  }

  async function discover(signal?: AbortSignal): Promise<SkillRecord[]> {
    checkSignal(signal)
    const root = await canonicalRoot()
    if (!root) return []
    let entries: Dirent[]
    try {
      const directoryHandle = await opendir(root)
      try {
        entries = []
        for await (const entry of directoryHandle) {
          entries.push(entry)
          if (entries.length > MAX_SKILLS) throw new HbarError('INPUT_TOO_LARGE', 'Too many global skills to inspect')
        }
      } finally {
        await directoryHandle.close().catch(() => {})
      }
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return []
      if (error instanceof HbarError) throw error
      return rethrowFs(error, 'Global skill discovery root cannot be read')
    }
    const result: SkillRecord[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      checkSignal(signal)
      if (isHiddenOrReserved(entry.name)) continue
      if (!isSafeSkillId(entry.name)) continue
      const candidate = join(root, entry.name)
      let info
      try {
        info = await lstat(candidate)
      } catch (error) {
        if (errorCode(error) === 'ENOENT') continue
        return rethrowFs(error, 'A global skill entry cannot be inspected')
      }
      if (!info.isDirectory() || info.isSymbolicLink()) continue
      let canonical: string
      try {
        canonical = await realpath(candidate)
      } catch (error) {
        if (errorCode(error) === 'ENOENT') continue
        return rethrowFs(error, 'A global skill entry cannot be inspected')
      }
      if (!within(root, canonical)) continue
      const latest = await lstat(candidate).catch((error: unknown) => {
        if (errorCode(error) === 'ENOENT') return null
        return rethrowFs(error, 'A global skill entry cannot be inspected')
      })
      if (!latest || latest.isSymbolicLink() || !latest.isDirectory()) continue
      result.push({ id: entry.name, path: canonical, scope: 'global', directory: canonical })
    }
    return result
  }

  function isSafeSkillId(id: string): boolean {
    return (
      id.length > 0 &&
      id.length <= 160 &&
      !isHiddenOrReserved(id) &&
      ![...id].some((character) => character.charCodeAt(0) < 0x20 || character === '\u007f')
    )
  }

  async function checkedTarget(directory: string, path: string, signal?: AbortSignal): Promise<string | null> {
    checkSignal(signal)
    const segments = pathSegments(path)
    if (!isAllowedTextPath(path)) throw new HbarError('UNSUPPORTED_TYPE', 'Skill file is not a readable text file')
    const target = join(directory, ...segments)
    if (!within(directory, resolve(target))) throw new HbarError('FORBIDDEN', 'Skill file path is outside the skill')
    let current = directory
    for (const [index, segment] of segments.entries()) {
      current = join(current, segment)
      let segmentInfo
      try {
        segmentInfo = await lstat(current)
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return null
        return rethrowFs(error, 'Skill file cannot be read')
      }
      if (segmentInfo.isSymbolicLink()) throw new HbarError('FORBIDDEN', 'Symbolic links are not readable skill files')
      const segmentCanonical = await realpath(current).catch((error: unknown) => {
        if (errorCode(error) === 'ENOENT') return null
        return rethrowFs(error, 'Skill file cannot be read')
      })
      if (!segmentCanonical || !within(directory, segmentCanonical))
        throw new HbarError('FORBIDDEN', 'Skill file is outside the skill')
      if (index < segments.length - 1 && !segmentInfo.isDirectory())
        throw new HbarError('UNSUPPORTED_TYPE', 'Skill file parent is not a directory')
    }
    return target
  }

  async function secureRead(directory: string, path: string, signal?: AbortSignal): Promise<ReadTextResult | null> {
    const target = await checkedTarget(directory, path, signal)
    if (!target) return null
    let before
    try {
      before = await lstat(target)
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null
      return rethrowFs(error, 'Skill file cannot be read')
    }
    if (before.isSymbolicLink()) throw new HbarError('FORBIDDEN', 'Symbolic links are not readable skill files')
    if (!before.isFile()) throw new HbarError('UNSUPPORTED_TYPE', 'Skill path is not a regular text file')
    const canonical = await realpath(target).catch((error: unknown) => {
      if (errorCode(error) === 'ENOENT') return null
      return rethrowFs(error, 'Skill file cannot be read')
    })
    if (!canonical || !within(directory, canonical)) throw new HbarError('FORBIDDEN', 'Skill file is outside the skill')
    checkSignal(signal)
    const handle = await open(target, 'r').catch((error: unknown) => rethrowFs(error, 'Skill file cannot be read'))
    try {
      const after = await handle.stat()
      if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino)
        throw new HbarError('FORBIDDEN', 'Skill file changed while it was being read')
      const canonicalAfterOpen = await realpath(target).catch((error: unknown) => {
        if (errorCode(error) === 'ENOENT') return null
        return rethrowFs(error, 'Skill file cannot be read')
      })
      if (!canonicalAfterOpen || !within(directory, canonicalAfterOpen))
        throw new HbarError('FORBIDDEN', 'Skill file is outside the skill')
      const targetBytes = Math.min(after.size, MAX_TEXT_BYTES)
      const buffer = Buffer.allocUnsafe(targetBytes)
      let bytesRead = 0
      while (bytesRead < targetBytes) {
        checkSignal(signal)
        const read = await handle.read(buffer, bytesRead, targetBytes - bytesRead, bytesRead)
        if (!read.bytesRead) break
        bytesRead += read.bytesRead
      }
      checkSignal(signal)
      const latest = await handle.stat()
      const truncated = after.size > MAX_TEXT_BYTES
      if (
        latest.size !== after.size ||
        latest.dev !== after.dev ||
        latest.ino !== after.ino ||
        bytesRead !== targetBytes
      )
        throw new HbarError('FORBIDDEN', 'Skill file changed while it was being read')
      const bytes = buffer.subarray(0, bytesRead)
      if (bytes.includes(0)) throw new HbarError('UNSUPPORTED_TYPE', 'Skill file is binary data')
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true })
        const text = truncated ? decoder.decode(bytes, { stream: true }) : decoder.decode(bytes)
        return { text, truncated }
      } catch {
        throw new HbarError('UNSUPPORTED_TYPE', 'Skill file is not valid UTF-8 text')
      }
    } finally {
      await handle.close().catch(() => {})
    }
  }

  async function indexFiles(
    directory: string,
    signal?: AbortSignal,
  ): Promise<{ files: SkillFileEntry[]; truncated: boolean }> {
    const files: SkillFileEntry[] = []
    let scanned = 0
    let truncated = false
    const visit = async (current: string, depth: number, prefix: string): Promise<void> => {
      checkSignal(signal)
      if (depth > MAX_DEPTH) {
        truncated = true
        return
      }
      let entries: Dirent[]
      try {
        const directoryHandle = await opendir(current)
        try {
          entries = []
          for await (const entry of directoryHandle) {
            checkSignal(signal)
            if (scanned + entries.length >= MAX_SCANNED_ENTRIES) {
              truncated = true
              break
            }
            entries.push(entry)
          }
        } finally {
          await directoryHandle.close().catch(() => {})
        }
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return
        return rethrowFs(error, 'Skill files cannot be indexed')
      }
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        checkSignal(signal)
        if (scanned >= MAX_SCANNED_ENTRIES) {
          truncated = true
          return
        }
        scanned++
        if (isHiddenOrReserved(entry.name)) continue
        const child = join(current, entry.name)
        let info
        try {
          info = await lstat(child)
        } catch (error) {
          if (errorCode(error) === 'ENOENT') continue
          return rethrowFs(error, 'Skill files cannot be indexed')
        }
        if (info.isSymbolicLink()) continue
        const childCanonical = await realpath(child).catch((error: unknown) => {
          if (errorCode(error) === 'ENOENT') return null
          return rethrowFs(error, 'Skill files cannot be indexed')
        })
        if (!childCanonical || !within(directory, childCanonical)) continue
        const path = prefix ? `${prefix}/${entry.name}` : entry.name
        if (info.isDirectory()) {
          await visit(child, depth + 1, path)
        } else if (info.isFile() && isAllowedTextPath(path)) {
          files.push({ path, size: Math.max(0, info.size) })
        }
      }
    }
    await visit(directory, 0, '')
    files.sort((left, right) =>
      left.path === 'SKILL.md' ? -1 : right.path === 'SKILL.md' ? 1 : left.path.localeCompare(right.path),
    )
    if (files.length > MAX_FILES) truncated = true
    return { files: files.slice(0, MAX_FILES), truncated }
  }

  return {
    list: (signal) =>
      withPermit(active, signal, async () =>
        (await discover(signal)).map(({ directory: _directory, ...item }) => item),
      ),
    inspect: (id, signal) =>
      withPermit(active, signal, async () => {
        const item = (await discover(signal)).find((candidate) => candidate.id === id)
        if (!item) return null
        const indexed = await indexFiles(item.directory, signal)
        const entry = await secureRead(item.directory, 'SKILL.md', signal)
        const parsed = entry ? parseEntry(entry.text, item.id) : { displayName: item.id, description: '', body: '' }
        return {
          id: item.id,
          path: item.path,
          scope: item.scope,
          entryPath: entry ? 'SKILL.md' : null,
          displayName: parsed.displayName,
          description: parsed.description,
          body: parsed.body,
          files: indexed.files,
          filesTruncated: indexed.truncated,
          entryTruncated: entry?.truncated ?? false,
        }
      }),
    readFile: (id, path, signal) =>
      withPermit(active, signal, async () => {
        const item = (await discover(signal)).find((candidate) => candidate.id === id)
        if (!item) return null
        const requested = pathSegments(path).join('/')
        const indexed = await indexFiles(item.directory, signal)
        if (!indexed.files.some((file) => samePath(file.path, requested))) {
          const target = await checkedTarget(item.directory, requested, signal)
          if (!target) return null
          throw new HbarError('FORBIDDEN', 'Skill file is not in the indexed readable files')
        }
        const result = await secureRead(item.directory, requested, signal)
        if (!result) return null
        return { id: item.id, path: requested, text: result.text, truncated: result.truncated }
      }),
  }
}

export const skillInspectionLimits = {
  maxSkills: MAX_SKILLS,
  maxScannedEntries: MAX_SCANNED_ENTRIES,
  maxDepth: MAX_DEPTH,
  maxFiles: MAX_FILES,
  maxTextBytes: MAX_TEXT_BYTES,
  maxInFlight: MAX_IN_FLIGHT,
} as const
