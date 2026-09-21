import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import {
  auditProductionCss,
  auditProductionDesignSystem,
  auditProductionTsx,
} from '../scripts/verify-design-system-boundaries'

test('every production and preview visible element is rendered through Lumen components', async () => {
  expect(await auditProductionDesignSystem()).toEqual([])
})

test('design-system boundary guard rejects native visible elements, numeric sizes, and page-owned primitive visuals', () => {
  expect(auditProductionTsx('fixture.tsx', '<section><button>Save</button></section><Widget size={13} />')).toEqual([
    {
      file: 'fixture.tsx',
      line: 1,
      rule: 'native-element',
      detail: 'Render <section> through an @lumen/app-ui component',
    },
    {
      file: 'fixture.tsx',
      line: 1,
      rule: 'native-control',
      detail: 'Render <button> through an @lumen/app-ui component',
    },
    { file: 'fixture.tsx', line: 1, rule: 'numeric-size', detail: 'Use the semantic S/M/L component size' },
  ])
  expect(
    auditProductionCss(
      'fixture.css',
      '.page .hbar-app-ui-button:hover { min-block-size: 31px; background: red; }',
    ),
  ).toEqual([
    {
      file: 'fixture.css',
      line: 1,
      rule: 'primitive-state-style',
      detail: 'State styling belongs to hbar-app-ui: .page .hbar-app-ui-button:hover',
    },
    {
      file: 'fixture.css',
      line: 1,
      rule: 'primitive-style',
      detail: 'Visual primitive styling belongs to hbar-app-ui: .page .hbar-app-ui-button:hover',
    },
  ])
})

test('shared vertical navigation selection is a square line with an outer glow', async () => {
  const css = await readFile('packages/hbar-app-ui/src/primitives.css', 'utf8')
  const selectedRule = css.match(/\.hbar-app-ui-navigation-button\[aria-current='page'\]::before\s*\{([^}]*)\}/)?.[1]

  expect(selectedRule).toBeDefined()
  expect(selectedRule).toContain('border-radius: 0')
  expect(selectedRule).toContain('background: var(--hbar-app-ui-accent)')
  expect(selectedRule).toContain('box-shadow:')
})
