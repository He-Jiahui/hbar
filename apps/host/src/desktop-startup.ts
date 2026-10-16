import { encodePath } from '@hbar/schema-core'
import {
  DESKTOP_STARTUP_MODE_SETTING,
  desktopStartupSchema,
  desktopBackgroundResponseSchema,
  type DesktopStartup,
  type DesktopTrayCopy,
} from '@hbar/contracts/desktop'
import { settingsSnapshotSchema } from '@hbar/contracts/commands/settings'
import { BACKEND_UNATTENDED_SETTING, BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import type { createSettingsCommands } from '@hbar/kernel/controller'

export async function enableDesktopBackground(
  settings: Pick<ReturnType<typeof createSettingsCommands>, 'execute'>,
  actorId: string,
) {
  const before = await settings.execute('settings.get', { scope: { kind: 'global' } })
  if (before.resolution.reports[BACKEND_UNATTENDED_VALUE_KEY]?.effectiveValue !== true)
    await settings.execute(
      'settings.apply',
      {
        schemaVersion: before.schemaVersion,
        scope: before.scope,
        baselineRevisions: before.revisions,
        changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: true }],
      },
      { actorId, idempotencyKey: `desktop-background:${crypto.randomUUID()}` },
    )
  return desktopBackgroundResponseSchema.parse({ unattended: true })
}

const copy: Readonly<Record<'zh-CN' | 'en-US', DesktopTrayCopy>> = {
  'zh-CN': {
    openClient: '打开客户端',
    openWeb: '打开网页',
    exitClient: '退出客户端',
    stopBackend: '停止后台并退出',
  },
  'en-US': {
    openClient: 'Open client',
    openWeb: 'Open web',
    exitClient: 'Exit client',
    stopBackend: 'Stop backend and exit',
  },
}

export function projectDesktopStartup(settings: unknown, language = 'zh-CN'): DesktopStartup {
  const snapshot = settingsSnapshotSchema.parse(settings)
  const report = snapshot.resolution.reports[encodePath([{ kind: 'field', name: DESKTOP_STARTUP_MODE_SETTING }])]
  return desktopStartupSchema.parse({
    startupMode: report?.effectiveValue ?? 'client',
    labels: copy[language.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'],
  })
}
