import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShellWorkflows, selectLumenAppShellItem, uniqueLumenAppShellItems, type LumenAppShellContent } from '@lumen/app-ui/catalog'
import {
  appShellPreviewRequestActions,
  createAppShellIntentPreviewStore,
} from '../apps/hbar-app-ui-preview/src/appShellIntentPreviewStore'
import { createAppShellPreviewCopy } from '../apps/hbar-app-ui-preview/src/appShellPreviewCopy'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { appShellDocumentsFixture } from './fixtures/hbar-app-ui-app-shell-documents-fixtures'
import { appShellChatFixture } from './fixtures/hbar-app-ui-app-shell-chat-fixtures'

const render = (variant: number, content: LumenAppShellContent) =>
  renderToStaticMarkup(
    createElement(LumenAppShellWorkflows, { variant, variantId: `hbar-app-ui-app-shell-${variant}`, content }),
  )

describe('owned App Shell preview boundaries', () => {
  test('records exact owned requests, not another owner, blank payload, duplicate or an unexposed action', () => {
    const store = createAppShellIntentPreviewStore({ ownerId: 'chat-owner', actions: appShellPreviewRequestActions(9) })
    expect(store.getState().request('another-owner', 'send', 'Draft')).toBe(false)
    expect(store.getState().request('chat-owner', 'create')).toBe(false)
    expect(store.getState().request('chat-owner', ' ', 'Draft')).toBe(false)
    expect(store.getState().request('chat-owner', 'send', ' ')).toBe(false)
    expect(store.getState().intent).toBeUndefined()
    expect(store.getState().request('chat-owner', 'send', '  Exact draft  ')).toBe(true)
    expect(store.getState().intent).toEqual({ actionId: 'send', value: '  Exact draft  ' })
    expect(store.getState().request('chat-owner', 'send', '  Exact draft  ')).toBe(false)
    expect(store.getState().request('chat-owner', 'share')).toBe(true)
    const blank = createAppShellIntentPreviewStore({ ownerId: ' ', actions: ['share'] })
    expect(blank.getState().request(' ', 'share')).toBe(false)
    expect(appShellPreviewRequestActions(0)).toEqual([])
    expect(appShellPreviewRequestActions(8)).not.toContain('send')
  })

  test('the optional German notice keeps the document reader and default DOM compatible', () => {
    const documents = appShellDocumentsFixture(null)
    const content = { ...HBAR_APP_UI_APP_SHELL_FIXTURES, documents }
    const legacy = render(6, content)
    expect(legacy).not.toContain('lumen-app-shell-preview')
    expect(legacy).not.toContain('role="status"')
    const notice = createAppShellPreviewCopy(true).requestNotice
    const owned = render(6, { ...content, presentation: { ownerId: 'documents-owner', notice } })
    expect(owned).toContain('class="lumen-app-shell-preview"')
    expect(owned).toContain('role="status"')
    expect(owned).toContain(notice)
    expect(owned).toContain('Webhook retry schedule')
    expect(owned).toContain('class="lumen-documents-reader" data-lumen-list-strategy="pane-scroll"')
    expect(documents.selectedId).toBe('webhook')
    expect(documents.statusState).toBe('saved')
  })

  test('request feedback does not append a chat message, clear the draft or replace host threads', () => {
    const chat = { ...appShellChatFixture('localized'), draft: 'Lokaler Entwurf' }
    const store = createAppShellIntentPreviewStore({ ownerId: 'chat-owner', actions: appShellPreviewRequestActions(9) })
    expect(store.getState().request('chat-owner', 'send', chat.draft)).toBe(true)
    const html = render(9, {
      ...HBAR_APP_UI_APP_SHELL_FIXTURES,
      chat,
      presentation: { ownerId: 'chat-owner', notice: createAppShellPreviewCopy(true).requestNotice },
    })
    expect(html).toContain('Lokaler Entwurf')
    expect(html).toContain('Wie kann ich helfen?')
    expect(html).not.toContain('lumen-shell-chat-message-user')
    expect(chat.draft).toBe('Lokaler Entwurf')
    expect(chat.selectedThreadId).toBeNull()
    expect(chat.threads).toHaveLength(6)
  })

  test('legacy public helpers retain first-wins semantics while excluding blank IDs and invalid fallback', () => {
    const items = [
      { id: ' ', label: 'Invalid' },
      { id: ' valid ', label: 'Exact first value' },
      { id: ' valid ', label: 'Duplicate' },
    ]
    expect(uniqueLumenAppShellItems(items)).toEqual([{ id: ' valid ', label: 'Exact first value' }])
    expect(selectLumenAppShellItem(items, 'missing')).toBe(items[1])
    expect(selectLumenAppShellItem([{ id: ' ', label: 'Invalid' }], ' ')).toBeUndefined()
  })
})
