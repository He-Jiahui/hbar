/* global Bun, console, process */

const coordinateProperties = new Set([
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'inset-block',
  'inset-inline',
  'inset-block-start',
  'inset-block-end',
  'inset-inline-start',
  'inset-inline-end',
  'transform',
])

const spacingProperties = new Set([
  'padding',
  'padding-block',
  'padding-block-end',
  'padding-block-start',
  'padding-inline',
  'padding-inline-end',
  'padding-inline-start',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'margin',
  'margin-block',
  'margin-block-end',
  'margin-block-start',
  'margin-inline',
  'margin-inline-end',
  'margin-inline-start',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'gap',
  'row-gap',
  'column-gap',
])

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length
}

function parseRules(source) {
  const rules = []
  const stack = []
  let headerStart = 0
  let inComment = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]
    if (!inComment && character === '/' && next === '*') {
      inComment = true
      index += 1
      continue
    }
    if (inComment && character === '*' && next === '/') {
      inComment = false
      index += 1
      continue
    }
    if (inComment) continue

    if (character === '{') {
      const selector = source
        .slice(headerStart, index)
        .replaceAll(/\/\*[\s\S]*?\*\//g, '')
        .trim()
      stack.push({ selector, bodyStart: index + 1, startLine: lineNumber(source, headerStart) })
      headerStart = index + 1
      continue
    }
    if (character !== '}') continue

    const rule = stack.pop()
    if (rule && !rule.selector.startsWith('@')) {
      rules.push({ selector: rule.selector, body: source.slice(rule.bodyStart, index), startLine: rule.startLine })
    }
    headerStart = index + 1
  }
  return rules
}

function isOverlaySelector(path, selector) {
  if (/hbar-app-ui-(?:dialog-backdrop|dialog-menu|app-sidebar-drawer|app-tool-drawer)(?:[\s.:#>+~]|$)/.test(selector)) {
    return true
  }
  if (!/packages\/lumen-app-ui\/src\/(?:materials|primitives)\.module\.css$/.test(path.replaceAll('\\', '/'))) {
    return false
  }
  return /(?:^|,)\s*(?:\.surface\s*>\s*\.indicator|\.field\s*>\s*\.indicator|\.button\s*>\s*\[data-edge|\.iconButton\s*>\s*\[data-edge|\.glass|\.filter|\.halo)(?:[=\]\s\[:.#>+~]|$)/.test(
    selector,
  )
}

function validateCss(path, source) {
  const errors = []
  for (const rule of parseRules(source)) {
    const isOverlay = isOverlaySelector(path, rule.selector)
    const lines = rule.body.split(/\r?\n/)
    for (const [offset, rawLine] of lines.entries()) {
      const match = rawLine.match(/^\s*([a-z-]+)\s*:\s*([^;]+);/)
      if (!match) continue
      const [, property, value] = match
      const location = `${path}:${rule.startLine + offset}`
      if (coordinateProperties.has(property) && !isOverlay) {
        errors.push(`${location}: ${property} is reserved for a real overlay container; use flex flow for content.`)
      }
      if (property === 'position' && /\b(?:absolute|fixed)\b/.test(value) && !isOverlay) {
        errors.push(
          `${location}: ${value.trim()} positioning is reserved for a real overlay container; use flex flow for content.`,
        )
      }
      if (property === 'display' && /\b(?:inline-)?grid\b/.test(value)) {
        errors.push(`${location}: ${value.trim()} uses CSS Grid; use flex flow for ordinary content.`)
      }
      if (/^grid(?:-|$)/.test(property)) {
        errors.push(`${location}: ${property} is a CSS Grid declaration; use flex flow for ordinary content.`)
      }
      if (/\b\d+(?:\.\d+)?px\b/.test(value) && !spacingProperties.has(property)) {
        errors.push(
          `${location}: ${property} contains a px value outside spacing; use rem, em, percentages, or intrinsic sizing.`,
        )
      }
    }
  }
  return errors
}

const inputPaths = Bun.argv.slice(2)
if (inputPaths.length === 1 && inputPaths[0] === '--self-test') {
  const valid = validateCss(
    'self-test-valid.css',
    `.card {
  display: flex;
  padding: 8px;
  margin-inline: 4px;
  gap: 6px;
  border-radius: .5rem;
}`,
  )
  if (valid.length !== 0) {
    console.error(`Flow layout guard self-test expected valid CSS, got: ${valid.join('; ')}`)
    process.exit(1)
  }
  const invalid = validateCss(
    'self-test-invalid.css',
    `.card {
  display: grid;
  border: 1px solid red;
  width: 320px;
  left: 2px;
}`,
  )
  if (invalid.length < 4) {
    console.error(
      `Flow layout guard self-test expected CSS Grid, px, and coordinate errors, got: ${invalid.join('; ')}`,
    )
    process.exit(1)
  }
  const overlay = validateCss(
    'self-test-overlay.css',
    `.hbar-app-ui-dialog-backdrop {
  position: fixed;
  inset: 0;
  padding: 1rem;
}
.hbar-app-ui-app-sidebar-drawer {
  position: fixed;
  inset: 0;
}`,
  )
  if (overlay.length !== 0) {
    console.error(`Flow layout guard self-test expected overlay exception, got: ${overlay.join('; ')}`)
    process.exit(1)
  }
  const lumenMaterialOverlay = validateCss(
    'packages/lumen-app-ui/src/materials.module.css',
    `.surface > .indicator {
  position: absolute;
  inset-block-start: 0;
}
.glass {
  position: absolute;
  inset: 0;
}
.button > [data-edge],
.iconButton > [data-edge] {
  position: absolute;
  inset-block-start: 0;
}`,
  )
  if (lumenMaterialOverlay.length !== 0) {
    console.error(
      `Flow layout guard self-test expected Lumen material overlay exception, got: ${lumenMaterialOverlay.join('; ')}`,
    )
    process.exit(1)
  }
  const leakedLumenOverlay = validateCss(
    'packages/hbar-app-ui/src/feature.css',
    `.surface > .indicator {
  position: absolute;
  inset: 0;
}`,
  )
  if (leakedLumenOverlay.length < 2) {
    console.error(
      `Flow layout guard self-test expected Lumen material exception to remain path-scoped, got: ${leakedLumenOverlay.join('; ')}`,
    )
    process.exit(1)
  }
  console.log('Flow layout guard self-test passed.')
  process.exit(0)
}
if (inputPaths.length === 0) {
  console.error('Usage: bun validate-flow-layout.mjs <stylesheet> [...stylesheet]')
  process.exit(1)
}

const allErrors = []
for (const path of inputPaths) {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    allErrors.push(`${path}: stylesheet does not exist`)
    continue
  }
  allErrors.push(...validateCss(path, await file.text()))
}

if (allErrors.length > 0) {
  console.error(allErrors.join('\n'))
  process.exit(1)
}

console.log(`Flow layout guard passed for ${inputPaths.length} stylesheet(s).`)
