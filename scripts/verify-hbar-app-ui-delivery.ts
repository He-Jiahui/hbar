import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/specs'

type Variant = Readonly<{ id: string; category: string; variant: number }>
export type DeliveryRow = Readonly<{
  id: string
  componentPath: string
  status: string
  capacity: string
  limits: string
}>

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

export function readDeliveryRows(markdown: string): readonly DeliveryRow[] {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\| hbar-app-ui-/.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim())
      const [id, entry, status, capacity, limits] = cells.slice(1, 6)
      const link = entry?.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      assert(id && link && status && capacity && limits, `Incomplete delivery row: ${id ?? line}`)
      assert(link[1] === id && link[2], `Delivery link does not match ${id}`)
      return { id, componentPath: link[2], status, capacity, limits }
    })
}

/** This verifies coverage and provenance only. It does not replay controls or grant strict sign-off. */
export function assessDeliveryCoverage(variants: readonly Variant[], markdown: string, source: unknown) {
  const rows = readDeliveryRows(markdown)
  const expected = new Map(variants.map((variant) => [variant.id, variant]))
  assert(expected.size === variants.length, 'Duplicate local variant ID')
  assert(rows.length === variants.length, 'Delivery inventory has a missing or extra row')
  assert(new Set(rows.map((row) => row.id)).size === rows.length, 'Duplicate delivery row')
  for (const row of rows) assert(expected.has(row.id), `Unexpected delivery row: ${row.id}`)

  assert(record(source), 'Missing source inventory object')
  assert(typeof source.sourceUrl === 'string', 'Source inventory has no reference URL')
  assert(
    typeof source.generatedAt === 'string' && !Number.isNaN(Date.parse(source.generatedAt)),
    'Missing source timestamp',
  )
  assert(typeof source.sourceDirectoryHash === 'string' && source.sourceDirectoryHash.length > 0, 'Missing source hash')
  assert(
    Array.isArray(source.variants) && source.variants.length === variants.length,
    'Source count differs from local',
  )
  assert(Array.isArray(source.categories) && record(source.categoryCounts), 'Missing source category counts')
  const categoryCounts = source.categoryCounts
  const referenceUrl = new URL(source.sourceUrl)
  const seen = new Set<string>()
  const discovered = new Map<string, number>()
  for (const item of source.variants) {
    assert(record(item) && typeof item.id === 'string', 'Invalid source variant')
    assert(!seen.has(item.id), `Duplicate source ID: ${item.id}`)
    seen.add(item.id)
    const local = expected.get(item.id)
    assert(local, `Unexpected source ID: ${item.id}`)
    assert(item.category === local.category && item.variant === local.variant, `Source mapping differs: ${item.id}`)
    assert(item.sourceId === `${local.category}-${local.variant}`, `Source ID differs: ${item.id}`)
    assert(
      typeof item.title === 'string' &&
        item.title.trim() &&
        typeof item.description === 'string' &&
        item.description.trim(),
      `Missing source metadata: ${item.id}`,
    )
    assert(typeof item.url === 'string', `Missing source URL: ${item.id}`)
    const url = new URL(item.url)
    assert(
      url.origin === referenceUrl.origin &&
        url.pathname === `${referenceUrl.pathname.replace(/\/$/, '')}/${local.category}/${item.sourceId}`,
      `Source URL differs: ${item.id}`,
    )
    assert(
      item.sourceStatus === 200 && typeof item.sourceHash === 'string' && item.sourceHash.length > 0,
      `Unavailable source card: ${item.id}`,
    )
    discovered.set(local.category, (discovered.get(local.category) ?? 0) + 1)
  }
  const categories = [...new Set(variants.map((variant) => variant.category))]
  assert(
    source.categories.length === categories.length && new Set(source.categories).size === categories.length,
    'Source categories differ from local',
  )
  for (const category of categories) {
    const count = variants.filter((variant) => variant.category === category).length
    assert(
      source.categories.includes(category) && categoryCounts[category] === count && discovered.get(category) === count,
      `Category count differs: ${category}`,
    )
  }
  const byId = new Map(rows.map((row) => [row.id, row]))
  return {
    standard: 'core mechanisms and natural flow; unchanged behavior may be inferred',
    provenance: { url: source.sourceUrl, capturedAt: source.generatedAt, hash: source.sourceDirectoryHash },
    scope: { categories: categories.length, localIds: expected.size, sourceIds: seen.size, deliveryRows: rows.length },
    categories: categories.map((category) => ({
      category,
      variants: variants
        .filter((variant) => variant.category === category)
        .map((variant) => ({
          id: variant.id,
          sourceId: `${category}-${variant.variant}`,
          delivery: byId.get(variant.id),
        })),
    })),
    interactionReplayInThisRun: false,
    freshStrictAcceptance: false,
    remoteBusinessDelivered: false,
  }
}

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2)
  const sourcePath = argumentsList[0]
  const outputArgument = argumentsList[1] ?? 'artifacts/app-ui-delivery/report.json'
  assert(
    sourcePath && argumentsList.length <= 2,
    'Usage: bun scripts/verify-hbar-app-ui-delivery.ts <authorized-source-inventory.json> [artifacts/report.json]',
  )
  const output = resolve(outputArgument)
  const artifactRoot = resolve('artifacts')
  const relativeOutput = relative(artifactRoot, output)
  assert(
    relativeOutput && !relativeOutput.startsWith('..') && !isAbsolute(relativeOutput),
    'Delivery report must remain in artifacts/',
  )
  assert(await Bun.file(sourcePath).exists(), `Missing explicit source inventory: ${sourcePath}`)
  const source: unknown = await Bun.file(sourcePath).json()
  const inventoryPath = resolve('docs/app-ui-variant-inventory.md')
  const report = assessDeliveryCoverage(HBAR_APP_UI_VARIANT_SPECS, await Bun.file(inventoryPath).text(), source)
  assert(report.scope.categories === 38 && report.scope.localIds === 300, 'Expected complete 38/300 delivery scope')
  for (const row of readDeliveryRows(await Bun.file(inventoryPath).text())) {
    const component = resolve(dirname(inventoryPath), row.componentPath)
    const local = relative(process.cwd(), component)
    assert(
      !local.startsWith('..') && !isAbsolute(local) && (await Bun.file(component).exists()),
      `Missing local component: ${row.id}`,
    )
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`, 'utf8')
  console.log(
    JSON.stringify({
      ...report.scope,
      report: output,
      freshStrictAcceptance: false,
      interactionReplayInThisRun: false,
    }),
  )
}

if (import.meta.main) await main()
