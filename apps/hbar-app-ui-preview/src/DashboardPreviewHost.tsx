import { LumenDashboardProvider } from '@lumen/app-ui/catalog'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createDashboardPreviewStore } from './dashboardPreviewModel'
import { createDashboardPreviewReferenceContent } from './dashboardPreviewReferenceFixtures'
import { createDashboardPreviewSeed, projectDashboardPreview } from './dashboardPreviewProjection'

interface DashboardHostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}
export function DashboardPreviewHost(props: DashboardHostProps) {
  if (props.spec.category !== 'dashboard') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('dashboardFixture') ?? 'default'
  return <DashboardOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}
function DashboardOwner({ spec, onAction, children, mode }: DashboardHostProps & { readonly mode: string }) {
  const ownerId = `dashboard-preview-${spec.id}`
  const content = useMemo(() => createDashboardPreviewReferenceContent(spec.variant, mode), [spec.variant, mode])
  const seed = useMemo(
    () => createDashboardPreviewSeed(content, spec.variant, ownerId, mode),
    [content, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createDashboardPreviewStore(seed))
  const state = useStore(store)
  useEffect(() => {
    store.getState().refresh(seed)
  }, [store, seed])
  const projected = projectDashboardPreview(content, store, ({ actionId, value }) =>
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
  )
  return (
    <LumenDashboardProvider key={state.fixtureId} content={projected}>
      {children}
    </LumenDashboardProvider>
  )
}
