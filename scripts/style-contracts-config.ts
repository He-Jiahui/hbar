import stylelint from 'stylelint'
import selectors from 'postcss-selector-parser'
import valueParser from 'postcss-value-parser'
import { LUMEN_STYLE_PARTS } from '@lumen/app-ui/style-contract'

const ruleName = 'hbar/known-lumen-parts'
const knownParts = new Set<string>(LUMEN_STYLE_PARTS)
const partRule: stylelint.Rule = (enabled: unknown) => (root, result) => {
  if (enabled !== true) return
  root.walkRules((rule) => {
    selectors((ast) => {
      ast.walkAttributes((attribute) => {
        if (attribute.attribute !== 'data-lumen-part') return
        const value = attribute.value
        if (attribute.operator === '~=' && value !== undefined && knownParts.has(value)) return
        stylelint.utils.report({
          ruleName,
          result,
          node: rule,
          message: `Use a known public Lumen part with ~=; received ${attribute.toString()}`,
          index: attribute.sourceIndex ?? 0,
          endIndex: (attribute.sourceIndex ?? 0) + attribute.toString().length,
        })
      })
    }).processSync(rule.selector)
  })
}
partRule.ruleName = ruleName
partRule.messages = stylelint.utils.ruleMessages(ruleName, { rejected: 'Unknown public Lumen part' })

const designScaleRuleName = 'hbar/design-scale-tokens'
const designScaleProperties =
  /^(?:gap|row-gap|column-gap|margin(?:-.+)?|padding(?:-.+)?|border-radius|border-(?:top|bottom|left|right|start|end)-(?:top|bottom|left|right|start|end)-radius|z-index)$/
const spacingTokenValues = new Map([
  ['--lumen-space-2', '0.125rem'],
  ['--lumen-space-4', '0.25rem'],
  ['--lumen-space-8', '0.5rem'],
  ['--lumen-space-12', '0.75rem'],
  ['--lumen-space-16', '1rem'],
  ['--lumen-space-24', '1.5rem'],
  ['--lumen-space-32', '2rem'],
])
const layerTokenValues = new Map([
  ['--lumen-layer-underlay', '-1'],
  ['--lumen-layer-base', '0'],
  ['--lumen-layer-raised', '1'],
  ['--lumen-layer-sticky-cell', '2'],
  ['--lumen-layer-sticky-edge', '3'],
  ['--lumen-layer-anchored', '4'],
  ['--lumen-layer-menu-panel', '5'],
  ['--lumen-layer-submenu', '6'],
  ['--lumen-layer-floating-menu', '7'],
  ['--lumen-layer-hint', '9'],
  ['--lumen-layer-toast', '10'],
  ['--lumen-layer-menu', '12'],
  ['--lumen-layer-drawer', '20'],
  ['--lumen-layer-mobile-overlay', '30'],
  ['--lumen-layer-drawer-backdrop', '35'],
  ['--lumen-layer-dialog-content', '40'],
  ['--lumen-layer-toast-top', '45'],
  ['--lumen-layer-popover', '50'],
  ['--lumen-layer-selection', '1100'],
  ['--lumen-layer-backdrop', '9990'],
  ['--lumen-layer-modal', '10000'],
])
const validTokenDeclaration = (property: string, value: string, selector = ''): boolean => {
  const spacing = spacingTokenValues.get(property)
  if (spacing) return value.trim() === spacing
  const layer = layerTokenValues.get(property)
  if (layer) return value.trim() === layer
  if (property.startsWith('--lumen-radius-')) {
    if (selector === "[data-lumen-shape='square']")
      return (
        ['--lumen-radius-control', '--lumen-radius-surface', '--lumen-radius-panel'].includes(property) &&
        value.trim() === '0'
      )
    const sizes: Record<string, Record<string, string>> = {
      s: { '--lumen-radius-control': '0.25rem', '--lumen-radius-surface': '0.5rem', '--lumen-radius-panel': '0.75rem' },
      m: {
        '--lumen-radius-control': '0.375rem',
        '--lumen-radius-surface': '0.75rem',
        '--lumen-radius-panel': '1.125rem',
      },
      l: { '--lumen-radius-control': '0.5rem', '--lumen-radius-surface': '1rem', '--lumen-radius-panel': '1.5rem' },
    }
    const size = selector.match(/^\[data-lumen-corner-size=['"]([sml])['"]\]$/)?.[1]
    if (size) return sizes[size]?.[property] === value.trim()
    if (property === '--lumen-radius-pill') return value.trim() === '999px'
    return false
  }
  if (property === '--lumen-mobile-nav-height') return value.trim() === '3.625rem'
  return false
}
const designScaleRule: stylelint.Rule = (enabled: unknown) => (root, result) => {
  if (enabled !== true) return
  root.walkDecls((declaration) => {
    const isCustomDesignValue =
      declaration.prop.startsWith('--') && /(?:space|spacing|gap|padding|radius|layer)/i.test(declaration.prop)
    if (!designScaleProperties.test(declaration.prop) && !isCustomDesignValue) return
    const isTokenSource =
      /^--lumen-(?:space-(?:2|4|8|12|16|24|32)|radius-(?:control|surface|panel|pill)|layer-[a-z-]+|mobile-nav-height)$/.test(
        declaration.prop,
      )
    const selector = declaration.parent?.type === 'rule' ? declaration.parent.selector : ''
    let rejected = isTokenSource && !validTokenDeclaration(declaration.prop, declaration.value, selector)
    const normalizedValue = declaration.value
      .replace(/calc\(\s*(var\(--lumen-space-(?:2|4|8|12|16|24|32)\))\s*\*\s*-1\s*\)/g, '$1')
      .replace(
        /calc\(100% \/ var\(--lumen-usage-widget-points\) \/ 2\)/g,
        'calc(100% / var(--lumen-usage-widget-points) / 1)',
      )
    valueParser(normalizedValue).walk((node) => {
      if (node.type === 'function' && node.value === 'var') {
        const variable = node.nodes.find((argument) => argument.type === 'word')?.value ?? ''
        if (
          !declaration.prop.startsWith('--') &&
          declaration.prop.includes('radius') &&
          !/^--lumen-radius-(?:control|surface|panel|pill)$/.test(variable)
        ) {
          rejected = true
        }
        if (
          !declaration.prop.startsWith('--') &&
          declaration.prop === 'z-index' &&
          !/^--lumen-(?:layer-[a-z-]+|floating-layer|toast-depth)$/.test(variable)
        )
          rejected = true
      }
      if (node.type !== 'word') return
      if (/^-?\d*\.?\d+(?:px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|ch|ex|cap|ic|lh|rlh|%)$/i.test(node.value)) {
        if (/%$/.test(node.value)) return
        if (isTokenSource) return
        rejected = true
        return
      }
      if (/^-?\d*\.?\d+$/.test(node.value) && Number(node.value) !== 0 && !isTokenSource) rejected = true
    })
    if (!rejected) return
    stylelint.utils.report({
      ruleName: designScaleRuleName,
      result,
      node: declaration,
      message: `Use a Lumen spacing, semantic radius, or named layer token for ${declaration.prop}; keep only geometric 0 and percentages literal.`,
    })
  })
}
designScaleRule.ruleName = designScaleRuleName
designScaleRule.messages = stylelint.utils.ruleMessages(designScaleRuleName, {
  rejected: 'Use a Lumen spacing, semantic radius, or named layer token.',
})

export const styleContractsConfig: stylelint.Config = {
  plugins: [stylelint.createPlugin(ruleName, partRule), stylelint.createPlugin(designScaleRuleName, designScaleRule)],
  rules: {
    'selector-class-pattern': [
      '^(?!lumen-).+$',
      {
        message: 'Host styles must use public data-lumen-part attributes; internal Lumen classes are private.',
      },
    ],
    [ruleName]: true,
    [designScaleRuleName]: true,
  },
  ignoreFiles: ['apps/web/src/react-bits/**', 'apps/web/src/gallery-theme.css'],
}

export const lumenDesignScaleConfig: stylelint.Config = {
  plugins: [stylelint.createPlugin(designScaleRuleName, designScaleRule)],
  rules: {
    [designScaleRuleName]: true,
  },
}
