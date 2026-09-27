import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarExtensionWorkspace, HbarRuntimeProvider, type HbarExtensionWorkspaceLabels } from '@hbar/app-react'
import { createAppRuntime, type ExtensionWorkspaceEntryState, type StateReader } from '@hbar/app-runtime'
import type { PluginInfo, SkillDescriptor } from '@hbar/contracts/commands/extensions'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { extensionCollectionCopy } from '../apps/web/src/extension-collection-copy'

type Collection = ExtensionWorkspaceEntryState['collections']['plugins']
const plugin: PluginInfo = {
  id: 'collection-plugin',
  name: 'Collection plugin',
  version: '1.0.0',
  required: false,
  status: 'active',
  provides: [],
  requires: [],
  description: 'Successful plugin read',
  config: {},
}
const skill: SkillDescriptor = { id: 'collection-skill', path: 'D:/fixture/skill', scope: 'global' }
function collection(status: Collection['status'], hasSnapshot = false, requestInFlight = false): Collection {
  return { status, hasSnapshot, requestInFlight, error: status === 'error' ? 'PRIVATE_READ_ERROR' : null }
}
function entry(overrides: Partial<ExtensionWorkspaceEntryState> = {}): ExtensionWorkspaceEntryState {
  return {
    instanceId: 'fixture-panel',
    status: 'ready',
    plugins: [plugin],
    skills: [skill],
    collections: { plugins: collection('ready', true), skills: collection('ready', true) },
    actions: {},
    error: null,
    query: '',
    pluginPage: 0,
    skillPage: 0,
    selectedPluginId: null,
    detail: null,
    ...overrides,
  }
}
function reader<Value>(snapshot: Value): StateReader<Value> {
  return { getSnapshot: () => snapshot, subscribe: () => () => {} }
}
function render(
  value: ExtensionWorkspaceEntryState | undefined,
  locale: ShellLocale = 'en-US',
  connected = true,
  customLabels?: HbarExtensionWorkspaceLabels,
) {
  const runtime = createAppRuntime({
    hostId: 'fixture-host',
    instanceId: 'collection-view',
    directory: { execute: async () => ({ items: [], nextCursor: null }) },
  })
  const labels = customLabels ?? { ...getShellCopy(locale).extensions, collections: extensionCollectionCopy(locale) }
  try {
    const view = {
      ...runtime.view,
      state: {
        ...runtime.view.state,
        extensions: reader({ entries: value ? { [value.instanceId]: value } : {} }),
      },
    }
    return {
      labels,
      html: renderToStaticMarkup(
        <HbarRuntimeProvider view={view}>
          <HbarExtensionWorkspace labels={labels} connected={connected} instanceId="fixture-panel" />
        </HbarRuntimeProvider>,
      ),
    }
  } finally {
    runtime.dispose()
  }
}
function button(html: string, label: string) {
  const found = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find((item) => item.includes(label))
  expect(found).toBeDefined()
  return found ?? ''
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`${locale}: a failed Skills read keeps successful Plugins visible without false empty counts or raw errors`, () => {
    const { html, labels } = render(
      entry({
        status: 'error',
        skills: [],
        error: 'PRIVATE_READ_ERROR',
        collections: { plugins: collection('ready', true), skills: collection('error') },
      }),
      locale,
    )
    expect(html).toContain(plugin.name)
    expect(html).toContain(labels.pluginCount(1))
    expect(html).not.toContain(labels.noPlugins)
    expect(html).not.toContain(labels.noSkills)
    expect(html).not.toContain(labels.skillCount(0))
    expect(html).not.toContain('PRIVATE_READ_ERROR')
    expect(html).toContain(labels.collections.skills.error('PRIVATE_READ_ERROR'))
    expect(html.match(/role="alert"/g)).toHaveLength(1)
    expect(button(html, labels.collections.skills.retry)).not.toContain('disabled=""')
    expect(html).not.toContain(labels.collections.plugins.retry)
    expect(button(html, labels.disable)).not.toContain('disabled=""')
  })

  test(`${locale}: a failed Plugins read leaves successful Skills visible and retry scoped to Plugins`, () => {
    const { html, labels } = render(
      entry({
        status: 'error',
        plugins: [],
        collections: { plugins: collection('error'), skills: collection('ready', true) },
      }),
      locale,
    )
    expect(html).toContain(skill.id)
    expect(html).toContain(labels.skillCount(1))
    expect(html).not.toContain(labels.pluginCount(0))
    expect(html).not.toContain(labels.noPlugins)
    expect(button(html, labels.collections.plugins.retry)).not.toContain('disabled=""')
    expect(html).not.toContain(labels.collections.skills.retry)
  })

  test(`${locale}: fresh loading is local to each collection, never a confirmed empty collection`, () => {
    const { html, labels } = render(undefined, locale)
    expect(html).toContain(labels.collections.plugins.loading)
    expect(html).toContain(labels.collections.skills.loading)
    expect(html).not.toContain(labels.pluginCount(0))
    expect(html).not.toContain(labels.skillCount(0))
    expect(html).not.toContain(labels.noPlugins)
    expect(html).not.toContain(labels.noSkills)
  })

  test(`${locale}: ready empty snapshots alone display real zero counts and empty states`, () => {
    const { html, labels } = render(entry({ plugins: [], skills: [] }), locale)
    expect(html).toContain(labels.pluginCount(0))
    expect(html).toContain(labels.skillCount(0))
    expect(html).toContain(labels.noPlugins)
    expect(html).toContain(labels.noSkills)
    expect(html.match(/role="heading"[^>]*aria-level="3"[^>]*tabindex="-1"/gi)).toHaveLength(2)
    expect(html).not.toContain(labels.collections.plugins.stale)
    expect(html).not.toContain(labels.collections.skills.retry)
  })
}

for (const status of ['idle', 'loading', 'error'] as const) {
  test(`${status}: snapshots remain readable but explicitly old; no-snapshot arrays are not trusted`, () => {
    const old = render(entry({ collections: { plugins: collection(status, true), skills: collection(status, true) } }))
    expect(old.html).toContain(plugin.name)
    expect(old.html).toContain(skill.id)
    expect(old.html).toContain(old.labels.collections.plugins.stale)
    expect(old.html).toContain(old.labels.collections.skills.stale)
    const unverified = render(entry({ collections: { plugins: collection(status), skills: collection(status) } }))
    expect(unverified.html).not.toContain(plugin.name)
    expect(unverified.html).not.toContain(skill.id)
    expect(unverified.html).not.toContain(unverified.labels.pluginCount(0))
    expect(unverified.html).not.toContain(unverified.labels.skillCount(0))
    const empty = render(
      entry({
        plugins: [],
        skills: [],
        collections: { plugins: collection(status, true), skills: collection(status, true) },
      }),
    )
    expect(empty.html).not.toContain(empty.labels.noPlugins)
    expect(empty.html).not.toContain(empty.labels.noSkills)
    expect(empty.html).toContain(empty.labels.collections.plugins.stale)
  })
}

test('physical read holds disable a single collection retry; offline keeps the same honest failure', () => {
  const value = entry({ collections: { plugins: collection('ready', true), skills: collection('error', true, true) } })
  const busy = render(value)
  const retry = button(busy.html, busy.labels.collections.skills.loading)
  expect(retry).toContain('disabled=""')
  expect(retry).toContain('aria-busy="true"')
  expect(busy.html).toContain(busy.labels.collections.skills.error('PRIVATE_READ_ERROR'))
  const offline = render(
    entry({ collections: { plugins: collection('ready', true), skills: collection('error') } }),
    'en-US',
    false,
  )
  expect(button(offline.html, offline.labels.collections.skills.retry)).toContain('disabled=""')
  expect(offline.html).not.toContain(offline.labels.noSkills)
})

test('a slow Skills read never disables independent plugin detail or enable controls', () => {
  const value = entry({
    status: 'loading',
    collections: { plugins: collection('ready', true), skills: collection('loading', true, true) },
  })
  const list = render(value)
  expect(button(list.html, list.labels.inspect(plugin.name))).not.toContain('disabled=""')
  expect(button(list.html, list.labels.disable)).not.toContain('disabled=""')
  const detail = render({
    ...value,
    selectedPluginId: plugin.id,
    detail: { pluginId: plugin.id, status: 'ready', plugin, error: null },
  })
  expect(button(detail.html, detail.labels.detail.actions.disable)).not.toContain('disabled=""')
  expect(button(detail.html, detail.labels.detail.retry)).not.toContain('disabled=""')
})

test('plugin reads retain the original unknown action lock rather than exposing another enable write', () => {
  const value = entry({
    actions: { [plugin.id]: { status: 'unknown', error: 'RESULT_UNKNOWN' } },
    collections: { plugins: collection('error', true), skills: collection('ready', true) },
  })
  const list = render(value)
  expect(list.html).toContain(list.labels.detail.actions.unknown)
  expect(list.html).not.toContain(`>${list.labels.disable}<`)
  expect(list.html).toContain(list.labels.detail.actions.readCurrent)
  const detail = render({ ...value, detail: { pluginId: plugin.id, status: 'ready', plugin, error: null } })
  expect(detail.html).toContain(detail.labels.detail.actions.unknown)
  expect(detail.html).not.toContain(`>${detail.labels.detail.actions.disable}<`)
})

for (const count of [1, 20, 21]) {
  test(`${count} confirmed plugin records retain the existing 20-row page bound during sibling failure`, () => {
    const plugins = Array.from({ length: count }, (_, index) => ({
      ...plugin,
      id: `plugin-${index}`,
      name: `Plugin ${index}`,
    }))
    const first = render(
      entry({ plugins, collections: { plugins: collection('ready', true), skills: collection('error') } }),
    )
    expect(first.html.match(/data-plugin-id=/g)).toHaveLength(Math.min(count, 20))
    expect(first.html).toContain(first.labels.pluginCount(count))
    if (count === 21) {
      const second = render(
        entry({
          plugins,
          pluginPage: 1,
          collections: { plugins: collection('ready', true), skills: collection('error') },
        }),
      )
      expect(second.html.match(/data-plugin-id=/g)).toHaveLength(1)
      expect(second.html).toContain('Plugin 20')
    }
  })
}

test('filters distinguish confirmed no-match from a stale empty projection and long localized copy is preserved', () => {
  const value = entry({ query: 'no-result' })
  const ready = render(value, 'zh-CN')
  expect(ready.html).toContain(ready.labels.noMatches)
  const long =
    '上次读取的技能目录仍保留，但当前读取尚未完成；请确认连接并使用此集合的重试入口，不会更改其他集合或插件状态。'
  const labels = {
    ...ready.labels,
    collections: { ...ready.labels.collections, skills: { ...ready.labels.collections.skills, stale: long } },
  }
  const stale = render(
    { ...value, collections: { plugins: collection('error', true), skills: collection('error', true) } },
    'zh-CN',
    true,
    labels,
  )
  expect(stale.html).toContain(long)
  expect(stale.html).not.toContain(stale.labels.noMatches)
  expect(stale.html).not.toContain('PRIVATE_READ_ERROR')
})

test('long skill identity and Host path use a dedicated content column beside the complete status', () => {
  const longSkill: SkillDescriptor = {
    id: 'fixture-skill-001-long-local-name-with-unbroken-identity',
    path: 'D:/isolated-host/data/skills/global/fixture-skill-001-long-local-name-with-unbroken-identity',
    scope: 'global',
  }
  const { html, labels } = render(entry({ skills: [longSkill] }))
  expect(html).toContain(longSkill.id)
  expect(html).toContain(longSkill.path)
  expect(html).toContain(labels.discovered)
  expect(html.match(/class="hbar-app-react-extension-skill-content"/g)).toHaveLength(1)
  expect(html).toContain('hbar-app-react-extension-skill-status')
})
