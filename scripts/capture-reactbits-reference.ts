import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getReferenceVariant, listReferenceVariants } from '../apps/web/src/react-bits/reference/reference-manifest'

type CaptureRecord = {
  sourceUrl: string
  fetchedAt: string
  status: number | 'error'
  htmlHash: string
  cssResources: Array<{ url: string; status: number | 'error'; hash: string }>
  jsResources: Array<{ url: string; status: number | 'error'; hash: string }>
  publicSurface: string[]
  note: string
}

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

async function fetchResource(url: string, includeBody = false) {
  try {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    return { url, status: response.status, hash: await hash(buffer), ...(includeBody ? { body: new Uint8Array(buffer) } : {}) }
  } catch {
    return { url, status: 'error' as const, hash: '', ...(includeBody ? { body: new Uint8Array() } : {}) }
  }
}

async function capture(referenceId: string) {
  const variant = getReferenceVariant(referenceId)
  if (!variant) throw new Error(`Unknown ReactBits reference variant: ${referenceId}`)
  const outputDir = join(process.cwd(), 'artifacts', 'reactbits-reference', variant.variantSlug)
  await mkdir(outputDir, { recursive: true })
  const fetchedAt = new Date().toISOString()
  let record: CaptureRecord
  try {
    const response = await fetch(variant.sourceUrl)
    const html = await response.text()
    const [cssFetched, jsResources] = await Promise.all([
      Promise.all(resources(html, variant.sourceUrl, 'css').map((url) => fetchResource(url, true))),
      Promise.all(resources(html, variant.sourceUrl, 'js').map((url) => fetchResource(url, false))),
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
const records: CaptureRecord[] = []
for (const referenceId of ids.slice(0, Number.isFinite(limit) ? limit : ids.length)) records.push(await capture(referenceId))
console.log(JSON.stringify({ captured: records.length, records }, null, 2))
