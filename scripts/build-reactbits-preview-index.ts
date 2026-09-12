import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listReferenceVariants } from '../apps/web/src/react-bits/reference/reference-manifest'

type PreviewViewport = 'desktop' | 'tablet' | 'mobile'
type Geometry = { x: number; y: number; width: number; height: number; scrollWidth: number; scrollHeight: number }
type PreviewRecord = {
  capturedAt: string
  viewport: PreviewViewport
  visibleText: string
  controls: string[]
  roles: Record<string, number>
  geometry: { iframe: Geometry; body: Geometry; root: Geometry }
  styles: { fontFamily: string; fontSize: string; lineHeight: string; color: string; backgroundColor: string; borderRadius: string }
  elements?: Array<{ tag: string; role?: string; className?: string; text: string; rect: { x: number; y: number; width: number; height: number }; styles: { display: string; position: string; fontSize: string; lineHeight: string; color: string; backgroundColor: string; border: string; borderRadius: string; padding: string; gap: string } }>
  screenshotHash?: string
  pageScreenshotHash?: string
}

type PreviewObservationFile = { sourceUrl: string; records: PreviewRecord[] }
type PreviewIndexRecord = {
  referenceId: string
  variantSlug: string
  sourceUrl: string
  viewport: PreviewViewport
  targetViewportPixels: { width: number; height: number }
  capturedAt: string
  visibleTextHash: string
  controls: string[]
  controlHash: string
  roles: Record<string, number>
  geometry: PreviewRecord['geometry']
  styles: PreviewRecord['styles']
  screenshotPath?: string
  screenshotHash?: string
  pageScreenshotPath?: string
  pageScreenshotHash?: string
  elementCount: number
  elementSamples: NonNullable<PreviewRecord['elements']>
}

const root = join(process.cwd(), 'artifacts', 'reactbits-reference')
const target = join(process.cwd(), 'apps', 'web', 'src', 'react-bits', 'reference', 'reference-preview-observation-index.json')
const viewportPixels: Record<PreviewViewport, { width: number; height: number }> = {
  desktop: { width: 1280, height: 720 },
  tablet: { width: 768, height: 900 },
  mobile: { width: 390, height: 844 },
}

async function hash(value: ArrayBuffer | string): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashFile(path: string): Promise<string | undefined> {
  if (!existsSync(path)) return undefined
  return hash(await Bun.file(path).arrayBuffer())
}

async function readPreview(variant: ReturnType<typeof listReferenceVariants>[number]): Promise<PreviewIndexRecord[]> {
  const directory = join(root, variant.variantSlug)
  const sourcePath = join(directory, 'preview-observation.json')
  if (!existsSync(sourcePath)) return []
  const capture = JSON.parse(await readFile(sourcePath, 'utf8')) as PreviewObservationFile
  const records: PreviewIndexRecord[] = []
  for (const record of capture.records) {
    const screenshotPath = join(directory, `preview-${record.viewport}.png`)
    const pageScreenshotPath = join(directory, `page-${record.viewport}.png`)
    const screenshotHash = await hashFile(screenshotPath) ?? record.screenshotHash
    const pageScreenshotHash = await hashFile(pageScreenshotPath) ?? record.pageScreenshotHash
    records.push({
      referenceId: variant.referenceId,
      variantSlug: variant.variantSlug,
      sourceUrl: capture.sourceUrl || variant.sourceUrl,
      viewport: record.viewport,
      targetViewportPixels: viewportPixels[record.viewport],
      capturedAt: record.capturedAt,
      visibleTextHash: await hash(record.visibleText),
      controls: record.controls,
      controlHash: await hash(JSON.stringify(record.controls)),
      roles: record.roles,
      geometry: record.geometry,
      styles: record.styles,
      elementCount: record.elements?.length ?? 0,
      // Keep the checked-in index compact while retaining representative
      // geometry/style evidence for each public preview record.
      elementSamples: (record.elements ?? []).slice(0, 8),
      ...(screenshotHash ? { screenshotPath: `artifacts/reactbits-reference/${variant.variantSlug}/preview-${record.viewport}.png`, screenshotHash } : {}),
      ...(pageScreenshotHash ? { pageScreenshotPath: `artifacts/reactbits-reference/${variant.variantSlug}/page-${record.viewport}.png`, pageScreenshotHash } : {}),
    })
  }
  return records
}

const variants = listReferenceVariants()
const records = (await Promise.all(variants.map((variant) => readPreview(variant)))).flat()
const output = {
  generatedAt: new Date().toISOString(),
  note: 'Public preview iframe observations only. Text/style hashes and geometry are tracked; private Code-tab source is excluded.',
  exactViewportPixels: viewportPixels,
  coverage: {
    expectedVariants: variants.length,
    capturedVariants: new Set(records.map((record) => record.referenceId)).size,
    expectedRecords: variants.length * 3,
    capturedRecords: records.length,
    screenshotRecords: records.filter((record) => record.screenshotHash).length,
    pageScreenshotRecords: records.filter((record) => record.pageScreenshotHash).length,
  },
  records,
}
await mkdir(join(process.cwd(), 'apps', 'web', 'src', 'react-bits', 'reference'), { recursive: true })
await Bun.write(target, JSON.stringify(output, null, 2) + '\n')
console.log(`ReactBits preview observation index: ${records.length} viewport records for ${output.coverage.capturedVariants} variants`)
