import { useCallback } from 'react'
import { useHbarRuntime } from '@hbar/app-react'
import { HbarSkillImportPanel } from '@hbar/app-react/skill-import'
import type { SkillImportController } from '@hbar/app-runtime/skill-import'
import type { ShellLocale } from './shell-copy'
import { skillImportCopy } from './skill-import-copy'
export function WebSkillImportPanel({
  controller,
  instanceId,
  connected,
  locale,
}: {
  readonly controller: SkillImportController
  readonly instanceId: string
  readonly connected: boolean
  readonly locale: ShellLocale
}) {
  const runtime = useHbarRuntime()
  const onImported = useCallback(() => {
    void runtime.commands
      .execute('extensionWorkspace.refresh', { instanceId, collection: 'skills' })
      .catch(() => undefined)
  }, [runtime, instanceId])
  return (
    <HbarSkillImportPanel
      controller={controller}
      labels={skillImportCopy(locale)}
      connected={connected}
      onImported={onImported}
    />
  )
}
