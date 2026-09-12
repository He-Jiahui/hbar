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

const root = join(process.cwd(), 'artifacts', 'reactbits-reference')
const index = JSON.parse(await readFile(join(root, 'capture-index.json'), 'utf8')) as { records: CaptureRecord[] }
const resourceBundles = new Map<string, { css: CaptureRecord['cssResources']; js: CaptureRecord['jsResources'] }>()
const records = index.records.map((record) => {
  const bundleKey = JSON.stringify({ css: record.cssResources, js: record.jsResources })
  if (!resourceBundles.has(bundleKey)) resourceBundles.set(bundleKey, { css: record.cssResources, js: record.jsResources })
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
