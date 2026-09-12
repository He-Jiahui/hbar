import { REFERENCE_CATEGORY_COUNTS, REFERENCE_VARIANTS, validateReferenceRegistry } from '../apps/web/src/react-bits/reference/reference-manifest'

const result = validateReferenceRegistry()
if (!result.ok) {
  for (const error of result.errors) console.error(error)
  process.exit(1)
}

for (const [category, expected] of Object.entries(REFERENCE_CATEGORY_COUNTS)) {
  const actual = REFERENCE_VARIANTS.filter((variant) => variant.category === category).length
  if (actual !== expected) {
    console.error(`${category}: expected ${expected}, got ${actual}`)
    process.exit(1)
  }
}

console.log(`ReactBits reference registry: ${result.categoryCount} categories, ${result.variantCount} variants`)
