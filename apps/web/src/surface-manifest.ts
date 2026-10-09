export const webSurfaceOutlets = Object.freeze({
  settings: 'page',
  status: 'page',
  files: 'tool',
  browser: 'page',
  'resource-file': 'page',
  activity: 'tool',
  monitoring: 'tool',
  agents: 'tool',
  goals: 'tool',
  commands: 'modal',
  'chat-search': 'modal',
  'settings-editor': 'modal',
  notifications: 'page',
  'run-board': 'page',
  schedules: 'page',
  'prompt-templates': 'page',
  onboarding: 'page',
} as const)

export type WebSurfaceId = keyof typeof webSurfaceOutlets
export type WebSurfaceOutlet = (typeof webSurfaceOutlets)[WebSurfaceId]

export function canRenderWebSurface(panelId: string): panelId is WebSurfaceId {
  return Object.hasOwn(webSurfaceOutlets, panelId)
}
