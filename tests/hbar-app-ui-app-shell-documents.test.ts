import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShell06, type LumenAppShellDocumentsContent } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { appShellDocumentsFixture } from './fixtures/hbar-app-ui-app-shell-documents-fixtures'
import {
  createAppShellDocumentsPreviewStore,
  projectAppShellDocumentsPreview,
} from '../apps/hbar-app-ui-preview/src/app-shell-documents-preview-model'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (documents: LumenAppShellDocumentsContent) =>
  renderToStaticMarkup(createElement(LumenAppShell06, { content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, documents } }))
const setup = (mode: string | null = null) => {
  const fixture = appShellDocumentsFixture(mode),
    store = createAppShellDocumentsPreviewStore()
  return { fixture, store, view: () => projectAppShellDocumentsPreview(store.getState(), fixture) }
}
test('document shell renders a grouped tree, native title field, semantic article and independent formats', () => {
  const { view } = setup(),
    html = render(view())
  expect(html).toContain('role="banner"')
  expect(html).toContain('role="tree"')
  expect(html.match(/role="treeitem"/g)).toHaveLength(19)
  expect(html.match(/aria-pressed=/g)).toHaveLength(6)
  expect(html).toContain('<article>')
  expect(html).toContain('max_attempts: 21')
  expect(html).not.toContain('<textarea')
  expect(html).toContain('data-lumen-list-strategy="pane-scroll"')
})
test('selection changes metadata and title editing synchronizes all host projections without changing body', () => {
  const { view } = setup()
  view().onSelect('versioning')
  expect(view().selectedId).toBe('versioning')
  expect(render(view())).toContain('1,340 words')
  expect(render(view())).toContain('9 March 2025 by Tobias Lindqvist')
  view().onTitle('versioning', 'Reviewed document title')
  expect(render(view()).match(/Reviewed document title/g)).toHaveLength(3)
  view().onSelect('webhook')
  expect(render(view())).toContain('value="Webhook retry schedule"')
  view().onSelect('versioning')
  expect(render(view())).toContain('value="Reviewed document title"')
  expect(render(view())).toContain('Every webhook Halden sends')
})
test('formats are independent and persist across selected documents, without mutating document paragraphs', () => {
  const { view } = setup()
  view().onFormat('italic')
  view().onFormat('quote')
  view().onFormat('bold')
  expect(view().formats).toEqual(['italic', 'quote'])
  view().onSelect('versioning')
  expect(view().formats).toEqual(['italic', 'quote'])
  expect(render(view())).toContain('<p>Every webhook')
})
test('empty, single, normal, bounded and over-capacity inventories retain all unique documents', () => {
  const { fixture, store } = setup(),
    folder = fixture.folders[2],
    seed = folder?.documents[0]
  if (!seed || !folder) throw new Error('Fixture absent')
  for (const count of [0, 1, 19, 100, 101]) {
    const value = projectAppShellDocumentsPreview(store.getState(), {
      ...fixture,
      folders: count
        ? [{ ...folder, documents: Array.from({ length: count }, (_, i) => ({ ...seed, id: `record-${i}` })) }]
        : [],
    })
    expect(value.folders.flatMap((item) => item.documents)).toHaveLength(count)
    expect(value.selectedId).toBeNull()
    expect(render(value)).toContain('Select a document')
    expect(render(value).match(/class="[^"]*lumen-documents-file/g) ?? []).toHaveLength(count)
  }
  expect(setup('overflow').view().folders[0]?.documents).toHaveLength(101)
  expect(render(setup('empty').view())).toContain('No documents')
})
test('duplicate IDs update in original order; stale selection is empty and retained callbacks use original IDs', () => {
  const events: string[] = [],
    fixture = appShellDocumentsFixture(null, (action, id) => events.push(`${action}:${id}`)),
    store = createAppShellDocumentsPreviewStore()
  const folder = fixture.folders[2],
    seed = folder?.documents[0]
  if (!seed || !folder) throw new Error('Fixture absent')
  const value = projectAppShellDocumentsPreview(store.getState(), {
    ...fixture,
    folders: [{ ...folder, documents: [...folder.documents, { ...seed, title: 'Updated webhook' }] }],
  })
  expect(value.folders[0]?.documents).toHaveLength(9)
  expect(value.folders[0]?.documents[0]?.title).toBe('Updated webhook')
  const original = () => value.onTitle(seed.id, 'Original document changed')
  value.onSelect('versioning')
  original()
  expect(events.at(-1)).toBe('title:webhook')
  expect(store.getState().selectedId).toBe('versioning')
  expect(store.getState().titles.webhook).toBe('Original document changed')
  value.onSelect('missing')
  value.onTitle('missing', 'invalid')
  expect(store.getState().titles.missing).toBeUndefined()
  store.setState({ selectedId: 'missing' })
  expect(projectAppShellDocumentsPreview(store.getState(), fixture).selectedId).toBeNull()
})
test('localized long content and save-status lifecycle stay owned by the host', () => {
  const a = setup('localized'),
    b = setup()
  a.view().onTitle('webhook', 'Ausführliche Dokumentation')
  expect(b.view().folders[2]?.documents[0]?.title).toBe('Webhook retry schedule')
  const html = render(a.view())
  expect(html).toContain('Weitere Formatierungen')
  expect(html).not.toContain('aria-label="Document title"')
  for (const [statusState, status] of [
    ['pending', 'Wird gespeichert'],
    ['failed', 'Speichern fehlgeschlagen'],
    ['saved', 'Gespeichert'],
  ] as const) {
    const value = render({ ...a.view(), statusState, status })
    expect(value).toContain(status)
    expect(value).toContain(`data-state="${statusState}"`)
    expect(value).toContain('Ausführliche Dokumentation')
  }
})
test('sampling distinguishes narrow menu callbacks from desktop toggles without exhaustive gesture multiplication', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-shell-6')
  expect(plan?.samples).toHaveLength(16)
  expect(plan?.samples.some((item) => item.suffix.includes('tree-arrowdown'))).toBe(true)
  expect(plan?.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})
