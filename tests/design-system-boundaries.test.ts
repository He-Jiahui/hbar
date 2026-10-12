import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import {
  auditProductionCss,
  auditProductionDesignSystem,
  auditProductionTsx,
  collectProductionAppSourceFiles,
} from '../scripts/verify-design-system-boundaries'

test('Desktop build, application composition and compatibility preview elements respect Lumen and declared renderers', async () => {
  expect(await auditProductionDesignSystem()).toEqual([])
}, 30_000)

test('production source coverage retains delayed business surfaces while excluding package unit fixtures', async () => {
  const files = (await collectProductionAppSourceFiles()).map((file) => file.replaceAll('\\', '/'))
  expect(files.some((file) => file.endsWith('/apps/web/src/schedules-page.tsx'))).toBe(true)
  expect(files.some((file) => file.endsWith('/packages/app-react/src/message-markdown.tsx'))).toBe(true)
  expect(files.some((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))).toBe(false)
  expect(files.some((file) => file.includes('/react-bits/reference/'))).toBe(false)
  expect(files.some((file) => file.includes('/hbar-ui/'))).toBe(false)
})

test('design-system boundary guard rejects native visible elements, numeric sizes, and page-owned primitive visuals', () => {
  expect(
    auditProductionTsx('fixture.tsx', '<><section><button>Save</button></section><Widget size={13} /></>'),
  ).toEqual([
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
    { file: 'fixture.tsx', line: 1, rule: 'numeric-size', detail: 'Use the component semantic size tier' },
  ])
  expect(
    auditProductionCss('fixture.css', '.page .hbar-app-ui-button:hover { min-block-size: 31px; background: red; }'),
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

test('the JSX guard ignores quoted HTML, comments and generic types but still rejects actual numeric size attributes', () => {
  expect(
    auditProductionTsx(
      'fixture.tsx',
      `
    const example = '<button size={13}>Save</button>'
    // <section><input size={12} /></section>
    type span = string
    type Wrapper<T> = { value: T }
    const value: Wrapper<span> = { value: example }
    const view = <Widget size="sm" />
  `,
    ),
  ).toEqual([])
  expect(auditProductionTsx('fixture.tsx', 'const view = <Widget size={-13} />')).toEqual([
    { file: 'fixture.tsx', line: 1, rule: 'numeric-size', detail: 'Use the component semantic size tier' },
  ])
})

test('declared inline renderer ownership does not allow an adjacent business button in the same file', () => {
  expect(
    auditProductionTsx(
      'packages/app-react/src/message-markdown.tsx',
      `function InlineContainer({children}) { return <span>{children}</span> }
function MessageActions({labels}) { return <button>{labels.copy}</button> }`,
    ),
  ).toEqual([
    {
      file: 'packages/app-react/src/message-markdown.tsx',
      line: 2,
      rule: 'native-control',
      detail: 'Render <button> through an @lumen/app-ui component',
    },
  ])
})

test('compatibility controls leave visual state to canonical Lumen primitives', async () => {
  const css = await readFile('packages/hbar-app-ui/src/primitives.css', 'utf8')
  const forms = await readFile('packages/hbar-app-ui/src/components/forms/FormControls.css', 'utf8')

  expect(css).not.toMatch(/\.hbar-app-ui-button[^{}]*\{[^}]*(?:border|background|box-shadow|outline)\s*:/s)
  expect(forms).not.toMatch(/\.hbar-app-ui-control[^{}]*\{/)
  expect(forms).not.toMatch(/\.hbar-app-ui-(?:checkbox|combobox|multi-select)[^{}]*\{/)
})
