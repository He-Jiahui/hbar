import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarCommandPalette, HbarRuntimeProvider, type HbarCommandPaletteLabels } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'

const labels: HbarCommandPaletteLabels = {
  title: 'Command catalog',
  description: 'Search the shared command definitions.',
  search: 'Search commands',
  available: 'Available commands',
  empty: 'No commands',
  unavailable: 'The previous selection is unavailable.',
  choose: 'Choose',
  close: 'Close',
  actions: 'Command actions',
  backToCommands: 'Back to commands',
  backToParameters: 'Back to parameters',
  count: (count) => `${count} commands`,
  navigateKeys: 'Arrows',
  executeKey: 'Enter',
  closeKey: 'Escape',
  category: (id) => `Category ${id}`,
  resolve: (key) => key,
  commandFallback: (id) => id,
  descriptionFallback: (id) => `Description ${id}`,
  parameters: 'Parameters',
  noParameters: 'No parameters',
  required: 'Required',
  optional: 'Optional',
  unset: 'Clear',
  trueValue: 'True',
  falseValue: 'False',
  jsonPlaceholder: 'JSON value',
  fieldFallback: (name) => `Field ${name}`,
  option: (_field, value) => String(value),
  issue: (issue) => `Issue ${issue.field} ${issue.code}`,
  refresh: 'Refresh',
  reset: 'Reset parameters',
  execute: 'Execute command',
  executing: 'Executing',
  succeeded: 'Command succeeded',
  result: 'Command result',
  resultSummary: (command) => `${command} completed.`,
  technicalDetails: 'Technical details',
  loading: 'Loading commands',
  truncated: 'More commands are available.',
  unavailableReason: (code) => `Unavailable ${code}`,
  error: (code) => `Error ${code}`,
  kind: (kind) => `Kind ${kind}`,
  execution: (execution) => `Execution ${execution}`,
  scope: (scope) => `Scope ${scope}`,
}

test('app-react renders the controlled catalog and descriptor parameter form without owning command data', async () => {
  const runtime = createAppRuntime({
    instanceId: 'react-palette',
    hostId: 'host',
    directory: { execute: () => Promise.reject(new Error('unused')) },
    surfaces: { canRender: () => true },
  })
  try {
    await runtime.view.commands.execute('commandPalette.refresh', {})
    await runtime.view.commands.execute('commandPalette.setQuery', { query: 'app.openPanel' })
    let html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarCommandPalette labels={labels} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Command catalog')
    expect(html).toContain('app.openPanel')
    expect(html).toContain('Category app.navigation')
    expect(html).toContain('hbar-app-ui-controlled-commands')
    expect(html).not.toContain('Field panelId')

    await runtime.view.commands.execute('commandPalette.openCommand', { commandId: 'app.openPanel' })
    html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarCommandPalette labels={labels} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Field panelId')
    expect(html).toContain('Issue panelId required')
    expect(html).toContain('Execute command')
    expect(html).not.toContain('Workspace 1')

    await runtime.view.commands.execute('commandPalette.setParameter', { field: 'panelId', value: 'status' })
    await runtime.view.commands.execute('commandPalette.execute', {})
    html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarCommandPalette labels={labels} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Command succeeded')
    expect(html).toContain('app.openPanel completed.')
    expect(html).toContain('Technical details')
    expect(html).toContain('&quot;panelId&quot;: &quot;status&quot;')
  } finally {
    runtime.dispose()
  }
})

test('web host supplies localized command, category, field, and validation copy', () => {
  const chinese = getShellCopy('zh-CN').commandPalette
  const english = getShellCopy('en-US').commandPalette
  expect(chinese.resolve('commands.session.setBudget.title')).toBe('设置会话 Token 预算')
  expect(english.resolve('commands.session.setBudget.title')).toBe('Set session token budget')
  expect(chinese.category('model.budget')).toBe('模型与预算')
  expect(english.category('model.budget')).toBe('Models and budgets')
  expect(chinese.fieldFallback('tokens')).toBe('Token 上限')
  expect(english.fieldFallback('tokens')).toBe('Token limit')
  expect(english.issue({ field: 'tokens', code: 'required' })).toBe('This parameter is required.')
  expect(english.resolve('commands.plugin.dynamic.title')).toBe('commands.plugin.dynamic.title')
})
