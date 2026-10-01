import { LumenMobileProvider } from '@lumen/app-ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createMobilePreviewStore } from './mobilePreviewModel'
import { createMobilePreviewContent, createMobilePreviewSeed, mobileRequestNotice } from './mobilePreviewFixtures'
import { projectMobilePreview } from './mobilePreviewProjection'
import {
  createHbarAppUiMobileLocalizedFixtures,
  createHbarAppUiMobileOverflowFixtures,
  HBAR_APP_UI_MOBILE_FIXTURES,
} from '../../../tests/fixtures/hbar-app-ui-mobile-fixtures'

interface MobilePreviewHostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}
export function MobilePreviewHost(props: MobilePreviewHostProps) {
  if (props.spec.category !== 'mobile') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('mobileFixture') ?? 'default'
  return <MobilePreviewOwner key={`${props.spec.id}:${mode}`} {...props} mode={mode} />
}
function MobilePreviewOwner({ spec, onAction, children, mode }: MobilePreviewHostProps & { readonly mode: string }) {
  const ownerId = `mobile-preview-${spec.id}`
  const fixture = useMemo(
    () =>
      createMobilePreviewContent(
        mode === 'localized'
          ? createHbarAppUiMobileLocalizedFixtures()
          : mode === 'overflow'
            ? createHbarAppUiMobileOverflowFixtures()
            : HBAR_APP_UI_MOBILE_FIXTURES,
        spec.variant,
        mode === 'localized',
      ),
    [spec.variant, mode],
  )
  const seed = useMemo(
    () => createMobilePreviewSeed(fixture, spec.variant, ownerId, mode),
    [fixture, spec.variant, ownerId, mode],
  )
  const [store] = useState(() => createMobilePreviewStore(seed))
  const state = useStore(store)
  useEffect(() => {
    store.getState().refresh(ownerId, seed)
  }, [store, ownerId, seed])
  const preview = projectMobilePreview(fixture, state, store, mobileRequestNotice(mode === 'localized'), (event) =>
    onAction?.({
      variantId: spec.id,
      actionId: event.actionId,
      ...(event.value === undefined ? {} : { value: event.value }),
    }),
  )
  return <LumenMobileProvider content={preview}>{children}</LumenMobileProvider>
}
