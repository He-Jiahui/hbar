import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LumenCommandList,
  LumenInviteCommand,
  LumenAssistantCommands,
  LumenSearchCommands,
  uniqueLumenCommandItems,
  type LumenCommandListProps,
} from '@lumen/app-ui'
import { createCommandPreviewFixtures } from '../apps/hbar-app-ui-preview/src/commandPreviewFixtures'
import {
  createCommandPreviewStore,
  selectCommandPreviewItems,
  selectCommandPreviewSelection,
} from '../apps/hbar-app-ui-preview/src/commandPreviewModel'
import { projectCommandWorkflowPreview } from '../apps/hbar-app-ui-preview/src/CommandWorkflowPreview'

function preview(variant: number, mode: string | null = null) {
  const fixture = createCommandPreviewFixtures(variant, mode)
  const ownerId = `test-owner-${variant}`
  const store = createCommandPreviewStore({ ...fixture.seed, ownerId })
  function project() {
    const state = store.getState()
    const selection = selectCommandPreviewSelection(state)
    const items = selectCommandPreviewItems(state)
    const list: LumenCommandListProps = {
      labels: fixture.labels,
      items,
      query: state.query,
      selectedId: selection.selectedId,
      inputRole: 'combobox',
      listStrategy: items.length > 50 ? 'virtual' : 'content-grown',
      onQueryChange: (value) => {
        state.setQuery(ownerId, value)
      },
      onSelect: (id) => {
        state.select(ownerId, id)
      },
      onMove: (direction) => {
        state.move(ownerId, direction)
      },
      onExecute() {},
    }
    return { list, content: projectCommandWorkflowPreview(state, store, fixture, list, () => {}) }
  }
  return { fixture, ownerId, store, project }
}

test('group labels are list-owned semantic sections, and blank IDs never become options', () => {
  const { project } = preview(1)
  const list = project().list
  const html = renderToStaticMarkup(
    createElement(LumenCommandList, { ...list, items: [{ id: ' ', label: 'Invalid' }, ...list.items] }),
  )
  expect(html.match(/role="group"/g)).toHaveLength(3)
  expect(html.match(/role="option"/g)).toHaveLength(10)
  expect(html).not.toContain('Invalid')
  expect(
    uniqueLumenCommandItems([
      { id: ' x ', label: 'Old' },
      { id: '', label: 'Blank' },
      { id: ' x ', label: 'Latest' },
    ]),
  ).toEqual([{ id: ' x ', label: 'Latest' }])
})

test('quick nested pages have source-specific datasets and valid original targets', () => {
  const { store, ownerId, fixture } = preview(2)
  expect(fixture.seed.pages.map((page) => page.items.length)).toEqual([5, 6, 3, 4])
  expect(store.getState().enterPage(ownerId, 'theme')).toBe(true)
  expect(selectCommandPreviewItems(store.getState()).map((item) => item.id)).toEqual(['system', 'light', 'dark'])
  expect(store.getState().requestCommand(ownerId, { actionId: 'open', targetId: 'project-aurora' })).toBeUndefined()
  expect(store.getState().backPage(ownerId)).toBe(true)
  expect(store.getState().pageId).toBe('root')
})

test('search query precedes typed filters and each selected entity keeps its own detail facts', () => {
  const { store, ownerId, project } = preview(3)
  store.getState().setScope(ownerId, 'person')
  store.getState().select(ownerId, 'marcus')
  const search = project().content.search!
  const html = renderToStaticMarkup(createElement(LumenSearchCommands, search))
  expect(html.indexOf('role="combobox"')).toBeLessThan(html.indexOf('role="tablist"'))
  expect(html).toContain('GMT−5')
  expect(html).toContain('Reliability')
  expect(html).not.toContain('Gate checklist')
  expect(html).not.toContain('Open result')
  expect(search.detail?.fields.map((field) => field.id)).toEqual(['team', 'timezone', 'reviews'])
})

test('invite review is a real summary without editable controls; Back retains the exact draft', () => {
  const { store, ownerId, project, fixture } = preview(4, 'localized')
  store.getState().setEmail(ownerId, 'exact@example.test')
  store.getState().setRole(ownerId, 'viewer')
  project().content.invite!.onReview()
  const html = renderToStaticMarkup(createElement(LumenInviteCommand, project().content.invite!))
  expect(html).toContain('Schritt 2 von 2')
  expect(html).toContain('exact@example.test')
  expect(html).toContain(fixture.invite.confirm)
  expect(html).not.toContain('type="email"')
  project().content.invite!.onBack()
  expect(store.getState().email).toBe('exact@example.test')
  expect(store.getState().roleId).toBe('viewer')
  expect(store.getState().step).toBe(1)
})

test('inline workflow arguments and archive warnings are Host-owned, with target-bound confirmation', () => {
  const { store, ownerId, project } = preview(4)
  store.getState().backPage(ownerId)
  store.getState().enterPage(ownerId, 'rerun')
  store.getState().setArgument(ownerId, 'rerun', 'ref', 'release/v2')
  project().content.invite!.inlineAction!.onSubmit()
  const runHtml = renderToStaticMarkup(createElement(LumenInviteCommand, project().content.invite!))
  expect(runHtml).toContain('Run Staged deploy on release/v2.')
  expect(runHtml).toContain('Start run')
  project().content.invite!.inlineAction!.onBack()
  expect(store.getState().argumentsByPage.rerun?.ref).toBe('release/v2')
  project().content.invite!.inlineAction!.onSubmit()
  const obsoleteConfirmation = project().content.invite!.inlineAction!
  store.getState().backPage(ownerId)
  expect(store.getState().step).toBe(1)
  store.getState().enterPage(ownerId, 'archive')
  obsoleteConfirmation.onSubmit()
  expect(store.getState().step).toBe(1)
  expect(store.getState().lastRequest).toBeUndefined()
  project().content.invite!.inlineAction!.onSubmit()
  const archiveHtml = renderToStaticMarkup(createElement(LumenInviteCommand, project().content.invite!))
  expect(archiveHtml).toContain('Members lose access until it is restored.')
  expect(archiveHtml).toContain('Archive project')
})

test('assistant suggestions leave fallback for matching commands, while room choice remains local', () => {
  const assistant = preview(5, 'localized')
  expect(assistant.project().content.assistant?.canAsk).toBe(true)
  assistant.store.getState().useSuggestion(assistant.ownerId, 'usage')
  const content = assistant.project().content.assistant!
  const html = renderToStaticMarkup(createElement(LumenAssistantCommands, content))
  expect(html).toContain('Nutzungsbericht exportieren')
  expect(html).not.toContain('Keine passenden Befehle')
  expect(content.canAsk).toBe(false)
  const rooms = preview(6)
  expect(rooms.store.getState().requestCommand(rooms.ownerId, { actionId: 'switch', targetId: 'aurora' })?.value).toBe(
    'aurora',
  )
  expect(rooms.store.getState().currentRoomId).toBe('aurora')
})

test('explicit virtual strategy renders a bounded initial window rather than all 10,000 rows', () => {
  const { project } = preview(1, 'overflow')
  const html = renderToStaticMarkup(createElement(LumenCommandList, project().list))
  const rendered = (html.match(/role="option"/g) ?? []).length
  expect(rendered).toBeGreaterThan(0)
  expect(rendered).toBeLessThan(40)
  expect(html).toContain('aria-setsize="10000"')
  expect(html).not.toContain('Command 9999')
})
