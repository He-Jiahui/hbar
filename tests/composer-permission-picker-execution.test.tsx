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
    test(`${locale}: unresolved execution ${index}/${state.label} replaces the trigger and every selected approval mark`, () => {
      const input = props(locale, state.entry)
      const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
      expect(html).toContain(`aria-label="${input.labels.trigger(input.labels.execution[state.label])}"`)
      expect(html).not.toContain('aria-checked="true"')
      expect(html.match(/<button[^>]*role="menuitemradio"[^>]*disabled=""/g)).toHaveLength(4)
      expect(html.match(/<button[^>]*role="menuitemcheckbox"[^>]*disabled=""/g)).toHaveLength(1)
      expect(html).toContain(input.labels.execution.approvalFrozen)
      const trigger = html.match(/<button[^>]*class="[^"]*hbar-composer-permission-trigger[^>]*>/)?.[0]
      expect(trigger).toBeDefined()
      expect(trigger).not.toContain('disabled=""')
      const close = html.match(new RegExp(`<button[^>]*aria-label="${input.labels.close}"[^>]*>`))?.[0]
      expect(close).toBeDefined()
      expect(close).not.toContain('disabled=""')
    })
  }

  test(`${locale}: a fresh view projection of shared owner reading displays checking and disables reconciliation`, () => {
    const input = props(locale, mode('unknown', true))
    const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
    expect(html).toContain(input.labels.execution.checking)
    const recovery = html.match(/<button[^>]*data-execution-recovery[^>]*>/g)
    expect(recovery).toHaveLength(1)
    expect(recovery?.[0]).toContain('disabled=""')
    expect(recovery?.[0]).toContain('aria-busy="true"')
    expect(html).not.toContain(input.labels.plan.recheck)
    expect(html).not.toContain(input.labels.plan.pending)
  })

  test(`${locale}: read failure keeps the original unknown mode unselected and exposes only safe local copy`, () => {
    const input = props(locale, { ...mode('unknown'), error: 'PRIVATE_HOST_PAYLOAD' })
    const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
    expect(html).toContain(input.labels.execution.checkFailed)
    expect(html).toContain(input.labels.plan.recheck)
    expect(html).not.toContain('PRIVATE_HOST_PAYLOAD')
    expect(html).not.toContain('aria-checked="true"')
    expect(html.match(/<button[^>]*data-execution-recovery[^>]*disabled=""/g)).toBeNull()
    const offline = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} connected={false} />)
    expect(offline.match(/<button[^>]*data-execution-recovery[^>]*disabled=""/g)).toHaveLength(1)
    expect(offline).toContain(input.labels.plan.recheck)
  })

  test(`${locale}: only confirmed default restores the locally remembered approval, not Host default or Plan`, () => {
    const input = props(locale, { ...mode('ready'), mode: 'default' })
    const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
    expect(html).toContain(`aria-label="${input.labels.trigger(input.labels.options.allow.label)}"`)
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(html).toContain('role="menuitemradio" aria-checked="true"')
    expect(html).not.toContain(input.labels.execution.approvalFrozen)
    expect(html.match(/<button[^>]*role="menuitemradio"[^>]*disabled=""/g)).toBeNull()
    expect(html).not.toContain('data-execution-recovery-region')
  })

  for (const status of ['unknown', 'failed'] as const) {
    test(`${locale}: ${status} execution feedback and its read action precede disabled options and scope detail`, () => {
      const input = props(locale, { ...mode(status), error: 'DISCONNECTED' })
      const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
      const body = html.slice(html.indexOf('class="hbar-composer-permission-body"'))
      const message = status === 'unknown' ? input.labels.execution.checkFailed : input.labels.execution.readFailed
      const region = body.indexOf('data-execution-recovery-region')
      const feedback = body.indexOf(message)
      const frozen = body.indexOf(input.labels.execution.approvalFrozen)
      const action = body.indexOf('data-execution-recovery="true"')
      const options = body.indexOf('role="menu"')
      expect(region).toBeGreaterThanOrEqual(0)
      expect(feedback).toBeGreaterThan(region)
      expect(frozen).toBeGreaterThan(feedback)
      expect(action).toBeGreaterThan(frozen)
      expect(options).toBeGreaterThan(action)
      expect(body.indexOf(input.labels.plan.scope)).toBeGreaterThan(options)
      expect(body.split(message)).toHaveLength(2)
      expect(body.match(/data-execution-recovery="true"/g)).toHaveLength(1)
    })
  }
}

test('a mismatched Plan target is loading, never an inherited approval or another session Plan fact', () => {
  const input = props('en-US', { ...mode('ready'), sessionId: 'b', mode: 'plan' })
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
  expect(html).toContain(`aria-label="${input.labels.trigger(input.labels.execution.loading)}"`)
  expect(html).not.toContain('aria-checked="true"')
  expect(html).toContain(input.labels.plan.retry)
})

test('an archived or submission-locked unresolved mode is inspectable but cannot create a mode or approval write', () => {
  const input = props('en-US', mode('unknown'))
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} disabled canPrepare={false} />)
  expect(html.match(/<button[^>]*role="menuitemradio"[^>]*disabled=""/g)).toHaveLength(4)
  expect(html.match(/<button[^>]*role="menuitemcheckbox"[^>]*disabled=""/g)).toHaveLength(1)
  expect(html.match(/<button[^>]*data-execution-recovery[^>]*disabled=""/g)).toBeNull()
  expect(html).toContain(input.labels.plan.recheck)
})

test('failed mode reads expose localized recovery rather than raw Host details or a remembered selected mode', () => {
  const input = props('zh-CN', { ...mode('failed'), mode: 'default', error: 'PRIVATE_HOST_PAYLOAD' })
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} />)
  expect(html).toContain(input.labels.execution.readFailed)
  expect(html).toContain(input.labels.plan.retry)
  expect(html).not.toContain('PRIVATE_HOST_PAYLOAD')
  expect(html).not.toContain('aria-checked="true"')
})

test('a long translated uncertain trigger preserves its full accessible name without inventing another option', () => {
  const input = props('zh-CN', { ...mode('unknown'), mode: 'plan' })
  const long = '尚未确认原会话的执行模式切换结果，请核对原请求，不会重复切换或清除已保存的审批选择'
  const labels = { ...input.labels, execution: { ...input.labels.execution, unknown: long } }
  const html = renderToStaticMarkup(<HbarComposerPermissionPicker {...input} labels={labels} />)
  expect(html).toContain(`aria-label="${labels.trigger(long)}"`)
  expect(html.match(/role="menuitemradio"/g)).toHaveLength(4)
  expect(html.match(/role="menuitemcheckbox"/g)).toHaveLength(1)
  expect(html).not.toContain('aria-checked="true"')
})
