import { expect, test } from 'bun:test'
import { workspaceShellShortcut } from '../packages/app-react/src/lumen-workspace-shell'
import { getShellCopy } from '../apps/web/src/shell-copy'

type ShortcutEvent = Parameters<typeof workspaceShellShortcut>[0]

const base = {
  key: 'k',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  keyCode: 75,
  repeat: false,
  defaultPrevented: false,
} satisfies ShortcutEvent

test('global search and Commands own distinct exact shortcuts', () => {
  expect(workspaceShellShortcut({ ...base, ctrlKey: true }, false)).toBe('chat-search')
  expect(workspaceShellShortcut({ ...base, metaKey: true, key: 'K' }, false)).toBe('chat-search')
  expect(workspaceShellShortcut({ ...base, ctrlKey: true, shiftKey: true, key: 'p' }, false)).toBe('commands')
  expect(workspaceShellShortcut({ ...base, metaKey: true, shiftKey: true, key: 'P' }, false)).toBe('commands')
})

test('shortcut does not steal modified, composed, repeated, consumed, or top-layer input', () => {
  const ignored: readonly [Partial<ShortcutEvent>, boolean][] = [
    [{}, false],
    [{ ctrlKey: true, metaKey: true }, false],
    [{ ctrlKey: true, altKey: true }, false],
    [{ ctrlKey: true, shiftKey: true }, false],
    [{ ctrlKey: true, key: 'p' }, false],
    [{ ctrlKey: true, isComposing: true }, false],
    [{ ctrlKey: true, keyCode: 229 }, false],
    [{ ctrlKey: true, repeat: true }, false],
    [{ ctrlKey: true, defaultPrevented: true }, false],
    [{ ctrlKey: true }, true],
    [{ metaKey: true, shiftKey: true, key: 'p' }, true],
  ]
  for (const [input, topLayerOpen] of ignored)
    expect(workspaceShellShortcut({ ...base, ...input }, topLayerOpen)).toBeNull()
})

test('host copy names the two entry points and platform-specific shortcut hints in both locales', () => {
  expect(getShellCopy('zh-CN', 'Win32').shell).toMatchObject({
    searchChats: '搜索聊天',
    searchShortcut: 'Ctrl K',
    commands: '命令',
    commandShortcut: 'Ctrl Shift P',
  })
  expect(getShellCopy('en-US', 'Win32').shell).toMatchObject({
    searchChats: 'Search chats',
    searchShortcut: 'Ctrl K',
    commands: 'Commands',
    commandShortcut: 'Ctrl Shift P',
  })
  expect(getShellCopy('zh-CN', 'MacIntel').shell).toMatchObject({
    searchChats: '搜索聊天',
    searchShortcut: '⌘K',
    commandShortcut: '⌘⇧P',
  })
  expect(getShellCopy('en-US', 'MacIntel').shell).toMatchObject({
    searchChats: 'Search chats',
    searchShortcut: '⌘K',
    commandShortcut: '⌘⇧P',
  })
})
