import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShell09, type LumenAppShellChatContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { appShellChatFixture } from './fixtures/hbar-app-ui-app-shell-chat-fixtures'
import {
  createAppShellChatPreviewStore,
  projectAppShellChatPreview,
} from '../apps/hbar-app-ui-preview/src/app-shell-chat-preview-model'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const setup = (mode: string | null = null, report: (action: string, value?: string) => void = () => {}) => {
  const store = createAppShellChatPreviewStore(),
    fixture = appShellChatFixture(mode, report)
  return { store, fixture, view: () => projectAppShellChatPreview(store.getState(), fixture) }
}
const render = (chat: LumenAppShellChatContent) =>
  renderToStaticMarkup(
    createElement(LumenAppShell09, {
      content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, chat },
    }),
  )

test('chat shell has semantic sidebar, model radios, native composer and four suggestions', () => {
  const html = render(setup().view())
  expect(html).toContain('<aside class="lumen-chat-sidebar">')
  expect(html).toContain('role="radiogroup" aria-label="Model"')
  expect(html).toContain('role="radio" aria-checked="true"')
  expect(html).toContain('<h2>How can I help?</h2>')
  expect(html).toMatch(/<label[^>]+for="[^"]+"[^>]*>Message Halden<\/label>/)
  expect(html).toMatch(/<textarea[^>]+id="[^"]+"/)
  expect(html).toContain('aria-label="Send message" disabled=""')
  expect(html.match(/class="lumen-chat-suggestions"/g)).toHaveLength(1)
  expect(html).not.toContain('October reconciliation')
})
test('model and thread selection project stable IDs, and a new chat restores the welcome state', () => {
  const { view } = setup()
  view().onModel('wren')
  expect(view().selectedModelId).toBe('wren')
  view().onThread('refactor')
  const html = render(view())
  expect(html).toContain('<h1>Refactor auth middleware</h1>')
  expect(html).toContain('The session refresh runs on every request. Can it be cheaper?')
  expect(html).not.toContain('How can I help?')
  view().onThread(null)
  expect(view().selectedThreadId).toBeNull()
  expect(view().selectedModelId).toBe('wren')
  expect(render(view())).toContain('<h2>How can I help?</h2>')
})
test('suggestions fill the draft; a demo send does not invent a response or clear input', () => {
  const events: string[] = [],
    { view } = setup(null, (action, value) => events.push(`${action}:${value ?? ''}`))
  view().onDraft('Draft an email')
  expect(view().draft).toBe('Draft an email')
  expect(render(view())).not.toContain('aria-label="Send message" disabled=""')
  view().onAction('send', view().draft)
  expect(view().draft).toBe('Draft an email')
  expect(view().selectedThreadId).toBeNull()
  view().onThread('refactor')
  expect(view().draft).toBe('')
  expect(events).toContain('send:Draft an email')
})
test('empty, single, normal, 100 and 101 thread pages remain accessible without slicing', () => {
  for (const [mode, count] of [
    ['empty', 0],
    ['one', 1],
    [null, 6],
    ['boundary', 100],
    ['overflow', 101],
  ] as const) {
    const value = setup(mode).view(),
      html = render(value)
    expect(value.threads).toHaveLength(count)
    expect(html.match(/class="lumen-chat-side-link"/g) ?? []).toHaveLength(count + 4)
  }
})
test('duplicate and stale IDs, original-target callbacks, long locale and no-op actions are explicit', () => {
  const events: string[] = [],
    { fixture, store } = setup(null, (action, value) => events.push(`${action}:${value ?? ''}`))
  const first = fixture.threads[0]!
  const duplicate = projectAppShellChatPreview(store.getState(), {
    ...fixture,
    threads: [...fixture.threads, { ...first, label: 'Updated quarterly thread' }],
  })
  expect(render(duplicate).match(/Updated quarterly thread/g)?.length).toBeGreaterThan(0)
  duplicate.onThread('quarterly')
  expect(events).toContain('thread:quarterly')
  duplicate.onThread('removed')
  duplicate.onModel('removed')
  duplicate.onAction('quick', 'removed')
  expect(events).not.toContain('thread:removed')
  store.getState().chooseThread('removed')
  expect(projectAppShellChatPreview(store.getState(), fixture).selectedThreadId).toBeNull()
  const translated = projectAppShellChatPreview(store.getState(), appShellChatFixture('localized'))
  expect(render(translated)).toContain('Wie kann ich helfen?')
  expect(
    render({ ...translated, labels: { ...translated.labels, welcomeTitle: 'Eine sehr lange Überschrift '.repeat(8) } }),
  ).toContain('Eine sehr lange Überschrift')
  expect(render(translated)).not.toContain('How can I help?')
  translated.onAction('share')
  translated.onAction('search')
  expect(translated.selectedThreadId).toBeNull()
})
test('sampling plan separates distinct feedback from repeated no-op affordances', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-shell-9')
  expect(plan?.samples.length).toBeGreaterThanOrEqual(6)
  expect(plan?.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})
