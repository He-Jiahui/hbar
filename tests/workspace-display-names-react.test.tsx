import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { WorkspaceDisplayNamesState } from '@hbar/app-runtime'
import {
  WorkspaceDisplayNameDialog,
  WorkspaceDisplayNameFeedback,
  workspaceDisplayNameCanSave,
  workspaceDisplayNameSubmitKey,
  type WorkspaceDisplayNameDialogProps,
} from '../packages/app-react/src/workspace-display-names'
import { workspaceDisplayNamesCopy } from '../apps/web/src/workspace-display-names-copy'
import type { ShellLocale } from '../apps/web/src/shell-copy'

const request = {
  workspaceId: 'project-a',
  expectedRevision: 1,
  expectedDisplayName: 'Original alias',
  displayName: 'New alias',
}
const receipt = { commitId: 'confirmed-original', revision: 2, request, changed: true }
function state(): WorkspaceDisplayNamesState {
  return {
    status: 'ready',
    error: null,
    requestInFlight: false,
    snapshot: { schemaVersion: 1, revision: 1, entries: [{ workspaceId: 'project-a', displayName: 'Original alias' }] },
    editor: {
      open: true,
      workspaceId: 'project-a',
      canonicalName: 'real-folder',
      path: 'D:/real/folder/真实项目',
      draft: 'New alias',
      revision: 5,
      validation: null,
      expectedRevision: 1,
      expectedDisplayName: 'Original alias',
      conflict: false,
      baseLoaded: true,
      pristine: false,
    },
    action: { status: 'idle', operation: null, request: null, key: null, receipt: null, error: null },
  }
}
const noop = async () => {}
function props(value = state(), locale: ShellLocale = 'en-US'): WorkspaceDisplayNameDialogProps {
  return {
    state: value,
    connected: true,
    labels: workspaceDisplayNamesCopy(locale),
    onEdit: () => {},
    onClose: () => {},
    onSave: noop,
    onReset: noop,
    onRebase: noop,
    onRefresh: noop,
    onReconcile: noop,
  }
}
function dialog(value = state(), locale: ShellLocale = 'en-US', connected = true) {
  return renderToStaticMarkup(<WorkspaceDisplayNameDialog {...props(value, locale)} connected={connected} />)
}
function feedback(value: WorkspaceDisplayNamesState, locale: ShellLocale = 'en-US', connected = true) {
  return renderToStaticMarkup(
    <WorkspaceDisplayNameFeedback
      state={value}
      labels={workspaceDisplayNamesCopy(locale)}
      connected={connected}
      onOpen={() => {}}
      onRefresh={noop}
      onReconcile={noop}
    />,
  )
}
function findButton(html: string, label: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(
    ([markup]) => markup.replace(/<[^>]*>/g, '') === label,
  )?.[0]
}
function button(html: string, label: string) {
  const result = findButton(html, label)
  if (!result) throw new Error(`Expected localized button: ${label}`)
  return result
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`${locale} editor separates editable alias from readonly real path with one Save and no duplicate Hide`, () => {
    const labels = workspaceDisplayNamesCopy(locale)
    const html = dialog(state(), locale)
    expect(html).toContain(`aria-label="${labels.title}"`)
    expect(html).toContain('class="lumen-floating-modal-root hbar-app-ui-dialog-backdrop"')
    expect(html).toContain(
      'class="lumen-floating-surface lumen-dialog hbar-app-ui-native-dialog hbar-workspace-display-name-dialog"',
    )
    expect(html).toContain('role="dialog" aria-label=')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-testid="workspace-display-name-dialog"')
    expect(html).toContain('data-testid="workspace-display-name-input"')
    expect(html).toContain('value="New alias"')
    expect(html).toContain('value="D:/real/folder/真实项目"')
    expect(html).toContain('aria-readonly="true"')
    expect(html).toContain(labels.pathHint)
    expect(html).toContain(labels.restoreHint)
    expect(button(html, labels.cancel)).not.toContain('disabled=""')
    expect(button(html, labels.save)).not.toContain('disabled=""')
    expect([...html.matchAll(/type="submit"/g)]).toHaveLength(1)
    expect(html).not.toContain('Hide project')
    expect(html).not.toContain('隐藏项目')
    expect(html).not.toContain('original-key')
  })
  test(`${locale} all validation reasons stay beside the name without exposing private errors`, () => {
    for (const validation of ['required', 'tooLong', 'invalid'] as const) {
      const value = state()
      if (!value.editor) throw new Error('Fixture editor missing')
      const html = dialog({ ...value, editor: { ...value.editor, validation } }, locale)
      expect(html).toContain(workspaceDisplayNamesCopy(locale).validation[validation])
      expect(html).toContain('aria-invalid="true"')
      expect(button(html, workspaceDisplayNamesCopy(locale).save)).toContain('disabled=""')
    }
    const value = state()
    const privateCode = 'private-provider-path-and-token-never-render'
    const html = dialog(
      {
        ...value,
        action: {
          ...value.action,
          status: 'failed',
          operation: 'save',
          request,
          key: 'original-key',
          error: privateCode,
        },
      },
      locale,
    )
    expect(html).toContain(workspaceDisplayNamesCopy(locale).actionFailure(privateCode))
    expect(html).not.toContain(privateCode)
    expect(html).not.toContain('original-key')
  })
  test(`${locale} unknown can close but never offers Save or a second write; physical pending disables only checking`, () => {
    const labels = workspaceDisplayNamesCopy(locale)
    for (const requestInFlight of [false, true]) {
      const value = state()
      const html = dialog(
        {
          ...value,
          requestInFlight,
          action: {
            ...value.action,
            status: 'unknown',
            operation: 'save',
            request,
            key: 'unknown-key',
            error: 'RESULT_UNKNOWN',
          },
        },
        locale,
      )
      expect(html).toContain(requestInFlight ? labels.waiting : labels.unknown)
      expect(button(html, labels.dismiss)).not.toContain('disabled=""')
      expect(button(html, labels.save)).toContain('disabled=""')
      expect(button(html, labels.restore)).toContain('disabled=""')
      expect(button(html, labels.reconcile).includes('disabled=""')).toBe(requestInFlight)
      expect(html).toContain('readOnly=""')
      expect(html).not.toContain('unknown-key')
    }
  })
}

test('no editor means no fake dialog; a retained closed editor leaves its operation available in feedback', () => {
  const value = state()
  expect(dialog({ ...value, editor: null })).toBe('')
  if (!value.editor) throw new Error('Fixture editor missing')
  const uncertain: WorkspaceDisplayNamesState = {
    ...value,
    editor: { ...value.editor, open: false },
    action: { ...value.action, status: 'unknown', operation: 'save', request, key: 'unknown-key', error: null },
  }
  expect(dialog(uncertain)).not.toContain('data-open="true"')
  const html = feedback(uncertain)
  const labels = workspaceDisplayNamesCopy('en-US')
  expect(html).toContain('data-testid="workspace-display-name-feedback"')
  expect(html).toContain(labels.unknown)
  expect(html).toContain(labels.reopen)
  expect(html).toContain(labels.reconcile)
  expect(html).not.toContain(labels.save + '</span>')
  expect(feedback({ ...uncertain, editor: { ...value.editor, open: true } })).toBe('')
})

test('in-flight Save and Restore offer Close rather than implying the original write can be cancelled', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = workspaceDisplayNamesCopy(locale)
    for (const operation of ['save', 'reset'] as const) {
      const value = state()
      const html = dialog(
        {
          ...value,
          requestInFlight: true,
          action: { ...value.action, status: 'submitting', operation, request, key: 'waiting-key' },
        },
        locale,
      )
      expect(html).toContain(operation === 'reset' ? labels.restoring : labels.saving)
      expect(html).toContain(locale === 'zh-CN' ? '关闭不会取消原请求' : 'Closing does not cancel the original request')
      expect(button(html, labels.dismiss)).not.toContain('disabled=""')
      expect(html).not.toContain(`>${labels.cancel}<`)
      expect(button(html, labels.save)).toContain('disabled=""')
    }
  }
})

test('Restore is conditional on an existing alias and its acknowledged result keeps the controlled editor open', () => {
  const value = state()
  if (!value.editor) throw new Error('Fixture editor missing')
  const resetRequest = { ...request, displayName: null }
  const reset: WorkspaceDisplayNamesState = {
    ...value,
    snapshot: { schemaVersion: 1, revision: 2, entries: [] },
    editor: { ...value.editor, draft: value.editor.canonicalName, expectedDisplayName: null, expectedRevision: 2 },
    action: {
      status: 'succeeded',
      operation: 'reset',
      request: resetRequest,
      key: 'reset-key',
      receipt: { ...receipt, request: resetRequest },
      error: null,
    },
  }
  const html = dialog(reset)
  const labels = workspaceDisplayNamesCopy('en-US')
  expect(html).toContain('data-open="true"')
  expect(html).toContain('value="real-folder"')
  expect(html).toContain(labels.restored)
  expect(html).not.toContain(labels.restore + '</span>')
  expect(workspaceDisplayNameCanSave(reset, true)).toBe(true)
})

test('raw whitespace and 80/81-unit names are not silently truncated to the Host normalized limit', () => {
  const value = state()
  if (!value.editor) throw new Error('Fixture editor missing')
  for (const draft of ['', 'x'.repeat(80), 'x'.repeat(81), ' '.repeat(3999) + 'x']) {
    const html = dialog({ ...value, editor: { ...value.editor, draft } })
    expect(html).toContain(`value="${draft}"`)
    expect(html).toContain('maxLength="4000"')
    expect(html).not.toContain('maxLength="80"')
  }
})

test('write availability derives canonical state rather than an optimistic callback result', () => {
  const ready = state()
  expect(workspaceDisplayNameCanSave(ready, true)).toBe(true)
  expect(workspaceDisplayNameCanSave(ready, false)).toBe(false)
  for (const status of ['unavailable', 'loading', 'error', 'offline'] as const)
    expect(workspaceDisplayNameCanSave({ ...ready, status }, true)).toBe(false)
  for (const status of ['submitting', 'unknown', 'reconciling'] as const)
    expect(workspaceDisplayNameCanSave({ ...ready, action: { ...ready.action, status } }, true)).toBe(false)
  expect(workspaceDisplayNameCanSave({ ...ready, requestInFlight: true }, true)).toBe(false)
  expect(workspaceDisplayNameCanSave({ ...ready, editor: null }, true)).toBe(false)
  if (!ready.editor) throw new Error('Fixture editor missing')
  expect(workspaceDisplayNameCanSave({ ...ready, editor: { ...ready.editor, conflict: true } }, true)).toBe(false)
  expect(workspaceDisplayNameCanSave({ ...ready, editor: { ...ready.editor, open: false } }, true)).toBe(false)
  expect(workspaceDisplayNameCanSave({ ...ready, editor: { ...ready.editor, baseLoaded: false } }, true)).toBe(false)
})

test('a cold editor preserves its typed draft and real path without presenting a fake conflict', () => {
  const value = state()
  if (!value.editor) throw new Error('Fixture editor missing')
  const labels = workspaceDisplayNamesCopy('en-US')
  for (const status of ['loading', 'error'] as const) {
    const html = dialog({
      ...value,
      status,
      snapshot: null,
      error: status === 'error' ? 'PRIVATE_READ_DETAIL' : null,
      editor: { ...value.editor, baseLoaded: false, pristine: false, expectedDisplayName: null },
    })
    expect(html).toContain('value="New alias"')
    expect(html).toContain('value="D:/real/folder/真实项目"')
    expect(button(html, labels.save)).toContain('disabled=""')
    expect(html).not.toContain(labels.conflict)
    expect(html).not.toContain(labels.rebase)
    expect(html).not.toContain('PRIVATE_READ_DETAIL')
    expect(html).toContain(status === 'loading' ? labels.loading : labels.readFailure('PRIVATE_READ_DETAIL'))
  }
})

test('initial idle and unavailable feedback stays silent; only a real operation or read failure is surfaced', () => {
  const value = state()
  expect(feedback({ ...value, editor: null })).toBe('')
  expect(feedback({ ...value, editor: null, snapshot: null, status: 'unavailable' }, 'zh-CN', false)).toBe('')
})

test('only ordinary unhandled Enter submits; IME keyCode229 and composition never submit', () => {
  expect(workspaceDisplayNameSubmitKey({ key: 'Enter', composing: false, keyCode: 13, defaultPrevented: false })).toBe(
    true,
  )
  for (const input of [
    { key: 'Enter', composing: true, keyCode: 13, defaultPrevented: false },
    { key: 'Enter', composing: false, keyCode: 229, defaultPrevented: false },
    { key: 'Enter', composing: false, keyCode: 13, defaultPrevented: true },
    { key: 'Escape', composing: false, keyCode: 27, defaultPrevented: false },
  ])
    expect(workspaceDisplayNameSubmitKey(input)).toBe(false)
})

test('conflict keeps the original draft and has an explicit read-rebase action, not automatic overwrite', () => {
  const value = state()
  if (!value.editor) throw new Error('Fixture editor missing')
  const html = dialog({
    ...value,
    editor: { ...value.editor, conflict: true },
    action: { ...value.action, status: 'failed', operation: 'save', request, error: 'COMMAND_CONFLICT' },
  })
  const labels = workspaceDisplayNamesCopy('en-US')
  expect(html).toContain('value="New alias"')
  expect(html).toContain(labels.conflict)
  expect(button(html, labels.rebase)).not.toContain('disabled=""')
  expect(button(html, labels.save)).toContain('disabled=""')
  expect(html).not.toContain('COMMAND_CONFLICT')
})

test('a confirmed save and later failed read stay distinct; reversed latest facts do not claim the old alias is current', () => {
  const value = state()
  const succeeded: WorkspaceDisplayNamesState = {
    ...value,
    editor: null,
    action: { status: 'succeeded', operation: 'save', request, key: 'save-key', receipt, error: null },
  }
  const labels = workspaceDisplayNamesCopy('en-US')
  const failedRead = feedback({ ...succeeded, status: 'error', error: 'PRIVATE_READ_DETAIL' })
  expect(failedRead).toContain(labels.acknowledged)
  expect(failedRead).toContain(labels.readFailure('PRIVATE_READ_DETAIL'))
  expect(failedRead).toContain(labels.refresh)
  expect(failedRead).not.toContain(labels.unknown)
  expect(failedRead).not.toContain('PRIVATE_READ_DETAIL')
  const current = feedback({
    ...succeeded,
    snapshot: {
      schemaVersion: 1,
      revision: 2,
      entries: [{ workspaceId: request.workspaceId, displayName: 'New alias' }],
    },
  })
  expect(current).toContain(labels.saved)
  const reversed = feedback({ ...succeeded, snapshot: { schemaVersion: 1, revision: 3, entries: [] } })
  expect(reversed).toContain(labels.acknowledged)
  expect(reversed).not.toContain(labels.saved)
})

test('read failure during unknown offers exact receipt check, never a misleading fresh write or separate Refresh', () => {
  const value = state()
  const html = feedback(
    {
      ...value,
      editor: null,
      status: 'error',
      error: 'PRIVATE_READ_DETAIL',
      action: {
        ...value.action,
        status: 'unknown',
        operation: 'save',
        request,
        key: 'unknown-key',
        error: 'RESULT_UNKNOWN',
      },
    },
    'zh-CN',
    false,
  )
  const labels = workspaceDisplayNamesCopy('zh-CN')
  expect(html).toContain(labels.unknown)
  expect(html).toContain(labels.offline)
  expect(button(html, labels.reconcile)).toContain('disabled=""')
  expect(findButton(html, labels.refresh)).toBeUndefined()
  expect(findButton(html, labels.save)).toBeUndefined()
  expect(html).not.toContain('unknown-key')
  expect(html).not.toContain('PRIVATE_READ_DETAIL')
})

test('SSR is side-effect free and long supplied labels and path remain semantic form content', () => {
  let calls = 0
  const value = state()
  if (!value.editor) throw new Error('Fixture editor missing')
  const next = props({ ...value, editor: { ...value.editor, path: 'D:/' + '非常长的真实路径/'.repeat(30) } }, 'zh-CN')
  const html = renderToStaticMarkup(
    <WorkspaceDisplayNameDialog
      {...next}
      labels={{ ...next.labels, save: '保存'.repeat(35), restore: '恢复文件夹名称'.repeat(20) }}
      onSave={async () => {
        calls += 1
      }}
      onReset={async () => {
        calls += 1
      }}
      onEdit={() => {
        calls += 1
      }}
    />,
  )
  expect(calls).toBe(0)
  expect(html).toContain('保存'.repeat(35))
  expect(html).toContain('恢复文件夹名称'.repeat(20))
  expect(html).toContain('<form')
  expect(html).toContain('noValidate=""')
})
