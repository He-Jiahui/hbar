import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Folder } from 'lucide-react'
import { HbarPreSessionChoicePicker, PRE_SESSION_CHOICE_PAGE_SIZE, visiblePreSessionChoices } from '@hbar/app-react'

const labels = {
  title: '选择项目名称很长时仍能换行',
  trigger: (selected: string | null) => `选择项目：${selected ?? '无'}`,
  search: '搜索项目',
  clearSearch: '清除项目搜索',
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

test('model triggers can be text-only while their Host provider groups, details and identities remain in the menu', () => {
  const modelName = '一个很长的推理模型名称——保持输入区前后连续'
  const html = renderToStaticMarkup(
    <HbarPreSessionChoicePicker
      placement="composer"
      labels={labels}
      items={[
        { id: 'a/model', label: modelName, detail: '支持图像与推理', group: { id: 'a', label: '提供商甲' } },
        { id: 'b/model', label: modelName, detail: '另一个服务端配置', group: { id: 'b', label: '提供商乙' } },
      ]}
      selectedId="b/model"
      onChoose={() => undefined}
    />,
  )
  const trigger = html.slice(html.indexOf('<button'), html.indexOf('</button>'))
  expect(trigger).toContain(modelName)
  expect(trigger).toContain(labels.trigger(modelName))
  expect(trigger).toContain(`title="${modelName}"`)
  expect(trigger.match(/<svg/g)).toHaveLength(1)
  expect(trigger).toContain('lucide-chevron-down')
  expect(trigger).not.toContain('提供商甲')
  expect(trigger).not.toContain('提供商乙')
  expect(html).toContain('aria-label="提供商甲"')
  expect(html).toContain('aria-label="提供商乙"')
  expect(html).toContain('支持图像与推理')
  expect(html).toContain('另一个服务端配置')
  expect(html).toContain('aria-current="true"')
  expect(html.indexOf('aria-label="提供商乙"')).toBeLessThan(html.indexOf('aria-current="true"'))
})
