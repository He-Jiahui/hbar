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

const dimensionProperties = new Set([
  'width',
  'height',
  'inline-size',
  'block-size',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'min-inline-size',
  'max-inline-size',
  'min-block-size',
  'max-block-size',
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
      const selector = source.slice(headerStart, index).replaceAll(/\/\*[\s\S]*?\*\//g, '').trim()
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

function isOverlaySelector(selector) {
  return /hbar-app-ui-(?:dialog-backdrop|dialog-menu)(?:[\s.:#>+~]|$)/.test(selector)
}

function validateCss(path, source) {
  const errors = []
  for (const rule of parseRules(source)) {
    const isOverlay = isOverlaySelector(rule.selector)
    const lines = rule.body.split(/\r?\n/)
    for (const [offset, rawLine] of lines.entries()) {
      const match = rawLine.match(/^\s*([a-z-]+)\s*:\s*([^;]+);/)
      if (!match) continue
      const [, property, value] = match
      const location = `${path}:${rule.startLine + offset}`
      if (coordinateProperties.has(property) && !isOverlay) {
        errors.push(`${location}: ${property} is reserved for a real overlay container; use flex/grid flow for content.`)
      }
      if (property === 'position' && /\b(?:absolute|fixed)\b/.test(value) && !isOverlay) {
        errors.push(`${location}: ${value.trim()} positioning is reserved for a real overlay container; use flex/grid flow for content.`)
      }
      if (dimensionProperties.has(property) && /(?:^|\s|\()\d+(?:\.\d+)?px\b/.test(value)) {
        errors.push(`${location}: ${property} uses a fixed px dimension; use intrinsic sizing, percentages, or rem-based bounds instead.`)
      }
    }
  }
  return errors
}

const inputPaths = Bun.argv.slice(2)
if (inputPaths.length === 0) {
  console.error('Usage: bun validate-flow-layout.mjs <stylesheet> [...stylesheet]')
  process.exit(1)
}

const allErrors = []
for (const path of inputPaths) {
  const file = Bun.file(path)
  if (!await file.exists()) {
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
