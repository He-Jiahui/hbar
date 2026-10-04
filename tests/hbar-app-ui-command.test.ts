import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarAppUiCommandList, type HbarAppUiCommandListProps } from '../packages/hbar-app-ui/src/command-menu'
import { COMMAND_LABELS, GROUPED_COMMANDS } from './fixtures/hbar-app-ui-command-fixtures'
import { getCommandCopy } from './fixtures/hbar-app-ui-command-locale'
const content: HbarAppUiCommandListProps = {
  labels: COMMAND_LABELS,
  items: [],
  query: '',
  selectedId: undefined,
  selectionLost: false,
  listStrategy: 'content-grown',
  error: undefined,
  onQueryChange() {},
  onSelect() {},
  onMove() {},
  onExecute() {},
}
test('command data handles empty, duplicate, invalid selection and localized copy without embedded fixtures', () => {
  const empty = renderToStaticMarkup(createElement(HbarAppUiCommandList, content))
  expect(empty).toContain(COMMAND_LABELS.empty)
  const items = [
    GROUPED_COMMANDS[0]!,
    { ...GROUPED_COMMANDS[0]!, label: '宿主更新后的命令名称'.repeat(6) },
    ...GROUPED_COMMANDS.slice(1),
  ]
  const html = renderToStaticMarkup(
    createElement(HbarAppUiCommandList, {
      ...content,
      labels: getCommandCopy('zh-CN'),
      items,
      selectedId: 'deleted',
      selectionLost: true,
    }),
  )
  expect(html.match(/role="option"/g)).toHaveLength(GROUPED_COMMANDS.length)
  expect(html).toContain('宿主更新后的命令名称')
  expect(html).not.toContain('aria-selected="true"')
  expect(html).toContain('原先选中的命令已不可用')
  expect(html).not.toContain('Launch readiness review')
})
