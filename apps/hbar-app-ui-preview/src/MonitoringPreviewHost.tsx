import { LumenMonitoringProvider } from '@lumen/app-ui/catalog'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createMonitoringPreviewStore } from './monitoringPreviewModel'
import { createMonitoringPreviewReferenceContent } from './monitoringPreviewReferenceFixtures'
import { createMonitoringPreviewSeed, projectMonitoringPreview } from './monitoringPreviewProjection'
import './monitoring-preview.css'

interface HostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}
export function MonitoringPreviewHost(props: HostProps) {
  if (props.spec.category !== 'monitoring') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('monitoringFixture') ?? 'default'
  return <MonitoringOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}
function MonitoringOwner({ spec, children, onAction, mode }: HostProps & { readonly mode: string }) {
  const ownerId = `monitoring-preview-${spec.id}`
  const input = useMemo(() => createMonitoringPreviewReferenceContent(spec.variant, mode), [spec.variant, mode])
  const seed = useMemo(
    () => createMonitoringPreviewSeed(input, spec.variant, ownerId, mode),
    [input, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createMonitoringPreviewStore(seed))
  useStore(store)
  useEffect(() => {
    store.getState().refresh(seed)
  }, [seed, store])
  const content = projectMonitoringPreview(input, store, ({ actionId, value }) =>
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
  )
  return <LumenMonitoringProvider content={content}>{children}</LumenMonitoringProvider>
}
