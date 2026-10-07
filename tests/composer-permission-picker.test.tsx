import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarComposerPermissionPicker,
  type HbarComposerPermissionPickerProps,
} from '../packages/app-react/src/composer-permission-picker'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'

function props(locale: ShellLocale = 'zh-CN'): HbarComposerPermissionPickerProps {
  return {
    sessionId: 'a',
    sessionLabel: 'Original session A',
    entry: undefined,
    hostDefault: { status: 'idle', mode: null, error: null },
    defaultAvailable: true,
    connected: true,
    disabled: false,
    labels: getShellCopy(locale).session.permissionPicker,
    onRefresh: async () => {},
    onSelect: async () => {},
  }
}

// Open content, option order/marks, Goal cancellation, confirmation, disabled
// options and scope copy are exercised in verify-session-permission.ts against
// the visible body portal. Closed SSR must not pretend that portal is present.
test('closed permission entry has a localized trigger and no mounted menu', () => {
  const input = props()
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
  expect(html).toContain(`aria-label="${input.labels.trigger(input.labels.options.inherit.label)}"`)
  expect(html).toContain('aria-expanded="false"')
  expect(html).not.toContain('role="dialog"')
  expect(html).not.toContain('role="menuitemradio"')
  expect(html).not.toContain(input.labels.confirmTitle)
})

test('an active Run locks the entry and retains its confirmed approval', () => {
  const input = props()
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      runActive
      entry={{ sessionId: 'a', choice: 'ask', revision: 2, status: 'idle', locked: false, error: null }}
    />,
  )
  expect(html).toContain(`title="${input.labels.runActiveHint}"`)
  expect(html).toContain('data-choice="ask"')
  expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(1)
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`${locale}: inherit names the confirmed default and does not guess through failure`, () => {
    const input = props(locale)
    const visible = input.labels.inheritedTrigger(input.labels.options.ask.label)
    const ready = renderToStaticMarkup(
      <HbarComposerPermissionPicker {...input} hostDefault={{ status: 'ready', mode: 'ask', error: null }} />,
    )
    expect(ready).toContain(`aria-label="${input.labels.trigger(visible)}"`)
    expect(ready).toContain(`>${visible}</span>`)
    const failed = renderToStaticMarkup(
      <HbarComposerPermissionPicker {...input} hostDefault={{ status: 'error', mode: null, error: 'DISCONNECTED' }} />,
    )
    expect(failed).toContain(`aria-label="${input.labels.trigger(input.labels.options.inherit.label)}"`)
    expect(failed).not.toContain(visible)
  })
}

test('Plan and unknown execution retain distinct closed trigger and feedback contracts', () => {
  const input = props()
  const plan = {
    entry: { sessionId: 'a', mode: 'plan' as const, status: 'ready' as const, error: null, revision: 3 },
    onSetMode: async () => {},
    onSelectOrdinary: async () => {},
    onRefresh: async () => {},
    onReconcile: async () => {},
  }
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} plan={plan} />)
  expect(html).toContain(`aria-label="${input.labels.trigger(input.labels.plan.label)}"`)
  const uncertain = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      plan={{ ...plan, entry: { ...plan.entry, mode: null, status: 'unknown' } }}
    />,
  )
  expect(uncertain).toContain(input.labels.plan.unknown)
  expect(uncertain).toContain(`aria-label="${input.labels.trigger(input.labels.execution.unknown)}"`)
  expect(uncertain).not.toContain(`aria-label="${input.labels.trigger(input.labels.plan.label)}"`)
})

test('a long host label remains complete in the visible trigger and its accessible name', () => {
  const input = props()
  const long = '自动批准这个会话中所有需要用户审批但未被服务端规则拒绝的工具操作'.repeat(4)
  const labels = {
    ...input.labels,
    options: { ...input.labels.options, allow: { ...input.labels.options.allow, label: long } },
  }
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      labels={labels}
      entry={{ sessionId: 'a', choice: 'allow', revision: 4, status: 'idle', locked: false, error: null }}
    />,
  )
  expect(html).toContain(`aria-label="${labels.trigger(long)}"`)
  expect(html).toContain(`>${long}</span>`)
  expect(html).toContain('data-choice="allow"')
})

test('an entry owned by another session never paints its approval, unknown feedback or lock', () => {
  const input = props()
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      entry={{ sessionId: 'b', choice: 'allow', revision: 3, status: 'unknown', locked: true, error: 'RESULT_UNKNOWN' }}
    />,
  )
  expect(html).toContain(`aria-label="${input.labels.trigger(input.labels.options.inherit.label)}"`)
  expect(html).not.toContain(input.labels.unknown)
  expect(html).not.toContain('disabled=""')
})

test('unknown approval freezes the entry and exposes original receipt reconciliation nearby', () => {
  const input = props()
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      entry={{
        sessionId: 'a',
        choice: 'allow',
        revision: 1,
        status: 'unknown',
        locked: true,
        error: 'RESULT_UNKNOWN',
        writeUnknown: true,
      }}
      onReconcile={async () => {}}
    />,
  )
  expect(html).toContain(input.labels.unknown)
  expect(html).toContain(input.labels.recheck)
  expect(html).not.toContain(input.labels.retry)
  expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(1)
})

test('failed inherited reads have nearby retry; explicit choices do not claim that failure', () => {
  const input = props()
  const html = renderToStaticMarkup(
    <HbarComposerPermissionPicker {...input} hostDefault={{ status: 'error', mode: null, error: 'DISCONNECTED' }} />,
  )
  expect(html).toContain(input.labels.error('DISCONNECTED'))
  expect(html).toContain(input.labels.retry)
  const explicit = renderToStaticMarkup(
    <HbarComposerPermissionPicker
      {...input}
      hostDefault={{ status: 'error', mode: null, error: 'DISCONNECTED' }}
      entry={{ sessionId: 'a', choice: 'deny', revision: 1, status: 'idle', locked: false, error: null }}
    />,
  )
  expect(explicit).not.toContain(input.labels.retry)
  expect(explicit).not.toContain(input.labels.error('DISCONNECTED'))
})
