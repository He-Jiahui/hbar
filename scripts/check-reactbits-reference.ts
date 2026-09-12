import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { REFERENCE_CATEGORY_COUNTS, REFERENCE_VARIANTS, validateReferenceRegistry } from '../apps/web/src/react-bits/reference/reference-manifest'
import { getReferenceFixture, REFERENCE_FIXTURE_COUNT } from '../apps/web/src/react-bits/reference/reference-fixtures'
import { getReferenceProductionAdapter } from '../apps/web/src/react-bits/reference/adapters/reference-adapters'
import observationIndex from '../apps/web/src/react-bits/reference/reference-observation-index.json'

const result = validateReferenceRegistry()
if (!result.ok) {
  for (const error of result.errors) console.error(error)
  process.exit(1)
}
if (REFERENCE_FIXTURE_COUNT !== REFERENCE_VARIANTS.length) {
  console.error(`fixture registry expected ${REFERENCE_VARIANTS.length}, got ${REFERENCE_FIXTURE_COUNT}`)
  process.exit(1)
}
for (const [category, expected] of Object.entries(REFERENCE_CATEGORY_COUNTS)) {
  const actual = REFERENCE_VARIANTS.filter((variant) => variant.category === category).length
  if (actual !== expected) {
    console.error(`${category}: expected ${expected}, got ${actual}`)
    process.exit(1)
  }
}

const skillRegistryPath = join(process.cwd(), '.agents', 'skills', 'hbar-reactbits-ui', 'references', 'reactbits-registry.md')
if (!existsSync(skillRegistryPath)) {
  console.error(`missing skill registry: ${skillRegistryPath}`)
  process.exit(1)
}
const skillRegistry = await Bun.file(skillRegistryPath).text()
const registryRows = [...skillRegistry.matchAll(/^\| (reactbits\.[^ |]+) \| \[([^\]]+)\]\((https:\/\/pro\.reactbits\.dev\/docs\/app-ui\/[^)]+)\) \| ([^ |]+) \| ([^ |]+)(?::[^|]*)? \|/gm)]
if (registryRows.length !== REFERENCE_VARIANTS.length) {
  console.error(`skill registry expected ${REFERENCE_VARIANTS.length} rows, got ${registryRows.length}`)
  process.exit(1)
}
const skillIds = new Set<string>()
const skillUrls = new Set<string>()
for (const row of registryRows) {
  const [, referenceId, slug, sourceUrl, fixturePath, binding] = row
  if (!referenceId || !slug || !sourceUrl || !fixturePath || !binding) continue
  if (skillIds.has(referenceId) || skillUrls.has(sourceUrl)) {
    console.error(`duplicate skill registry mapping: ${referenceId}`)
    process.exit(1)
  }
  const variant = REFERENCE_VARIANTS.find((candidate) => candidate.referenceId === referenceId)
  if (!variant || variant.variantSlug !== slug || variant.sourceUrl !== sourceUrl || !existsSync(join(process.cwd(), fixturePath))) {
    console.error(`skill registry mismatch: ${referenceId}`)
    process.exit(1)
  }
  if (binding === 'hbar-bound' && (variant.productionBinding.mode !== 'hbar-bound' || !getReferenceProductionAdapter(variant.productionBinding.adapterId))) {
    console.error(`missing production adapter: ${referenceId}`)
    process.exit(1)
  }
  skillIds.add(referenceId)
  skillUrls.add(sourceUrl)
}
if (skillIds.size !== REFERENCE_VARIANTS.length || skillUrls.size !== REFERENCE_VARIANTS.length) {
  console.error('skill registry is not a one-to-one mapping')
  process.exit(1)
}

if (observationIndex.records.length !== REFERENCE_VARIANTS.length) {
  console.error(`observation index expected ${REFERENCE_VARIANTS.length} records, got ${observationIndex.records.length}`)
  process.exit(1)
}
const observedUrls = new Set(observationIndex.records.map((record) => record.sourceUrl))
if (observedUrls.size !== REFERENCE_VARIANTS.length || REFERENCE_VARIANTS.some((variant) => !observedUrls.has(variant.sourceUrl))) {
  console.error('observation index does not cover every source URL')
  process.exit(1)
}
if (Bun.argv.includes('--require-capture')) {
  const missing: string[] = []
  for (const variant of REFERENCE_VARIANTS) {
    const directory = join(process.cwd(), 'artifacts', 'reactbits-reference', variant.variantSlug)
    if (!existsSync(join(directory, 'observation.json')) || !existsSync(join(directory, 'interactions.json'))) missing.push(variant.variantSlug)
  }
  if (missing.length > 0) {
    console.error(`missing public observation artifacts: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`)
    process.exit(1)
  }
}

for (const variant of REFERENCE_VARIANTS) {
  getReferenceFixture(variant.variantSlug)
  const fixturePath = join(process.cwd(), 'apps', 'web', 'src', 'react-bits', 'reference', 'variants', variant.category, `${variant.variantSlug}.tsx`)
  if (!existsSync(fixturePath)) {
    console.error(`missing independent fixture module: ${variant.variantSlug}`)
    process.exit(1)
  }
  const fixtureSource = await Bun.file(fixturePath).text()
  if (!fixtureSource.includes(variant.sourceUrl)) {
    console.error(`fixture does not document its public source URL: ${variant.variantSlug}`)
    process.exit(1)
  }
  if (fixtureSource.includes('import ReferenceVariant from')) {
    console.error(`fixture must bind directly to its family renderer: ${variant.variantSlug}`)
    process.exit(1)
  }
}
console.log(`ReactBits reference registry: ${result.categoryCount} categories, ${result.variantCount} variants; skill matrix and observation index are complete`)
