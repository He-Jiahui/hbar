import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAiChat01 } from '@lumen/app-ui'
import { LumenPromptInput01, LumenPromptInput04, LumenPromptInput07 } from '@lumen/app-ui'
import {
  LumenAgentActivity03,
  LumenAgentActivity05,
  LumenAgentActivity07,
  LumenToolCalls01,
  LumenToolCalls06,
} from '@lumen/app-ui'
import { LumenAgentApproval01, LumenAgentApproval02, LumenAgentApproval06 } from '@lumen/app-ui'
import { HbarPromptComposer } from '../packages/app-react/src/prompt-composer'

const labels = {
  input: 'Prompt',
  placeholder: 'Write',
  send: 'Send',
  submitTitle: 'Submit',
  stop: 'Stop',
  uploading: 'Uploading',
  addAttachment: 'Attach',
  removeAttachment: ({ name, id }: { name: string; id: string }) => `Remove ${name} (${id})`,
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

test.each([LumenAgentApproval01, LumenAgentApproval02, LumenAgentApproval06])(
  'approval numbered controlled slots render host decision',
  (Variant) => {
    const html = renderToStaticMarkup(
      <Variant controlled={{ body: <div data-testid="decision">host decision</div> }} />,
    )
    expect(html).toContain('data-testid="decision"')
    expect(html).toContain('host decision')
  },
)

test('composer parity keeps host gates, deduplicates attachment identity and preserves original removal id', () => {
  const html = renderToStaticMarkup(<HbarPromptComposer {...base} disabled />)
  // The fallback is rendered by LumenChip. Its semantic identity is exposed
  // through the component data attribute and attachment class; `data-kind`
  // belongs to other Lumen surfaces and is not emitted by prompt chips.
  expect(html.match(/class="[^"]*\blumen-attachment-chip\b[^"]*"/g)).toHaveLength(1)
  expect(html).toContain('data-lumen-component="chip"')
  // Lumen derives the chip key from kind:id, then strips that prefix before
  // invoking the host removal label/callback. Include the id in the label so
  // SSR verifies the original id survives that round trip.
  expect(html).toContain('Remove a.txt (a)')
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

test.each([LumenAgentActivity03, LumenAgentActivity05, LumenAgentActivity07, LumenToolCalls01, LumenToolCalls06])(
  'activity and tool numbered controlled slots render host trace',
  (Variant) => {
    const html = renderToStaticMarkup(<Variant controlled={{ body: <div data-testid="trace">host trace</div> }} />)
    expect(html).toContain('data-testid="trace"')
    expect(html).toContain('host trace')
  },
)
