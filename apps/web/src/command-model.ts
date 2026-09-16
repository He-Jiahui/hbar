import { createStore } from 'zustand/vanilla'
import type { HbarAppUiCommandItem } from 'hbar-app-ui/command-menu'
export interface PaletteCommand extends HbarAppUiCommandItem {
  readonly keywords?: readonly string[]
  execute(): void | Promise<void>
}
interface CommandState {
  readonly open: boolean
  readonly query: string
  readonly items: readonly PaletteCommand[]
  readonly selectedId: string | undefined
  readonly selectionLost: boolean
  readonly busyId: string | undefined
  readonly error: string | undefined
}
function unique(items: readonly PaletteCommand[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}
export function createCommandModel() {
  const store = createStore<CommandState>(() => ({
    open: false,
    query: '',
    items: [],
    selectedId: undefined,
    selectionLost: false,
    busyId: undefined,
    error: undefined,
  }))
  let entries: readonly PaletteCommand[] = [],
    source: object | null = null,
    workspace = '',
    generation = 0
  const filter = (query: string) => {
    const needle = query.trim().toLocaleLowerCase()
    return entries.filter((item) =>
      [item.label, item.description ?? '', ...(item.keywords ?? [])].some((text) =>
        text.toLocaleLowerCase().includes(needle),
      ),
    )
  }
  return {
    store,
    sync(items: readonly PaletteCommand[], connection: object | null, workspaceId: string) {
      const changed = connection !== source || workspace !== workspaceId
      source = connection
      workspace = workspaceId
      entries = unique(items)
      const state = store.getState(),
        visible = filter(state.query)
      const lost =
        changed || Boolean(state.selectedId && !visible.some((item) => item.id === state.selectedId && !item.disabled))
      if (changed || (lost && state.busyId)) generation++
      store.setState({
        items: visible,
        ...(lost ? { selectedId: undefined, selectionLost: state.open, busyId: undefined } : {}),
      })
    },
    open() {
      generation++
      const items = filter('')
      store.setState({
        open: true,
        query: '',
        items,
        selectedId: items.find((item) => !item.disabled)?.id,
        selectionLost: false,
        error: undefined,
        busyId: undefined,
      })
    },
    close() {
      generation++
      store.setState({ open: false, busyId: undefined })
    },
    query(value: string) {
      const items = filter(value)
      store.setState({
        query: value,
        items,
        selectedId: items.find((item) => !item.disabled)?.id,
        selectionLost: false,
        error: undefined,
      })
    },
    select(id: string) {
      const item = store.getState().items.find((item) => item.id === id)
      if (item && !item.disabled) store.setState({ selectedId: id, selectionLost: false })
    },
    move(direction: -1 | 1) {
      const state = store.getState(),
        items = state.items.filter((item) => !item.disabled)
      if (!items.length) return
      const index = items.findIndex((item) => item.id === state.selectedId)
      const next =
        index < 0 ? (direction > 0 ? 0 : items.length - 1) : (index + direction + items.length) % items.length
      store.setState({ selectedId: items[next]!.id, selectionLost: false })
    },
    async execute(id: string) {
      const state = store.getState(),
        item = state.items.find((item) => item.id === id)
      if (!state.open || state.busyId || !item || item.disabled) return
      const sequence = ++generation
      store.setState({ busyId: id, error: undefined })
      try {
        await item.execute()
        if (generation === sequence) store.setState({ open: false, busyId: undefined })
      } catch (error) {
        if (generation === sequence)
          store.setState({ busyId: undefined, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}
export const commandModel = createCommandModel()
