import { expect, test } from 'bun:test'
import type { CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import {
  settingsDescriptionSchema,
  settingsCommands,
  type SettingsDescription,
} from '@hbar/contracts/commands/settings'
import { encodePath, encodeResourceReference, type ResourcePickerSelection } from '@hbar/schema-core'

const path = [{ kind: 'field' as const, name: 'context.file' }]
const field = encodePath(path)
const description: SettingsDescription = settingsDescriptionSchema.parse({
  id: 'resource.settings',
  schemaVersion: 1,
  groups: [{ id: 'context', labelKey: 'i18n:settings.groups.context', order: 0 }],
  fields: [
    {
      path,
      type: 'string',
      nullable: true,
      defaultValue: null,
      allowedScopes: ['global', 'workspace', 'session'],
      applyMode: 'nextRun',
      labelKey: 'i18n:settings.context.file',
      group: 'context',
      order: 0,
      component: 'FilePicker',
      multiple: false,
      resource: { kind: 'file', location: 'client-local' },
    },
  ],
})

const directory: CommandExecutor = {
  async execute(name) {
    if (name === 'workspace.list' || name === 'session.list') return { items: [], nextCursor: null }
    if (name === 'workspace.get' || name === 'session.get') return null
    throw new Error(`Unexpected directory command: ${name}`)
  },
}

const settings: CommandExecutor = {
  async execute(name, input) {
    if (name === 'settings.describe') return description
    if (name === 'settings.get') {
      const scope = settingsCommands['settings.get'].input.parse(input).scope
      return settingsCommands['settings.get'].output.parse({
        schemaVersion: 1,
        scope,
        revisions: { global: 0 },
        resolution: {
          layers: [{ id: 'global', kind: 'global', revision: 0 }],
          reports: {
            [field]: {
              path: field,
              localPresence: false,
              effectiveValue: null,
              sourceLayer: 'schema',
              sourceRevision: null,
              inherited: true,
              validation: 'valid',
              applyMode: 'nextRun',
              applyState: 'applied',
              provenance: {},
            },
          },
        },
      })
    }
    throw new Error(`Unexpected settings command: ${name}`)
  },
}

async function ready(runtime: ReturnType<typeof createAppRuntime>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = runtime.view.state.settings.getSnapshot()
    const entry = state.activeFormId ? state.forms[state.activeFormId] : undefined
    if (entry?.status === 'ready') return entry
    await Bun.sleep(1)
  }
  throw new Error('Settings resource form did not become ready')
}

test('settings resource selection is command-owned and only accepts matching durable references', async () => {
  let selection: ResourcePickerSelection | null = {
    reference: { kind: 'artifact', resourceKind: 'file', artifactId: 'a'.repeat(64) },
    label: 'context.md',
  }
  let release!: () => void
  let hold = new Promise<void>((resolve) => {
    release = resolve
  })
  const runtime = createAppRuntime({
    instanceId: 'resource-client',
    hostId: 'resource-host',
    directory,
    settings,
    resourcePicker: {
      async select() {
        await hold
        return selection
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  try {
    await runtime.view.commands.execute('app.openSettings', { scope: 'global' })
    const entry = await ready(runtime)
    const pending = runtime.view.commands.execute('settingsForm.pickResource', {
      formId: entry.formId,
      field,
    })
    expect(runtime.view.state.settings.getSnapshot().forms[entry.formId]?.content[field]).toEqual({
      status: 'loading',
    })
    release()
    await pending
    expect(runtime.view.state.settings.getSnapshot().forms[entry.formId]?.form).toMatchObject({
      draft: {
        [field]: encodeResourceReference({
          kind: 'artifact',
          resourceKind: 'file',
          artifactId: 'a'.repeat(64),
        }),
      },
      dirty: [field],
    })

    selection = {
      reference: { kind: 'host-path', resourceKind: 'file', hostId: 'resource-host', path: '/tmp/context.md' },
      label: 'context.md',
    }
    hold = Promise.resolve()
    await expect(
      runtime.view.commands.execute('settingsForm.pickResource', { formId: entry.formId, field }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(runtime.view.state.settings.getSnapshot().forms[entry.formId]?.content[field]).toEqual({
      status: 'error',
      errorCode: 'INVALID_OUTPUT',
    })

    selection = null
    await runtime.view.commands.execute('settingsForm.pickResource', { formId: entry.formId, field })
    expect(runtime.view.state.settings.getSnapshot().forms[entry.formId]?.content[field]).toEqual({ status: 'idle' })
  } finally {
    runtime.dispose()
  }
})
