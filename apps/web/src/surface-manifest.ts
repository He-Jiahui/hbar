export const webSurfaceOutlets = Object.freeze({
  settings: 'page',
  status: 'page',
  files: 'tool',
  monitoring: 'tool',
  agents: 'tool',
  goals: 'tool',
  commands: 'modal',
  'chat-search': 'modal',
  'settings-editor': 'modal',
} as const)

export type WebSurfaceId = keyof typeof webSurfaceOutlets
export type WebSurfaceOutlet = (typeof webSurfaceOutlets)[WebSurfaceId]

export function canRenderWebSurface(panelId: string): panelId is WebSurfaceId {
  return Object.hasOwn(webSurfaceOutlets, panelId)
}
