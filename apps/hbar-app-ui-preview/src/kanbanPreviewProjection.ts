import type { LumenKanbanContent } from '@lumen/app-ui/catalog'
import type { KanbanPreviewStoreApi } from './kanbanPreviewModel'

function first<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter(({ id }) => {
    if (!id.trim() || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Project one owner's positions onto current host records and localized copy. */
export function projectKanbanPreview(content: LumenKanbanContent, store: KanbanPreviewStoreApi): LumenKanbanContent {
  const { ownerId, data } = store.getState()
  if (data.kind === 'board' && content.referenceBoard) {
    const flow = content.referenceBoard
    const cards = first([...flow.cards, ...data.addedCards]).filter(({ id }) => data.cardIds.includes(id))
    const columns = first(flow.columns).flatMap((column) => {
      const position = data.columns.find(({ id }) => id === column.id)
      return position ? [{ ...column, cardIds: position.cardIds }] : []
    })
    const event = data.announcement
    const announcement =
      event?.kind === 'grabbed'
        ? flow.labels.grabbed(event.cardId)
        : event?.kind === 'dropped'
          ? flow.labels.dropped(event.cardId, columns.find(({ id }) => id === event.targetId)?.label ?? '')
          : event?.kind === 'added'
            ? flow.labels.added(event.title)
            : ''
    return {
      ...content,
      referenceBoard: {
        ...flow,
        columns,
        cards,
        composerColumnId: data.composerColumnId,
        draft: data.draft,
        grabbedCardId: data.grabbedCardId,
        targetColumnId: data.targetColumnId,
        announcement,
        onOpenComposer: (id) => {
          store.getState().boardOpenComposer(ownerId, id)
        },
        onDraftChange: (value) => {
          store.getState().boardDraft(ownerId, value)
        },
        onCancelComposer: () => {
          store.getState().boardCancelComposer(ownerId)
        },
        onAddCard: () => {
          const template = cards[0]
          const choice = content.assignees[0]
          const defaults = template
            ? { id: template.assignee, name: template.assigneeName }
            : choice
              ? { id: choice.id, name: choice.label }
              : undefined
          if (defaults) store.getState().boardAddCard(ownerId, flow.labels.newCardTag, defaults)
        },
        onGrab: (id, columnId) => {
          store.getState().boardGrab(ownerId, id, columnId)
        },
        onTargetChange: (id) => {
          store.getState().boardTargetChange(ownerId, id)
        },
        onDrop: (id, columnId) => {
          store.getState().boardDrop(ownerId, id, columnId)
        },
        onCancelGrab: () => {
          store.getState().boardCancelGrab(ownerId)
        },
      },
    }
  }
  if (data.kind === 'swimlanes' && content.referenceSwimlanes) {
    const flow = content.referenceSwimlanes
    const cardsById = new Map(first(flow.lanes.flatMap((lane) => lane.cards)).map((card) => [card.id, card]))
    const lanes = first(flow.lanes).flatMap((lane) => {
      const position = data.lanes.find(({ id }) => id === lane.id)
      return position
        ? [
            {
              ...lane,
              cards: position.columns.flatMap((column) =>
                column.cardIds.flatMap((id) => {
                  const card = cardsById.get(id)
                  return card ? [{ ...card, stageId: column.id }] : []
                }),
              ),
            },
          ]
        : []
    })
    const event = data.announcement
    return {
      ...content,
      referenceSwimlanes: {
        ...flow,
        lanes,
        stages: first(flow.stages).filter(({ id }) => data.stages.includes(id)),
        collapsedLaneIds: data.collapsedLaneIds,
        grabbedCardId: data.grabbedCardId,
        announcement:
          event?.kind === 'grabbed'
            ? flow.labels.grabbed(event.cardId)
            : event?.kind === 'dropped'
              ? flow.labels.dropped(event.cardId)
              : '',
        onToggleLane: (id) => {
          store.getState().swimToggleLane(ownerId, id)
        },
        onToggleAll: () => {
          store.getState().swimToggleAll(ownerId)
        },
        onGrab: (id) => {
          store.getState().swimGrab(ownerId, id)
        },
        onMove: (id, laneId, stageId) => {
          store.getState().swimMove(ownerId, id, laneId, stageId)
        },
        onDrop: (id) => {
          store.getState().swimDrop(ownerId, id)
        },
        onCancelGrab: () => {
          store.getState().swimCancelGrab(ownerId)
        },
      },
    }
  }
  if (data.kind === 'regroup' && content.referenceRegroup) {
    const flow = content.referenceRegroup
    const cardsById = new Map(first(flow.cards).map((card) => [card.id, card]))
    const groups = first(flow.groups).filter(({ id }) => data.groups.includes(id))
    const columns = Object.fromEntries(
      groups.map(({ id }) => [
        id,
        first(flow.columns[id] ?? []).filter((column) => data.columns[id]?.includes(column.id)),
      ]),
    )
    const cards = data.cards.flatMap((values) => {
      const card = cardsById.get(values.id)
      return card
        ? [
            {
              ...card,
              ...values,
              priorityTone: columns.priority?.find(({ id }) => id === values.priorityId)?.tone ?? card.priorityTone,
            },
          ]
        : []
    })
    const event = data.announcement
    return {
      ...content,
      referenceRegroup: {
        ...flow,
        groups,
        columns,
        cards,
        groupId: data.groupId,
        grabbedCardId: data.grabbedCardId,
        announcement:
          event?.kind === 'grabbed'
            ? flow.labels.grabbed(event.cardId, groups.find(({ id }) => id === event.groupId)?.label ?? '')
            : event?.kind === 'dropped'
              ? flow.labels.dropped(
                  event.cardId,
                  columns[data.groupId]?.find(({ id }) => id === event.targetId)?.label ?? '',
                )
              : '',
        onGroupChange: (id) => {
          store.getState().regroupGroupChange(ownerId, id)
        },
        onGrab: (id) => {
          store.getState().regroupGrab(ownerId, id)
        },
        onMove: (id, groupId, columnId) => {
          store.getState().regroupMove(ownerId, id, groupId, columnId)
        },
        onDrop: (id, columnId) => {
          store.getState().regroupDrop(ownerId, id, columnId)
        },
        onCancelGrab: () => {
          store.getState().regroupCancelGrab(ownerId)
        },
      },
    }
  }
  if (data.kind === 'detail' && content.referenceDetail) {
    const flow = content.referenceDetail
    const cardsById = new Map(first(flow.cards).map((card) => [card.id, card]))
    const cards = data.cardIds.flatMap((id) => {
      const card = cardsById.get(id)
      return card ? [{ ...card, statusId: data.statusByCard[id] ?? card.statusId }] : []
    })
    const columns = first(flow.columns).filter(({ id }) => data.columns.includes(id))
    const event = data.announcement
    return {
      ...content,
      referenceDetail: {
        ...flow,
        cards,
        columns,
        selectedCardId: data.selectedCardId,
        grabbedCardId: data.grabbedCardId,
        announcement:
          event?.kind === 'moved'
            ? flow.labels.moved(event.cardId, columns.find(({ id }) => id === event.targetId)?.label ?? '')
            : '',
        onSelect: (id) => {
          store.getState().detailSelect(ownerId, id)
        },
        onClose: () => {
          store.getState().detailClose(ownerId)
        },
        onGrab: (id) => {
          store.getState().detailGrab(ownerId, id)
        },
        onMove: (id, columnId) => {
          store.getState().detailMove(ownerId, id, columnId)
        },
        onCancelGrab: () => {
          store.getState().detailCancelGrab(ownerId)
        },
      },
    }
  }
  if (data.kind === 'sprint' && content.referenceSprint) {
    const flow = content.referenceSprint
    const cardsById = new Map(first(flow.cards).map((card) => [card.id, card]))
    const cards = data.cardIds.flatMap((id) => {
      const card = cardsById.get(id)
      return card ? [{ ...card, stageId: data.stageByCard[id] ?? card.stageId }] : []
    })
    const stages = first(flow.stages).filter(({ id }) => data.stages.includes(id))
    const event = data.announcement
    return {
      ...content,
      referenceSprint: {
        ...flow,
        cards,
        stages,
        grabbedCardId: data.grabbedCardId,
        announcement:
          event?.kind === 'grabbed'
            ? flow.labels.grabbed(event.cardId)
            : event?.kind === 'dropped'
              ? flow.labels.dropped(event.cardId, stages.find(({ id }) => id === event.targetId)?.label ?? '')
              : '',
        onGrab: (id) => {
          store.getState().sprintGrab(ownerId, id)
        },
        onMove: (id, stageId) => {
          store.getState().sprintMove(ownerId, id, stageId)
        },
        onDrop: (id, stageId) => {
          store.getState().sprintDrop(ownerId, id, stageId)
        },
        onCancelGrab: () => {
          store.getState().sprintCancelGrab(ownerId)
        },
      },
    }
  }
  if (data.kind === 'compact' && content.referenceCompact) {
    const flow = content.referenceCompact
    const cardsById = new Map(first(flow.cards).map((card) => [card.id, card]))
    const cards = data.cardIds.flatMap((id) => {
      const card = cardsById.get(id)
      return card ? [{ ...card, columnId: data.columnByCard[id] ?? card.columnId }] : []
    })
    const columns = first(flow.columns).filter(({ id }) => data.columns.includes(id))
    const event = data.announcement
    return {
      ...content,
      referenceCompact: {
        ...flow,
        cards,
        columns,
        selectedColumnId: data.selectedColumnId,
        announcement:
          event?.kind === 'moved'
            ? flow.labels.moved(
                cardsById.get(event.cardId)?.label ?? '',
                columns.find(({ id }) => id === event.targetId)?.label ?? '',
              )
            : '',
        onSelectColumn: (id) => {
          store.getState().compactSelectColumn(ownerId, id)
        },
        onMove: (id, columnId) => {
          store.getState().compactMove(ownerId, id, columnId)
        },
      },
    }
  }
  return content
}
