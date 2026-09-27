import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { z } from 'zod'
import { HbarCommandPalette, HbarRuntimeProvider, HbarSettingsWorkspace, HbarStatusWorkspace } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarClient } from '@hbar/client'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import type { WorkspaceDisplayNamesSnapshot } from '@hbar/contracts/commands/workspace-display-names'
import { HBAR_SETTINGS_DEFINITIONS, HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'
import { encodePath } from '@hbar/schema-core'
import { resolveSettings } from '@hbar/settings-core'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { WorkspaceTabsController } from '../apps/web/src/WorkspaceTabsController'

const workspaceA: Workspace = { id: 'workspace-a', name: 'Canonical Z', path: 'D:/real/project-a', createdAt: 1 }
const workspaceB: Workspace = { id: 'workspace-b', name: 'Canonical A', path: 'D:/real/project-b', createdAt: 2 }
// Deliberately reverse ID order so equal aliases cannot accidentally pass by insertion order.
const workspaces = [workspaceB, workspaceA]
const sessionA: Session = {
  id: 'session-a',
  workspaceId: workspaceA.id,
  title: 'Real session A',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 0,
}
const sessionB: Session = { ...sessionA, id: 'session-b', workspaceId: workspaceB.id, title: 'Real session B' }
const sessions = [sessionA, sessionB]
const modelField = encodePath([{ kind: 'field', name: 'provider.model' }])

async function fixture(withAliases = true) {
  let snapshot: WorkspaceDisplayNamesSnapshot = { schemaVersion: 1, revision: 0, entries: [] }
  const reads: string[] = []
  const directory: CommandExecutor = {
    execute(name, raw) {
      const target = z.object({ workspaceId: z.string().optional(), sessionId: z.string().optional() }).parse(raw)
      if (name === 'workspace.list') return Promise.resolve({ items: workspaces, nextCursor: null })
      if (name === 'workspace.get')
        return Promise.resolve(workspaces.find((item) => item.id === target.workspaceId) ?? null)
      if (name === 'session.list')
        return Promise.resolve({
          items: sessions.filter((item) => !target.workspaceId || item.workspaceId === target.workspaceId),
          nextCursor: null,
        })
      if (name === 'session.get') return Promise.resolve(sessions.find((item) => item.id === target.sessionId) ?? null)
      return Promise.reject(new Error(`Unexpected directory query: ${name}`))
    },
  }
  const aliases: CommandExecutor = {
    execute(name) {
      reads.push(name)
      if (name === 'workspaceDisplayNames.get') return Promise.resolve(snapshot)
      return Promise.reject(new Error(`Unexpected alias mutation: ${name}`))
    },
  }
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'consumer-host',
    directory,
    ...(withAliases ? { workspaceDisplayNames: { commands: aliases } } : {}),
    settings: {
      execute(name, raw) {
        if (name === 'settings.describe') return Promise.resolve(HBAR_SETTINGS_DESCRIPTION)
        if (name !== 'settings.get') return Promise.reject(new Error(`Unexpected settings write: ${name}`))
        const scope = settingsCommands[name].input.parse(raw).scope
        const layers = [{ id: 'settings:global', kind: 'global', revision: 1, values: {} }]
        return Promise.resolve(
          settingsCommands[name].output.parse({
            schemaVersion: 1,
            scope,
            revisions: { 'settings:global': 1 },
            resolution: resolveSettings(HBAR_SETTINGS_DEFINITIONS, layers),
          }),
        )
      },
    },
    git: {
      execute(name) {
        reads.push(name)
        return Promise.reject(new CommandError('CAPABILITY_UNAVAILABLE', 'Read-only fixture has no Git repository'))
      },
    },
    surfaces: { canRender: () => true },
  })
  await runtime.ready
  await runtime.view.commands.execute('workspace.list', { limit: 100 })
  for (const session of sessions)
    await runtime.view.commands.execute('app.setSession', { workspaceId: session.workspaceId, sessionId: session.id })
  await runtime.view.commands.execute('app.setSession', { workspaceId: workspaceA.id, sessionId: sessionA.id })
  if (withAliases) {
    for (
      let attempt = 0;
      attempt < 100 && runtime.view.state.workspaceDisplayNames.getSnapshot().status === 'loading';
      attempt++
    )
      await Bun.sleep(2)
    await runtime.view.commands.execute('workspaceAlias.refresh', {})
  }
  return {
    runtime,
    reads,
    async replace(entries: WorkspaceDisplayNamesSnapshot['entries']) {
      snapshot = { schemaVersion: 1, revision: snapshot.revision + 1, entries }
      await runtime.view.commands.execute('workspaceAlias.refresh', {})
    },
  }
}

async function options(html: string, select: string) {
  const result: { value: string | null; text: string; selected: boolean }[] = []
  await new HTMLRewriter()
    .on(`${select} option`, {
      element(element) {
        result.push({ value: element.getAttribute('value'), text: '', selected: element.hasAttribute('selected') })
      },
      text(chunk) {
        const current = result.at(-1)
        if (current) current.text += chunk.text
      },
    })
    .transform(new Response(html))
    .text()
  return result
}

function palette(runtime: ReturnType<typeof createAppRuntime>, locale: ShellLocale) {
  return renderToStaticMarkup(
    <HbarRuntimeProvider view={runtime.view}>
      <HbarCommandPalette labels={getShellCopy(locale).commandPalette} connected />
    </HbarRuntimeProvider>,
  )
}

async function openPalette(
  runtime: ReturnType<typeof createAppRuntime>,
  commandId: 'app.setWorkspace' | 'app.setSession',
) {
  await runtime.view.commands.execute('commandPalette.refresh', {})
  await runtime.view.commands.execute('commandPalette.openCommand', { commandId })
}

test('legacy null and confirmed empty alias snapshots both render canonical project names and real paths', async () => {
  for (const available of [false, true]) {
    const f = await fixture(available)
    try {
      expect(f.runtime.view.state.workspaceDisplayNameSnapshot.getSnapshot()).toEqual(
        available ? { schemaVersion: 1, revision: 0, entries: [] } : null,
      )
      await openPalette(f.runtime, 'app.setWorkspace')
      const choices = (await options(palette(f.runtime, 'en-US'), '#hbar-command-workspaceId')).filter((item) =>
        workspaces.some((workspace) => workspace.id === item.value),
      )
      expect(choices.map((item) => item.value)).toEqual([workspaceB.id, workspaceA.id])
      const copy = getShellCopy('en-US').commandPalette
      expect(choices.map((item) => item.text)).toEqual([
        copy.workspaceOption(workspaceB.name, workspaceB.path),
        copy.workspaceOption(workspaceA.name, workspaceA.path),
      ])
      expect(f.runtime.view.state.directory.getSnapshot().workspaces[workspaceA.id]).toEqual(workspaceA)
    } finally {
      f.runtime.dispose()
    }
  }
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`${locale}: command choices project aliases, preserve real IDs and captured parameters through rename/reset`, async () => {
    const f = await fixture()
    const { runtime } = f
    try {
      await openPalette(runtime, 'app.setWorkspace')
      await runtime.view.commands.execute('commandPalette.setParameter', { field: 'workspaceId', value: workspaceB.id })
      const draft = runtime.view.state.commandPalette.getSnapshot().draft
      const navigation = runtime.view.state.navigation.getSnapshot()
      const alias = '同名项目 — Equal project aliases'
      await f.replace(workspaces.map((workspace) => ({ workspaceId: workspace.id, displayName: alias })))
      let choices = (await options(palette(runtime, locale), '#hbar-command-workspaceId')).filter((item) =>
        workspaces.some((workspace) => workspace.id === item.value),
      )
      expect(choices.map((item) => item.value)).toEqual([workspaceA.id, workspaceB.id])
      expect(choices.map((item) => item.text)).toEqual([
        getShellCopy(locale).commandPalette.workspaceOption(alias, workspaceA.path),
        getShellCopy(locale).commandPalette.workspaceOption(alias, workspaceB.path),
      ])
      expect(choices.find((item) => item.selected)?.value).toBe(workspaceB.id)
      expect(runtime.view.state.commandPalette.getSnapshot().draft).toBe(draft)
      expect(runtime.view.state.navigation.getSnapshot()).toBe(navigation)

      await f.replace([{ workspaceId: workspaceA.id, displayName: 'A new display caption' }])
      choices = (await options(palette(runtime, locale), '#hbar-command-workspaceId')).filter((item) =>
        workspaces.some((workspace) => workspace.id === item.value),
      )
      expect(choices.map((item) => item.value)).toEqual([workspaceA.id, workspaceB.id])
      expect(choices.find((item) => item.value === workspaceB.id)?.text).toBe(
        getShellCopy(locale).commandPalette.workspaceOption(workspaceB.name, workspaceB.path),
      )
      expect(runtime.view.state.commandPalette.getSnapshot().draft).toBe(draft)

      await openPalette(runtime, 'app.setSession')
      const sessionChoices = await options(palette(runtime, locale), '#hbar-command-sessionId')
      expect(sessionChoices.find((item) => item.value === sessionA.id)?.text).toBe(
        getShellCopy(locale).commandPalette.sessionOption(sessionA.title, 'A new display caption'),
      )
      await f.replace([])
      const resetChoices = await options(palette(runtime, locale), '#hbar-command-sessionId')
      expect(resetChoices.find((item) => item.value === sessionA.id)?.text).toBe(
        getShellCopy(locale).commandPalette.sessionOption(sessionA.title, workspaceA.name),
      )
      expect(runtime.view.state.directory.getSnapshot().workspaces[workspaceA.id]).toEqual(workspaceA)
      expect(runtime.view.state.navigation.getSnapshot()).toBe(navigation)
    } finally {
      runtime.dispose()
    }
  })
}

test('pinned settings use the original project alias and keep schema draft, scope, panel and active session intact', async () => {
  const f = await fixture()
  const { runtime } = f
  try {
    const panel = await runtime.view.commands.execute('app.openSettings', {
      binding: 'pinned',
      workspaceId: workspaceB.id,
      scope: 'workspace',
      targetId: workspaceB.id,
    })
    for (let attempt = 0; attempt < 100; attempt++) {
      const settings = runtime.view.state.settings.getSnapshot()
      if (settings.activeFormId && settings.forms[settings.activeFormId]?.status === 'ready') break
      await Bun.sleep(2)
    }
    const before = runtime.view.state.settings.getSnapshot()
    const formId = before.activeFormId
    if (!formId) throw new Error('Settings form missing')
    await runtime.view.commands.execute('settingsForm.setField', {
      formId,
      field: modelField,
      value: 'original-unsaved-model',
    })
    const captured = runtime.view.state.settings.getSnapshot().forms[formId]
    const navigation = runtime.view.state.navigation.getSnapshot()
    const surface = runtime.view.state.surfaces.getSnapshot().panels[panel.instanceId]
    const alias = '原目标 B：很长的项目显示名称和真实范围说明'
    await f.replace([
      { workspaceId: workspaceA.id, displayName: 'Active A alias' },
      { workspaceId: workspaceB.id, displayName: alias },
    ])
    const render = () =>
      renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSettingsWorkspace labels={getShellCopy('zh-CN').settings} connected />
        </HbarRuntimeProvider>,
      )
    let html = render()
    expect(html).toContain(getShellCopy('zh-CN').settings.title('workspace', alias))
    expect(html).toContain(getShellCopy('zh-CN').settings.scopeOption('workspace', alias))
    expect(html).not.toContain('Active A alias')
    expect(runtime.view.state.settings.getSnapshot().forms[formId]).toBe(captured)
    expect(captured?.form?.draft[modelField]).toBe('original-unsaved-model')
    await f.replace([])
    html = render()
    expect(html).toContain(getShellCopy('zh-CN').settings.title('workspace', workspaceB.name))
    expect(runtime.view.state.settings.getSnapshot().forms[formId]).toBe(captured)
    expect(runtime.view.state.surfaces.getSnapshot().panels[panel.instanceId]).toBe(surface)
    expect(runtime.view.state.navigation.getSnapshot()).toBe(navigation)
  } finally {
    runtime.dispose()
  }
})

test('Git project options use stable alias sorting without changing repository targets or issuing new reads', async () => {
  const f = await fixture()
  const { runtime } = f
  try {
    const panel = await runtime.view.commands.execute('app.openStatus', { section: 'git' })
    let failure: unknown
    try {
      await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
    } catch (reason) {
      failure = reason
    }
    expect(failure).toBeInstanceOf(CommandError)
    const status = runtime.view.state.status.getSnapshot().entries[panel.instanceId]
    const gitReads = f.reads.filter((name) => name.startsWith('git.'))
    await f.replace(workspaces.map((workspace) => ({ workspaceId: workspace.id, displayName: '同名 Git project' })))
    const render = () =>
      renderToStaticMarkup(
        <HbarRuntimeProvider view={runtime.view}>
          <HbarStatusWorkspace labels={getShellCopy('zh-CN').status} />
        </HbarRuntimeProvider>,
      )
    let choices = await options(render(), '#hbar-status-git-repository')
    expect(choices.map((item) => item.value)).toEqual([workspaceA.id, workspaceB.id])
    expect(choices.map((item) => item.text)).toEqual([
      getShellCopy('zh-CN').status.git.workspaceOption('同名 Git project', workspaceA.path),
      getShellCopy('zh-CN').status.git.workspaceOption('同名 Git project', workspaceB.path),
    ])
    expect(choices.find((item) => item.selected)?.value).toBe(workspaceA.id)
    await f.replace([])
    choices = await options(render(), '#hbar-status-git-repository')
    expect(choices.map((item) => item.value)).toEqual([workspaceB.id, workspaceA.id])
    expect(runtime.view.state.status.getSnapshot().entries[panel.instanceId]).toBe(status)
    expect(f.reads.filter((name) => name.startsWith('git.'))).toEqual(gitReads)
  } finally {
    runtime.dispose()
  }
})

test('workspace tab project captions update and reset without replacing real session titles or tab lifetimes', async () => {
  const f = await fixture()
  const { runtime } = f
  const client = new HbarClient('http://127.0.0.1:1', 'unused-test-token')
  try {
    const captured = runtime.view.state.workspaceTabs.getSnapshot()
    const navigation = runtime.view.state.navigation.getSnapshot()
    const render = () =>
      renderToStaticMarkup(
        <WorkspaceTabsController runtime={runtime} client={client} locale="en-US">
          {null}
        </WorkspaceTabsController>,
      )
    expect(render()).toContain(`title="${sessionA.title}\n${workspaceA.name}"`)
    await f.replace([{ workspaceId: workspaceA.id, displayName: 'Project caption alias' }])
    const changed = render()
    expect(changed).toContain(`title="${sessionA.title}\nProject caption alias"`)
    expect(changed).toContain(`aria-label="${sessionA.title}"`)
    expect(changed).toContain(`title="${sessionB.title}\n${workspaceB.name}"`)
    await f.replace([])
    expect(render()).toContain(`title="${sessionA.title}\n${workspaceA.name}"`)
    expect(runtime.view.state.workspaceTabs.getSnapshot()).toBe(captured)
    expect(runtime.view.state.navigation.getSnapshot()).toBe(navigation)
    expect(runtime.workspaceTabs.capture(captured.items.map((item) => item.id))).toEqual(
      captured.items.map((item) => ({
        id: item.id,
        instanceKey: item.instanceKey,
        sessionId: item.kind === 'session' ? item.sessionId : item.sourceSessionId,
      })),
    )
  } finally {
    client.disconnect()
    runtime.dispose()
  }
})
