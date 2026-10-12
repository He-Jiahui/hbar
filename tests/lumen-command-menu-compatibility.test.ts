import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenCommandList } from '@lumen/app-ui'
import { LumenAssistantCommands, LumenCommandMenu01, LumenCommandMenu06, LumenCommandMenuProvider, LumenInviteCommand, LumenSearchCommands } from '@lumen/app-ui/catalog'
import { getLumenVariantComponent } from '@lumen/app-ui/catalog'
import { HbarAppUiCommandMenuProvider } from '../packages/hbar-app-ui/src/catalog'
import {
  HbarAppUiAssistantCommands,
  HbarAppUiCommandList,
  HbarAppUiInviteCommand,
  HbarAppUiSearchCommands,
} from '../packages/hbar-app-ui/src/command-menu'
import { COMMAND_LABELS, GROUPED_COMMANDS } from './fixtures/hbar-app-ui-command-fixtures'

test('command compatibility exports are canonical Lumen components', () => {
  expect(HbarAppUiCommandMenuProvider).toBe(LumenCommandMenuProvider)
  expect(HbarAppUiCommandList).toBe(LumenCommandList)
  expect(HbarAppUiSearchCommands).toBe(LumenSearchCommands)
  expect(HbarAppUiInviteCommand).toBe(LumenInviteCommand)
  expect(HbarAppUiAssistantCommands).toBe(LumenAssistantCommands)
  expect(getLumenVariantComponent('hbar-app-ui-command-menu-6')).toBe(LumenCommandMenu06)
})

test('the canonical Lumen entry renders command content and controls', () => {
  const grouped = {
    labels: COMMAND_LABELS,
    items: GROUPED_COMMANDS,
    query: '',
    selectedId: GROUPED_COMMANDS[0]?.id,
    selectionLost: false,
    listStrategy: 'content-grown' as const,
    error: undefined,
    open: true,
    title: 'Commands',
    trigger: 'Open commands',
    onOpen() {},
    onClose() {},
    onQueryChange() {},
    onSelect() {},
    onMove() {},
    onExecute() {},
  }
  const markup = renderToStaticMarkup(
    createElement(LumenCommandMenuProvider, {
      content: { grouped },
      children: createElement(LumenCommandMenu01),
    }),
  )

  expect(markup).toContain('data-lumen-component="command-menu"')
  expect(markup).toContain('Open commands')
  expect(markup).toContain('Launch readiness review')
  expect(markup).toContain('data-lumen-variant=')
})

test('the legacy command implementation and stylesheets are retired', async () => {
  const retired = [
    'AssistantCommandPalette.tsx',
    'CommandCatalogSurface.tsx',
    'CommandList.css',
    'CommandList.tsx',
    'CommandMenuSurface.css',
    'CommandPrimitives.tsx',
    'CommandWorkflowCatalog.tsx',
    'CommandWorkflows.css',
    'CommandWorkflows.tsx',
    'GroupedCommandPalette.tsx',
    'InviteCommandDialog.tsx',
    'QuickCommandPalette.tsx',
    'RoomCommandPalette.tsx',
    'SearchEverythingPalette.tsx',
  ]

  for (const file of retired) {
    expect(await Bun.file(`packages/hbar-app-ui/src/components/command-menu/${file}`).exists()).toBe(false)
  }
})
