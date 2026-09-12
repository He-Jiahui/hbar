import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getReferenceVariant, listReferenceVariants } from '../apps/web/src/react-bits/reference/reference-manifest'

type CaptureRecord = {
  sourceUrl: string
  fetchedAt: string
  status: number | 'error'
  htmlHash: string
  title: string
  description: string
  canonicalUrl: string
  domSummary: {
    previewTabs: string[]
    viewportControls: string[]
    actionControls: string[]
    iframeCount: number
    ariaRoles: Record<string, number>
  }
  cssResources: Array<{ url: string; status: number | 'error'; hash: string }>
  jsResources: Array<{ url: string; status: number | 'error'; hash: string }>
  publicSurface: string[]
  note: string
}

type FetchOptions = { timeoutMs?: number }

const DEFAULT_TIMEOUT_MS = 20_000
const resourceCache = new Map<string, Promise<{ url: string; status: number | 'error'; hash: string; body?: Uint8Array }>>()

async function hash(value: ArrayBuffer | string): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function absoluteUrl(value: string, sourceUrl: string): string | undefined {
  try {
    return new URL(value, sourceUrl).href
  } catch {
    return undefined
  }
}

function resources(html: string, sourceUrl: string, kind: 'css' | 'js') {
  const values = kind === 'css'
    ? [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map((match) => match[1])
    : [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1])
  return values.map((value) => (value ? absoluteUrl(value, sourceUrl) : undefined)).filter((value): value is string => Boolean(value))
}

async function fetchResource(url: string, includeBody = false, options: FetchOptions = {}) {
  const cached = resourceCache.get(url)
  if (cached) {
    const result = await cached
    return includeBody && !result.body ? { ...result, body: new Uint8Array() } : result
  }
  const request = (async () => {
    try {
      const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: { accept: '*/*', 'user-agent': 'hbar-reactbits-reference-observer/1.0' },
      })
      const buffer = await response.arrayBuffer()
      return { url, status: response.status, hash: await hash(buffer), ...(includeBody ? { body: new Uint8Array(buffer) } : {}) }
    } catch {
      return { url, status: 'error' as const, hash: '', ...(includeBody ? { body: new Uint8Array() } : {}) }
    }
  })()
  resourceCache.set(url, request)
  const result = await request
  return includeBody && !result.body ? { ...result, body: new Uint8Array() } : result
}

function firstMeta(html: string, name: string): string {
  const match = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function firstTagText(html: string, tag: string): string {
  return html.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is'))?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''
}

function domSummary(html: string) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const controls = (pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value)).slice(0, 16)
  const ariaRoles: Record<string, number> = {}
  for (const match of text.matchAll(/role=["']([^"']+)["']/gi)) {
    const role = match[1]
    if (role) ariaRoles[role] = (ariaRoles[role] ?? 0) + 1
  }
  return {
    previewTabs: controls(/>(Preview|Code)<\/[^>]+>/gi),
    viewportControls: controls(/(?:aria-label|title)=["']([^"']*(?:Desktop|Tablet|Mobile) preview width[^"']*)["']/gi),
    actionControls: controls(/(?:aria-label|title)=["']([^"']*(?:fullscreen|Refresh|splitter|variant)[^"']*)["']/gi),
    iframeCount: (text.match(/<iframe\b/gi) ?? []).length,
    ariaRoles,
  }
}

async function capture(referenceId: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const variant = getReferenceVariant(referenceId)
  if (!variant) throw new Error(`Unknown ReactBits reference variant: ${referenceId}`)
  const outputDir = join(process.cwd(), 'artifacts', 'reactbits-reference', variant.variantSlug)
  await mkdir(outputDir, { recursive: true })
  const fetchedAt = new Date().toISOString()
  let record: CaptureRecord
  try {
    const response = await fetch(variant.sourceUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'text/html', 'user-agent': 'hbar-reactbits-reference-observer/1.0' },
    })
    const html = await response.text()
    const [cssFetched, jsResources] = await Promise.all([
      Promise.all(resources(html, variant.sourceUrl, 'css').map((url) => fetchResource(url, true, { timeoutMs }))),
      Promise.all(resources(html, variant.sourceUrl, 'js').map((url) => fetchResource(url, false, { timeoutMs }))),
    ])
    await Bun.write(join(outputDir, 'page.html'), html)
    for (const [index, resource] of cssFetched.entries()) {
      if ('body' in resource && resource.body.length > 0) await Bun.write(join(outputDir, `styles-${index + 1}.css`), resource.body)
    }
    const cssResources = cssFetched.map(({ body: _body, ...resource }) => resource)
    record = {
      sourceUrl: variant.sourceUrl,
      fetchedAt,
      status: response.status,
      htmlHash: await hash(html),
      title: firstTagText(html, 'title'),
      description: firstMeta(html, 'description'),
      canonicalUrl: html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? '',
      domSummary: domSummary(html),
      cssResources,
      jsResources,
      publicSurface: ['HTML structure', 'Next/RSC metadata', 'Preview/Code controls', 'ARIA text and roles', 'public stylesheet/script resource hashes'],
      note: 'Clean-room observation only. Private Code-tab source, login, uploads and unknown scripts are not accessed.',
    }
  } catch {
    record = {
      sourceUrl: variant.sourceUrl,
      fetchedAt,
      status: 'error',
      htmlHash: '',
      title: '',
      description: '',
      canonicalUrl: '',
      domSummary: { previewTabs: [], viewportControls: [], actionControls: [], iframeCount: 0, ariaRoles: {} },
      cssResources: [],
      jsResources: [],
      publicSurface: [],
      note: 'The public page could not be fetched; fixture remains available and must be visually rechecked when network access is restored.',
    }
  }
  await Bun.write(join(outputDir, 'observation.json'), JSON.stringify(record, null, 2))
  await Bun.write(join(outputDir, 'interactions.json'), JSON.stringify(variant.interactions, null, 2))
  return record
}

const requested = Bun.argv.slice(2).filter((argument) => !argument.startsWith('--'))
const category = Bun.argv.find((argument) => argument.startsWith('--category='))?.slice('--category='.length)
const ids = requested.length > 0
  ? requested
  : listReferenceVariants(category as Parameters<typeof listReferenceVariants>[0] | undefined).map((variant) => variant.referenceId)
const limit = Number(Bun.argv.find((argument) => argument.startsWith('--limit='))?.slice('--limit='.length) ?? ids.length)
const concurrencyArg = Number(Bun.argv.find((argument) => argument.startsWith('--concurrency='))?.slice('--concurrency='.length) ?? 4)
const timeoutArg = Number(Bun.argv.find((argument) => argument.startsWith('--timeout='))?.slice('--timeout='.length) ?? DEFAULT_TIMEOUT_MS)
const concurrency = Number.isFinite(concurrencyArg) ? Math.max(1, Math.min(12, Math.floor(concurrencyArg))) : 4
const timeoutMs = Number.isFinite(timeoutArg) ? Math.max(1_000, Math.min(120_000, Math.floor(timeoutArg))) : DEFAULT_TIMEOUT_MS
const records: CaptureRecord[] = []
const selectedIds = ids.slice(0, Number.isFinite(limit) ? limit : ids.length)
let cursor = 0
async function worker() {
  while (true) {
    const index = cursor++
    const referenceId = selectedIds[index]
    if (!referenceId) return
    const record = await capture(referenceId, timeoutMs)
    records[index] = record
    if (record.status === 'error') console.error(`capture failed: ${referenceId}`)
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, selectedIds.length) }, () => worker()))
const orderedRecords = records.filter((record): record is CaptureRecord => Boolean(record))
const indexPath = join(process.cwd(), 'artifacts', 'reactbits-reference', 'capture-index.json')
await Bun.write(indexPath, JSON.stringify({ capturedAt: new Date().toISOString(), captured: orderedRecords.length, records: orderedRecords }, null, 2))
const failed = orderedRecords.filter((record) => record.status === 'error').length
const output = { captured: orderedRecords.length, failed, concurrency, timeoutMs, resourceCacheEntries: resourceCache.size }
if (Bun.argv.includes('--json')) console.log(JSON.stringify({ ...output, records: orderedRecords }, null, 2))
else console.log(JSON.stringify(output, null, 2))
