/* global Bun, console, process */

const canonicalNumericSizes = new Set([12, 14, 16, 20, 24])
const canonicalTokens = new Map([
  ['xs', '.75rem'],
  ['sm', '.875rem'],
  ['md', '1rem'],
  ['lg', '1.25rem'],
  ['xl', '1.5rem'],
])

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length
}

function numericValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function validateSource(path, source) {
  const errors = []

  for (const match of source.matchAll(
    /\bsize\s*=\s*(?:\{\s*([0-9]+(?:\.[0-9]+)?)\s*\}|["']([0-9]+(?:\.[0-9]+)?)["'])/g,
  )) {
    const value = numericValue(match[1] ?? match[2] ?? '')
    if (value !== undefined && !canonicalNumericSizes.has(value)) {
      errors.push(
        `${path}:${lineNumber(source, match.index ?? 0)}: icon size ${value} is not a shared tier; use xs/sm/md/lg/xl.`,
      )
    }
  }

  for (const match of source.matchAll(/--hbar-app-ui-icon-(xs|sm|md|lg|xl)\s*:\s*([^;]+);/g)) {
    const tier = match[1]
    const actual = match[2].trim().replaceAll(/\s+/g, ' ')
    const expected = canonicalTokens.get(tier)
    // Prettier adds a leading zero; it does not change the semantic rem tier.
    if (expected !== actual.replace(/^0(?=\.)/, '')) {
      errors.push(
        `${path}:${lineNumber(source, match.index ?? 0)}: icon token ${tier} must be ${expected}, found ${actual}.`,
      )
    }
  }

  const cssBlockPattern = /([^{}]+)\{([^{}]*)\}/g
  for (const match of source.matchAll(cssBlockPattern)) {
    const selector = match[1]
    if (!/(?:icon|lucide|glyph|avatar)/i.test(selector)) continue
    const body = match[2]
    for (const dimension of body.matchAll(
      /\b(?:width|height|inline-size|block-size)\s*:\s*([0-9]+(?:\.[0-9]+)?)px\b/g,
    )) {
      const value = numericValue(dimension[1] ?? '')
      if (value !== undefined && !canonicalNumericSizes.has(value)) {
        errors.push(
          `${path}:${lineNumber(source, (match.index ?? 0) + (dimension.index ?? 0))}: icon dimension ${value}px is not a shared tier.`,
        )
      }
    }
  }

  return errors
}

function selfTest() {
  const good =
    '<Check size={14} />\n:root { --hbar-app-ui-icon-md: 1rem; --hbar-app-ui-icon-xs: 0.75rem; --hbar-app-ui-icon-sm: 0.875rem; }'
  const bad =
    '<Check size={15} />\n:root { --hbar-app-ui-icon-md: 15px; --hbar-app-ui-icon-xs: 0.76rem; --hbar-app-ui-icon-sm: 0.875px; }'
  const goodErrors = validateSource('good', good)
  const badErrors = validateSource('bad', bad)
  if (goodErrors.length !== 0 || badErrors.length !== 4) {
    console.error('Icon scale self-test failed.')
    process.exit(1)
  }
  console.log('Icon scale self-test passed.')
}

const inputPaths = Bun.argv.slice(2).filter((path) => path !== '--self-test')
if (Bun.argv.includes('--self-test')) {
  selfTest()
  if (inputPaths.length === 0) process.exit(0)
}

if (inputPaths.length === 0) {
  console.error('Usage: bun validate-icon-scale.mjs <file> [...files]')
  process.exit(1)
}

const allErrors = []
for (const path of inputPaths) {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    allErrors.push(`${path}: file does not exist`)
    continue
  }
  allErrors.push(...validateSource(path, await file.text()))
}

if (allErrors.length > 0) {
  console.error(allErrors.join('\n'))
  process.exit(1)
}

console.log(`Icon scale guard passed for ${inputPaths.length} file(s).`)
