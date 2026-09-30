import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenAppSidebarWorkflowsProvider,
  type LumenAppSidebarContent,
  type LumenAppSidebarWorkflowAction,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createAppSidebarPreviewStore } from './appSidebarPreviewStore'
import { createAppSidebarPreviewCopy } from './appSidebarPreviewCopy'
import {
  appSidebarFixtureParameter,
  appSidebarPreviewRequestActions,
  createAppSidebarPreviewContent,
  createAppSidebarPreviewSeed,
} from './appSidebarPreviewFixtures'

interface AppSidebarPreviewHostProps extends HbarAppUiVariantProps {
  readonly content: LumenAppSidebarContent
  readonly children: ReactNode
}

export function AppSidebarPreviewHost(props: AppSidebarPreviewHostProps) {
  if (props.spec.category !== 'app-sidebar') return <>{props.children}</>
  const parameter = appSidebarFixtureParameter(props.spec.variant)
  const mode = parameter ? new URLSearchParams(location.search).get(parameter) : null
  return <AppSidebarPreviewOwner key={`${props.spec.id}:${mode ?? 'default'}`} {...props} mode={mode} />
}

function AppSidebarPreviewOwner({
  content,
  spec,
  onAction,
  children,
  mode,
}: AppSidebarPreviewHostProps & { readonly mode: string | null }) {
  const ownerId = `app-sidebar-preview-${spec.id}`
  const [store] = useState(() =>
    createAppSidebarPreviewStore(
      createAppSidebarPreviewSeed(createAppSidebarPreviewContent(content, spec.variant, mode), spec.variant, ownerId),
    ),
  )
  const state = useStore(store)
  const preview = useMemo(
    () => createAppSidebarPreviewContent(content, spec.variant, mode, state.workspaceId, state.sectionId),
    [content, spec.variant, mode, state.workspaceId, state.sectionId],
  )
  const seed = useMemo(
    () => createAppSidebarPreviewSeed(preview, spec.variant, ownerId),
    [preview, spec.variant, ownerId],
  )
  useEffect(() => store.getState().reconcile(seed), [store, seed])
  const copy = createAppSidebarPreviewCopy(mode === 'localized')

  function report({ actionId, value }: LumenAppSidebarWorkflowAction) {
    // Consult live state before accepting a delayed callback from a superseded section.
    const current = store.getState()
    const live = createAppSidebarPreviewContent(content, spec.variant, mode, current.workspaceId, current.sectionId)
    current.reconcile(createAppSidebarPreviewSeed(live, spec.variant, ownerId))
    if (actionId === 'workspace' && spec.variant === 3) {
      if (!value || !current.selectWorkspace(ownerId, value)) return
    } else if (actionId === 'section' && spec.variant === 4) {
      if (!value || !current.selectSection(ownerId, value)) return
    } else if (appSidebarPreviewRequestActions(spec.variant).includes(actionId)) {
      if (!store.getState().request(ownerId, actionId, value)) return
    } else if (actionId === 'search' && [3, 4, 5].includes(spec.variant)) {
      if (value === undefined) return
    } else if (actionId === 'folder' && spec.variant === 5) {
      if (!live.treePreview?.folders.some((folder) => folder.id === value && folder.id.trim())) return
    } else if ([6, 7].includes(spec.variant) && ['open', 'close', 'overlay'].includes(actionId)) {
      if (value !== undefined) return
    } else {
      return
    }
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) })
  }

  return (
    <LumenAppSidebarWorkflowsProvider
      content={{
        ...preview,
        presentation: { ownerId, notice: state.intent ? copy.requestNotice : undefined, onAction: report },
      }}
    >
      {children}
    </LumenAppSidebarWorkflowsProvider>
  )
}
