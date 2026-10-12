import { LumenFilteringProvider } from '@lumen/app-ui/catalog'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createFilteringPreviewStore } from './filteringPreviewModel'
import { createFilteringPreviewReferenceContent } from './filteringPreviewReferenceFixtures'
import { createFilteringPreviewSeed, projectFilteringPreview } from './filteringPreviewProjection'

interface HostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}
export function FilteringPreviewHost(props: HostProps) {
  if (props.spec.category !== 'filtering') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('filteringFixture') ?? 'default'
  return <FilteringOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}
function FilteringOwner({ spec, onAction, children, mode }: HostProps & { readonly mode: string }) {
  const ownerId = `filtering-preview-${spec.id}`
  const content = useMemo(() => createFilteringPreviewReferenceContent(spec.variant, mode), [spec.variant, mode])
  const seed = useMemo(
    () => createFilteringPreviewSeed(content, spec.variant, ownerId, mode),
    [content, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createFilteringPreviewStore(seed))
  useStore(store)
  useEffect(() => {
    store.getState().refresh(seed)
  }, [store, seed])
  const projected = projectFilteringPreview(content, store, ({ actionId, value }) =>
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
  )
  return <LumenFilteringProvider content={projected}>{children}</LumenFilteringProvider>
}
