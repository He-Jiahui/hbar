import { expect, test } from 'bun:test'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/catalog-metadata'
import { createPreviewWorkspaceStore } from '../apps/hbar-app-ui-preview/src/preview-workspace-store'

const entries = HBAR_APP_UI_VARIANT_SPECS.map((spec) => ({ spec, component: () => null }))
test('unknown preview IDs recover to a real entry and empty registrations fail explicitly', () => {
  const store = createPreviewWorkspaceStore(entries, new URLSearchParams('variant=missing&theme=light'))
  expect(store.getState()).toMatchObject({ selectedId: entries[0]?.spec.id, theme: 'light', viewport: 'desktop' })
  expect(() => createPreviewWorkspaceStore([], new URLSearchParams())).toThrow('registered component')
})
test('selection keeps original target identity and ignores late events from a former preview', () => {
  const first = entries[0]
  const second = entries[1]
  if (!first || !second) throw new Error('Missing preview fixtures')
  const store = createPreviewWorkspaceStore(entries, new URLSearchParams())
  const originalCallback = store.getState().recordAction
  originalCallback({ variantId: first.spec.id, actionId: 'send', value: 'original draft' })
  expect(store.getState().eventLog).toHaveLength(1)
  store.getState().chooseEntry(second)
  originalCallback({ variantId: first.spec.id, actionId: 'complete', value: 'late original response' })
  expect(store.getState().selectedId).toBe(second.spec.id)
  expect(store.getState().eventLog).toHaveLength(0)
  store.getState().recordAction({ variantId: second.spec.id, actionId: 'send', value: 'new draft' })
  expect(store.getState().eventLog[0]?.value).toBe('new draft')
})
test('inspection history stays bounded and reset restores all workspace controls', () => {
  const store = createPreviewWorkspaceStore(entries, new URLSearchParams())
  for (let index = 0; index < 20; index += 1) {
    store.getState().recordAction({ variantId: store.getState().selectedId, actionId: 'inspect', value: String(index) })
  }
  expect(store.getState().eventLog).toHaveLength(12)
  expect(store.getState().eventLog[0]?.value).toBe('19')
  expect(store.getState().eventLog.at(-1)?.value).toBe('8')
  store.getState().setQuery('Prompt Input')
  store.getState().chooseCategory('prompt-input')
  expect(store.getState().selectedId).toBe('hbar-app-ui-prompt-input-1')
  store.getState().toggleTheme()
  store.getState().setViewport('mobile')
  store.getState().reset()
  expect(store.getState()).toMatchObject({
    selectedId: entries[0]?.spec.id,
    query: '',
    theme: 'dark',
    viewport: 'desktop',
    eventLog: [],
  })
})
test('separate preview workspaces do not share filters or interaction state', () => {
  const first = createPreviewWorkspaceStore(entries, new URLSearchParams('variant=hbar-app-ui-forms-12'))
  const second = createPreviewWorkspaceStore(entries, new URLSearchParams())
  first.getState().setQuery('forms')
  first.getState().recordAction({ variantId: first.getState().selectedId, actionId: 'save' })
  expect(second.getState().query).toBe('')
  expect(second.getState().eventLog).toHaveLength(0)
  expect(second.getState().selectedId).not.toBe(first.getState().selectedId)
})
