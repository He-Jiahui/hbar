import { z } from 'zod'

export const RESOURCE_MEDIA_LIMIT = 10 * 1024 * 1024
export const RESOURCE_CANDIDATE_LIMIT = 100
export const resourceReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('web'), url: z.string().url().max(16384), image: z.boolean() }),
  z.strictObject({
    kind: z.literal('file'),
    path: z.string().min(1).max(4000),
    line: z.number().int().min(1).max(2_000_000).optional(),
    column: z.number().int().min(1).max(2_000_000).optional(),
  }),
])
export type ResourceReference = z.output<typeof resourceReferenceSchema>
export const resourceCandidateSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(['web', 'file', 'image']),
  name: z.string().max(1024),
  location: z.string().max(16384),
  workspacePath: z.string().max(4000).nullable(),
  directory: z.string().max(4000),
  mime: z.string().max(120).nullable(),
  size: z.number().int().nonnegative().nullable(),
})
export type ResourceCandidate = z.output<typeof resourceCandidateSchema>

const images = /\.(?:png|jpe?g|webp|gif|apng|avif|svg|bmp|ico)(?:$|[?#])/i
const files =
  /(?:\.(?:[cm]?[jt]sx?|py|rs|go|java|c|cc|cpp|h|hpp|cs|swift|kt|rb|php|sh|ps1|bat|cmd|vue|svelte|css|scss|html?|md|mdx|txt|json|jsonc|ya?ml|toml|xml|sql|ini|cfg|conf|log|csv|pdf|docx?|xlsx?|pptx?|zip|gz|tar|7z|rar|mp[34]|wav|ogg|flac|mov|webm|woff2?|ttf|otf|png|jpe?g|webp|gif|apng|avif|svg|bmp|ico)|(?:^|\/)(?:Dockerfile|Makefile|LICENSE|\.env(?:\.[\w-]+)?|\.gitignore|\.npmrc))$/i

/** Conservative code/prose guard; explicitly authored links can still name such directories. */
export function resourceCommandText(input: string): boolean {
  return (
    /^(?:[$>]\s*)?(?:(?:bun|npm|npx|pnpm|yarn|deno|node|python[23]?|pip[23]?|uv|cargo|rustc|go|dotnet|java|javac|mvn|gradle|git|gh|curl|wget|docker|podman|kubectl|ssh|scp|rsync|ls|cat|cd|cp|mv|rm|rg|grep|find|sed|awk|echo|printf|powershell|pwsh|cmd|bash|sh|zsh|fish|make|cmake|ninja|ctest|code)(?:\.exe)?\s+|(?:Get|Set|Add|Remove|Select|Start|Stop|Test|Invoke)-[\w-]+\s+|(?:const|let|var|return|throw|await|import|export)\s+)/i.test(
      input.trim(),
    ) ||
    /^[\w.$]+\s*=/.test(input.trim()) ||
    /\$\{/.test(input)
  )
}

export function parseResourceReference(
  input: string,
  explicit = false,
  source: 'reference' | 'authored-link' = 'reference',
): ResourceReference | null {
  let value = input.trim()
  if (!value || [...value].some((char) => char.charCodeAt(0) < 32) || value.length > 16384) return null
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null
      return { kind: 'web', url: url.href, image: images.test(url.pathname) }
    } catch {
      return null
    }
  }
  if (/^file:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (url.username || url.password || url.search) return null
      value = decodeURIComponent(url.pathname)
      if (/^\/[a-z]:\//i.test(value)) value = value.slice(1)
      if (url.hostname && url.hostname !== 'localhost') value = `//${url.hostname}${value}`
    } catch {
      return null
    }
  } else if (source === 'authored-link') {
    try {
      value = decodeURIComponent(value)
    } catch {
      return null
    }
  }
  value = value.replaceAll('\\', '/')
  if (value.length > 4000 || /[<>|?*\n]/.test(value) || value.includes('://')) return null
  const suffix = /:(\d+)(?::(\d+))?$/.exec(value)
  const line = suffix ? Number(suffix[1]) : undefined
  const column = suffix?.[2] ? Number(suffix[2]) : undefined
  if (suffix) value = value.slice(0, suffix.index)
  if (
    (line !== undefined && (line < 1 || line > 2_000_000)) ||
    (column !== undefined && (column < 1 || column > 2_000_000))
  )
    return null
  if (/:/.test(value.replace(/^[a-z]:/i, '')) || /(?:^|\/)\.\.(?:\/|$)/.test(value)) return null
  const absolute = /^(?:[a-z]:\/|\/|~\/)/i.test(value)
  if (!absolute && source !== 'authored-link' && resourceCommandText(value)) return null
  if (!absolute && !files.test(value)) return null
  if (!absolute && !value.includes('/') && line === undefined && /\.(?:log|c|h|conf|cfg)$/i.test(value)) return null
  if (!explicit && (/\s/.test(value) || /[(){}=;]/.test(value))) return null
  if (
    !absolute &&
    !value.includes('/') &&
    /^(?:[A-Z][A-Za-z0-9]*|[a-z][A-Za-z0-9]*)$/.test(value) &&
    !files.test(value)
  )
    return null
  return {
    kind: 'file',
    path: value.replace(/^\.\//, ''),
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  }
}

export function resourceImagePath(value: string): boolean {
  return images.test(value)
}
