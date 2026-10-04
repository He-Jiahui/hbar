import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarRuntimeProvider, HbarSystemDiagnostics } from '@hbar/app-react'
import type { SystemDiagnosis } from '@hbar/contracts/commands/system'
import { getShellCopy } from '../apps/web/src/shell-copy'

const report: SystemDiagnosis = {
  host: {
    version: '0.1.0',
    protocol: 2,
    instanceId: 'diagnostics-host',
    platform: 'win32',
    addresses: ['127.0.0.1:4317'],
    activeRuns: 1,
    demo: false,
  },
  database: { sessions: 12, events: 9 },
  recoveredRuns: 2,
  plugins: [],
  tools: ['read_file'],
  streams: 1,
}

const directory: CommandExecutor = {
  execute(name) {
    if (name === 'workspace.get' || name === 'session.get') return Promise.resolve(null)
    if (name === 'workspace.list' || name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
    return Promise.reject(new Error(`Unexpected directory query ${name}`))
  },
}

function fixture(system?: CommandExecutor) {
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: report.host.instanceId,
    directory,
    surfaces: { canRender: (id) => id === 'settings' },
    ...(system ? { system } : {}),
  })
  const open = (section = 'diagnostics') =>
    runtime.view.commands.execute('app.openSettings', { scope: 'global', section, instanceId: 'settings' })
  const refresh = () => runtime.view.commands.execute('systemDiagnostics.refresh', { instanceId: 'settings' })
  return { runtime, open, refresh }
}

test('read-only Host diagnosis is bound to the settings panel; failure preserves the confirmed snapshot and retry recovers', async () => {
  let calls = 0
  const system: CommandExecutor = {
    execute(name) {
      expect(name).toBe('system.diagnose')
      calls++
      if (calls === 2) return Promise.reject(new CommandError('DISCONNECTED', 'Host unavailable'))
      return Promise.resolve({ ...report, host: { ...report.host, activeRuns: calls } })
    },
  }
  const { runtime, open, refresh } = fixture(system)
  try {
    await runtime.ready
    await open()
    expect(await refresh()).toEqual({ status: 'ready', error: null })
    const first = runtime.view.state.diagnostics.getSnapshot().entries.settings
    expect(first).toMatchObject({ status: 'ready', report: { host: { activeRuns: 1 } }, error: null })
    expect(await refresh()).toEqual({ status: 'error', error: 'DISCONNECTED' })
    expect(runtime.view.state.diagnostics.getSnapshot().entries.settings).toMatchObject({
      status: 'error',
      report: { host: { activeRuns: 1 } },
      error: 'DISCONNECTED',
    })
    expect(await refresh()).toEqual({ status: 'ready', error: null })
    expect(runtime.view.state.diagnostics.getSnapshot().entries.settings).toMatchObject({
      status: 'ready',
      report: { host: { activeRuns: 3 } },
    })
    await open('providers')
    let rejected: unknown
    try {
      await refresh()
    } catch (reason) {
      rejected = reason
    }
    expect(rejected).toMatchObject({ code: 'COMMAND_NOT_FOUND' })
    expect(calls).toBe(3)
  } finally {
    runtime.dispose()
  }
})

test('late old diagnosis cannot update a different settings section or a new panel instance', async () => {
  let resolveRead: (value: SystemDiagnosis) => void = () => {}
  const system: CommandExecutor = {
    execute: () =>
      new Promise<SystemDiagnosis>((resolve) => {
        resolveRead = resolve
      }),
  }
  const { runtime, open, refresh } = fixture(system)
  try {
    await runtime.ready
    await open()
    const pending = refresh()
    expect(runtime.view.state.diagnostics.getSnapshot().entries.settings?.status).toBe('loading')
    await open('extensions')
    resolveRead(report)
    expect(await pending).toMatchObject({ status: 'error' })
    expect(runtime.view.state.diagnostics.getSnapshot().entries.settings?.report).toBeNull()
  } finally {
    runtime.dispose()
  }
})

test('missing Host capability and invalid output show local recoverable errors without invented facts', async () => {
  const missing = fixture()
  try {
    await missing.runtime.ready
    await missing.open()
    expect(await missing.refresh()).toEqual({ status: 'error', error: 'CAPABILITY_UNAVAILABLE' })
    expect(missing.runtime.view.state.diagnostics.getSnapshot().entries.settings?.report).toBeNull()
  } finally {
    missing.runtime.dispose()
  }
  const invalid = fixture({ execute: () => Promise.resolve({ ...report, recoveredRuns: -1 }) })
  try {
    await invalid.runtime.ready
    await invalid.open()
    expect(await invalid.refresh()).toEqual({ status: 'error', error: 'INVALID_OUTPUT' })
    expect(invalid.runtime.view.state.diagnostics.getSnapshot().entries.settings?.report).toBeNull()
  } finally {
    invalid.runtime.dispose()
  }
})

test('localized diagnostics render only actual Host values, bounded storage rows and safe long names', async () => {
  const values = Object.fromEntries(
    Array.from({ length: 15 }, (_, i) => [`${i}-very-long-storage-name-${'x'.repeat(120)}`, i]),
  )
  const target = { ...report, database: values }
  const { runtime, open, refresh } = fixture({ execute: () => Promise.resolve(target) })
  try {
    await runtime.ready
    await open()
    await refresh()
    for (const locale of ['zh-CN', 'en-US'] as const) {
      const labels = getShellCopy(locale).diagnostics
      const html = renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSystemDiagnostics instanceId="settings" connected labels={labels} />
        </HbarRuntimeProvider>,
      )
      expect(html).toContain(labels.title)
      expect(html).toContain(labels.number(2))
      expect(html).toContain(labels.moreStorageEntries(3))
      expect(html).not.toContain('127.0.0.1:4317')
      expect(html).not.toContain('logDirectory')
      expect((html.match(/hbar-system-diagnostics-value"/g) ?? []).length).toBe(4 + 5 + 12)
    }
  } finally {
    runtime.dispose()
  }
})
