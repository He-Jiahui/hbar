import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Folder } from 'lucide-react'
import { HbarPreSessionChoicePicker, PRE_SESSION_CHOICE_PAGE_SIZE, visiblePreSessionChoices } from '@hbar/app-react'

const labels = {
  title: '选择项目名称很长时仍能换行',
  trigger: (selected: string | null) => `选择项目：${selected ?? '无'}`,
  search: '搜索项目',
  empty: '没有项目',
  noMatches: '没有匹配项',
  more: (remaining: number | null) => `更多 ${remaining ?? '远端'}`,
  close: '关闭',
  error: (code: string) => `失败：${code}`,
}

test('choice windows stay bounded at 0, 1, 60, 61, 100 and 101 items', () => {
  for (const count of [0, 1, 60, 61, 100, 101]) {
    const items = Array.from({ length: count }, (_, index) => ({
      id: `item-${index}`,
      label: `Project ${index}`,
      detail: `D:/projects/${index}`,
    }))
    const first = visiblePreSessionChoices(items, '', PRE_SESSION_CHOICE_PAGE_SIZE)
    expect(first.rows).toHaveLength(Math.min(count, PRE_SESSION_CHOICE_PAGE_SIZE))
    expect(first.remaining).toBe(Math.max(0, count - PRE_SESSION_CHOICE_PAGE_SIZE))
    const next = visiblePreSessionChoices(items, '', PRE_SESSION_CHOICE_PAGE_SIZE * 2)
    expect(next.rows).toHaveLength(count)
    expect(next.remaining).toBe(0)
  }
})

test('duplicate IDs keep the first source row and search does not invent a stale selection', () => {
  const items = [
    { id: 'one', label: 'Original project', detail: 'D:/original' },
    { id: 'one', label: 'Replacement project', detail: 'D:/replacement' },
    { id: 'two', label: '另一个很长的项目名称', detail: 'D:/another' },
  ]
  expect(visiblePreSessionChoices(items, '', 60).rows.map((item) => item.label)).toEqual([
    'Original project',
    '另一个很长的项目名称',
  ])
  expect(visiblePreSessionChoices(items, 'replacement', 60).rows).toEqual([])
  expect(visiblePreSessionChoices(items, 'another', 60).rows.map((item) => item.id)).toEqual(['two'])
  const html = renderToStaticMarkup(
    <HbarPreSessionChoicePicker
      icon={Folder}
      labels={labels}
      items={items}
      selectedId="missing"
      onChoose={() => undefined}
    />,
  )
  expect(html).toContain(labels.trigger(null))
  expect(html).not.toContain('Replacement project')
})

test('composer placement keeps the same Host choices in a trigger-owned popup', () => {
  const html = renderToStaticMarkup(
    <HbarPreSessionChoicePicker
      icon={Folder}
      placement="composer"
      labels={labels}
      items={[{ id: 'model', label: 'Provider · Model', detail: 'Reasoning' }]}
      selectedId="model"
      onChoose={() => undefined}
    />,
  )
  expect(html).toContain('data-placement="composer"')
  expect(html).toContain('popover="auto"')
  expect(html).toContain('role="dialog"')
  expect(html).toContain(labels.trigger('Provider · Model'))
  expect(html).toContain('data-tier="sm"')
})

test('open requests preserve the closed initial render for both picker placements', () => {
  const props = {
    icon: Folder,
    labels,
    items: [{ id: 'model', label: 'Provider · Model', detail: 'Reasoning' }],
    selectedId: 'model',
    openRequest: 1,
    onChoose: () => undefined,
  }
  const dialog = renderToStaticMarkup(<HbarPreSessionChoicePicker {...props} />)
  const composer = renderToStaticMarkup(<HbarPreSessionChoicePicker {...props} placement="composer" />)

  // Requests are transitions observed after mount, not render-time UI state.
  expect(dialog).toContain('aria-expanded="false"')
  expect(dialog).not.toContain('data-open="true"')
  expect(composer).toContain('aria-expanded="false"')
  expect(composer).toContain('popover="auto"')
})
