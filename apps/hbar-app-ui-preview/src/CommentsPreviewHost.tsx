import { useMemo, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  HbarAppUiCommentsProvider,
  type HbarAppUiCommentsContent,
  type HbarAppUiVariantSpec,
} from 'hbar-app-ui/catalog'
import {
  createCommentsPreviewStore,
  type CommentsPreviewScope,
  type CommentsPreviewVariant,
} from './commentsPreviewModel'
import { projectCommentsPreview } from './commentsPreviewProjection'

interface HostProps {
  readonly spec: HbarAppUiVariantSpec
  readonly content: HbarAppUiCommentsContent
  readonly children: ReactNode
}
function isCommentsVariant(variant: number): variant is CommentsPreviewVariant {
  return variant === 1 || variant === 2 || variant === 3 || variant === 4 || variant === 5 || variant === 6
}
export function CommentsPreviewHost(props: HostProps) {
  if (props.spec.category !== 'comments' || !isCommentsVariant(props.spec.variant)) return <>{props.children}</>
  const mode =
    typeof location === 'undefined'
      ? 'default'
      : (new URLSearchParams(location.search).get('commentsFixture') ?? 'default')
  return <CommentsOwner key={`${props.spec.id}:${mode}`} {...props} variant={props.spec.variant} mode={mode} />
}
function CommentsOwner({
  spec,
  content: input,
  variant,
  mode,
  children,
}: HostProps & {
  readonly variant: CommentsPreviewVariant
  readonly mode: string
}) {
  const scope = useMemo<CommentsPreviewScope>(
    () => ({ ownerId: `comments-preview-${spec.id}`, variant, fixtureId: mode }),
    [spec.id, variant, mode],
  )
  const store = useMemo(() => createCommentsPreviewStore(input, scope), [input, scope])
  useStore(store, (state) => state.flow)
  return (
    <HbarAppUiCommentsProvider content={projectCommentsPreview(input, store)}>{children}</HbarAppUiCommentsProvider>
  )
}
