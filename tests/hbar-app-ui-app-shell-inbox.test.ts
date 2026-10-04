import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShell05 } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { appShellInboxFixture } from './fixtures/hbar-app-ui-app-shell-inbox-fixtures'
import {
  createAppShellInboxPreviewStore,
  projectAppShellInboxPreview,
} from '../apps/hbar-app-ui-preview/src/app-shell-inbox-preview-model'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'
const setup = (mode: string | null = null) => {
  const fixture = appShellInboxFixture(mode),
    store = createAppShellInboxPreviewStore()
  return { fixture, store, view: () => projectAppShellInboxPreview(store.getState(), fixture) }
}
test('inbox renders grouped mailboxes, radio filters, option rows, full message paragraphs and attachments', () => {
  const { view } = setup()
  const html = renderToStaticMarkup(
    createElement(LumenAppShell05, { content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, inbox: view() } }),
  )
  expect(html).toContain('role="listbox"')
  expect(html.match(/role="option"/g)).toHaveLength(9)
  expect(html.match(/role="radio"/g)).toHaveLength(4)
  expect(html).toContain('supplier-import-sample-500.csv')
  expect(html).toContain('two-hour timeout')
  expect(html).toContain('data-lumen-list-strategy="pane-scroll"')
})
test('filters and search change only the list; empty recovery preserves selection and star state', () => {
  const { view } = setup()
  view().onFilter('unread')
  expect(view().conversations).toHaveLength(8)
  expect(view().selected?.id).toBe('priya')
  view().onFilter('assigned')
  expect(view().conversations.map((item) => item.id)).toEqual(['priya', 'marta', 'aisha'])
  view().onFilter('escalated')
  expect(view().conversations).toHaveLength(0)
  expect(view().selected?.id).toBe('priya')
  view().onClear()
  view().onQuery('  ROTTERDAM  ')
  expect(view().conversations.map((item) => item.id)).toEqual(['daniel'])
  view().onQuery('brightsea')
  expect(view().conversations).toHaveLength(0)
  view().onStar('priya')
  view().onClear()
  expect(view().conversations).toHaveLength(9)
  expect(view().selected?.starred).toBe(true)
})
test('selecting an unread result removes only it from that filter while keeping its reader', () => {
  const { view } = setup()
  view().onFilter('unread')
  view().onSelect('daniel')
  expect(view().conversations).toHaveLength(7)
  expect(view().selected?.id).toBe('daniel')
  expect(view().selected?.unread).toBe(false)
  expect(view().selected?.paragraphs).toHaveLength(3)
  view().onStar('daniel')
  view().onSelect('marta')
  expect(view().selected?.starred).toBe(false)
  view().onSelect('daniel')
  expect(view().selected?.starred).toBe(true)
})
test('empty, single, normal, capacity and over-capacity lists retain every unique item', () => {
  const { fixture, store } = setup()
  const seed = fixture.inventory[0]
  if (!seed) throw new Error('Fixture missing')
  for (const count of [0, 1, 9, 100, 101]) {
    const inventory = Array.from({ length: count }, (_, i) => ({ ...seed, id: `record-${i}` }))
    const value = projectAppShellInboxPreview(store.getState(), { ...fixture, inventory })
    expect(value.conversations).toHaveLength(count)
    expect(value.selected).toBeNull()
  }
  expect(setup('overflow').view().mailboxes).toHaveLength(21)
  expect(setup('empty').view().conversations).toHaveLength(0)
  const mailbox = fixture.mailboxes[0]
  if (!mailbox) throw new Error('Mailbox fixture missing')
  for (const count of [0, 1, 5, 20, 21]) {
    const mailboxes = Array.from({ length: count }, (_, index) => ({ ...mailbox, id: `mailbox-${index}` }))
    const html = renderToStaticMarkup(
      createElement(LumenAppShell05, {
        content: {
          ...HBAR_APP_UI_APP_SHELL_FIXTURES,
          inbox: { ...projectAppShellInboxPreview(store.getState(), fixture), mailboxes },
        },
      }),
    )
    expect(html.match(/role="tooltip"/g) ?? []).toHaveLength(count + 1)
  }
})
test('duplicates update in order, stale IDs stay empty and callbacks bind their original target', () => {
  const events: string[] = [],
    fixture = appShellInboxFixture(null, (action, id) => events.push(`${action}:${id}`)),
    store = createAppShellInboxPreviewStore()
  const seed = fixture.inventory[0]
  if (!seed) throw new Error('Fixture missing')
  const value = projectAppShellInboxPreview(store.getState(), {
    ...fixture,
    inventory: [...fixture.inventory, { ...seed, subject: 'Updated subject' }],
  })
  expect(value.conversations).toHaveLength(9)
  expect(value.selected?.subject).toBe('Updated subject')
  const originalId = value.selected?.id
  if (!originalId) throw new Error('Selection missing')
  const action = () => value.onAction('reply', originalId)
  value.onSelect('daniel')
  action()
  expect(events.at(-1)).toBe('reply:priya')
  value.onSelect('missing')
  expect(store.getState().selectedId).toBe('daniel')
  store.setState({ selectedId: 'missing', filterId: 'missing' })
  const stale = projectAppShellInboxPreview(store.getState(), fixture)
  expect(stale.selected).toBeNull()
  expect(stale.filterId).toBeNull()
  expect(stale.conversations).toHaveLength(0)
})
test('localized content and independent stores preserve domain identities without leaking UI copy', () => {
  const a = setup('localized'),
    b = setup()
  a.view().onSelect('daniel')
  a.view().onStar('daniel')
  expect(b.view().selected?.id).toBe('priya')
  expect(b.view().selected?.starred).toBe(false)
  expect(a.view().labels.title).toBe('Gemeinsamer Kundendiensteingang')
  expect(a.view().selected?.recipient).toBe('An den Portway-Kundendienst')
  const html = renderToStaticMarkup(
    createElement(LumenAppShell05, { content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, inbox: a.view() } }),
  )
  expect(html).not.toContain('Search conversations')
  expect(html).toContain('Unterhaltungen durchsuchen')
})
test('blank and stale mailbox, conversation, attachment and menu targets are rejected', () => {
  const actions: string[] = []
  const fixture = appShellInboxFixture(null, (action, value) => actions.push(`${action}:${value ?? ''}`))
  const store = createAppShellInboxPreviewStore()
  const view = projectAppShellInboxPreview(store.getState(), fixture)
  view.onFilter(' ')
  view.onMailbox(' ')
  view.onSelect(' ')
  view.onStar(' ')
  view.onAction('reply', ' ')
  view.onAction('download', 'priya', ' ')
  view.onAction('menu', 'priya', 'removed')
  expect(store.getState().selectedId).toBe('priya')
  expect(actions).toEqual([])
  view.onAction('reply', 'priya')
  expect(actions).toEqual(['reply:priya'])
})
test('inbox sampling covers independent changes and explicitly infers repeated buttons', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-shell-5')
  expect(plan?.samples).toHaveLength(17)
  expect(new Set(plan?.samples.map((item) => `${item.viewport}/${item.theme}/${item.suffix}`)).size).toBe(17)
  expect(plan?.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})
