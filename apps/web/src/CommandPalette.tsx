import { useEffect } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiCommandDialog } from 'hbar-app-ui/command-menu'
import { commandModel, type PaletteCommand } from './command-model'
import { getCommandCopy } from './command-locale'
import { useLocale } from './locale'
import { useConnection, useWorkbench } from './stores'
import commandPolicy from './workbench/command-policy.json'
export type { PaletteCommand } from './command-model'
export default function CommandPalette({ commands }: { readonly commands: readonly PaletteCommand[] }) {
  const state = useStore(commandModel.store),
    { locale, t } = useLocale()
  const source = useConnection((s) => s.client),
    workspace = useWorkbench((s) => s.workspaceId)
  useEffect(() => commandModel.sync(commands, source, workspace), [commands, source, workspace])
  return (
    <HbarAppUiCommandDialog
      title={t('commandPalette')}
      open={state.open}
      onClose={commandModel.close}
      labels={getCommandCopy(locale)}
      items={state.items.map((item) => ({ ...item, disabled: item.disabled || Boolean(state.busyId) }))}
      query={state.query}
      selectedId={state.selectedId}
      selectionLost={state.selectionLost}
      onQueryChange={commandModel.query}
      onSelect={commandModel.select}
      onMove={commandModel.move}
      onExecute={(id) => void commandModel.execute(id)}
      listStrategy={state.items.length > commandPolicy.virtualizeAbove ? 'virtual' : 'content-grown'}
      error={state.error}
    />
  )
}
