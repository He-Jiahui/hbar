import { expect, test } from 'bun:test'
import stylelint from 'stylelint'
import { styleContractsConfig } from '../scripts/style-contracts-config'

const lint = (code: string) =>
  stylelint.lint({
    code,
    codeFilename: 'packages/app-react/src/host-contract-fixture.css',
    config: styleContractsConfig,
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
