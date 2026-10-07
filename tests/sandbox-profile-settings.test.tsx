import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SandboxProfileEditorState, SandboxProfilesState } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'
import {
  HbarSandboxProfilesView,
  type HbarSandboxProfilesViewProps,
} from '../packages/app-react/src/sandbox-profile-settings'

const zh = getShellCopy('zh-CN').sandbox
const en = getShellCopy('en-US').sandbox
const noop = () => undefined

const builtins = [
  { id: ':read-only', builtin: true, name: 'Read only', description: '', extends: null, revision: 0, updatedAt: 0 },
  {
    id: ':workspace-write',
    builtin: true,
    name: 'Workspace write',
    description: '',
    extends: ':read-only',
    revision: 0,
    updatedAt: 0,
  },
] as const

function editor(overrides: Partial<SandboxProfileEditorState> = {}): SandboxProfileEditorState {
  const draft = {
    id: 'engine-strict',
    name: 'Engine strict',
    description: '',
    extends: ':read-only' as const,
    escalation: 'deny' as const,
    fileDefault: null,
    network: null,
    grants: [
      { rowId: 'g1', path: 'engine/src', access: 'write' as const },
      { rowId: 'g2', path: '', access: 'write' as const },
    ],
    commands: [{ rowId: 'c1', pattern: 'cargo test *', decision: 'allow' as const }],
    tools: [],
    environment: [{ rowId: 'e1', name: 'CARGO_TARGET_DIR', value: 'bad\u0007value' }],
    osConfinement: null,
  }
  return {
    editorId: '00000000-0000-4000-8000-000000000001',
    mode: 'edit',
    profileId: 'engine-strict',
    revision: 3,
    status: 'ready',
    pending: null,
    error: null,
    draft,
    baseline: draft,
    dirty: true,
    issues: [
      { field: 'grants', rowId: 'g2', column: 'path', code: 'required' },
      { field: 'environment', rowId: 'e1', column: 'value', code: 'invalid' },
    ],
    resolved: null,
    resolveError: null,
    saved: false,
    ...overrides,
  }
}

function state(overrides: Partial<SandboxProfilesState> = {}): SandboxProfilesState {
  return {
    available: true,
    list: {
      status: 'ready',
      items: [
        ...builtins,
        {
          id: 'engine-strict',
          builtin: false,
          name: 'Engine strict',
          description: '',
          extends: ':read-only',
          revision: 3,
          updatedAt: 1,
        },
      ],
      error: null,
    },
    editor: editor(),
    ...overrides,
  }
}

function render(overrides: Partial<HbarSandboxProfilesViewProps> = {}) {
  return renderToStaticMarkup(
    <HbarSandboxProfilesView
      labels={zh}
      connected
      state={state()}
      confirmation={null}
      actionError={null}
      onRefresh={noop}
      onOpen={noop}
      onEdit={noop}
      onSave={noop}
      onDiscard={noop}
      onReconcile={noop}
      onRequestDelete={noop}
      onConfirm={noop}
      onCancelConfirmation={noop}
      {...overrides}
    />,
  )
}

test('renders localized built-in names, rules, the command limitation and row-bound issues', () => {
  const html = render()
  expect(html).toContain(zh.title)
  expect(html).toContain('工作区可写')
  expect(html).toContain('只读')
  expect(html).toContain(zh.commands.warning)
  expect(html).toContain('value="engine/src"')
  expect(html).toContain('value="cargo test *"')
  // Each issue names its own column and is wired to the row's control.
  expect(html).toContain('请填写路径。')
  expect(html).toContain('变量值格式不正确。')
  expect(html).not.toContain('变量名格式不正确。')
  expect(html.match(/aria-invalid="true"/g)?.length).toBeGreaterThanOrEqual(2)
  expect(html).toContain(zh.revision(3))
  expect(html).toContain(`>${zh.delete}<`)
  // Save is blocked while issues remain.
  const saveButtons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map((match) => match[0])
    .filter((button) => button.replace(/<[^>]*>/g, '').trim() === zh.save)
  expect(saveButtons).toHaveLength(1)
  expect(saveButtons[0]).toContain('disabled=""')
})

test('uses controlled popup selects for profile choices and keeps the sandbox in flow layout', async () => {
  const html = render()
  expect(html).not.toContain('<select')
  expect(html.match(/role="combobox"/g)?.length).toBe(8)
  expect(html).toContain('data-value="deny"')

  const source = await Bun.file(
    new URL('../packages/app-react/src/sandbox-profile-settings.tsx', import.meta.url),
  ).text()
  expect(source.match(/<LumenPopupSelect/g)?.length).toBe(8)
  const css = await Bun.file(new URL('../packages/app-react/src/sandbox-profile-settings.css', import.meta.url)).text()
  expect(css).toContain('.hbar-sandbox-profiles-body {\n  display: flex;')
  expect(css).toContain('min-inline-size: min(100%, 24rem);')
  expect(css).toContain('.hbar-sandbox-profiles-fields {\n  display: flex;')
  expect(css).not.toContain('display: grid')
  expect(css).not.toContain('@media (max-width')
})

test('the English locale and a long translated name stay in the semantic text', () => {
  const longName = 'An exceptionally long sandbox profile name used to check wrapping and accessible names'.repeat(2)
  const html = render({
    labels: en,
    state: state({
      list: {
        status: 'ready',
        items: [...builtins, { ...builtins[0], id: 'long', builtin: false, name: longName }],
        error: null,
      },
      editor: null,
    }),
  })
  expect(html).toContain(longName)
  expect(html).toContain(en.noSelection)
  expect(html).toContain('Workspace write')
})

test('empty, unavailable and disconnected states are explicit', () => {
  expect(render({ state: state({ available: false, editor: null }) })).toContain(zh.unavailable)
  const offline = render({ connected: false })
  expect(offline).toContain(zh.disconnected)
  expect(offline.match(/<input[^>]*disabled=""/g)?.length).toBeGreaterThan(0)
  const loading = render({ state: state({ list: { status: 'loading', items: [], error: null }, editor: null }) })
  expect(loading).toContain(zh.loading)
  const failed = render({ state: state({ list: { status: 'error', items: [], error: 'TIMEOUT' }, editor: null }) })
  expect(failed).toContain(zh.listError('TIMEOUT'))
})

test('built-ins are read-only and offer a new profile that extends them', () => {
  const html = render({
    state: state({
      editor: editor({ mode: 'readonly', profileId: ':workspace-write', revision: 0, dirty: false, issues: [] }),
    }),
  })
  expect(html).toContain(zh.readonlyHint)
  expect(html).toContain(zh.createFrom)
  expect(html).not.toContain(`>${zh.delete}<`)
  expect(html).not.toContain(`>${zh.save}<`)
})

test('unknown and conflict outcomes show their recovery actions next to the editor', () => {
  const unknown = render({ state: state({ editor: editor({ status: 'unknown', pending: 'save', issues: [] }) }) })
  expect(unknown).toContain(zh.unknown('save'))
  expect(unknown).toContain(zh.reconcile)
  expect(unknown).toContain(zh.retry)
  const conflict = render({ state: state({ editor: editor({ status: 'conflict', error: 'COMMAND_CONFLICT' }) }) })
  expect(conflict).toContain(zh.conflict)
  expect(conflict).toContain(zh.reload)
  const failed = render({ state: state({ editor: editor({ status: 'failed', error: 'SANDBOX_PROFILE_IN_USE' }) }) })
  expect(failed).toContain(zh.error('SANDBOX_PROFILE_IN_USE'))
})

test('a delete confirmation renders only for the editor it was requested for', () => {
  const name = 'Engine strict'
  const bound = render({
    confirmation: { kind: 'delete', editorId: '00000000-0000-4000-8000-000000000001', name },
  })
  expect(bound).toContain(zh.deleteConfirm(name))
  const stale = render({
    confirmation: { kind: 'delete', editorId: '00000000-0000-4000-8000-000000000099', name },
  })
  expect(stale).not.toContain(zh.deleteConfirm(name))
  const discard = render({ confirmation: { kind: 'discard', target: { kind: 'existing', id: ':read-only' } } })
  expect(discard).toContain(zh.discardConfirm)
})
