import type { LumenMobileContent } from '@lumen/app-ui'
import type { MobilePreviewModelState, MobilePreviewStoreApi } from './mobilePreviewModel'

export function projectMobilePreview(
  fixture: LumenMobileContent,
  state: MobilePreviewModelState,
  store: MobilePreviewStoreApi,
  requestNotice: string,
  report: (event: { readonly actionId: string; readonly value?: string | undefined }) => void,
): LumenMobileContent {
  const { ownerId } = state
  const onAction: NonNullable<LumenMobileContent['onAction']> = ({ actionId, value }) => {
    const current = store.getState()
    if (actionId === 'open' && value) {
      if (state.variant === 1) {
        const activeItems =
          current.selectedBySlot.tab === fixture.activity?.initialTabId
            ? fixture.activity?.items
            : fixture.activity?.pages?.find((page) => page.id === current.selectedBySlot.tab)?.items
        if (!activeItems?.some((item) => item.id === value)) return
      }
      if (
        state.variant === 5 &&
        !fixture.runs?.runs.some((item) => item.id === value && item.stateId === current.selectedBySlot.state)
      )
        return
      if (state.variant === 3) {
        const item = fixture.home?.cards.find((card) => card.id === value)
        if (
          current.selectedBySlot.tab !== fixture.home?.search?.tabId ||
          !item ||
          !`${item.title} ${item.description ?? ''} ${item.detail}`
            .toLocaleLowerCase()
            .includes((current.draftsById.query ?? '').trim().toLocaleLowerCase())
        )
          return
      }
    }
    if (current.request(ownerId, { actionId, ...(value === undefined ? {} : { targetId: value }) }))
      report({ actionId, ...(value === undefined ? {} : { value }) })
  }
  const selection = (slotId: string) => ({
    id: state.selectedBySlot[slotId],
    onChange: (id: string) => {
      if (store.getState().select(ownerId, slotId, id)) report({ actionId: 'tabs', value: id })
    },
  })
  return {
    ...fixture,
    onAction,
    presentation: { ownerId, notice: state.lastRequest ? requestNotice : undefined },
    ...(fixture.activity
      ? {
          activity: {
            ...fixture.activity,
            selection: selection('tab'),
            filter: {
              value: false,
              onChange: () => {
                onAction({ actionId: 'filter' })
              },
            },
          },
        }
      : {}),
    ...(fixture.tasks
      ? {
          tasks: {
            ...fixture.tasks,
            tasks: fixture.tasks.tasks.map((task) => ({
              ...task,
              complete: state.taskCompleteById[task.id] ?? task.complete,
            })),
            draft: {
              query: state.draftsById.query ?? '',
              onChange: (query: string) => {
                store.getState().setDraft(ownerId, 'query', query)
              },
            },
            onComplete: (id: string, complete: boolean) => {
              const current = store.getState()
              const task = fixture.tasks?.tasks.find((entry) => entry.id === id)
              if (
                !task ||
                current.taskCompleteById[id] ||
                !task.title.toLocaleLowerCase().includes((current.draftsById.query ?? '').trim().toLocaleLowerCase())
              )
                return
              if (current.setTaskComplete(ownerId, id, complete)) report({ actionId: 'confirm', value: id })
            },
          },
        }
      : {}),
    ...(fixture.home
      ? {
          home: {
            ...fixture.home,
            selection: selection('tab'),
            draft: {
              query: state.draftsById.query ?? '',
              onChange: (query: string) => {
                store.getState().setDraft(ownerId, 'query', query)
              },
            },
          },
        }
      : {}),
    ...(fixture.orders ? { orders: { ...fixture.orders, selection: selection('tab') } } : {}),
    ...(fixture.runs ? { runs: { ...fixture.runs, selection: selection('state') } } : {}),
  }
}
