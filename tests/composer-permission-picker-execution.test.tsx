import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComposerPlanModeEntry } from '@hbar/app-runtime'
import {
  HbarComposerPermissionPicker,
  type HbarComposerPermissionPickerProps,
} from '../packages/app-react/src/composer-permission-picker'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'

function props(locale: ShellLocale, entry: ComposerPlanModeEntry | undefined): HbarComposerPermissionPickerProps {
  return {
    sessionId: 'a',
    sessionLabel: 'A',
    connected: true,
    disabled: false,
    labels: getShellCopy(locale).session.permissionPicker,
    entry: { sessionId: 'a', choice: 'allow', revision: 7, locked: false, status: 'idle', error: null },
    hostDefault: { status: 'ready', mode: 'ask', error: null },
    defaultAvailable: true,
    onRefresh: async () => {},
    onSelect: async () => {},
    plan: {
      entry,
      onSetMode: async () => {},
      onSelectOrdinary: async () => {},
      onRefresh: async () => {},
      onReconcile: async () => {},
    },
  }
}

function mode(status: ComposerPlanModeEntry['status'], reading = false): ComposerPlanModeEntry {
  return { sessionId: 'a', mode: null, status, reading, error: null, revision: 5 }
}

const states = [
  { entry: undefined, label: 'loading' },
  { entry: mode('loading', true), label: 'loading' },
  { entry: mode('pending'), label: 'pending' },
  { entry: mode('pending', true), label: 'checking' },
  { entry: mode('unknown'), label: 'unknown' },
  { entry: mode('unknown', true), label: 'checking' },
  { entry: mode('failed'), label: 'failed' },
] as const

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const [index, state] of states.entries()) {
    test(`${locale}: closed unresolved execution ${index}/${state.label} replaces remembered approval`, () => {
      const input = props(locale, state.entry)
      const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
      expect(html).toContain(`aria-label="${input.labels.trigger(input.labels.execution[state.label])}"`)
      expect(html).not.toContain('aria-checked="true"')
      expect(html).not.toContain('role="menuitemradio"')
      const trigger = html.match(/<button[^>]*class="[^"]*hbar-composer-permission-trigger[^>]*>/)?.[0]
      expect(trigger).toBeDefined()
      expect(trigger).not.toContain('disabled=""')
    })
  }

  test(`${locale}: closed shared owner reading displays checking beside the entry`, () => {
    const input = props(locale, mode('unknown', true))
    const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
    expect(html).toContain(input.labels.execution.checking)
    expect(html).not.toContain('data-execution-recovery')
    expect(html).not.toContain(input.labels.plan.recheck)
    expect(html).not.toContain(input.labels.plan.pending)
  })

  test(`${locale}: read failure keeps the original unknown mode unselected and exposes only safe local copy`, () => {
    const input = props(locale, { ...mode('unknown'), error: 'PRIVATE_HOST_PAYLOAD' })
    const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
    expect(html).toContain(input.labels.execution.checkFailed)
    expect(html).not.toContain('PRIVATE_HOST_PAYLOAD')
    expect(html).not.toContain('aria-checked="true"')
  })

  test(`${locale}: only confirmed default restores the locally remembered approval, not Host default or Plan`, () => {
    const input = props(locale, { ...mode('ready'), mode: 'default' })
    const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
    expect(html).toContain(`aria-label="${input.labels.trigger(input.labels.options.allow.label)}"`)
    expect(html).not.toContain('role="menuitemradio"')
    expect(html).not.toContain(input.labels.execution.approvalFrozen)
    expect(html).not.toContain('data-execution-recovery-region')
  })

  // Recovery order, disabled rows, nearby scope, Close, and focusable pending
  // read actions are checked on the visible portal in verify-session-permission.ts.
}

test('a mismatched Plan target is loading, never an inherited approval or another session Plan fact', () => {
  const input = props('en-US', { ...mode('ready'), sessionId: 'b', mode: 'plan' })
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
  expect(html).toContain(`aria-label="${input.labels.trigger(input.labels.execution.loading)}"`)
  expect(html).not.toContain('aria-checked="true"')
})

test('an archived unresolved mode keeps its inspection trigger available while closed', () => {
  const input = props('en-US', mode('unknown'))
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} disabled canPrepare={false} />)
  const trigger = html.match(/<button[^>]*class="[^"]*hbar-composer-permission-trigger[^>]*>/)?.[0]
  expect(trigger).toBeDefined()
  expect(trigger).not.toContain('disabled=""')
})

test('failed mode reads expose localized recovery rather than raw Host details or a remembered selected mode', () => {
  const input = props('zh-CN', { ...mode('failed'), mode: 'default', error: 'PRIVATE_HOST_PAYLOAD' })
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
  expect(html).toContain(input.labels.execution.readFailed)
  expect(html).not.toContain('PRIVATE_HOST_PAYLOAD')
  expect(html).not.toContain('aria-checked="true"')
})

test('a long translated uncertain trigger preserves its full accessible name without inventing another option', () => {
  const input = props('zh-CN', { ...mode('unknown'), mode: 'plan' })
  const long = '尚未确认原会话的执行模式切换结果，请核对原请求，不会重复切换或清除已保存的审批选择'
  const labels = { ...input.labels, execution: { ...input.labels.execution, unknown: long } }
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} labels={labels} />)
  expect(html).toContain(`aria-label="${labels.trigger(long)}"`)
  expect(html).not.toContain('role="menuitemradio"')
  expect(html).not.toContain('aria-checked="true"')
})
