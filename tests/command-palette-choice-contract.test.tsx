import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { z } from 'zod'
import { defineCommand, describeCommand, type CommandDescriptor } from '@hbar/commands'
import { createAppRuntime, type CommandCatalogPort } from '@hbar/app-runtime'
import { HbarCommandPalette, HbarRuntimeProvider } from '@hbar/app-react'
import { getShellCopy } from '../apps/web/src/shell-copy'

const optionalBoolean = defineCommand(
  {
    id: 'test.optionalBoolean',
    version: 1,
    owner: 'command-palette-contract-test',
    kind: 'command',
    execution: 'host',
    stateEffect: 'persistent',
    category: 'settings.test',
    titleKey: 'commands.test.optionalBoolean.title',
    descriptionKey: 'commands.test.optionalBoolean.description',
    scope: 'global',
    surfaces: ['palette'],
  },
  z.strictObject({ enabled: z.boolean().optional() }),
  z.strictObject({ saved: z.boolean() }),
)

const descriptor: CommandDescriptor = describeCommand(optionalBoolean)

function runtimeFixture() {
  const executions: Readonly<Record<string, unknown>>[] = []
  const commandCatalog: CommandCatalogPort = {
    async list() {
      return { revision: 1, items: [descriptor] }
    },
    async execute(_descriptor, input) {
      executions.push(input)
      return { saved: true }
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'command-palette-choice-contract',
    hostId: 'command-palette-choice-host',
    directory: {
      async execute(name) {
        throw new Error(`Unexpected directory query: ${name}`)
      },
    },
    commandCatalog,
    commandText: { resolve: (key) => key },
    surfaces: { canRender: () => true },
  })
  return { runtime, executions }
}

function render(runtime: ReturnType<typeof createAppRuntime>) {
  return renderToStaticMarkup(
    <HbarRuntimeProvider view={runtime.view}>
      <HbarCommandPalette labels={getShellCopy('en-US').commandPalette} connected />
    </HbarRuntimeProvider>,
  )
}

test('command palette optional booleans preserve unset, false, and true through runtime state and SSR', async () => {
  const { runtime, executions } = runtimeFixture()
  try {
    await runtime.ready
    await runtime.view.commands.execute('commandPalette.refresh', {})
    await runtime.view.commands.execute('commandPalette.openCommand', { commandId: descriptor.metadata.id })

    let state = runtime.view.state.commandPalette.getSnapshot()
    expect(state.draft?.values).toEqual({})
    expect(Object.hasOwn(state.draft?.values ?? {}, 'enabled')).toBe(false)
    let html = render(runtime)
    expect(html).toContain('role="combobox"')
    expect(html).toContain('id="hbar-command-enabled"')
    expect(html).toContain('data-value=""')
    expect(html).toContain('value=""')
    expect(html).toContain(getShellCopy('en-US').commandPalette.unset)
    expect(html).not.toContain('<select')

    await runtime.view.commands.execute('commandPalette.setParameter', { field: 'enabled', value: false })
    state = runtime.view.state.commandPalette.getSnapshot()
    expect(state.draft?.values).toEqual({ enabled: false })
    expect(Object.hasOwn(state.draft?.values ?? {}, 'enabled')).toBe(true)
    html = render(runtime)
    expect(html).toContain('data-value="false"')
    expect(html).toContain('value="false"')
    expect(html).toContain(getShellCopy('en-US').commandPalette.falseValue)

    await runtime.view.commands.execute('commandPalette.execute', {})
    expect(executions).toEqual([{ enabled: false }])

    await runtime.view.commands.execute('commandPalette.back', {})
    await runtime.view.commands.execute('commandPalette.setParameter', { field: 'enabled', value: true })
    state = runtime.view.state.commandPalette.getSnapshot()
    expect(state.draft?.values).toEqual({ enabled: true })
    html = render(runtime)
    expect(html).toContain('data-value="true"')
    expect(html).toContain('value="true"')
    expect(html).toContain(getShellCopy('en-US').commandPalette.trueValue)

    await runtime.view.commands.execute('commandPalette.unsetParameter', { field: 'enabled' })
    state = runtime.view.state.commandPalette.getSnapshot()
    expect(state.draft?.values).toEqual({})
    expect(Object.hasOwn(state.draft?.values ?? {}, 'enabled')).toBe(false)
    html = render(runtime)
    expect(html).toContain('data-value=""')
    expect(html).toContain('value=""')
    expect(html).toContain(getShellCopy('en-US').commandPalette.unset)
  } finally {
    runtime.dispose()
  }
})
