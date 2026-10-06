import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarComposerSlashMenuContent,
  type HbarComposerSlashLabels,
} from '../packages/app-react/src/composer-slash-menu'

const labels: HbarComposerSlashLabels = {
  menu: '本地命令',
  commands: [
    { id: 'model', label: '/model', description: '选一个模型 — very long explanatory label '.repeat(8) },
    { id: 'settings', label: '/settings', description: '打开当前会话设置' },
  ],
  select: (name) => `补全 ${name}`,
  hint: '↑↓ 选择 · Enter/Tab 补全 · Esc 关闭',
  agentProfile: (profileId) => ({ label: `/agent ${profileId}`, description: '只读探索'.repeat(30) }),
  agentTaskHint: '<任务>',
  agentRequired: '填写 Agent 类型和任务',
  agentCatalogUnavailable: 'Agent 类型列表暂不可用',
  agentProfileUnavailable: (profileId) => `${profileId} 不可用`,
  agentNotice: {
    creating: '正在创建',
    unknown: '结果未知',
    retry: '重试',
    created: '已创建子 Agent',
    open: '打开子 Agent',
  },
  attachmentsBlocked: '先移除附件',
  modelBusy: '当前任务结束后才能更改模型',
  goalRequired: '请输入目标',
  goalBusy: '当前任务结束后再更改目标',
  goalSnapshotUnavailable: '正在读取目标',
  goalConfirmReplace: (objective) => `替换 ${objective}`,
  goalConfirmClear: (objective) => `清除 ${objective}`,
  goalConfirm: '确认',
  goalCancel: '取消',
  error: (code) => code,
}

function html(input: HbarComposerSlashLabels, selected = 0, term = '') {
  return renderToStaticMarkup(
    <HbarComposerSlashMenuContent
      id="slash"
      term={term}
      selected={selected}
      labels={input}
      onSelect={() => {}}
      onHover={() => {}}
    />,
  )
}

test('host-owned long localized command rows remain bounded and keep a valid selected option', () => {
  const rendered = html(labels, 20, 's')
  expect(rendered).toContain(labels.commands[1]!.description)
  expect(rendered).toContain(`aria-label="${labels.select(labels.commands[1]!.label)}"`)
  expect(rendered).toContain('aria-selected="true"')
  expect(rendered).not.toContain('补全 /model')
  expect(html({ ...labels, commands: [] })).toBe('')
  expect(html({ ...labels, commands: [labels.commands[0]!] })).toContain('补全 /model')
  const duplicate = html({ ...labels, commands: [labels.commands[0]!, labels.commands[0]!, labels.commands[1]!] })
  expect((duplicate.match(/role="option"/g) ?? []).length).toBe(2)
})

test('Host-supplied Agent type appears as a bounded, keyboard-addressable completion row', () => {
  const profile = labels.agentProfile('explore')
  const rendered = html(
    {
      ...labels,
      commands: [
        { id: 'agent', label: '/agent', argumentHint: '<类型> <任务>', description: '运行子 Agent' },
        {
          id: 'agent explore',
          label: profile.label,
          argumentHint: labels.agentTaskHint,
          description: profile.description,
        },
      ],
    },
    1,
    'ag',
  )
  expect(rendered).toContain('补全 /agent explore')
  expect(rendered).toContain(profile.description)
  expect(rendered).toContain('aria-selected="true"')
  expect((rendered.match(/role="option"/g) ?? []).length).toBe(2)
})
