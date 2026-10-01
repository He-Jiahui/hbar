import { LumenListProvider } from '@lumen/app-ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createListPreviewStore } from './listPreviewModel'
import { createListPreviewReferenceContent } from './listPreviewReferenceFixtures'
import { createListPreviewSeed, projectListPreview } from './listPreviewProjection'

interface HostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}
export function ListPreviewHost(props: HostProps) {
  if (props.spec.category !== 'list') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('listFixture') ?? 'default'
  return <ListOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}
function ListOwner({ spec, onAction, children, mode }: HostProps & { readonly mode: string }) {
  const ownerId = `list-preview-${spec.id}`
  const content = useMemo(() => createListPreviewReferenceContent(spec.variant, mode), [spec.variant, mode])
  const seed = useMemo(
    () => createListPreviewSeed(content, spec.variant, ownerId, mode),
    [content, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createListPreviewStore(seed))
  useStore(store)
  useEffect(() => {
    store.getState().refresh(seed)
  }, [store, seed])
  const projected = projectListPreview(content, store, ({ actionId, value }) =>
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
  )
  return <LumenListProvider content={projected}>{children}</LumenListProvider>
}
