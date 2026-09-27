import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime, type ExtensionWorkspaceEntryState, type StateReader } from '@hbar/app-runtime'
import { HbarExtensionWorkspace, HbarRuntimeProvider, type HbarExtensionWorkspaceLabels } from '@hbar/app-react'
import type { PluginInfo, SkillDescriptor } from '@hbar/contracts/commands/extensions'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { extensionNavigationCopy } from '../apps/web/src/extension-navigation-copy'

type Collection = 'plugins' | 'skills'
const plugin: PluginInfo = {
  id: 'navigation-plugin',
  name: 'Navigation plugin',
  version: '1.0.0',
  required: false,
  status: 'active',
  provides: [],
  requires: [],
  description: 'Plugin facts',
  config: {},
}
const skill: SkillDescriptor = { id: 'navigation-skill', path: 'D:/fixture/skills/navigation', scope: 'global' }
function entry(overrides: Partial<ExtensionWorkspaceEntryState> = {}): ExtensionWorkspaceEntryState {
  return {
    instanceId: 'navigation-panel',
    status: 'ready',
    plugins: [plugin],
    skills: [skill],
    collections: {
      plugins: { status: 'ready', hasSnapshot: true, error: null, requestInFlight: false },
      skills: { status: 'ready', hasSnapshot: true, error: null, requestInFlight: false },
    },
    queries: { plugins: '', skills: '' },
    pluginPage: 0,
    skillPage: 0,
    actions: {},
    error: null,
    selectedPluginId: null,
    detail: null,
    ...overrides,
  }
}
function reader<Value>(value: Value): StateReader<Value> {
  return { getSnapshot: () => value, subscribe: () => () => {} }
}
function render(
  value: ExtensionWorkspaceEntryState | undefined,
  collection?: Collection,
  locale: ShellLocale = 'en-US',
  customLabels?: HbarExtensionWorkspaceLabels,
) {
  const runtime = createAppRuntime({
    hostId: 'fixture-host',
    instanceId: 'navigation-view',
    directory: { execute: async () => ({ items: [], nextCursor: null }) },
  })
  const labels = customLabels ?? { ...getShellCopy(locale).extensions, navigation: extensionNavigationCopy(locale) }
  try {
    const view = {
      ...runtime.view,
      state: { ...runtime.view.state, extensions: reader({ entries: value ? { [value.instanceId]: value } : {} }) },
    }
    return {
      labels,
      html: renderToStaticMarkup(
        <HbarRuntimeProvider view={view}>
          <HbarExtensionWorkspace
            labels={labels}
            instanceId="navigation-panel"
            connected
            {...(collection ? { collection } : {})}
          />
        </HbarRuntimeProvider>,
      ),
    }
  } finally {
    runtime.dispose()
  }
}
function button(html: string, label: string) {
  const result = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find((node) => node.includes(label))
  expect(result).toBeDefined()
  return result ?? ''
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const collection of ['plugins', 'skills'] as const) {
    test(`${locale}: ${collection} has one focusable title and only its own list, filter and actions`, () => {
      const { html, labels } = render(entry(), collection, locale)
      expect(html).toContain(labels.navigation[collection].title)
      expect(html).toContain(labels.navigation[collection].description)
      expect(html).toContain(labels.navigation[collection].filter)
      expect(html).not.toContain(labels.hostWide)
      expect(html.match(/role="heading"/g)).toHaveLength(1)
      expect(html).toMatch(/role="heading"[^>]*aria-level="2"[^>]*tabindex="-1"/)
      expect(html.match(/data-extension-collection=/g)).toHaveLength(1)
      expect(html).toContain(`data-extension-collection="${collection}"`)
      expect(html).not.toContain(`class="hbar-app-react-extension-section" aria-label=`)
      expect(html).toContain(collection === 'plugins' ? plugin.name : skill.id)
      expect(html).not.toContain(collection === 'plugins' ? skill.id : plugin.name)
      if (collection === 'skills') {
        expect(html).not.toContain(labels.openSystemCommands)
        expect(html).not.toContain('hbar-app-react-extension-plugin')
        expect(html).toContain(labels.skillScope)
      } else expect(html).toContain(labels.openSystemCommands)
    })
  }
  test(`${locale}: current read failure remains local, not another collection's status or false empty`, () => {
    const value = entry({
      status: 'error',
      collections: {
        plugins: { status: 'loading', hasSnapshot: true, error: null, requestInFlight: true },
        skills: { status: 'error', hasSnapshot: false, error: 'PRIVATE_PATH_FAILURE', requestInFlight: false },
      },
    })
    const { html, labels } = render(value, 'skills', locale)
    expect(html).toContain(labels.collections.skills.error('PRIVATE_PATH_FAILURE'))
    expect(html).not.toContain('PRIVATE_PATH_FAILURE')
    expect(html).not.toContain(labels.collections.plugins.loading)
    expect(html).not.toContain(labels.noSkills)
    expect(html).not.toContain(labels.skillCount(0))
    expect(button(html, labels.refresh)).not.toContain('disabled=""')
    expect(button(html, labels.collections.skills.retry)).not.toContain('disabled=""')
  })
}

test('the legacy combined consumer keeps both collections, shared filter and diagnostic action', () => {
  const { html, labels } = render(entry())
  expect(html).toContain(labels.title)
  expect(html).toContain(labels.description)
  expect(html).toContain(labels.hostWide)
  expect(html).toContain(labels.filter)
  expect(html).toContain(plugin.name)
  expect(html).toContain(skill.id)
  expect(html).toContain(labels.openSystemCommands)
  expect(html.match(/role="heading"/g)).toHaveLength(3)
  expect(html.match(/data-extension-collection=/g)).toHaveLength(2)
})

test('retained plugin detail and unknown action are absent on Skills and unchanged on Plugins return', () => {
  const value = entry({
    selectedPluginId: plugin.id,
    detail: { pluginId: plugin.id, status: 'ready', plugin, error: null },
    actions: { [plugin.id]: { status: 'unknown', error: 'RESULT_UNKNOWN' } },
  })
  const original = render(value, 'plugins')
  const skills = render(value, 'skills')
  const returned = render(value, 'plugins')
  expect(skills.html).toContain(skill.id)
  expect(skills.html).not.toContain('hbar-app-react-plugin-detail-navigation')
  expect(skills.html).not.toContain(skills.labels.detail.actions.unknown)
  expect(skills.html).not.toContain('hidden=""')
  expect(returned.html).toEqual(original.html)
  expect(returned.html).toContain(returned.labels.detail.actions.unknown)
  expect(returned.html).toContain(returned.labels.detail.actions.readCurrent)
  expect(value.detail?.pluginId).toBe(plugin.id)
})

test('filters read their canonical collection query without contaminating the other list', () => {
  const value = entry({ queries: { plugins: 'not-a-plugin', skills: 'navigation-skill' } })
  const plugins = render(value, 'plugins')
  const skills = render(value, 'skills')
  expect(plugins.html).toContain('value="not-a-plugin"')
  expect(plugins.html).toContain(plugins.labels.noMatches)
  expect(plugins.html).not.toContain(plugin.name)
  expect(skills.html).toContain('value="navigation-skill"')
  expect(skills.html).toContain(skill.id)
  expect(skills.html).not.toContain(skills.labels.noMatches)
})

for (const count of [0, 1, 20, 21]) {
  test(`${count} Skills: only the current bounded page and confirmed empty state are rendered`, () => {
    const skills = Array.from({ length: count }, (_, index) => ({ ...skill, id: `skill-${index}` }))
    const value = entry({ skills, skillPage: count > 20 ? 1 : 0, pluginPage: 4 })
    const { html, labels } = render(value, 'skills')
    expect(html.match(/class="hbar-app-react-extension-skill-content"/g) ?? []).toHaveLength(count > 20 ? 1 : count)
    expect(html).toContain(labels.skillCount(count))
    expect(html).not.toContain(plugin.name)
    if (count === 0) expect(html).toContain(labels.noSkills)
    if (count > 20) {
      expect(html).toContain('skill-20')
      expect(html).not.toContain('>skill-0<')
      expect(html).toContain(labels.pagination.page(2, 2, count))
    }
  })
}

test('a missing entry shows only current collection loading; long localized copy remains whole', () => {
  const base = getShellCopy('zh-CN').extensions
  const long = '这是由宿主提供的较长技能分类标题，用于检验窄屏自然换行且不会改变插件查询或操作目标'
  const labels = {
    ...base,
    navigation: { ...base.navigation, skills: { title: long, description: long, filter: long } },
  }
  const { html } = render(undefined, 'skills', 'zh-CN', labels)
  expect(html).toContain(long)
  expect(html).toContain(labels.collections.skills.loading)
  expect(html).not.toContain(labels.collections.plugins.loading)
  expect(html).not.toContain(labels.noSkills)
  expect(html).not.toContain(labels.skillCount(0))
})

test('stale selected plugin IDs do not fabricate a detail or alter the existing filter/page', () => {
  const value = entry({ selectedPluginId: 'removed-plugin', queries: { plugins: 'navigation', skills: '' } })
  const { html } = render(value, 'plugins')
  expect(html).toContain(plugin.name)
  expect(html).toContain('value="navigation"')
  expect(html).not.toContain('aria-current="true"')
  expect(html).not.toContain('hbar-app-react-plugin-detail-navigation')
  expect(value.pluginPage).toBe(0)
  expect(value.selectedPluginId).toBe('removed-plugin')
})
