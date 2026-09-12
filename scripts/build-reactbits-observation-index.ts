import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

type CaptureRecord = {
  sourceUrl: string
  fetchedAt: string
  status: number | 'error'
  htmlHash: string
  title: string
  description: string
  canonicalUrl: string
  domSummary: { previewTabs: string[]; viewportControls: string[]; actionControls: string[]; iframeCount: number; ariaRoles: Record<string, number> }
  cssResources: Array<{ url: string; status: number | 'error'; hash: string }>
  jsResources: Array<{ url: string; status: number | 'error'; hash: string }>
}

type CssObservation = {
  selectorCount: number
  selectorSamples: string[]
  relevantSelectors: string[]
  customPropertyNames: string[]
  mediaQueryCount: number
  mediaQueries: string[]
  keyframeNames: string[]
  animationDeclarations: string[]
  colorTokenCount: number
  fontFaceCount: number
  declarationCount: number
}

type CssResource = CaptureRecord['cssResources'][number]

function unique(values: Iterable<string>, limit = 120): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))].slice(0, limit)
}

function cssObservation(css: string, variantSlug: string): CssObservation {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const selectorMatches = [...source.matchAll(/(?:^|})\s*([^@{}][^{}]+)\{/g)]
    .map((match) => match[1]?.replace(/\s+/g, ' ').trim() ?? '')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value && !value.includes(':root') && !value.includes('@font-face'))
  const selectorSamples = unique(selectorMatches)
  const variantTokens = unique([variantSlug, ...variantSlug.split('-')].map((value) => value.toLowerCase()))
  const relevantSelectors = selectorSamples.filter((selector) => variantTokens.some((token) => selector.toLowerCase().includes(token)))
  const customPropertyNames = unique([...source.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((match) => match[1] ?? ''))
  const mediaQueries = unique([...source.matchAll(/@media\s*([^{]+)/gi)].map((match) => `@media ${match[1] ?? ''}`))
  const keyframeNames = unique([...source.matchAll(/@(?:-webkit-)?keyframes\s+([^\s{]+)/gi)].map((match) => match[1] ?? ''))
  const animationDeclarations = unique([...source.matchAll(/animation(?:-name)?\s*:\s*([^;}{]+)/gi)].map((match) => (match[1] ?? '').replace(/\s+/g, ' ').trim()))
  const colorTokens = unique([...source.matchAll(/(?:#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/gi)].map((match) => match[0] ?? ''), Number.MAX_SAFE_INTEGER)
  return {
    selectorCount: selectorSamples.length,
    selectorSamples,
    relevantSelectors,
    customPropertyNames,
    mediaQueryCount: mediaQueries.length,
    mediaQueries,
    keyframeNames,
    animationDeclarations,
    colorTokenCount: colorTokens.length,
    fontFaceCount: (source.match(/@font-face\s*\{/gi) ?? []).length,
    declarationCount: (source.match(/[a-zA-Z-]+\s*:\s*[^;}{]+/g) ?? []).length,
  }
}

async function readCssObservation(record: CaptureRecord, _resource: CssResource, resourceIndex: number): Promise<CssObservation | undefined> {
  let sourceUrl: URL
  try {
    sourceUrl = new URL(record.sourceUrl)
  } catch {
    return undefined
  }
  const variantSlug = sourceUrl.pathname.split('/').filter(Boolean).at(-1) ?? ''
  const localPath = join(root, variantSlug, `styles-${resourceIndex + 1}.css`)
  if (!existsSync(localPath)) return undefined
  const css = await readFile(localPath, 'utf8')
  return cssObservation(css, variantSlug)
}

const root = join(process.cwd(), 'artifacts', 'reactbits-reference')
const index = JSON.parse(await readFile(join(root, 'capture-index.json'), 'utf8')) as { records: CaptureRecord[] }
const resourceBundles = new Map<string, { css: CaptureRecord['cssResources']; js: CaptureRecord['jsResources']; cssObservation: Array<CssObservation | undefined> }>()
const records = index.records.map((record) => {
  const bundleKey = JSON.stringify({ css: record.cssResources, js: record.jsResources })
  if (!resourceBundles.has(bundleKey)) resourceBundles.set(bundleKey, { css: record.cssResources, js: record.jsResources, cssObservation: [] })
  return {
    sourceUrl: record.sourceUrl,
    fetchedAt: record.fetchedAt,
    status: record.status,
    htmlHash: record.htmlHash,
    title: record.title,
    description: record.description,
    canonicalUrl: record.canonicalUrl,
    domSummary: record.domSummary,
    resourceBundle: [...resourceBundles.keys()].indexOf(bundleKey),
  }
})

for (const [bundleKey, bundle] of resourceBundles) {
  const record = index.records.find((candidate) => JSON.stringify({ css: candidate.cssResources, js: candidate.jsResources }) === bundleKey)
  if (!record) continue
  bundle.cssObservation = await Promise.all(record.cssResources.map((resource, resourceIndex) => readCssObservation(record, resource, resourceIndex)))
}
const output = {
  generatedAt: new Date().toISOString(),
  note: 'Public HTML/CSS/JS resource metadata only. Private Code-tab source and unknown scripts are not included.',
  resourceBundles: [...resourceBundles.values()],
  records,
}
const target = join(process.cwd(), 'apps', 'web', 'src', 'react-bits', 'reference', 'reference-observation-index.json')
await mkdir(join(process.cwd(), 'apps', 'web', 'src', 'react-bits', 'reference'), { recursive: true })
await Bun.write(target, JSON.stringify(output, null, 2) + '\n')
console.log(`ReactBits observation index: ${records.length} records, ${resourceBundles.size} resource bundle(s)`)
