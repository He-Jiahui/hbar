import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarComposerPermissionPicker,
  type HbarComposerPermissionLabels,
  type HbarComposerPermissionPickerProps,
} from '../packages/app-react/src/composer-permission-picker'
import { composerExecutionCopy } from '../apps/web/src/composer-execution-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'

const labels: HbarComposerPermissionLabels = {
  execution: composerExecutionCopy('zh-CN'),
  title: '下一次发送的工具审批',
  plan: {
    label: '计划模式',
    description: '服务端拒绝写入',
    scope: '此会话持续生效，不修改审批策略',
    pending: '保存中',
    unknown: '尚未确认',
    loading: '读取中',
    exit: '退出计划模式',
    retry: '重试读取',
    recheck: '核对',
    approvalPaused: '选择其他审批会先退出计划模式',
    goalPrepared: '先取消目标准备，才能进入计划模式；保留文字与附件',
    cancelGoalPreparation: '取消目标准备',
    cancellingGoalPreparation: '正在取消目标准备',
  },
  trigger: (choice) => `工具审批：${choice}`,
  inheritedTrigger: (choice) => `${choice} · 默认`,
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
    defaultAvailable: true,
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

test('an inherited trigger names the confirmed effective default, but never guesses through read failure', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = getShellCopy(locale).session.permissionPicker
    const input = props()
    const ready = renderToStaticMarkup(
      <HbarComposerPermissionPicker
        {...input}
        labels={copy}
        hostDefault={{ status: 'ready', mode: 'ask', error: null }}
      />,
    )
    const visible = copy.inheritedTrigger(copy.options.ask.label)
    expect(ready).toContain(`aria-label="${copy.trigger(visible)}"`)
    expect(ready).toContain(`>${visible}</span>`)
    const failed = renderToStaticMarkup(
      <HbarComposerPermissionPicker
        {...input}
        labels={copy}
        hostDefault={{ status: 'error', mode: null, error: 'DISCONNECTED' }}
      />,
    )
    expect(failed).toContain(`aria-label="${copy.trigger(copy.options.inherit.label)}"`)
    expect(failed).not.toContain(visible)
  }
})

test('session Plan is a distinct fifth entry, while four approval choices retain their one-send semantics', () => {
  const input = props()
  const plan = {
    entry: { sessionId: 'a', mode: 'plan' as const, status: 'ready' as const, error: null, revision: 3 },
    onSetMode: async () => {},
    onSelectOrdinary: async () => {},
    onRefresh: async () => {},
    onReconcile: async () => {},
  }
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} plan={plan} />)
  expect(html).toContain('aria-label="工具审批：计划模式"')
  expect(html).toContain('退出计划模式')
  expect(html).toContain('此会话持续生效，不修改审批策略')
  expect(html).toContain(labels.plan.approvalPaused)
  expect(html.match(/<button[^>]*role="menuitemradio"[^>]*disabled=""/g)).toBeNull()
  expect(html.match(/role="menuitemradio"/g)).toHaveLength(4)
  expect(html.match(/role="menuitemcheckbox"/g)).toHaveLength(1)
  expect(html).toContain('role="menuitemcheckbox" aria-checked="true"')
  expect(html).not.toContain('role="menuitemradio" aria-checked="true"')
  const uncertain = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      plan={{ ...plan, entry: { ...plan.entry, mode: null, status: 'unknown' } }}
    />,
  )
  expect(uncertain).toContain(labels.plan.unknown)
  expect(uncertain).toContain(labels.plan.recheck)
  expect(uncertain).not.toContain('aria-label="工具审批：计划模式"')
  expect(uncertain).toContain(`aria-label="工具审批：${labels.execution.unknown}"`)
  expect(uncertain).not.toContain('aria-checked="true"')
  expect(uncertain.match(/<button[^>]*role="menuitemradio"[^>]*disabled=""/g)).toHaveLength(4)
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

test('prepared Goal explains its Plan conflict with a separate localized cancellation action', () => {
  const input = props()
  const plan = {
    entry: { sessionId: 'a', mode: 'default' as const, status: 'ready' as const, error: null, revision: 3 },
    goalPreparation: { revision: 7, onCancel: async () => {} },
    onSetMode: async () => {},
    onSelectOrdinary: async () => {},
    onRefresh: async () => {},
    onReconcile: async () => {},
  }
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} plan={plan} />)
  expect(html).toContain(labels.plan.goalPrepared)
  expect(html).toContain(labels.plan.cancelGoalPreparation)
  expect(html).toContain('aria-describedby=')
  expect(html.match(/<button[^>]*role="menuitemcheckbox"[^>]*disabled=""/g)).toHaveLength(1)
  expect(html.match(/<button[^>]*role="menuitemradio"[^>]*disabled=""/g)).toBeNull()
  expect(html).not.toContain(labels.plan.cancellingGoalPreparation)
  const busy = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} plan={plan} disabled />)
  expect(busy).toContain(labels.plan.goalPrepared)
  expect(busy.match(/<button[^>]*disabled=""/g)).toHaveLength(7)
  const unprepared = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      plan={{
        entry: plan.entry,
        onSetMode: plan.onSetMode,
        onSelectOrdinary: plan.onSelectOrdinary,
        onRefresh: plan.onRefresh,
        onReconcile: plan.onReconcile,
      }}
    />,
  )
  expect(unprepared).not.toContain(labels.plan.goalPrepared)
  expect(unprepared).not.toContain(labels.plan.cancelGoalPreparation)
  expect(unprepared).toContain(labels.plan.description)
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
