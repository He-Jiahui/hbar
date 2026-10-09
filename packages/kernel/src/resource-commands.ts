import { createHash } from 'node:crypto'
import { open, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  RESOURCE_CANDIDATE_LIMIT,
  RESOURCE_MEDIA_LIMIT,
  resourceImagePath,
  type ResourceCandidate,
} from '@hbar/contracts/resources'
import {
  resourceCommands,
  resourceReadInputSchema,
  type ResourceReadInput,
  type ResourceResolveInput,
} from '@hbar/contracts/commands/resources'
import type { ExecutionProvider } from '@hbar/plugin-sdk'
import type { StoragePort } from '@hbar/storage'
import { workspaceFindInputSchema } from '@hbar/contracts/workspace-query'
import { createSessionWorkspaceContext, type SessionWorkspaceResolver } from './session-workspace-context'

const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
const key = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value)
const inside = (root: string, path: string): boolean => {
  const rel = relative(root, path)
  return !rel || (!rel.startsWith('..') && !isAbsolute(rel))
}
const missing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code))

/** Image signatures are checked before bytes leave the Host. SVG is only served as an image. */
export function resourceMediaMime(bytes: Uint8Array): string {
  const prefix = new TextDecoder().decode(bytes.slice(0, 512))
  if (bytes[0] === 137 && prefix.slice(1, 4) === 'PNG') return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (/^GIF8[79]a/.test(prefix)) return 'image/gif'
  if (prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP') return 'image/webp'
  if (prefix.startsWith('BM')) return 'image/bmp'
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon'
  if (prefix.slice(4, 8) === 'ftyp' && /avif|avis/.test(prefix.slice(8, 64))) return 'image/avif'
  if (/^(?:\s|<\?xml[^>]*>|<!--[^]*?-->)*<svg(?:\s|>)/i.test(prefix)) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (
      /<!DOCTYPE|<!ENTITY|<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|file:)|@import|url\(\s*["']?(?:https?:|\/\/|file:)/i.test(
        text,
      )
    )
      throw new HbarError('UNSUPPORTED_IMAGE', 'SVG contains active or external content')
    return 'image/svg+xml'
  }
  throw new HbarError('UNSUPPORTED_IMAGE', 'The resource is not a supported image')
}

export function createResourceCommands(
  storage: StoragePort,
  execution: ExecutionProvider,
  resolver: SessionWorkspaceResolver,
  protectedRoots: readonly string[] = [],
) {
  const context = createSessionWorkspaceContext(storage, resolver)
  const registry = new CommandRegistry({ execution: 'host' })
  let reads = 0
  const assertReadable = async (path: string): Promise<string> => {
    for (const root of protectedRoots)
      if (inside(resolve(root), resolve(path))) throw new HbarError('PATH_DENIED', 'Host runtime data is protected')
    const canonical = await realpath(path)
    for (const root of protectedRoots) {
      let checked: string
      try {
        checked = await realpath(root)
      } catch {
        checked = resolve(root)
      }
      if (inside(checked, canonical)) throw new HbarError('PATH_DENIED', 'Host runtime data is protected')
    }
    return canonical
  }
  const fileCandidate = async (path: string, workspacePath: string | null): Promise<ResourceCandidate | null> => {
    try {
      const canonical = await assertReadable(path)
      const info = await stat(canonical)
      if (!info.isFile()) return null
      return {
        id: hash(key(canonical)),
        kind: resourceImagePath(canonical) ? 'image' : 'file',
        name: basename(canonical),
        location: canonical,
        workspacePath,
        directory: dirname(canonical),
        mime: null,
        size: info.size,
      }
    } catch (error) {
      if (missing(error)) return null
      throw error
    }
  }
  const resolveResource = async (input: ResourceResolveInput, signal: AbortSignal) => {
    signal.throwIfAborted()
    const workspace = await context.resolve(input, signal)
    if (input.reference.kind === 'web') {
      const url = new URL(input.reference.url)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new HbarError('INVALID_INPUT', 'Unsupported resource URL')
      return {
        candidates: [
          {
            id: hash(url.href),
            kind: input.reference.image ? 'image' : 'web',
            name: url.hostname,
            location: url.href,
            workspacePath: null,
            directory: url.origin,
            mime: null,
            size: null,
          } satisfies ResourceCandidate,
        ],
        truncated: false,
      }
    }
    let path = input.reference.path
    if (path.startsWith('~/')) path = join(homedir(), path.slice(2))
    const absolute = isAbsolute(path)
    const root = resolve(workspace.path)
    const resolved = absolute ? resolve(path) : resolve(root, path)
    if (!absolute && !inside(root, resolved))
      throw new HbarError('PATH_DENIED', 'Relative resource escapes the workspace')
    const workspacePath = inside(root, resolved) ? relative(root, resolved).replaceAll('\\', '/') : null
    const exact = await fileCandidate(resolved, workspacePath)
    if (exact) {
      await context.assertCurrent(input)
      signal.throwIfAborted()
      return { candidates: [exact], truncated: false }
    }
    if (absolute || !execution.workspaceQuery) return { candidates: [], truncated: false }
    const suffix = path.replace(/^\.\//, '').replaceAll('\\', '/')
    const found = await execution.workspaceQuery.find(
      root,
      workspaceFindInputSchema.parse({ path: '.', nameQuery: basename(suffix), limit: RESOURCE_CANDIDATE_LIMIT }),
      signal,
    )
    const candidates: ResourceCandidate[] = []
    const seen = new Set<string>()
    for (const hit of found.paths) {
      signal.throwIfAborted()
      const normalized = hit.replaceAll('\\', '/')
      if (key(normalized) !== key(suffix) && !key(normalized).endsWith(`/${key(suffix)}`)) continue
      const candidate = await fileCandidate(resolve(root, hit), normalized)
      if (candidate && !seen.has(candidate.id)) {
        candidates.push(candidate)
        seen.add(candidate.id)
      }
    }
    candidates.sort((a, b) => a.location.localeCompare(b.location))
    await context.assertCurrent(input)
    signal.throwIfAborted()
    return { candidates, truncated: found.truncated }
  }
  const selected = async (input: ResourceReadInput, signal: AbortSignal): Promise<ResourceCandidate> => {
    const result = await resolveResource(input, signal)
    const candidate = result.candidates.find((item) => item.id === input.candidateId)
    if (!candidate) throw new HbarError('STALE_TARGET', 'Resource changed or disappeared; resolve it again')
    return candidate
  }
  const localBytes = async (candidate: ResourceCandidate, limit: number, signal: AbortSignal): Promise<Uint8Array> => {
    signal.throwIfAborted()
    const path = await assertReadable(candidate.location)
    const file = await open(path, 'r')
    try {
      const before = await file.stat()
      if (!before.isFile()) throw new HbarError('UNSUPPORTED_TYPE', 'Resource is not a regular file')
      if (before.size > limit) throw new HbarError('TOO_LARGE', 'Resource exceeds the preview limit')
      const bytes = new Uint8Array(before.size)
      let offset = 0
      while (offset < bytes.length) {
        signal.throwIfAborted()
        const { bytesRead } = await file.read(bytes, offset, Math.min(64 * 1024, bytes.length - offset), offset)
        if (!bytesRead) throw new HbarError('FILE_CONFLICT', 'Resource changed during reading')
        offset += bytesRead
      }
      const after = await file.stat()
      if (
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        key(await assertReadable(candidate.location)) !== key(path)
      )
        throw new HbarError('FILE_CONFLICT', 'Resource changed during reading')
      signal.throwIfAborted()
      return bytes
    } finally {
      await file.close()
    }
  }
  const remoteBytes = async (
    location: string,
    signal: AbortSignal,
  ): Promise<{ bytes: Uint8Array; declaredMime: string }> => {
    let url = new URL(location)
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new HbarError('INVALID_INPUT', 'Unsupported media URL')
      const response = await fetch(url, {
        signal,
        redirect: 'manual',
        credentials: 'omit',
        headers: { Accept: 'image/*' },
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        const target = response.headers.get('location')
        if (!target) break
        url = new URL(target, url)
        continue
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel()
        throw new HbarError('READ_FAILED', 'Media could not be fetched')
      }
      const length = Number(response.headers.get('content-length'))
      if (length > RESOURCE_MEDIA_LIMIT) {
        await response.body.cancel()
        throw new HbarError('TOO_LARGE', 'Image exceeds the preview limit')
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        for (;;) {
          signal.throwIfAborted()
          const next = await reader.read()
          if (next.done) break
          size += next.value.byteLength
          if (size > RESOURCE_MEDIA_LIMIT) throw new HbarError('TOO_LARGE', 'Image exceeds the preview limit')
          chunks.push(next.value)
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      return { bytes, declaredMime: response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '' }
    }
    throw new HbarError('READ_FAILED', 'Media redirect limit exceeded')
  }
  const bounded = async <T>(signal: AbortSignal, action: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (reads >= 4) throw new HbarError('BUSY', 'Resource reads are busy; retry shortly')
    reads++
    try {
      return await action(AbortSignal.any([signal, AbortSignal.timeout(15_000)]))
    } finally {
      reads--
    }
  }
  const translate = async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  registry.register(resourceCommands['resource.resolve'], (input, request) =>
    translate(() => resolveResource(input, request.signal)),
  )
  registry.register(resourceCommands['resource.text'], (input, request) =>
    translate(() =>
      bounded(request.signal, async (signal) => {
        const candidate = await selected(input, signal)
        if (candidate.kind !== 'file') throw new CommandError('UNSUPPORTED_TYPE', 'Resource is not a text file')
        const bytes = await localBytes(candidate, 2 * 1024 * 1024, signal)
        let text: string
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          throw new HbarError('UNSUPPORTED_TYPE', 'File is not UTF-8 text')
        }
        if (text.includes('\0')) throw new HbarError('UNSUPPORTED_TYPE', 'Binary files cannot be read as text')
        await context.assertCurrent(input)
        return { candidate, text }
      }),
    ),
  )
  return {
    ...createCommandClient(resourceCommands, registry),
    dispatch: (value: unknown, actorId: string) => registry.dispatch(value, { actorId }),
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 100 }),
    dispose: () => registry.dispose(),
    async readMedia(value: unknown, signal: AbortSignal) {
      const input = resourceReadInputSchema.parse(value)
      return bounded(signal, async (scope) => {
        const candidate = await selected(input, scope)
        if (candidate.kind !== 'image') throw new HbarError('UNSUPPORTED_IMAGE', 'Resource is not an image')
        const result =
          input.reference.kind === 'web'
            ? await remoteBytes(candidate.location, scope)
            : { bytes: await localBytes(candidate, RESOURCE_MEDIA_LIMIT, scope), declaredMime: '' }
        const mime = resourceMediaMime(result.bytes)
        const declared = result.declaredMime
          .replace('image/vnd.microsoft.icon', 'image/x-icon')
          .replace('image/apng', 'image/png')
        if (declared && !['application/octet-stream', mime].includes(declared))
          throw new HbarError('CONTENT_MISMATCH', 'Image content does not match its declared type')
        await context.assertCurrent(input)
        scope.throwIfAborted()
        return { bytes: result.bytes, mime }
      })
    },
  }
}
