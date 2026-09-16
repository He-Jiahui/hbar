import { useState, type ReactNode } from 'react'
import { HbarAppUiButton } from 'hbar-app-ui'
import { HbarAppUiCommandMenuProvider, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import {
  COMMAND_LABELS,
  COMMAND_PROJECT_LABELS,
  GROUPED_COMMANDS,
  QUICK_COMMANDS,
  ROOM_COMMANDS,
  PROJECT_COMMANDS,
} from '../../../tests/fixtures/hbar-app-ui-command-fixtures'

export function CommandPreviewHost({
  spec,
  onAction,
  children,
}: HbarAppUiVariantProps & { readonly children: ReactNode }) {
  const overflow = new URLSearchParams(location.search).get('commandFixture') === 'overflow'
  const initialId = overflow
    ? 'command-0'
    : (spec.variant === 2 ? QUICK_COMMANDS : spec.variant === 6 ? ROOM_COMMANDS : GROUPED_COMMANDS)[0]?.id
  const [query, setQuery] = useState(''),
    [selectedId, setSelectedId] = useState<string | undefined>(initialId),
    [open, setOpen] = useState(true),
    [project, setProject] = useState(false),
    [variant, setVariant] = useState(spec.id)
  if (variant !== spec.id) {
    setVariant(spec.id)
    setQuery('')
    setSelectedId(initialId)
    setOpen(true)
    setProject(false)
  }
  const source = overflow
    ? Array.from({ length: 10000 }, (_, index) => ({ id: `command-${index}`, label: `Command ${index}` }))
    : spec.variant === 2
      ? project
        ? PROJECT_COMMANDS
        : QUICK_COMMANDS
      : spec.variant === 6
        ? ROOM_COMMANDS
        : GROUPED_COMMANDS
  const items = source.filter((item) =>
    `${item.label} ${'description' in item ? item.description : ''}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  )
  const selected = items.find((item) => item.id === selectedId)
  const content = {
    labels: { ...COMMAND_LABELS, ...(spec.variant === 6 ? { search: 'Find a room', execute: 'to switch' } : {}) },
    title: spec.variant === 6 ? 'Switch room' : COMMAND_LABELS.search,
    trigger: spec.variant === 6 ? 'Northwind' : COMMAND_LABELS.search,
    items,
    query,
    selectedId: selected?.id,
    selectionLost: Boolean(selectedId && !selected),
    open,
    listStrategy: overflow ? ('virtual' as const) : ('content-grown' as const),
    error: undefined,
    onOpen() {
      setOpen(true)
    },
    onClose() {
      setOpen(false)
    },
    onSelect: setSelectedId,
    onQueryChange(value: string) {
      setQuery(value)
      setSelectedId(undefined)
    },
    onMove(direction: -1 | 1) {
      if (!items.length) return
      const current = items.findIndex((item) => item.id === selectedId)
      setSelectedId(
        items[
          current < 0 ? (direction > 0 ? 0 : items.length - 1) : (current + direction + items.length) % items.length
        ]!.id,
      )
    },
    onExecute(id: string) {
      if (!items.some((item) => item.id === id)) return
      if (spec.variant === 2 && id === 'project') {
        setProject(true)
        setSelectedId(undefined)
        setQuery('')
      }
      onAction?.({
        variantId: spec.id,
        actionId: spec.variant === 6 ? 'switch' : id === 'project' ? 'navigate' : 'open',
        value: id,
      })
    },
    breadcrumb: project && (
      <div className="hbar-app-ui-command-breadcrumb">
        <HbarAppUiButton
          onClick={() => {
            setProject(false)
            setSelectedId(undefined)
          }}
        >
          {COMMAND_PROJECT_LABELS.home}
        </HbarAppUiButton>
        <strong>{COMMAND_PROJECT_LABELS.project}</strong>
      </div>
    ),
  }
  return (
    <HbarAppUiCommandMenuProvider content={{ grouped: content, quick: content, rooms: content }}>
      {children}
    </HbarAppUiCommandMenuProvider>
  )
}
