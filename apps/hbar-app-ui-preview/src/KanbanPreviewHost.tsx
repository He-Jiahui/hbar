import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiKanbanProvider, type HbarAppUiKanbanContent, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createKanbanPreviewSeed, createKanbanPreviewStore, type KanbanPreviewVariant } from './kanbanPreviewModel'
import { projectKanbanPreview } from './kanbanPreviewProjection'

interface HostProps extends HbarAppUiVariantProps {
  readonly content: HbarAppUiKanbanContent
  readonly children: ReactNode
}
function isKanbanVariant(variant: number): variant is KanbanPreviewVariant {
  return variant === 1 || variant === 2 || variant === 3 || variant === 4 || variant === 5 || variant === 6
}
export function KanbanPreviewHost(props: HostProps) {
  if (props.spec.category !== 'kanban' || !isKanbanVariant(props.spec.variant)) return <>{props.children}</>
  const mode =
    typeof location === 'undefined'
      ? 'default'
      : (new URLSearchParams(location.search).get('kanbanFixture') ?? 'default')
  return <KanbanOwner key={`${props.spec.id}:${mode}`} {...props} variant={props.spec.variant} mode={mode} />
}
function KanbanOwner({
  content: input,
  spec,
  variant,
  mode,
  children,
}: HostProps & {
  readonly variant: KanbanPreviewVariant
  readonly mode: string
}) {
  const ownerId = `kanban-preview-${spec.id}`
  const seed = useMemo(() => createKanbanPreviewSeed(input, variant, ownerId, mode), [input, variant, ownerId, mode])
  const [store] = useState(() => createKanbanPreviewStore(seed))
  useStore(store, (state) => state.data)
  useEffect(() => {
    store.getState().refresh(seed)
  }, [seed, store])
  const content = projectKanbanPreview(input, store)
  return <HbarAppUiKanbanProvider content={content}>{children}</HbarAppUiKanbanProvider>
}
