import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentApproval04, type LumenAgentApprovalPermissionContent } from '@lumen/app-ui'
import {
  createPermissionPreviewStore,
  projectPermissionPreviewContent,
} from '../apps/hbar-app-ui-preview/src/permission-preview-model'
import {
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
  createHbarAppUiAgentApprovalLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-approval-fixtures'

function fixture(): LumenAgentApprovalPermissionContent {
  const permission = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.permission
  if (!permission) throw new Error('Permission fixture required')
  return permission
}

function render(permission: LumenAgentApprovalPermissionContent | undefined) {
  return renderToStaticMarkup(createElement(LumenAgentApproval04, { content: { permission } }))
}

describe('controlled permission approval', () => {
  test('renders semantic summary, persistent scopes and a collapsed payload', () => {
    const content = fixture()
    const markup = render(content)
    expect(markup).toContain(`aria-label="${content.requestTitle}"`)
    expect(markup).toContain('<h3')
    expect(markup.match(/type="checkbox"/g)).toHaveLength(3)
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('<pre')
    expect(markup).not.toContain('role="status"')
  })

  test('all selection subsets share the same count and zero-selection guard', () => {
    const content = fixture()
    for (let mask = 0; mask < 8; mask += 1) {
      const store = createPermissionPreviewStore(content)
      content.scopes.forEach((scope, index) =>
        store.getState().changeScope(content.requestId, scope.id, Boolean(mask & (1 << index))),
      )
      const selected = content.scopes.filter((_, index) => mask & (1 << index)).length
      const before = projectPermissionPreviewContent(store.getState())
      expect(before?.scopes.filter((scope) => scope.checked)).toHaveLength(selected)
      expect(before?.requestText).toBe(content.requestText)
      store.getState().decide(content.requestId, 'approved')
      expect(store.getState().decision).toBe(selected === 0 ? undefined : 'approved')
      if (selected === 0) {
        expect(render(projectPermissionPreviewContent(store.getState()))).toMatch(/disabled=""[^>]*>.*?Approve/s)
        store.getState().changeScope(content.requestId, content.scopes[0]!.id, true)
        store.getState().decide(content.requestId, 'approved')
      }
      const after = render(projectPermissionPreviewContent(store.getState()))
      expect(after).toContain(content.outcomes.approved.summary(selected || 1, 3))
      expect(after).toContain(content.outcomes.approved.announcement(selected || 1))
      expect(after.match(/disabled=""/g)).toHaveLength(3)
      expect(after).not.toContain('<button')
      const locked = store.getState()
      store.getState().changeScope(content.requestId, content.scopes[0]!.id, false)
      store.getState().decide(content.requestId, 'rejected')
      expect(store.getState()).toBe(locked)
    }
  })

  test('rejects stale targets, busy decisions and missing scope callbacks', () => {
    const content = fixture()
    const store = createPermissionPreviewStore({ ...content, busy: true })
    store.getState().decide(content.requestId, 'approved')
    store.getState().changeScope(content.requestId, content.scopes[0]!.id, false)
    expect(store.getState().decision).toBeUndefined()
    expect(store.getState().selections.size).toBe(0)
    store.getState().replace(content)
    const initial = store.getState()
    initial.changeScope('old-request', content.scopes[0]!.id, false)
    initial.changeScope(content.requestId, 'removed-scope', false)
    initial.decide('old-request', 'approved')
    expect(store.getState()).toBe(initial)
    initial.decide(content.requestId, 'rejected')
    const rejected = render(projectPermissionPreviewContent(store.getState()))
    expect(rejected).toContain(content.outcomes.rejected.status)
    expect(rejected).toContain(content.outcomes.rejected.summary(3, 3))
    expect(rejected).not.toContain('<button')
  })

  test('retains original scope IDs across reordering and reconciles removed/duplicate IDs', () => {
    const content = fixture()
    const store = createPermissionPreviewStore(content)
    const original = content.scopes[0]!
    store.getState().replace({ ...content, scopes: [...content.scopes].reverse() })
    store.getState().changeScope(content.requestId, original.id, false)
    expect(
      projectPermissionPreviewContent(store.getState())?.scopes.find((scope) => scope.id === original.id)?.checked,
    ).toBe(false)
    store.getState().replace({ ...content, scopes: [original, { ...original, title: 'Duplicate must not render' }] })
    expect(projectPermissionPreviewContent(store.getState())?.scopes).toHaveLength(1)
    expect(render(projectPermissionPreviewContent(store.getState()))).not.toContain('Duplicate must not render')
    store.getState().replace({ ...content, scopes: [] })
    expect(store.getState().selections.size).toBe(0)
    store.getState().replace({ ...content, requestId: 'new-request' })
    expect(store.getState().decision).toBeUndefined()
    expect(projectPermissionPreviewContent(store.getState())?.scopes.every((scope) => scope.checked)).toBe(true)
  })

  test('host list capacity grows through zero, one, bound and over-bound without slicing', () => {
    const content = fixture()
    for (const count of [0, 1, 3, 4]) {
      const scopes = Array.from({ length: count }, (_, index) => ({ ...content.scopes[0]!, id: `scope-${index}` }))
      const markup = render({ ...content, scopes })
      expect(markup.match(/type="checkbox"/g) ?? []).toHaveLength(count)
      expect(markup).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    }
  })

  test('locale replacement derives current outcome text without resetting the decision', () => {
    const content = fixture()
    const store = createPermissionPreviewStore(content)
    store.getState().decide(content.requestId, 'approved')
    const localized = createHbarAppUiAgentApprovalLocalizedFixtures().permission
    if (!localized) throw new Error('Localized permission fixture required')
    store.getState().replace(localized)
    const markup = render(projectPermissionPreviewContent(store.getState()))
    expect(markup).toContain(localized.outcomes.approved.summary(3, 3))
    expect(markup).not.toContain('Access granted')
    expect(markup).toContain(localized.scopes[0]!.title)
  })

  test('host timer advances independently, clamps at zero and stops at a decision', () => {
    const content = fixture()
    const store = createPermissionPreviewStore(content, 61)
    const start = store.getState().deadline - 61000
    store.getState().tick(start + 1000)
    expect(projectPermissionPreviewContent(store.getState())?.expiry).toBe('01:00')
    store.getState().tick(start + 2000)
    expect(projectPermissionPreviewContent(store.getState())?.expiry).toBe('00:59')
    store.getState().tick(start + 90000)
    expect(projectPermissionPreviewContent(store.getState())?.expiry).toBe('00:00')
    store.getState().decide(content.requestId, 'rejected')
    const stopped = store.getState()
    store.getState().tick(start + 100000)
    expect(store.getState()).toBe(stopped)
    expect(createPermissionPreviewStore(content, Number.NaN).getState().remainingSeconds).toBe(0)
  })
})
