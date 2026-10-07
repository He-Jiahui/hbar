import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarSettingsWorkspace } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import { HBAR_SETTINGS_DEFINITIONS, HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'
import { SchemaContentError } from '@hbar/schema-core'
import { resolveSettings } from '@hbar/settings-core'
import { getShellCopy } from '../apps/web/src/shell-copy'

async function fixture(mode: 'error' | 'missing_model' | 'model_unavailable' | 'ready') {
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'content-view-host',
    directory: {
      execute(name) {
        return Promise.reject(new Error(`Unexpected directory query: ${name}`))
      },
    },
    surfaces: { canRender: (id) => id === 'settings' },
    settings: {
      execute(name, input) {
        if (name === 'settings.describe') return Promise.resolve(HBAR_SETTINGS_DESCRIPTION)
        if (name !== 'settings.get') return Promise.reject(new Error(`Unexpected write: ${name}`))
        const { scope } = settingsCommands[name].input.parse(input)
        return Promise.resolve({
          schemaVersion: 1,
          scope,
          revisions: { 'settings:global': 1 },
          resolution: resolveSettings(HBAR_SETTINGS_DEFINITIONS, [
            { id: 'settings:global', kind: 'global', revision: 1, values: {} },
          ]),
        })
      },
    },
    schemaContent: {
      query(id, request) {
        if (mode === 'error') return Promise.reject(new SchemaContentError('READ_FAILED', 'Read fixture'))
        if (id === 'settings.getThinkingLevels' && mode !== 'ready')
          return Promise.resolve({ kind: 'options', status: 'unavailable', reasonCode: mode })
        return Promise.resolve({
          kind: 'options',
          status: 'ready',
          options: [],
          dependencyFingerprint: request.dependencyFingerprint,
          capabilityRevision: 'fixture-1',
        })
      },
    },
  })
  await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'model' })
  for (let count = 0; count < 100; count++) {
    const state = runtime.view.state.settings.getSnapshot()
    const form = state.activeFormId ? state.forms[state.activeFormId] : undefined
    if (form?.status === 'ready' && Object.values(form.content).every((value) => value.status !== 'loading'))
      return runtime
    await Bun.sleep(2)
  }
  await runtime.dispose()
  throw new Error('Settings content did not settle')
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`failed settings options have one localized recovery action, even for multiple failures: ${locale}`, async () => {
    const runtime = await fixture('error')
    const labels = getShellCopy(locale).settings
    const longRetry = `${labels.contentRecovery.retry} — ${'较长的恢复操作说明 '.repeat(12)}`
    try {
      const render = (connected: boolean) =>
        renderToStaticMarkup(
          <HbarRuntimeProvider view={runtime.view}>
            <HbarSettingsWorkspace
              labels={{ ...labels, contentRecovery: { ...labels.contentRecovery, retry: longRetry } }}
              connected={connected}
            />
          </HbarRuntimeProvider>,
        )
      const markup = render(true)
      expect(markup.match(/class="hbar-settings-content-recovery"/g)).toHaveLength(1)
      expect(markup).toContain(longRetry)
      expect(markup).toContain(labels.form.contentError('READ_FAILED'))
      expect(markup).not.toContain('READ_FAILED')
      expect(markup).not.toContain(labels.contentRecovery.offline)
      const offline = render(false)
      expect(offline).toContain(labels.contentRecovery.offline)
      expect(offline).toMatch(/class="hbar-settings-content-recovery"[^>]*><button[^>]*disabled=""/)
    } finally {
      await runtime.dispose()
    }
  })

  for (const reason of ['missing_model', 'model_unavailable'] as const) {
    test(`unavailable thinking options explain the next step without a network retry: ${locale}/${reason}`, async () => {
      const runtime = await fixture(reason)
      const labels = getShellCopy(locale).settings
      try {
        const markup = renderToStaticMarkup(
          <HbarRuntimeProvider view={runtime.view}>
            <HbarSettingsWorkspace labels={labels} connected />
          </HbarRuntimeProvider>,
        )
        expect(markup).toContain(labels.form.unavailable(reason))
        expect(markup).not.toContain(reason)
        expect(markup).not.toContain('hbar-settings-content-recovery')
        const thinking = (markup.match(/<[^>]+>/g) ?? []).filter(
          (tag) => tag.includes('role="radiogroup"') && / id="[^"]*thinkingLevel"/.test(tag),
        )
        expect(thinking).toHaveLength(1)
        expect(thinking[0]).toContain('aria-disabled="true"')
        expect(thinking[0]).toMatch(/aria-describedby="[^"]*thinkingLevel-content/)
      } finally {
        await runtime.dispose()
      }
    })
  }
}

test('a ready empty option list does not gain a recovery action', async () => {
  const runtime = await fixture('ready')
  try {
    const markup = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSettingsWorkspace labels={getShellCopy('zh-CN').settings} connected />
      </HbarRuntimeProvider>,
    )
    expect(markup).not.toContain('hbar-settings-content-recovery')
  } finally {
    await runtime.dispose()
  }
})
