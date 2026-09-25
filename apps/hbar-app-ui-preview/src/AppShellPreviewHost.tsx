import { useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  HbarAppUiAppShellProvider,
  type HbarAppUiAppShellContent,
  type HbarAppUiVariantProps,
} from 'hbar-app-ui/catalog'
import { appShellSidebarFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-sidebar-fixtures'
import { appShellRailFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-rail-fixtures'
import { createAppShellRailPreviewStore, projectAppShellRailPreview } from './app-shell-rail-preview-model'
import { createAppShellSidebarPreviewStore, projectAppShellSidebarPreview } from './app-shell-sidebar-preview-model'

export function AppShellPreviewHost({
  content,
  spec,
  onAction,
  children,
}: HbarAppUiVariantProps & { readonly content: HbarAppUiAppShellContent; readonly children: ReactNode }) {
  const [store] = useState(createAppShellSidebarPreviewStore)
  const [railStore] = useState(createAppShellRailPreviewStore)
  const rail = projectAppShellRailPreview(
    useStore(railStore),
    appShellRailFixture(new URLSearchParams(location.search).get('appShellFixture'), (actionId, value) =>
      onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
    ),
  )
  const fixture = appShellSidebarFixture(
    new URLSearchParams(location.search).get('appShellFixture'),
    (actionId, value) => onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
  )
  const sidebar = projectAppShellSidebarPreview(useStore(store), fixture)
  return <HbarAppUiAppShellProvider content={{ ...content, sidebar, rail }}>{children}</HbarAppUiAppShellProvider>
}
