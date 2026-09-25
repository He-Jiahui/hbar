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
  // App Sidebar 5: a row's More button opens a trigger-anchored action menu
  // over later document rows. The menu contents themselves remain in flex flow.
  if (
    /packages\/lumen-app-ui\/src\/app-sidebar-tree\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-tree-menu'
  )
    return true
  // App Sidebar 3: the workspace radio menu overlays the search and navigation below its switcher.
  if (
    /packages\/lumen-app-ui\/src\/app-sidebar-workspace\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.lumen-workspace-menu'
  )
    return true
  // App Sidebar 2: hover flyouts and the account menu anchor to their icon buttons.
  if (/packages\/lumen-app-ui\/src\/app-sidebar-rail\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-rail-flyout',
      '.lumen-rail-account-menu',
      '.lumen-rail-navigation .lumen-rail-flyout',
      '.lumen-rail-navigation.is-long .lumen-rail-flyout',
      '.lumen-rail-footer-item .lumen-rail-flyout',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Sidebar 1: the account menu is anchored above its profile trigger;
  // the narrow navigation dialog and backdrop cover the blank preview canvas.
  if (/packages\/lumen-app-ui\/src\/app-sidebar-primary\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set(['.lumen-primary-account-menu', '.lumen-primary-drawer-layer', '.lumen-primary-backdrop'])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 9: observed model-trigger menu, narrow navigation drawer/backdrop,
  // the visually hidden Expand control at the model trigger, and the composer
  // label overlaying its native textarea without altering flow.
  if (/packages\/lumen-app-ui\/src\/app-shell-chat\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-chat-model-menu',
      '.lumen-chat-drawer-layer',
      '.lumen-chat-backdrop',
      '.lumen-shell-chat-composer',
      '.lumen-chat-field-label',
      '.lumen-shell-chat-header',
      '.lumen-chat-expand',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 8: observed mobile queue drawer/backdrop, anchored bottom navigation
  // and the follow-up action covering the card's top-right corner.
  if (/packages\/lumen-app-ui\/src\/app-shell-adaptive\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-adaptive-drawer-layer',
      '.lumen-adaptive-backdrop',
      '.lumen-adaptive-flag',
      '.lumen-adaptive-bottom-nav',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 7: observed scope/status/account popovers, navigation backdrop and scroll fades.
  if (/packages\/lumen-app-ui\/src\/app-shell-scope\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-scope-sr-only',
      '.lumen-scope-menu',
      '.lumen-scope-status-popover',
      '.lumen-scope-account-menu > .lumen-scope-menu',
      '.lumen-scope-overlay',
      '.lumen-scope-backdrop',
      '.lumen-scope-scroll-frame::before',
      '.lumen-scope-scroll-frame::after',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 6: observed trigger-relative menus and document drawer/backdrop only.
  if (/packages\/lumen-app-ui\/src\/app-shell-documents\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-documents-menu',
      '.lumen-documents-more-formatting > .lumen-documents-menu',
      '.lumen-documents-overlay',
      '.lumen-documents-backdrop',
      '.lumen-documents-scroll-frame::before',
      '.lumen-documents-scroll-frame::after',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // App Shell 5: observed mailbox drawer, trigger-relative menu/tooltips and decorative markers.
  if (/packages\/lumen-app-ui\/src\/app-shell-inbox\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-inbox-overlay',
      '.lumen-inbox-backdrop',
      '.lumen-inbox-drawer',
      '.lumen-inbox-menu',
      '.lumen-inbox-tooltip',
      '.lumen-inbox-rail-dot',
      '.lumen-inbox-search-icon',
      '.lumen-inbox-scroll-frame::before',
      '.lumen-inbox-scroll-frame::after',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // cc-haha ComposerDropOverlay covers only its owning input; text remains in flex flow.
  if (
    /packages\/app-react\/src\/composer-attachments\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-composer-attachment-drop-overlay'
  )
    return true
  // cc-haha FileSearchMenu: the composer-width suggestion menu overlays only its owning editor.
  if (
    /packages\/app-react\/src\/composer-mention-editor\.css$/.test(path.replaceAll('\\', '/')) &&
    selector.trim() === '.hbar-composer-mention-menu'
  )
    return true
  // cc-haha TabBar context menu: only the observed trigger-anchored top-layer container.
  if (
    /packages\/app-react\/src\/workspace-tabs\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-workspace-tab-menu-popover(?::popover-open)?$/.test(selector.trim())
  )
    return true
  // cc-haha PermissionModeSelector: composer-trigger overlay / narrow bottom sheet.
  // Only this evidenced top-layer container; its option and confirmation content stays in flex flow.
  if (
    /packages\/app-react\/src\/composer-permission-picker\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-composer-permission-popover(?::popover-open|::backdrop)?$/.test(selector.trim())
  )
    return true
  // Reference ContextUsageIndicator: trigger-anchored read-only usage overlay / narrow bottom sheet.
  if (
    /packages\/app-react\/src\/session-usage-control\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-session-usage-popover(?::popover-open|::backdrop)?$/.test(selector.trim())
  )
    return true
  // cc-haha original-component evidence: composer model/effort anchored popovers,
  // becoming bottom sheets on narrow screens. Only the top-layer container.
  if (
    /packages\/app-react\/src\/composer-model-picker\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.hbar-composer-picker-popover(?::popover-open|::backdrop|\[data-kind='thinking'\])?$/.test(selector.trim())
  )
    return true
  // App Shell 1: observed drawer/backdrop, footer-anchored account menu and pane-edge fades.
  // Only these containers may overlay; content descendants still require normal flow.
  if (/packages\/lumen-app-ui\/src\/app-shell-sidebar\.css$/.test(path.replaceAll('\\', '/'))) {
    const containers = new Set([
      '.lumen-sidebar-overlay',
      '.lumen-sidebar-backdrop',
      '.lumen-sidebar-mobile',
      '.lumen-sidebar-account-menu',
      '.lumen-sidebar-nav-frame::after',
      '.lumen-sidebar-main-frame::after',
    ])
    if (selector.split(',').every((part) => containers.has(part.trim()))) return true
  }
  // App Shell 2: observed mobile navigation, workspace menu and scroll-edge fades.
  if (/packages\/lumen-app-ui\/src\/app-shell-rail\.css$/.test(path.replaceAll('\\', '/'))) {
    const containers = new Set([
      '.lumen-rail-overlay',
      '.lumen-rail-backdrop',
      '.lumen-rail-mobile',
      '.lumen-rail-workspace-menu',
      '.lumen-rail-nav-frame::after',
      '.lumen-rail-main-frame::after',
    ])
    if (selector.split(',').every((part) => containers.has(part.trim()))) return true
  }
  // App Shell 3: observed drawer, account menu, scroll-edge fades and decorative search adornments.
  if (/packages\/lumen-app-ui\/src\/app-shell-contracts\.css$/.test(path.replaceAll('\\', '/'))) {
    const containers = new Set([
      '.lumen-contracts-overlay',
      '.lumen-contracts-backdrop',
      '.lumen-contracts-drawer',
      '.lumen-contracts-account-menu',
      '.lumen-contracts-nav-frame::after',
      '.lumen-contracts-main-frame::after',
      '.lumen-contracts-search-field > svg',
      '.lumen-contracts-search-field kbd',
    ])
    if (selector.split(',').every((part) => containers.has(part.trim()))) return true
  }
  // App Shell 4: navigation overlay and observed decorative date/event/scroll markers only.
  if (/packages\/lumen-app-ui\/src\/app-shell-editorial\.css$/.test(path.replaceAll('\\', '/'))) {
    const overlays = new Set([
      '.lumen-editorial-overlay',
      '.lumen-editorial-backdrop',
      '.lumen-editorial-drawer',
      '.lumen-editorial-date-dot',
      '.lumen-editorial-event-line',
      '.lumen-editorial-main-frame::after',
      '.lumen-editorial-agenda-frame::after',
    ])
    if (selector.split(',').every((part) => overlays.has(part.trim()))) return true
  }
  // Plan 6's main scroll pane has observed pointer-transparent edge fades.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-summary\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-summary-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
  // Plan 5 has observed fades for the stacked board and each wide-screen column.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-board\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-board-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
  // Plan 4's main scroll region has the same observed pointer-transparent fades.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-actual\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-actual-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
  // Plan 3 has pointer-transparent fades above and below its ul-owned scroll area.
  if (
    /packages\/lumen-app-ui\/src\/agent-plan-tree\.css$/.test(path.replaceAll('\\', '/')) &&
    /^\.lumen-plan-tree-edge-overlay(?:\.is-(?:top|bottom)|\[data-visible=['"]true['"]\])?$/.test(selector.trim())
  )
    return true
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
      const isShellAccessibleText =
        ((/packages\/lumen-app-ui\/src\/app-shell-sidebar\.css$/.test(path.replaceAll('\\', '/')) &&
          rule.selector.trim() === '.lumen-sidebar-sr') ||
          (/packages\/lumen-app-ui\/src\/app-shell-contracts\.css$/.test(path.replaceAll('\\', '/')) &&
            rule.selector.trim() === '.lumen-contracts-sr') ||
          (/packages\/lumen-app-ui\/src\/app-shell-editorial\.css$/.test(path.replaceAll('\\', '/')) &&
            rule.selector.trim() === '.lumen-editorial-sr') ||
          (/packages\/lumen-app-ui\/src\/app-shell-inbox\.css$/.test(path.replaceAll('\\', '/')) &&
            rule.selector.trim() === '.lumen-inbox-sr')) &&
        /clip-path:\s*inset\(50%\)/.test(rule.body) &&
        value.trim() === 'absolute'
      if (property === 'position' && /\b(?:absolute|fixed)\b/.test(value) && !isOverlay && !isShellAccessibleText) {
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
  const workspaceMenu = '.lumen-workspace-menu {\nposition: absolute;\ninset-block-start: 0;\n}'
  if (validateCss('packages/lumen-app-ui/src/app-sidebar-workspace.css', workspaceMenu).length)
    throw new Error('Rejected observed workspace switcher overlay')
  if (validateCss('other.css', workspaceMenu).length < 2)
    throw new Error('Workspace switcher overlay exception leaked to another stylesheet')
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
  const treeMenuCss = `.lumen-tree-menu {
  position: absolute;
  inset-block-start: 1.875rem;
  inset-inline-end: 0.125rem;
}`
  const treeMenu = validateCss('packages/lumen-app-ui/src/app-sidebar-tree.css', treeMenuCss)
  const leakedTreeMenu = validateCss('packages/lumen-app-ui/src/other.css', treeMenuCss)
  if (treeMenu.length !== 0 || leakedTreeMenu.length === 0) {
    console.error('Flow layout guard self-test expected a path-scoped tree menu overlay exception')
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
    const summaryErrors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-summary.css',
      `.lumen-plan-summary-edge-overlay${suffix} { position: absolute; inset-inline: 0; }`,
    )
    if (summaryErrors.length) {
      console.error(`Flow layout guard rejected verified summary edge overlays: ${summaryErrors.join('; ')}`)
      process.exit(1)
    }
    const boardErrors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-board.css',
      `.lumen-plan-board-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (boardErrors.length) {
      console.error(`Flow layout guard rejected verified board edge overlays: ${boardErrors.join('; ')}`)
      process.exit(1)
    }
    const actualErrors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-actual.css',
      `.lumen-plan-actual-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (actualErrors.length) {
      console.error(`Flow layout guard rejected verified timing edge overlays: ${actualErrors.join('; ')}`)
      process.exit(1)
    }
    const treeErrors = validateCss(
      'packages/lumen-app-ui/src/agent-plan-tree.css',
      `.lumen-plan-tree-edge-overlay${suffix} {
  position: absolute;
  inset-inline: 0;
}`,
    )
    if (treeErrors.length) {
      console.error(`Flow layout guard rejected verified tree edge overlays: ${treeErrors.join('; ')}`)
      process.exit(1)
    }
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
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-summary-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-summary.css', '.lumen-plan-summary-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-summary.css', '.lumen-plan-summary-edge-overlay > button'],
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-board-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-board.css', '.lumen-plan-board-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-board.css', '.lumen-plan-board-edge-overlay > button'],
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-actual-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-actual.css', '.lumen-plan-actual-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-actual.css', '.lumen-plan-actual-edge-overlay > button'],
    ['packages/lumen-app-ui/src/agent-plan.css', '.lumen-plan-tree-edge-overlay'],
    ['packages/lumen-app-ui/src/agent-plan-tree.css', '.lumen-plan-tree-edge-overlay p'],
    ['packages/lumen-app-ui/src/agent-plan-tree.css', '.lumen-plan-tree-edge-overlay > button'],
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
  for (const selector of [
    '.lumen-sidebar-overlay',
    '.lumen-sidebar-backdrop',
    '.lumen-sidebar-mobile',
    '.lumen-sidebar-account-menu',
    '.lumen-sidebar-nav-frame::after, .lumen-sidebar-main-frame::after',
  ]) {
    const path = 'packages/lumen-app-ui/src/app-shell-sidebar.css'
    if (validateCss(path, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error(`Rejected observed shell overlay: ${selector}`)
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Shell exception leaked across files')
  }
  if (
    validateCss(
      'packages/lumen-app-ui/src/app-shell-sidebar.css',
      '.lumen-sidebar-account-menu > button {\nposition: absolute;\n}',
    ).length !== 1
  )
    throw new Error('Shell overlay exception leaked to menu content')
  if (
    validateCss(
      'packages/lumen-app-ui/src/app-shell-sidebar.css',
      '.lumen-sidebar-sr {\nposition: absolute;\nclip-path: inset(50%);\n}',
    ).length
  )
    throw new Error('Rejected accessible hidden copy')
  if (
    validateCss(
      'packages/lumen-app-ui/src/app-shell-sidebar.css',
      '.lumen-sidebar-sr {\nposition: fixed;\nclip-path: inset(50%);\n}',
    ).length !== 1
  )
    throw new Error('Hidden text exception allowed fixed placement')
  for (const selector of [
    '.lumen-rail-overlay',
    '.lumen-rail-backdrop',
    '.lumen-rail-mobile',
    '.lumen-rail-workspace-menu',
    '.lumen-rail-nav-frame::after, .lumen-rail-main-frame::after',
  ]) {
    const path = 'packages/lumen-app-ui/src/app-shell-rail.css'
    if (validateCss(path, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error(`Rejected observed rail overlay: ${selector}`)
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Rail exception leaked across files')
  }
  if (
    validateCss(
      'packages/lumen-app-ui/src/app-shell-rail.css',
      '.lumen-rail-workspace-menu > button {\nposition: absolute;\n}',
    ).length !== 1
  )
    throw new Error('Rail exception leaked to menu content')
  const composerPath = 'packages/app-react/src/composer-model-picker.css'
  const tabsPath = 'packages/app-react/src/workspace-tabs.css'
  if (validateCss(tabsPath, '.hbar-workspace-tab-menu-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed workspace tab menu container')
  for (const [path, selector] of [
    ['other.css', '.hbar-workspace-tab-menu-popover'],
    [tabsPath, '.hbar-workspace-tab-menu-popover > button'],
    [tabsPath, '.hbar-workspace-tab'],
  ]) {
    if (validateCss(path, `${selector} {\nposition: fixed;\ninset: 0;\n}`).length !== 2)
      throw new Error('Workspace tab menu exception leaked to content or another file')
  }
  if (validateCss(composerPath, '.hbar-composer-picker-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed composer popover container')
  if (validateCss(composerPath, '.hbar-composer-picker-popover > button { position: fixed; }').length !== 1)
    throw new Error('Composer popover exception leaked to content')
  if (validateCss('other.css', '.hbar-composer-picker-popover { position: fixed; }').length !== 1)
    throw new Error('Composer popover exception leaked across files')
  const attachmentPath = 'packages/app-react/src/composer-attachments.css'
  if (validateCss(attachmentPath, '.hbar-composer-attachment-drop-overlay {\nposition: absolute;\ninset: 0;\n}').length)
    throw new Error('Rejected observed composer attachment drop overlay')
  for (const [path, selector] of [
    ['other.css', '.hbar-composer-attachment-drop-overlay'],
    [attachmentPath, '.hbar-composer-attachment-drop-overlay > p'],
    [attachmentPath, '.hbar-composer-attachment-transfer'],
  ]) {
    if (validateCss(path, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length !== 2)
      throw new Error('Composer attachment overlay exception leaked to content or another file')
  }
  const mentionPath = 'packages/app-react/src/composer-mention-editor.css'
  if (validateCss(mentionPath, '.hbar-composer-mention-menu {\nposition: absolute;\ninset: 0;\n}').length)
    throw new Error('Rejected evidence-backed composer mention menu overlay')
  for (const [path, selector] of [
    ['other.css', '.hbar-composer-mention-menu'],
    [mentionPath, '.hbar-composer-mention-menu > p'],
    [mentionPath, '.hbar-composer-mention-row'],
  ]) {
    if (validateCss(path, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length !== 2)
      throw new Error('Composer mention overlay exception leaked to content or another file')
  }
  const permissionPath = 'packages/app-react/src/composer-permission-picker.css'
  const usagePath = 'packages/app-react/src/session-usage-control.css'
  if (validateCss(usagePath, '.hbar-session-usage-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed session usage popover container')
  if (validateCss(usagePath, '.hbar-session-usage-popover > button { position: fixed; }').length !== 1)
    throw new Error('Session usage popover exception leaked to content')
  if (validateCss('other.css', '.hbar-session-usage-popover { position: fixed; }').length !== 1)
    throw new Error('Session usage popover exception leaked across files')
  if (validateCss(permissionPath, '.hbar-composer-permission-popover { position: fixed; inset: 0; }').length)
    throw new Error('Rejected observed composer permission popover container')
  if (validateCss(permissionPath, '.hbar-composer-permission-popover > button { position: fixed; }').length !== 1)
    throw new Error('Composer permission popover exception leaked to content')
  if (validateCss('other.css', '.hbar-composer-permission-popover { position: fixed; }').length !== 1)
    throw new Error('Composer permission popover exception leaked across files')
  const contractsPath = 'packages/lumen-app-ui/src/app-shell-contracts.css'
  for (const selector of [
    '.lumen-contracts-overlay',
    '.lumen-contracts-backdrop',
    '.lumen-contracts-drawer',
    '.lumen-contracts-account-menu',
    '.lumen-contracts-nav-frame::after, .lumen-contracts-main-frame::after',
    '.lumen-contracts-search-field > svg',
    '.lumen-contracts-search-field kbd',
  ]) {
    if (validateCss(contractsPath, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error(`Rejected observed contracts overlay: ${selector}`)
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Contracts overlay exception leaked across files')
  }
  if (validateCss(contractsPath, '.lumen-contracts-account-menu > button {\nposition: absolute;\n}').length !== 1)
    throw new Error('Contracts overlay exception leaked to content')
  if (validateCss(contractsPath, '.lumen-contracts-sr {\nposition: absolute;\nclip-path: inset(50%);\n}').length)
    throw new Error('Rejected contracts accessible hidden copy')
  if (validateCss(contractsPath, '.lumen-contracts-sr {\nposition: fixed;\nclip-path: inset(50%);\n}').length !== 1)
    throw new Error('Contracts hidden copy exception allowed fixed positioning')
  const editorialPath = 'packages/lumen-app-ui/src/app-shell-editorial.css'
  for (const selector of [
    '.lumen-editorial-overlay',
    '.lumen-editorial-backdrop',
    '.lumen-editorial-drawer',
    '.lumen-editorial-date-dot',
    '.lumen-editorial-event-line',
    '.lumen-editorial-main-frame::after, .lumen-editorial-agenda-frame::after',
  ]) {
    if (validateCss(editorialPath, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error(`Rejected observed editorial overlay: ${selector}`)
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Editorial overlay exception leaked across files')
  }
  if (validateCss(editorialPath, '.lumen-editorial-schedule {\nposition: absolute;\n}').length !== 1)
    throw new Error('Editorial normal-flow schedule cannot become an overlay')
  const inboxPath = 'packages/lumen-app-ui/src/app-shell-inbox.css'
  for (const selector of [
    '.lumen-inbox-overlay',
    '.lumen-inbox-backdrop',
    '.lumen-inbox-drawer',
    '.lumen-inbox-menu',
    '.lumen-inbox-tooltip',
    '.lumen-inbox-rail-dot',
    '.lumen-inbox-search-icon',
    '.lumen-inbox-scroll-frame::before, .lumen-inbox-scroll-frame::after',
  ]) {
    if (validateCss(inboxPath, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error('Rejected observed inbox overlay')
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Inbox overlay exception leaked across files')
  }
  if (validateCss(inboxPath, '.lumen-inbox-summary {\nposition: absolute;\n}').length !== 1)
    throw new Error('Inbox message content cannot use overlay placement')
  const documentsPath = 'packages/lumen-app-ui/src/app-shell-documents.css'
  for (const selector of [
    '.lumen-documents-menu',
    '.lumen-documents-more-formatting > .lumen-documents-menu',
    '.lumen-documents-overlay',
    '.lumen-documents-backdrop',
    '.lumen-documents-scroll-frame::before, .lumen-documents-scroll-frame::after',
  ]) {
    if (validateCss(documentsPath, `${selector} {\nposition: absolute;\ninset: 0;\n}`).length)
      throw new Error('Rejected document overlay')
    if (validateCss('other.css', `${selector} {\nposition: absolute;\ninset: 0;\n}`).length < 2)
      throw new Error('Document overlay allowance leaked across files')
  }
  if (validateCss(documentsPath, '.lumen-documents-reader p {\nposition: absolute;\n}').length !== 1)
    throw new Error('Document prose cannot use overlay placement')
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
