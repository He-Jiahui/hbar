import { LumenCardProvider } from '@lumen/app-ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createCardPreviewStore } from './cardPreviewModel'
import { createCardPreviewReferenceContent, cardRequestNotice } from './cardPreviewReferenceFixtures'
import { createCardPreviewSeed, projectCardPreview } from './cardPreviewProjection'

interface CardPreviewHostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}
export function CardPreviewHost(props: CardPreviewHostProps) {
  if (props.spec.category !== 'card') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('cardFixture') ?? 'default'
  return <CardPreviewOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}
function CardPreviewOwner({ spec, onAction, children, mode }: CardPreviewHostProps & { readonly mode: string }) {
  const ownerId = `card-preview-${spec.id}`
  const fixture = useMemo(() => createCardPreviewReferenceContent(spec.variant, mode), [spec.variant, mode])
  const seed = useMemo(
    () => createCardPreviewSeed(fixture, spec.variant, ownerId, mode),
    [fixture, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createCardPreviewStore(seed))
  const state = useStore(store)
  useEffect(() => {
    store.getState().refresh(ownerId, seed)
  }, [store, ownerId, seed])
  const content = projectCardPreview(fixture, store, cardRequestNotice(mode === 'localized'), (event) =>
    onAction?.({
      variantId: spec.id,
      actionId: event.actionId,
      ...(event.value === undefined ? {} : { value: event.value }),
    }),
  )
  return (
    <LumenCardProvider key={state.fixtureId} content={content}>
      {children}
    </LumenCardProvider>
  )
}
