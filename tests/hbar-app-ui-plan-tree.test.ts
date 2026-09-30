import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAgentPlan03, type LumenAgentPlanTreeContent } from '@lumen/app-ui'
import {
  createPlanTreePreviewStore,
  projectPlanTreePreviewContent,
} from '../apps/hbar-app-ui-preview/src/plan-tree-preview-model'
import {
  HBAR_APP_UI_AGENT_PLAN_FIXTURES,
  createHbarAppUiAgentPlanLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-plan-fixtures'

function fixture(): LumenAgentPlanTreeContent {
  const tree = HBAR_APP_UI_AGENT_PLAN_FIXTURES.tree
  if (!tree) throw new Error('Tree fixture required')
  return tree
}
function render(content: LumenAgentPlanTreeContent): string {
  return renderToStaticMarkup(createElement(LumenAgentPlan03, { content: { tree: content } }))
}

describe('reference plan tree', () => {
  test('renders an independently scrolling nested list, real counts and native disclosure names', () => {
    const content = fixture()
    expect(content.groups.flatMap((group) => group.items)).toHaveLength(13)
    const markup = render(content)
    expect(markup).toContain('5 of 13 done')
    expect(markup).toContain('role="banner"')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(2)
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(2)
    expect(markup).not.toContain('aria-label="Collapse')
    expect(markup).not.toContain('<main')
    expect(markup).not.toContain('<ol')
    const expanded = render({ ...content, groups: content.groups.map((group) => ({ ...group, openByDefault: true })) })
    for (const title of [
      'Update the changelog',
      'Tag the release',
      'Publish the registry payloads',
      'Run the smoke tests',
      'Check the billing dashboard',
      'Compare the entitlement counts',
    ])
      expect(expanded).toContain(title)
  })

  test('retry projects only the failed step to running without changing summary facts', () => {
    const content = fixture()
    const store = createPlanTreePreviewStore(content)
    store.getState().retry(content.runId, 'apply', 'verify-counts')
    const projected = projectPlanTreePreviewContent(store.getState())
    expect(projected?.groups[1]?.items[2]?.state).toBe('running')
    expect(projected?.groups[1]?.items[2]?.stateLabel).toBe('Running')
    expect(projected?.groups[1]?.items[3]?.state).toBe('queued')
    expect(projected?.groups[1]?.done).toBe(2)
    expect(projected && render(projected)).not.toContain('lumen-plan-tree-retry')
    expect(projected && render(projected)).toContain('5 of 13 done')
    expect(content.groups[1]?.items[2]?.state).toBe('failed')
    const changed = store.getState()
    store.getState().retry(content.runId, 'apply', 'verify-counts')
    expect(store.getState()).toBe(changed)
  })

  test('guards run, group, step, nonfailed and busy targets and isolates controller instances', () => {
    const content = fixture()
    const store = createPlanTreePreviewStore(content)
    const original = store.getState()
    for (const [runId, groupId, stepId] of [
      ['stale-run', 'apply', 'verify-counts'],
      [content.runId, 'stale-group', 'verify-counts'],
      [content.runId, 'apply', 'stale-step'],
      [content.runId, 'prepare', 'load-source'],
    ] as const)
      store.getState().retry(runId, groupId, stepId)
    expect(store.getState()).toBe(original)
    const busy = createPlanTreePreviewStore({ ...content, busy: true })
    busy.getState().retry(content.runId, 'apply', 'verify-counts')
    expect(busy.getState().retried).toEqual([])
    const other = createPlanTreePreviewStore(content)
    store.getState().retry(content.runId, 'apply', 'verify-counts')
    expect(other.getState().retried).toEqual([])
    store.getState().replace(undefined)
    original.retry(content.runId, 'apply', 'verify-counts')
    expect(projectPlanTreePreviewContent(store.getState())).toBeUndefined()
  })

  test('keeps group and step identity after reordering and deduplicates the visible target', () => {
    const content = fixture()
    const apply = content.groups.find((group) => group.id === 'apply')
    if (!apply) throw new Error('Apply group required')
    const store = createPlanTreePreviewStore(content)
    const callback = projectPlanTreePreviewContent(store.getState())?.onRetry
    const groups = [...content.groups].reverse().map((group) => ({ ...group, items: [...group.items].reverse() }))
    store.getState().replace({ ...content, groups })
    callback?.(content.runId, 'apply', 'verify-counts')
    expect(
      projectPlanTreePreviewContent(store.getState())
        ?.groups.find((group) => group.id === 'apply')
        ?.items.find((item) => item.id === 'verify-counts')?.state,
    ).toBe('running')
    const step = apply.items[2]
    if (!step) throw new Error('Failed step required')
    const duplicated = render({ ...content, groups: [{ ...apply, items: [step, step] }, apply] })
    expect(duplicated.match(/data-group-id="apply"/g)).toHaveLength(1)
    expect(duplicated.match(/data-step-id="verify-counts"/g)).toHaveLength(1)
    store.getState().replace({ ...content, runId: 'new-run' })
    callback?.(content.runId, 'apply', 'verify-counts')
    expect(store.getState().retried).toEqual([])
  })

  test('host facts can fail again and recover, while locale-only updates preserve retry state', () => {
    const content = fixture()
    const localized = createHbarAppUiAgentPlanLocalizedFixtures().tree
    if (!localized) throw new Error('Localized tree required')
    const store = createPlanTreePreviewStore(content)
    store.getState().retry(content.runId, 'apply', 'verify-counts')
    store.getState().replace(localized)
    let projected = projectPlanTreePreviewContent(store.getState())
    expect(projected && render(projected)).toContain('Wird ausgeführt')
    expect(projected && render(projected)).not.toContain('Running')
    store.getState().replace({ ...localized, groups: [...localized.groups] })
    projected = projectPlanTreePreviewContent(store.getState())
    expect(projected && render(projected)).toContain('Erneut versuchen')
    store.getState().retry(content.runId, 'apply', 'verify-counts')
    expect(projectPlanTreePreviewContent(store.getState())?.groups[1]?.items[2]?.state).toBe('running')
  })
  test('rejects blank run/group/step targets and clears local retry on host busy refresh', () => {
    const content = fixture()
    const store = createPlanTreePreviewStore(content)
    const original = store.getState()
    store.getState().retry(' ', 'apply', 'verify-counts')
    store.getState().retry(content.runId, ' ', 'verify-counts')
    store.getState().retry(content.runId, 'apply', ' ')
    expect(store.getState()).toBe(original)

    store.getState().retry(content.runId, 'apply', 'verify-counts')
    expect(store.getState().retried).toHaveLength(1)
    store.getState().replace({ ...content, busy: true })
    expect(store.getState().retried).toEqual([])
    store.getState().retry(content.runId, 'apply', 'verify-counts')
    expect(store.getState().retried).toEqual([])
  })

  test('retains empty, one, normal, boundary and over-bound host collections', () => {
    const content = fixture()
    expect(render({ ...content, groups: [] })).toContain('No plan groups')
    const group = content.groups[0]
    if (!group) throw new Error('Group required')
    for (const count of [1, 4, content.listStrategy.expectedMaximum, content.listStrategy.expectedMaximum + 1]) {
      const groups = Array.from({ length: count }, (_, index) => ({ ...group, id: `group-${index}` }))
      expect(render({ ...content, groups }).match(/data-group-id=/g)).toHaveLength(count)
    }
    const busy = render({ ...content, busy: true })
    const retry = busy.match(/<button[^>]*class="[^"]*lumen-plan-tree-retry[^"]*"[^>]*>/)?.[0]
    expect(retry).toContain('disabled=""')
    expect(retry).toContain('data-lumen-variant="text"')
    expect(retry).toContain('data-lumen-indicator="lamp"')
  })
})
