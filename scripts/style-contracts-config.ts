import stylelint from 'stylelint'
import selectors from 'postcss-selector-parser'
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

export const styleContractsConfig: stylelint.Config = {
  plugins: [stylelint.createPlugin(ruleName, partRule)],
  rules: {
    'selector-class-pattern': [
      '^(?!lumen-).+$',
      {
        message: 'Host styles must use public data-lumen-part attributes; internal Lumen classes are private.',
      },
    ],
    [ruleName]: true,
  },
  ignoreFiles: ['apps/web/src/react-bits/**', 'apps/web/src/gallery-theme.css'],
}
