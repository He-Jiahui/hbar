import { LumenNavbarProvider, type LumenNavbarContent } from '@lumen/app-ui/catalog'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createNavbarPreviewStore } from './navbarPreviewModel'
import { createNavbarPreviewContent, createNavbarPreviewCopy, createNavbarPreviewSeed } from './navbarPreviewFixtures'
import { projectNavbarPreview } from './navbarPreviewProjection'

interface NavbarPreviewHostProps extends HbarAppUiVariantProps {
  readonly content: LumenNavbarContent
  readonly children: ReactNode
}

export function NavbarPreviewHost(props: NavbarPreviewHostProps) {
  if (props.spec.category !== 'navbar') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('navbarFixture') ?? 'default'
  return <NavbarPreviewOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}

function NavbarPreviewOwner({
  content,
  spec,
  onAction,
  children,
  mode,
}: NavbarPreviewHostProps & { readonly mode: string }) {
  const ownerId = `navbar-preview-${spec.id}`
  const fixture = useMemo(
    () => createNavbarPreviewContent(content, spec.variant, mode === 'localized'),
    [content, spec.variant, mode],
  )
  const seed = useMemo(
    () => createNavbarPreviewSeed(fixture, spec.variant, ownerId, mode),
    [fixture, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createNavbarPreviewStore(seed))
  const state = useStore(store)
  useEffect(() => {
    store.getState().refresh(ownerId, seed)
  }, [store, ownerId, seed])
  const copy = createNavbarPreviewCopy(mode === 'localized')
  const preview = projectNavbarPreview(fixture, state, store, copy, (event) =>
    onAction?.({
      variantId: spec.id,
      actionId: event.actionId,
      ...(event.value === undefined ? {} : { value: event.value }),
    }),
  )
  return <LumenNavbarProvider content={preview}>{children}</LumenNavbarProvider>
}
