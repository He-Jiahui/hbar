import type { LumenCardContent, LumenCardReferenceContent } from '@lumen/app-ui'
import type { CardPreviewSeed, CardPreviewStoreApi } from './cardPreviewModel'

export function createCardPreviewSeed(
  content: LumenCardContent,
  variant: number,
  ownerId: string,
  fixtureId: string,
): CardPreviewSeed {
  const reference = content.reference
  let slots: CardPreviewSeed['slots'] = []
  let flags: CardPreviewSeed['flags'] = []
  let steps: CardPreviewSeed['steps'] = []
  let requestActions: CardPreviewSeed['requestActions'] = []
  if (reference)
    switch (reference.kind) {
      case 'members':
        flags = reference.items.filter((item) => !item.disabled).map((item) => ({ id: item.id, value: item.connected }))
        break
      case 'integrations':
        flags = reference.items.filter((item) => !item.disabled).map((item) => ({ id: item.id, value: item.connected }))
        break
      case 'onboarding':
        steps = reference.items
        break
      case 'agenda':
        flags = reference.items
          .filter((item) => !item.disabled)
          .flatMap((item) => [
            { id: `going:${item.id}`, value: item.going },
            { id: `decline:${item.id}`, value: item.declined },
          ])
        break
      case 'plans':
        requestActions = reference.items
          .filter((item) => !item.current && !item.disabled)
          .map((item) => ({ actionId: 'choose-plan', targetId: item.id }))
        break
      case 'accounts':
        slots = [{ id: 'range', items: reference.ranges, initialSelectedId: reference.selectedRangeId }]
        break
      case 'updates':
        flags = reference.items
          .filter((item) => !item.disabled)
          .map((item) => ({ id: item.id, value: item.bookmarked }))
        requestActions = reference.items
          .filter((item) => !item.disabled)
          .map((item) => ({ actionId: 'open-update', targetId: item.id }))
        break
      case 'files':
        flags = reference.items.filter((item) => !item.disabled).map((item) => ({ id: item.id, value: item.selected }))
        requestActions = [{ actionId: 'download', targetId: 'file-selection' }]
        break
      case 'profile':
        flags = [{ id: reference.id, value: reference.following }]
        requestActions = [{ actionId: 'message', targetId: reference.id }]
        break
      case 'balance':
        requestActions = [
          { actionId: 'deposit', targetId: reference.id },
          { actionId: 'transfer', targetId: reference.id },
        ]
        break
    }
  if (content.invoice) requestActions = [{ actionId: 'download', targetId: content.invoice.invoiceId }]
  return { ownerId, variant, fixtureId, slots, flags, steps, requestActions }
}

export function projectCardPreview(
  content: LumenCardContent,
  store: CardPreviewStoreApi,
  notice: string,
  report: (event: { readonly actionId: string; readonly value?: string | undefined }) => void,
): LumenCardContent {
  const state = store.getState()
  const { ownerId } = state
  const request: NonNullable<LumenCardContent['onAction']> = ({ actionId, value }) => {
    if (store.getState().request(ownerId, { actionId, ...(value === undefined ? {} : { targetId: value }) }))
      report({ actionId, ...(value === undefined ? {} : { value }) })
  }
  const changeFlag = (id: string, value: boolean, actionId: string) => {
    const current = store.getState()
    const reference = content.reference
    if (reference && 'items' in reference && reference.items.some((item) => item.id === id && item.disabled)) return
    if (current.flagsById[id] === value) return
    if (current.setFlag(ownerId, id, value)) report({ actionId, value: id })
  }
  let reference: LumenCardReferenceContent | undefined = content.reference
  if (reference)
    switch (reference.kind) {
      case 'members':
        reference = {
          ...reference,
          items: reference.items.map((item) => ({ ...item, connected: state.flagsById[item.id] ?? item.connected })),
          onToggle: (id, value) => changeFlag(id, value, value ? 'connect' : 'disconnect'),
        }
        break
      case 'integrations':
        reference = {
          ...reference,
          items: reference.items.map((item) => ({ ...item, connected: state.flagsById[item.id] ?? item.connected })),
          onToggle: (id, value) => changeFlag(id, value, value ? 'connect' : 'disconnect'),
        }
        break
      case 'onboarding':
        reference = {
          ...reference,
          items: reference.items.map((item) => ({
            ...item,
            complete: state.completedByStep[item.id] ?? item.complete,
          })),
          onToggle: (id, value) => {
            const current = store.getState()
            if (current.completedByStep[id] === value) return
            if (current.setStepComplete(ownerId, id, value)) report({ actionId: 'step', value: id })
          },
          onReset: () => {
            const current = store.getState()
            if (current.resetSteps(ownerId)) report({ actionId: 'reset' })
          },
        }
        break
      case 'agenda':
        reference = {
          ...reference,
          items: reference.items.map((item) => ({
            ...item,
            going: state.flagsById[`going:${item.id}`] ?? item.going,
            declined: state.flagsById[`decline:${item.id}`] ?? item.declined,
          })),
          onRespond: (id, response, selected) => {
            const current = store.getState()
            if (!current.flags.some((flag) => flag.id === `going:${id}`)) return
            if (
              current.setFlag(ownerId, `going:${id}`, response === 'going' && selected) &&
              current.setFlag(ownerId, `decline:${id}`, response === 'decline' && selected)
            )
              report({ actionId: response, value: id })
          },
        }
        break
      case 'plans':
        break
      case 'accounts':
        reference = {
          ...reference,
          selectedRangeId: state.selectedBySlot.range,
          onRange: (id) => {
            if (store.getState().select(ownerId, 'range', id)) report({ actionId: 'range', value: id })
          },
        }
        break
      case 'updates':
        reference = {
          ...reference,
          items: reference.items.map((item) => ({ ...item, bookmarked: state.flagsById[item.id] ?? item.bookmarked })),
          onToggle: (id, value) => changeFlag(id, value, 'bookmark'),
        }
        break
      case 'files': {
        const items = reference.items.map((item) => ({ ...item, selected: state.flagsById[item.id] ?? item.selected }))
        const selectedIds = items.filter((item) => item.selected && !item.disabled).map((item) => item.id)
        reference = {
          ...reference,
          items,
          onToggle: (id, value) => changeFlag(id, value, 'select-file'),
          onClear: () => {
            for (const flag of store.getState().flags) store.getState().setFlag(ownerId, flag.id, false)
            report({ actionId: 'clear' })
          },
          onDownload: () => {
            const current = store.getState()
            const validIds = current.flags.filter((flag) => current.flagsById[flag.id]).map((flag) => flag.id)
            if (
              !selectedIds.length ||
              selectedIds.length !== validIds.length ||
              selectedIds.some((id) => !validIds.includes(id))
            )
              return
            if (current.request(ownerId, { actionId: 'download', targetId: 'file-selection' }))
              report({ actionId: 'download', value: JSON.stringify(selectedIds) })
          },
        }
        break
      }
      case 'profile': {
        const id = reference.id
        reference = {
          ...reference,
          following: state.flagsById[id] ?? reference.following,
          onFollow: (value) => changeFlag(id, value, 'follow'),
        }
        break
      }
      case 'balance':
        break
    }
  return {
    ...content,
    reference,
    onAction: request,
    presentation: { ownerId, notice: state.lastRequest ? notice : undefined },
  }
}
