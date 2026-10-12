import { LumenAnalyticsProvider } from '@lumen/app-ui/catalog'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createAnalyticsPreviewStore } from './analyticsPreviewModel'
import { createAnalyticsPreviewReferenceContent } from './analyticsPreviewReferenceFixtures'
import {
  createAnalyticsPreviewSeed,
  projectAnalyticsPreview,
  advanceAnalyticsPreviewLive,
} from './analyticsPreviewProjection'

interface HostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}
export function AnalyticsPreviewHost(props: HostProps) {
  if (props.spec.category !== 'analytics') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('analyticsFixture') ?? 'default'
  return <AnalyticsOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}
function AnalyticsOwner({ spec, onAction, children, mode }: HostProps & { readonly mode: string }) {
  const ownerId = `analytics-preview-${spec.id}`
  const content = useMemo(() => createAnalyticsPreviewReferenceContent(spec.variant, mode), [spec.variant, mode])
  const seed = useMemo(
    () => createAnalyticsPreviewSeed(content, spec.variant, ownerId, mode),
    [content, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createAnalyticsPreviewStore(seed))
  const state = useStore(store)
  useEffect(() => {
    store.getState().refresh(seed)
  }, [store, seed])
  useEffect(() => {
    if (spec.variant !== 16 || state.flagsById.paused || state.selectedBySlot.range !== '60s') return
    const timer = window.setInterval(() => {
      advanceAnalyticsPreviewLive(store)
    }, 1500)
    return () => {
      window.clearInterval(timer)
    }
  }, [store, spec.variant, state.flagsById.paused, state.selectedBySlot.range])
  const projected = projectAnalyticsPreview(content, store, ({ actionId }) =>
    onAction?.({ variantId: spec.id, actionId }),
  )
  return <LumenAnalyticsProvider content={projected}>{children}</LumenAnalyticsProvider>
}
