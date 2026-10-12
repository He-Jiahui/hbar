import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { LumenCommandMenuProvider, type LumenCommandListProps } from '@lumen/app-ui/catalog'
import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { commandPreviewHints, projectCommandWorkflowPreview } from './CommandWorkflowPreview'
import { createCommandPreviewFixtures } from './commandPreviewFixtures'
import {
  createCommandPreviewStore,
  selectCommandPreviewItems,
  selectCommandPreviewSelection,
  type CommandPreviewRequest,
} from './commandPreviewModel'

interface CommandPreviewHostProps extends HbarAppUiVariantProps {
  readonly children: ReactNode
}

export function CommandPreviewHost(props: CommandPreviewHostProps) {
  if (props.spec.category !== 'command-menu') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('commandFixture')
  return <CommandPreviewOwner key={`${props.spec.id}:${mode ?? 'default'}`} {...props} mode={mode} />
}

function CommandPreviewOwner({
  spec,
  onAction,
  children,
  mode,
}: CommandPreviewHostProps & { readonly mode: string | null }) {
  const fixture = useMemo(() => createCommandPreviewFixtures(spec.variant, mode), [spec.variant, mode])
  const ownerId = `command-preview-${spec.id}`
  const [store] = useState(() => createCommandPreviewStore({ ...fixture.seed, ownerId }))
  const state = useStore(store)
  const items = useMemo(() => {
    const current = selectCommandPreviewItems(state)
    return spec.variant === 6
      ? current.map((item) => ({
          ...item,
          description:
            item.id === state.currentRoomId
              ? fixture.hints.roomCurrent
              : item.id === fixture.seed.pages[0]?.items[0]?.id
                ? fixture.hints.roomActive
                : item.description,
        }))
      : current
  }, [state, spec.variant, fixture])
  const selection = selectCommandPreviewSelection(state)
  const pageCopy =
    state.pageId === 'project'
      ? fixture.pageCopy.project
      : state.pageId === 'theme'
        ? fixture.pageCopy.theme
        : state.pageId === 'status'
          ? fixture.pageCopy.status
          : fixture.pageCopy.root
  function report(request: CommandPreviewRequest | undefined) {
    if (request) onAction?.({ variantId: spec.id, actionId: request.actionId, value: request.value })
  }
  const list: LumenCommandListProps = {
    labels: { ...fixture.labels, search: spec.variant === 6 ? fixture.hints.roomSearch : pageCopy.search },
    inputId: `${ownerId}-query`,
    inputRole: 'combobox',
    items,
    query: state.query,
    selectedId: selection.selectedId,
    selectionLost: selection.selectionLost,
    listStrategy: items.length > 50 ? 'virtual' : 'content-grown',
    error: undefined,
    onSelect: (id) => {
      store.getState().select(ownerId, id)
    },
    onQueryChange: (value) => {
      store.getState().setQuery(ownerId, value)
    },
    onMove: (direction) => {
      store.getState().move(ownerId, direction)
    },
    onExecute: (id) => {
      if (store.getState().enterPage(ownerId, id)) {
        onAction?.({ variantId: spec.id, actionId: 'navigate', value: id })
        return
      }
      report(
        store.getState().requestCommand(ownerId, { actionId: spec.variant === 6 ? 'switch' : 'open', targetId: id }),
      )
    },
  }
  if (spec.variant === 2) {
    list.hints = commandPreviewHints(fixture, fixture.hints.choose)
    if (state.pageId !== 'root') {
      list.breadcrumbPosition = 'before-query'
      list.onBack = () => {
        store.getState().backPage(ownerId)
      }
      list.breadcrumb = (
        <LumenFrame className="hbar-app-ui-command-breadcrumb">
          <LumenButton onClick={list.onBack}>{fixture.projectLabels.home}</LumenButton>
          <LumenText as="strong">{pageCopy.title}</LumenText>
        </LumenFrame>
      )
      list.hints = { items: [...list.hints.items, { id: 'back', key: '⌫', label: fixture.hints.back }] }
    }
  }
  if (spec.variant === 6) {
    list.shortcutExecution = true
    list.hints = {
      items: [
        { id: 'switch', key: '↵', label: fixture.hints.switch },
        { id: 'jump', key: '1–6', label: fixture.hints.jump },
      ],
    }
  }
  const surface = {
    ...list,
    title: spec.variant === 6 ? fixture.hints.roomTitle : pageCopy.title,
    trigger:
      spec.variant === 6
        ? (fixture.seed.pages[0]?.items.find((item) => item.id === state.currentRoomId)?.label ??
          fixture.hints.roomTitle)
        : fixture.labels.search,
    open: state.open,
    onOpen: () => {
      store.getState().setOpen(ownerId, true)
    },
    onClose: () => {
      store.getState().setOpen(ownerId, false)
    },
  }
  const content = {
    ...projectCommandWorkflowPreview(state, store, fixture, list, report),
    ...(spec.variant === 1
      ? { grouped: surface }
      : spec.variant === 2
        ? { quick: surface }
        : spec.variant === 6
          ? { rooms: surface }
          : {}),
    presentation: {
      ownerId,
      notice: state.lastRequest && state.lastRequest.actionId !== 'review' ? fixture.requestNotice : undefined,
    },
  }
  return <LumenCommandMenuProvider content={content}>{children}</LumenCommandMenuProvider>
}
