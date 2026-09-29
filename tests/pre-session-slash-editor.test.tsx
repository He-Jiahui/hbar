import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarPreSessionSlashEditor,
  localSlashCommand,
  type HbarComposerSlashLabels,
  type LocalSlashCommand,
} from '@hbar/app-react'
import { isSameSlashTrigger } from '../packages/app-react/src/pre-session-slash-editor'

const labels: HbarComposerSlashLabels = {
  menu: '本地命令',
  commands: [
    { id: 'model', label: '/model', description: '选择要用于新会话的模型' },
    { id: 'settings', label: '/settings', description: '打开工作区设置并核对长文案是否安全换行' },
    { id: 'goal', label: '/goal', description: '运行时目标命令不得出现在新会话本地菜单' },
  ],
  select: (name) => `补全 ${name}`,
  hint: '↑↓ 选择 · Enter/Tab 补全 · Esc 关闭',
  agentProfile: (profileId) => ({ label: `/agent ${profileId}`, description: '只读探索' }),
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
  error: (code) => `失败：${code}`,
}

function editor(value: string, slashOpenRequest = 0) {
  return renderToStaticMarkup(
    <HbarPreSessionSlashEditor
      value={value}
      inputLabel="新会话消息"
      placeholder="描述要完成的工作"
      disabled={false}
      sendBehavior="enter"
      labels={labels}
      slashOpenRequest={slashOpenRequest}
      onChange={() => undefined}
      onSubmit={() => undefined}
      onLocalCommand={() => undefined}
    />,
  )
}

test('pre-session slash editor uses the native labelled textarea and host placeholder', () => {
  const html = editor('保留这段草稿内容')
  expect(html).toContain('<textarea')
  expect(html).toContain('aria-label="新会话消息"')
  expect(html).toContain('placeholder="描述要完成的工作"')
  expect(html).toContain('保留这段草稿内容')
  expect(html).toContain('hbar-pre-session-slash-editor-input')
  expect(html).not.toContain('role="listbox"')
})

test('a slash token opens a menu containing only the Host-allowed local commands', () => {
  const html = editor('/')
  expect(html).toContain('aria-autocomplete="list"')
  expect(html).toContain('aria-expanded="true"')
  expect(html).toContain('role="listbox"')
  expect(html).toContain(labels.commands[0]!.description)
  expect(html).toContain(labels.commands[1]!.description)
  expect(html).not.toContain(labels.commands[2]!.description)
  expect(html).toContain(labels.hint)
})

test('the Host submit helper recognizes only exact local model/settings commands from its allowlist', () => {
  const available: LocalSlashCommand[] = ['model', 'settings']
  expect(localSlashCommand('/model', available)).toBe('model')
  expect(localSlashCommand('/settings', available)).toBe('settings')
  expect(localSlashCommand('/model extra', available)).toBeNull()
  expect(localSlashCommand('/goal ship a feature', available)).toBeNull()
})

test('slash dismissal matches only the unchanged trigger so editing can reopen suggestions', () => {
  const dismissed = { from: 0, to: 1, term: '' }
  expect(isSameSlashTrigger({ from: 0, to: 1, term: '' }, dismissed)).toBe(true)
  expect(isSameSlashTrigger({ from: 0, to: 2, term: 'm' }, dismissed)).toBe(false)
  expect(isSameSlashTrigger(null, dismissed)).toBe(false)
})
