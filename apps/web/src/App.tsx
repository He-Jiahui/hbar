import { HbarAppUiAppShell, HbarAppUiAppSidebar, HbarAppUiWorkbenchNotice } from 'hbar-app-ui/workbench'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { shellLayout } from './shell-layout'

export default function App({ locale }: { readonly locale: ShellLocale }) {
  const copy = getShellCopy(locale)
  return (
    <HbarAppUiAppShell
      label={copy.main}
      sidebarWidthRem={shellLayout.sidebar.widthRem}
      sidebar={shellLayout.sidebar.visible && <HbarAppUiAppSidebar {...copy.sidebar} />}
    >
      <HbarAppUiWorkbenchNotice {...copy.notice} />
    </HbarAppUiAppShell>
  )
}
