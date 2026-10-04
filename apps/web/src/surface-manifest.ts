export const webSurfaceOutlets = Object.freeze({
  settings: 'page',
  status: 'page',
  files: 'tool',
  activity: 'tool',
  monitoring: 'tool',
  agents: 'tool',
  goals: 'tool',
  commands: 'modal',
  'chat-search': 'modal',
  'settings-editor': 'modal',
  notifications: 'tool',
  'run-board': 'tool',
  schedules: 'tool',
  'prompt-templates': 'tool',
  onboarding: 'tool',
} as const)

export type WebSurfaceId = keyof typeof webSurfaceOutlets
export type WebSurfaceOutlet = (typeof webSurfaceOutlets)[WebSurfaceId]

export function canRenderWebSurface(panelId: string): panelId is WebSurfaceId {
  return Object.hasOwn(webSurfaceOutlets, panelId)
}
