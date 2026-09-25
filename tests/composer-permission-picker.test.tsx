import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarComposerPermissionPicker,
  type HbarComposerPermissionLabels,
  type HbarComposerPermissionPickerProps,
} from '../packages/app-react/src/composer-permission-picker'

const labels: HbarComposerPermissionLabels = {
  title: '下一次发送的工具审批',
  trigger: (choice) => `工具审批：${choice}`,
  close: '关闭权限选择',
  loading: '正在读取服务端默认值',
  retry: '重新读取默认值',
  pending: '正在准备这次发送的权限',
  unknown: '提交结果尚未确认，保留这次发送的原审批策略',
  scopeHint: '仅下一次发送；不会更改服务端默认值',
  inheritedSnapshotHint: (mode) => `发送时读取服务端默认值并保留用于该次运行；最近读取：${mode ?? '尚未读取'}`,
  options: {
    inherit: {
      label: '继承服务端默认',
      description: '发送时读取并固定这次运行的默认审批策略，不会跟随后续默认值改变。',
    },
    ask: { label: '按需询问', description: '对策略要求审批的工具询问；其他允许或拒绝规则继续生效。' },
    deny: { label: '拒绝需审批工具', description: '拒绝需要审批的工具，不影响策略直接允许的工具。' },
    allow: { label: '自动批准需审批工具', description: '无需逐次确认；服务端拒绝规则仍生效。' },
  },
  confirmTitle: '确认本次发送自动批准',
  confirmBody: (session) => `仅会话“${session}”的下一次发送；需要审批的写入或命令将自动批准。服务端拒绝规则仍生效。`,
  confirmAllow: '仅本次自动批准',
  cancel: '保留原选择',
  error: (code) => `读取或选择失败：${code}`,
}

function props(): HbarComposerPermissionPickerProps {
  return {
    sessionId: 'a',
    sessionLabel: '工程 A 的当前会话',
    entry: undefined,
    hostDefault: { status: 'idle', mode: null, error: null },
    connected: true,
    disabled: false,
    labels,
    onRefresh: async () => {},
    onSelect: async () => {},
  }
}

test('permission picker shows four real options with localized names and next-send scope', () => {
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...props()} />)
  expect(html).toContain('aria-label="工具审批：继承服务端默认"')
  expect(html.match(/role="menuitemradio"/g)).toHaveLength(4)
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
  expect(html).toContain(labels.scopeHint)
  expect(html).toContain('尚未读取')
  expect(html).not.toContain('Plan')
  expect(html).not.toContain('bypassPermissions')
  expect(html).not.toContain(labels.confirmTitle)
})

test('long host-supplied names and exact default labels remain semantic text without duplicated options', () => {
  const input = props()
  const longLabel = '自动批准这个会话下一次普通发送中所有需要用户审批但未被服务端规则拒绝的工具操作'
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      labels={{ ...labels, options: { ...labels.options, allow: { ...labels.options.allow, label: longLabel } } }}
      hostDefault={{ status: 'ready', mode: 'allow', error: null }}
      entry={{ sessionId: 'a', choice: 'allow', revision: 4, status: 'idle', locked: false, error: null }}
    />,
  )
  expect(html).toContain(`aria-label="工具审批：${longLabel}"`)
  expect(html).toContain(`最近读取：${longLabel}`)
  expect(html.match(/role="menuitemradio"/g)).toHaveLength(4)
  expect(html).toContain('data-choice="allow"')
})

test('stale other-session entry never displays its permission as this session selection', () => {
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...props()}
      entry={{ sessionId: 'b', choice: 'allow', revision: 3, status: 'unknown', locked: true, error: 'RESULT_UNKNOWN' }}
    />,
  )
  expect(html).toContain('aria-label="工具审批：继承服务端默认"')
  expect(html).not.toContain(labels.unknown)
  expect(html).not.toContain('disabled=""')
})

test('unknown freezes the trigger and every new choice with nearby original-policy feedback', () => {
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...props()}
      entry={{ sessionId: 'a', choice: 'allow', revision: 1, status: 'unknown', locked: true, error: 'RESULT_UNKNOWN' }}
    />,
  )
  expect(html).toContain('aria-label="工具审批：自动批准需审批工具"')
  expect(html).toContain(labels.unknown)
  expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(5)
  expect(html).not.toContain(labels.retry)
})

test('failed inherited read exposes local retry while retaining inherit; explicit choice does not claim failed default', () => {
  const input = props()
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker {...input} hostDefault={{ status: 'error', mode: null, error: 'DISCONNECTED' }} />,
  )
  expect(html).toContain(labels.error('DISCONNECTED'))
  expect(html).toContain(labels.retry)
  expect(html).toContain('aria-label="工具审批：继承服务端默认"')
  const explicit = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      hostDefault={{ status: 'error', mode: null, error: 'DISCONNECTED' }}
      entry={{ sessionId: 'a', choice: 'deny', revision: 1, status: 'idle', locked: false, error: null }}
    />,
  )
  expect(explicit).not.toContain(labels.retry)
  expect(explicit).not.toContain(labels.error('DISCONNECTED'))
})
