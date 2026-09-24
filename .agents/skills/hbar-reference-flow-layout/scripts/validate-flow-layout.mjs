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
  // Plan 2 uses the same observed pair around its div-owned scroll area.
  if (
    /packages\/lumen-app-ui\/src\/plan-review\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-review-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
  // The rendered Plan 1 scroll frame has two pointer-transparent edge fades.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-checklist\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-app-ui-agent-plan-checklist-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(
      selector.trim(),
    )
  )
    return true
  // Live Agent Approval 1 has two pointer-transparent scroll-edge fades.
  // Allow only those containers in their owning file, never their descendants.
  if (
    /packages\/lumen-app-ui\/src\/agent-approval\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-app-ui-agent-approval-scroll-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(
      selector.trim(),
    )
  ) {
    return true
  }
  if (/hbar-app-ui-(?:dialog-backdrop|dialog-menu|app-sidebar-drawer|app-tool-drawer)(?:[\s.:#>+~]|$)/.test(selector)) {
    return true
  }
  if (!/packages\/lumen-app-ui\/src\/(?:materials|primitives)\.module\.css$/.test(path.replaceAll('\\', '/'))) {
    return (
      /packages\/lumen-app-ui\/src\/forms\.css$/.test(path.replaceAll('\\', '/')) &&
      /(?:^|,)\s*\.lumen-(?:combobox-popup|checkbox-input|toggle-input)(?:[\s[:.#>+~]|$)/.test(selector)
    )
  }
  return /(?:^|,)\s*(?:\.surface\s*>\s*\.indicator|\.field\s*>\s*\.indicator|\.button\s*>\s*\[data-edge|\.iconButton\s*>\s*\[data-edge|\.glass|\.filter|\.halo)(?:[=\]\s[:.#>+~]|$)/.test(
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
  const lumenComboboxOverlay = validateCss(
    'packages/lumen-app-ui/src/forms.css',
    `.lumen-combobox-popup {
  position: absolute;
  inset-block-start: calc(100% + 0.25rem);
  inset-inline: 0;
}`,
  )
  if (lumenComboboxOverlay.length !== 0) {
    console.error(
      `Flow layout guard self-test expected Lumen combobox overlay exception, got: ${lumenComboboxOverlay.join('; ')}`,
    )
    process.exit(1)
  }
  const lumenNativeControlOverlay = validateCss(
    'packages/lumen-app-ui/src/forms.css',
    `.lumen-checkbox-input,
.lumen-toggle-input {
  position: absolute;
  inset: 0;
}`,
  )
  if (lumenNativeControlOverlay.length !== 0) {
    console.error(
      `Flow layout guard self-test expected Lumen native control overlay exception, got: ${lumenNativeControlOverlay.join('; ')}`,
    )
    process.exit(1)
  }
  const approvalScrollOverlay = validateCss(
    'packages/lumen-app-ui/src/agent-approval.css',
    `.hbar-app-ui-agent-approval-scroll-overlay {
  position: absolute;
  inset-inline: 0;
  block-size: 2rem;
}
.hbar-app-ui-agent-approval-scroll-overlay.is-top {
  inset-block-start: 0;
}
.hbar-app-ui-agent-approval-scroll-overlay.is-bottom {
  inset-block-end: 0;
}`,
  )
  if (approvalScrollOverlay.length !== 0) {
    console.error(`Flow layout guard rejected verified scroll-edge overlays: ${approvalScrollOverlay.join('; ')}`)
    process.exit(1)
  }
  for (const suffix of ['', '.is-top', '.is-bottom', '[data-visible="true"]']) {
    const reviewErrors = validateCss(
      'packages/lumen-app-ui/src/plan-review.css',
      `.lumen-plan-review-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (reviewErrors.length) {
      console.error(`Flow layout guard rejected verified review edge overlays: ${reviewErrors.join('; ')}`)
      process.exit(1)
    }
    const errors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-checklist.css',
      `.hbar-app-ui-agent-plan-checklist-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (errors.length) {
      console.error(`Flow layout guard rejected verified checklist edge overlays: ${errors.join('; ')}`)
      process.exit(1)
    }
  }
  for (const [path, selector] of [
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-review-edge-overlay'],
    ['packages/lumen-app-ui/src/plan-review.css', '.lumen-plan-review-edge-overlay p'],
    ['packages/lumen-app-ui/src/plan-review.css', '.lumen-plan-review-edge-overlay > button'],
    ['packages/lumen-app-ui/src/agent-plan.css', '.hbar-app-ui-agent-plan-checklist-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-checklist.css', '.hbar-app-ui-agent-plan-checklist-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-checklist.css', '.hbar-app-ui-agent-plan-checklist-edge-overlay > button'],
    ['packages/hbar-app-ui/src/feature.css', '.hbar-app-ui-agent-approval-scroll-overlay'],
    ['packages/lumen-app-ui/src/agent-approval.css', '.hbar-app-ui-agent-approval-scroll-overlay p'],
    ['packages/lumen-app-ui/src/agent-approval.css', '.hbar-app-ui-agent-approval-scroll-overlay > button'],
  ]) {
    const errors = validateCss(
      path,
      `${selector} {
  position: absolute;
  inset: 0;
}`,
    )
    if (errors.length < 2) {
      console.error(`Flow layout guard leaked the scroll-edge exception into ${path}: ${selector}`)
      process.exit(1)
    }
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
