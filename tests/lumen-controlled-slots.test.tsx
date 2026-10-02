import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAiChat01 } from '@lumen/app-ui'
import { LumenPromptInput01, LumenPromptInput04, LumenPromptInput07 } from '@lumen/app-ui'
import { HbarPromptComposer } from '../packages/app-react/src/prompt-composer'

const labels = {
  input: 'Prompt',
  placeholder: 'Write',
  send: 'Send',
  submitTitle: 'Submit',
  stop: 'Stop',
  uploading: 'Uploading',
  addAttachment: 'Attach',
  removeAttachment: ({ name }: { name: string }) => `Remove ${name}`,
}
const base = {
  value: 'hello',
  labels,
  attachments: [
    { id: 'a', kind: 'file' as const, name: 'a.txt' },
    { id: 'a', kind: 'file' as const, name: 'duplicate' },
  ],
  submitting: false,
  uploading: false,
  canSubmit: true,
  canStop: false,
  onChange: () => {},
  onRemoveAttachment: () => {},
  onSubmit: () => {},
  onStop: () => {},
}

test('AiChat01 controlled layout renders host body and composer without content records', () => {
  const html = renderToStaticMarkup(
    <LumenAiChat01
      controlled={{
        body: <article data-testid="body">runtime message</article>,
        composer: <aside data-testid="composer">runtime composer</aside>,
      }}
    />,
  )
  expect(html).toContain('data-testid="body"')
  expect(html).toContain('data-testid="composer"')
  expect(html).toContain('runtime message')
})

test.each([LumenPromptInput01, LumenPromptInput04, LumenPromptInput07])(
  'PromptInput controlled variant preserves host composer',
  (Variant) => {
    const html = renderToStaticMarkup(
      <Variant controlled={{ body: null, composer: <textarea aria-label="host editor" /> }} />,
    )
    expect(html).toContain('host editor')
  },
)

test('composer parity keeps host gates, deduplicates attachment identity and preserves original removal id', () => {
  const html = renderToStaticMarkup(<HbarPromptComposer {...base} disabled />)
  expect(html.match(/data-kind="file"/g)).toHaveLength(1)
  expect(html).toContain('Remove a.txt')
  expect(html).toContain('disabled=""')
  expect(html).toContain('hbar-prompt-composer')
})

test('composer parity renders background action before stop/send controls', () => {
  const html = renderToStaticMarkup(
    <HbarPromptComposer {...base} canStop backgroundAction={<span data-testid="background">background</span>} />,
  )
  expect(html.indexOf('data-testid="background"')).toBeGreaterThan(-1)
  expect(html.indexOf('data-testid="background"')).toBeLessThan(html.lastIndexOf('aria-label="Stop"'))
})
