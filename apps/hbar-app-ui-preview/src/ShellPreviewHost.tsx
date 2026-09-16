import { useState, type ReactNode } from 'react'
import { HbarAppUiNavigation, HbarAppUiToolbar } from 'hbar-app-ui'
import { HbarAppUiShellProvider, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { SHELL_FIXTURE } from '../../../tests/fixtures/hbar-app-ui-shell-fixtures'
import './shell-preview.css'
import { SessionPreviewHost } from './SessionPreviewHost'
import { FilePreviewHost } from './FilePreviewHost'
import { ObjectivePreviewHost } from './ObjectivePreviewHost'

/** The preview host, like Web, owns state and supplies all example records. */
export function ShellPreviewHost({
  children,
  spec,
  onAction,
}: HbarAppUiVariantProps & { readonly children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState(SHELL_FIXTURE.workspaces[0]!.id)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pageId, setPageId] = useState('sessions')
  const report = (actionId: string, value?: string) =>
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) })
  return (
    <HbarAppUiShellProvider
      content={{
        brand: SHELL_FIXTURE.brand,
        labels: SHELL_FIXTURE.labels,
        workspaces: SHELL_FIXTURE.workspaces,
        workspaceId,
        connection: SHELL_FIXTURE.connection,
        sidebarOpen,
        onToggleSidebar: () => {
          setSidebarOpen((value) => !value)
          report('collapse')
        },
        onWorkspaceChange: (id) => {
          setWorkspaceId(id)
          report('workspace', id)
        },
        onAddWorkspace: () => report('add-workspace'),
        onOpenCommands: () => report('search'),
        children: (
          <div className="hbar-app-ui-shell-preview-body">
            {sidebarOpen && (
              <HbarAppUiNavigation
                label={SHELL_FIXTURE.labels.navigation}
                items={SHELL_FIXTURE.navigation.map((item) => ({ ...item, selected: item.id === pageId }))}
                onSelect={(id) => {
                  setPageId(id)
                  report('navigate', id)
                }}
              />
            )}
            <main>
              <HbarAppUiToolbar
                title={SHELL_FIXTURE.navigation.find((item) => item.id === pageId)?.label ?? SHELL_FIXTURE.title}
                detail={SHELL_FIXTURE.detail}
              />
              {pageId === 'sessions' && <SessionPreviewHost />}
              {pageId === 'files' && <FilePreviewHost />}
              {pageId === 'activity' && <ObjectivePreviewHost />}
            </main>
          </div>
        ),
      }}
    >
      {children}
    </HbarAppUiShellProvider>
  )
}
