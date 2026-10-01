import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiComposer, HbarAppUiDataTable } from '../packages/hbar-app-ui/src/primitives'

test('compatibility composer receives all visible copy and count grammar from its host', () => {
  const labels = {
    input: '输入给当前工作区的完整说明',
    placeholder: '由当前语言包提供的长中文提示',
    send: '发送当前草稿',
    characterCount: (count: number) => `当前草稿共 ${count} 个字符`,
  }
  const markup = renderToStaticMarkup(<HbarAppUiComposer labels={labels} />)
  expect(markup).toContain(labels.input)
  expect(markup).toContain(labels.placeholder)
  expect(markup).toContain(labels.send)
  expect(markup).toContain(labels.characterCount(0))
  expect(markup).not.toContain('Write a message')
  expect(markup).toContain('data-lumen-variant="contained"')
})

test('compatibility table leaves localized status semantics and headings with its host', () => {
  const labels = {
    name: '工作区名称及完整路径',
    status: '当前运行状态',
    value: '当前使用量',
    details: '宿主提供的完整说明',
  }
  for (const count of [0, 1, 12]) {
    const rows = Array.from({ length: count }, (_, index) => ({
      id: `row-${index}`,
      name: `工作区 ${index}`,
      status: '已就绪',
      value: `${index}`,
      detail: '可继续执行',
    }))
    const markup = renderToStaticMarkup(
      <HbarAppUiDataTable rows={rows} labels={labels} statusTone={() => 'positive'} onSelect={() => {}} />,
    )
    for (const label of Object.values(labels)) expect(markup).toContain(label)
    expect(markup.match(/class="hbar-app-ui-status hbar-app-ui-status-positive"/g) ?? []).toHaveLength(count)
    expect(markup).not.toContain('Healthy')
  }
})
