import { LumenDataTableProvider } from '@lumen/app-ui/catalog'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createTablePreviewStore } from './dataTablePreviewModel'
import { createDataTablePreviewReferenceContent } from './dataTablePreviewReferenceFixtures'
import { createTablePreviewSeed, projectTablePreview } from './dataTablePreviewProjection'

interface TableHostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}
export function DataTablePreviewHost(props: TableHostProps) {
  if (props.spec.category !== 'data-table') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('tableFixture') ?? 'default'
  return <TableOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}
function TableOwner({ spec, onAction, children, mode }: TableHostProps & { readonly mode: string }) {
  const ownerId = `table-preview-${spec.id}`
  const content = useMemo(() => createDataTablePreviewReferenceContent(spec.variant, mode), [spec.variant, mode])
  const seed = useMemo(
    () => createTablePreviewSeed(content, spec.variant, ownerId, mode),
    [content, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createTablePreviewStore(seed))
  const state = useStore(store)
  useEffect(() => {
    store.getState().refresh(ownerId, seed)
  }, [store, ownerId, seed])
  const projected = projectTablePreview(content, store, ({ actionId, value }) =>
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) }),
  )
  return (
    <LumenDataTableProvider key={state.fixtureId} content={projected}>
      {children}
    </LumenDataTableProvider>
  )
}
