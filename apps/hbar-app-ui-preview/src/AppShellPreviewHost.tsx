import { useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  HbarAppUiAppShellProvider,
  type HbarAppUiAppShellContent,
  type HbarAppUiVariantProps,
} from 'hbar-app-ui/catalog'
import { appShellSidebarFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-sidebar-fixtures'
import { appShellRailFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-rail-fixtures'
import { appShellContractsFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-contracts-fixtures'
import { appShellEditorialFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-editorial-fixtures'
import {
  createAppShellEditorialPreviewStore,
  projectAppShellEditorialPreview,
} from './app-shell-editorial-preview-model'
import {
  createAppShellContractsPreviewStore,
  projectAppShellContractsPreview,
} from './app-shell-contracts-preview-model'
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
  const [contractsStore] = useState(createAppShellContractsPreviewStore)
  const [editorialStore] = useState(createAppShellEditorialPreviewStore)
  const editorial = projectAppShellEditorialPreview(
    useStore(editorialStore),
    appShellEditorialFixture(new URLSearchParams(location.search).get('appShellFixture'), (actionId, value) =>
      onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
    ),
  )
  const contracts = projectAppShellContractsPreview(
    useStore(contractsStore),
    appShellContractsFixture(new URLSearchParams(location.search).get('appShellFixture'), (actionId, value) =>
      onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
    ),
  )
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
  return (
    <HbarAppUiAppShellProvider content={{ ...content, sidebar, rail, contracts, editorial }}>
      {children}
    </HbarAppUiAppShellProvider>
  )
}
