import { expect, test } from 'bun:test'
import stylelint from 'stylelint'
import { lumenDesignScaleConfig, styleContractsConfig } from '../scripts/style-contracts-config'

const lint = (code: string) =>
  stylelint.lint({
    code,
    codeFilename: 'packages/app-react/src/host-contract-fixture.css',
    config: styleContractsConfig,
  })
const lintLumen = (code: string) =>
  stylelint.lint({
    code,
    codeFilename: 'packages/lumen-app-ui/src/style-contract-fixture.css',
    config: lumenDesignScaleConfig,
  })

test('host styling rejects internal Lumen classes, including classes inside pseudo selectors', async () => {
  const result = await lint('.host :is(.lumen-page-header, .owned-heading) { display: flex; }')
  expect(result.errored).toBe(true)
  expect(result.results[0]?.warnings[0]?.rule).toBe('selector-class-pattern')
})

test('host styling accepts public parts and rejects misspelled or positional part selectors', async () => {
  expect((await lint('.host [data-lumen-part~="conversation.messages"] { overflow: auto; }')).errored).toBe(false)
  expect((await lint('.host [data-lumen-part~="conversation.messsages"] { overflow: auto; }')).errored).toBe(true)
  expect((await lint('.host [data-lumen-part="conversation.messages"] { overflow: auto; }')).errored).toBe(true)
})

test('host styles use named spacing, semantic radius and layer tokens', async () => {
  const accepted = await lint(`
    .host { gap: var(--lumen-space-8) var(--lumen-space-12); padding: 0 var(--lumen-space-16); }
    .host [data-lumen-part~="dialog.content"] { border-radius: var(--lumen-radius-surface); z-index: var(--lumen-layer-modal); }
    .host .circle { border-radius: 50%; padding: 0; }
  `)
  expect(accepted.errored).toBe(false)
})

test('host styles reject bare values even when they match the approved spacing scale', async () => {
  for (const code of [
    '.host { gap: 8px; }',
    '.host { padding: 0.5rem 1rem; }',
    '.host { border-radius: 8px; }',
    '.host { border-radius: var(--radius-sm); }',
    '.host { z-index: var(--z-floating); }',
    '.host { border-top-left-radius: 4px; }',
    '.host { border-start-start-radius: 4px; }',
    '.host { gap: -.25rem; }',
    '.host { z-index: 12; }',
    '.host { gap: calc(var(--lumen-space-8) + 2px); }',
    '.host { padding: var(--lumen-space-8, 0.5rem); }',
  ]) {
    const result = await lint(code)
    expect(result.errored, code).toBe(true)
    expect(
      result.results[0]?.warnings.some((warning) => warning.rule === 'hbar/design-scale-tokens'),
      code,
    ).toBe(true)
  }
})

test('host styles reject bare dimensions in physical and logical corner-radius properties', async () => {
  const cornerProperties = [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-start-start-radius',
    'border-start-end-radius',
    'border-end-start-radius',
    'border-end-end-radius',
  ]
  for (const property of cornerProperties) {
    const result = await lint(`.host { ${property}: 4px; }`)
    expect(
      result.results[0]?.warnings.some((warning) => warning.rule === 'hbar/design-scale-tokens'),
      property,
    ).toBe(true)
  }
})

test('Lumen styles use the same token scale without applying host selector rules', async () => {
  const accepted = await lintLumen(`
    .lumen-card { gap: var(--lumen-space-8); border-radius: var(--lumen-radius-surface); z-index: calc(var(--lumen-layer-toast) - var(--lumen-toast-depth)); --lumen-dashboard-gap: var(--lumen-space-12); }
  `)
  expect(accepted.errored).toBe(false)
  const rejected = await lintLumen('.lumen-card { padding: 8px; border-radius: var(--radius-sm); z-index: 3; }')
  expect(rejected.errored).toBe(true)
  expect(rejected.results[0]?.warnings.some((warning) => warning.rule === 'hbar/design-scale-tokens')).toBe(true)
  expect((await lintLumen('.lumen-card { --lumen-dashboard-gap: 0.625rem; }')).errored).toBe(true)
  expect((await lintLumen(':root { --lumen-space-8: 0.75rem; }')).errored).toBe(true)
  expect((await lintLumen(':root { --lumen-layer-popover: 41; }')).errored).toBe(true)
  for (const [size, control, surface, panel] of [
    ['s', '0.25rem', '0.5rem', '0.75rem'],
    ['m', '0.375rem', '0.75rem', '1.125rem'],
    ['l', '0.5rem', '1rem', '1.5rem'],
  ]) {
    expect(
      (
        await lintLumen(
          `[data-lumen-corner-size='${size}'] { --lumen-radius-control: ${control}; --lumen-radius-surface: ${surface}; --lumen-radius-panel: ${panel}; }`,
        )
      ).errored,
    ).toBe(false)
  }
  expect(
    (
      await lintLumen(
        "[data-lumen-shape='square'] { --lumen-radius-control: 0; --lumen-radius-surface: 0; --lumen-radius-panel: 0; }",
      )
    ).errored,
  ).toBe(false)
  expect((await lintLumen("[data-lumen-corner-size='s'] { --lumen-radius-panel: 1rem; }")).errored).toBe(true)
  expect((await lintLumen('.lumen-card { --lumen-radius-control: 0.375rem; }')).errored).toBe(true)
  expect((await lintLumen("[data-lumen-corner-size='m'] { --lumen-radius-base: 0.375rem; }")).errored).toBe(true)
})
