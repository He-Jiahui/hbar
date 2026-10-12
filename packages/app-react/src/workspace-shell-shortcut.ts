export function workspaceShellShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'keyCode' | 'repeat' | 'defaultPrevented'
  >,
  topLayerOpen: boolean,
): 'chat-search' | 'commands' | 'settings' | null {
  if (
    topLayerOpen ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey === event.metaKey
  )
    return null
  const key = event.key.toLowerCase()
  if (key === 'k' && !event.shiftKey) return 'chat-search'
  if (key === 'p' && event.shiftKey) return 'commands'
  if (key === ',' && !event.shiftKey) return 'settings'
  return null
}
