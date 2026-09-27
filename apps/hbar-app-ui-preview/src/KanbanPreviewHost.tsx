import { useEffect, useState, type ReactNode } from 'react'
import { HbarAppUiKanbanProvider, type HbarAppUiKanbanContent } from 'hbar-app-ui/catalog'

export function KanbanPreviewHost({
  content,
  children,
}: {
  readonly content: HbarAppUiKanbanContent
  readonly children: ReactNode
}) {
  const initial = content.referenceBoard
  const initialSwimlanes = content.referenceSwimlanes
  const initialRegroup = content.referenceRegroup
  const initialDetail = content.referenceDetail
  const [columns, setColumns] = useState(initial?.columns ?? content.columns)
  const [cards, setCards] = useState(initial?.cards ?? [])
  const [composerColumnId, setComposerColumnId] = useState<string | null>(initial?.composerColumnId ?? null)
  const [draft, setDraft] = useState(initial?.draft ?? '')
  const [grabbedCardId, setGrabbedCardId] = useState<string | null>(initial?.grabbedCardId ?? null)
  const [targetColumnId, setTargetColumnId] = useState<string | null>(initial?.targetColumnId ?? null)
  const [announcement, setAnnouncement] = useState(initial?.announcement ?? '')
  const [lanes, setLanes] = useState(initialSwimlanes?.lanes ?? [])
  const [collapsedLaneIds, setCollapsedLaneIds] = useState<readonly string[]>(initialSwimlanes?.collapsedLaneIds ?? [])
  const [swimlaneGrabbedCardId, setSwimlaneGrabbedCardId] = useState<string | null>(
    initialSwimlanes?.grabbedCardId ?? null,
  )
  const [swimlaneAnnouncement, setSwimlaneAnnouncement] = useState(initialSwimlanes?.announcement ?? '')
  const [regroupCards, setRegroupCards] = useState(initialRegroup?.cards ?? [])
  const [regroupGroupId, setRegroupGroupId] = useState(initialRegroup?.groupId ?? '')
  const [regroupGrabbedCardId, setRegroupGrabbedCardId] = useState<string | null>(initialRegroup?.grabbedCardId ?? null)
  const [regroupAnnouncement, setRegroupAnnouncement] = useState(initialRegroup?.announcement ?? '')
  const [detailCards, setDetailCards] = useState(initialDetail?.cards ?? [])
  const [detailSelectedCardId, setDetailSelectedCardId] = useState<string | null>(initialDetail?.selectedCardId ?? null)
  const [detailGrabbedCardId, setDetailGrabbedCardId] = useState<string | null>(initialDetail?.grabbedCardId ?? null)
  const [detailAnnouncement, setDetailAnnouncement] = useState(initialDetail?.announcement ?? '')

  useEffect(() => {
    setColumns(content.referenceBoard?.columns ?? content.columns)
    setCards(content.referenceBoard?.cards ?? [])
    setComposerColumnId(content.referenceBoard?.composerColumnId ?? null)
    setDraft(content.referenceBoard?.draft ?? '')
    setGrabbedCardId(content.referenceBoard?.grabbedCardId ?? null)
    setTargetColumnId(content.referenceBoard?.targetColumnId ?? null)
    setAnnouncement(content.referenceBoard?.announcement ?? '')
    setLanes(content.referenceSwimlanes?.lanes ?? [])
    setCollapsedLaneIds(content.referenceSwimlanes?.collapsedLaneIds ?? [])
    setSwimlaneGrabbedCardId(content.referenceSwimlanes?.grabbedCardId ?? null)
    setSwimlaneAnnouncement(content.referenceSwimlanes?.announcement ?? '')
    setRegroupCards(content.referenceRegroup?.cards ?? [])
    setRegroupGroupId(content.referenceRegroup?.groupId ?? '')
    setRegroupGrabbedCardId(content.referenceRegroup?.grabbedCardId ?? null)
    setRegroupAnnouncement(content.referenceRegroup?.announcement ?? '')
    setDetailCards(content.referenceDetail?.cards ?? [])
    setDetailSelectedCardId(content.referenceDetail?.selectedCardId ?? null)
    setDetailGrabbedCardId(content.referenceDetail?.grabbedCardId ?? null)
    setDetailAnnouncement(content.referenceDetail?.announcement ?? '')
  }, [content])

  const flow = content.referenceBoard
  const swimlanes = content.referenceSwimlanes
  const regroup = content.referenceRegroup
  const detail = content.referenceDetail
  return (
    <HbarAppUiKanbanProvider
      content={{
        ...content,
        referenceBoard: flow && {
          ...flow,
          columns,
          cards,
          composerColumnId,
          draft,
          grabbedCardId,
          targetColumnId,
          announcement,
          onOpenComposer: (columnId) => {
            setComposerColumnId(columnId)
            setDraft('')
          },
          onDraftChange: setDraft,
          onCancelComposer: () => {
            setComposerColumnId(null)
            setDraft('')
          },
          onAddCard: () => {
            const title = draft.trim()
            if (!title || !composerColumnId) return
            const nextNumber =
              Math.max(0, ...cards.map((card) => Number.parseInt(card.id.match(/\d+$/)?.[0] ?? '0', 10))) + 1
            const id = `HAL-${nextNumber}`
            setCards((current) => [
              {
                id,
                label: title,
                tag: flow.labels.newCardTag,
                assignee: 'AR',
                assigneeName: 'Ana Reyes',
                priority: 'medium',
              },
              ...current,
            ])
            setColumns((current) =>
              current.map((column) =>
                column.id === composerColumnId ? { ...column, cardIds: [id, ...column.cardIds] } : column,
              ),
            )
            setDraft('')
            setComposerColumnId(null)
            setAnnouncement(flow.labels.added(title))
          },
          onGrab: (cardId, columnId) => {
            setGrabbedCardId(cardId)
            setTargetColumnId(columnId)
            setAnnouncement(flow.labels.grabbed(cardId))
          },
          onTargetChange: (columnId) => {
            if (grabbedCardId)
              setColumns((current) =>
                current.map((column) => {
                  const cardIds = column.cardIds.filter((id) => id !== grabbedCardId)
                  return column.id === columnId
                    ? { ...column, cardIds: [...cardIds, grabbedCardId] }
                    : { ...column, cardIds }
                }),
              )
            setTargetColumnId(columnId)
          },
          onDrop: (cardId, columnId) => {
            setColumns((current) =>
              current.map((column) => {
                const cardIds = column.cardIds.filter((id) => id !== cardId)
                return column.id === columnId ? { ...column, cardIds: [...cardIds, cardId] } : { ...column, cardIds }
              }),
            )
            setGrabbedCardId(null)
            setTargetColumnId(null)
            setAnnouncement(
              flow.labels.dropped(cardId, columns.find((column) => column.id === columnId)?.label ?? columnId),
            )
          },
          onCancelGrab: () => {
            setGrabbedCardId(null)
            setTargetColumnId(null)
            setAnnouncement('')
          },
        },
        referenceSwimlanes: swimlanes && {
          ...swimlanes,
          lanes,
          collapsedLaneIds,
          grabbedCardId: swimlaneGrabbedCardId,
          announcement: swimlaneAnnouncement,
          onToggleLane: (laneId) =>
            setCollapsedLaneIds((current) =>
              current.includes(laneId) ? current.filter((id) => id !== laneId) : [...current, laneId],
            ),
          onToggleAll: () =>
            setCollapsedLaneIds((current) => (current.length === lanes.length ? [] : lanes.map((lane) => lane.id))),
          onGrab: (cardId) => {
            setSwimlaneGrabbedCardId(cardId)
            setSwimlaneAnnouncement(swimlanes.labels.grabbed(cardId))
          },
          onMove: (cardId, laneId, stageId) =>
            setLanes((current) => {
              const card = current.flatMap((lane) => lane.cards).find((item) => item.id === cardId)
              const originalLaneId = current.find((lane) => lane.cards.some((item) => item.id === cardId))?.id
              if (!card) return current
              return current.map((lane) => {
                const remaining = lane.cards.filter((item) => item.id !== cardId)
                if (lane.id !== laneId) return { ...lane, cards: remaining }
                if (originalLaneId === laneId) return { ...lane, cards: [...remaining, { ...card, stageId }] }
                const insertAt = remaining.findIndex((item) => item.stageId === stageId)
                const next = [...remaining]
                next.splice(insertAt < 0 ? next.length : insertAt, 0, { ...card, stageId })
                return { ...lane, cards: next }
              })
            }),
          onDrop: (cardId) => {
            setSwimlaneGrabbedCardId(null)
            setSwimlaneAnnouncement(swimlanes.labels.dropped(cardId))
          },
          onCancelGrab: () => {
            setSwimlaneGrabbedCardId(null)
            setSwimlaneAnnouncement('')
          },
        },
        referenceRegroup: regroup && {
          ...regroup,
          cards: regroupCards,
          groupId: regroupGroupId,
          grabbedCardId: regroupGrabbedCardId,
          announcement: regroupAnnouncement,
          onGroupChange: (groupId) => {
            setRegroupGroupId(groupId)
            setRegroupGrabbedCardId(null)
            setRegroupAnnouncement('')
          },
          onGrab: (cardId) => {
            setRegroupGrabbedCardId(cardId)
            setRegroupAnnouncement(regroup.labels.grabbed(cardId, regroupGroupId))
          },
          onMove: (cardId, groupId, columnId) => setRegroupCards((current) => {
            const card = current.find((item) => item.id === cardId)
            if (!card) return current
            const updated = groupId === 'assignee' ? {...card, assigneeId: columnId}
              : groupId === 'priority' ? {...card, priorityId: columnId, priorityTone: columnId === 'urgent' ? 'strong' as const : columnId === 'high' ? 'medium' as const : 'soft' as const}
              : {...card, statusId: columnId}
            return [...current.filter((item) => item.id !== cardId), updated]
          }),
          onDrop: (cardId, columnId) => {
            setRegroupGrabbedCardId(null)
            const label = regroup.columns[regroupGroupId]?.find((column) => column.id === columnId)?.label ?? columnId
            setRegroupAnnouncement(regroup.labels.dropped(cardId, label))
          },
          onCancelGrab: () => {
            setRegroupGrabbedCardId(null)
            setRegroupAnnouncement('')
          },
        },
        referenceDetail: detail && {
          ...detail,
          cards: detailCards,
          selectedCardId: detailSelectedCardId,
          grabbedCardId: detailGrabbedCardId,
          announcement: detailAnnouncement,
          onSelect: (cardId) => { setDetailSelectedCardId(cardId); setDetailAnnouncement('') },
          onClose: () => { setDetailSelectedCardId(null); setDetailAnnouncement('') },
          onGrab: setDetailGrabbedCardId,
          onMove: (cardId, columnId) => {
            setDetailCards((current) => {
              const card = current.find((item) => item.id === cardId)
              return card ? [...current.filter((item) => item.id !== cardId), {...card, statusId: columnId}] : current
            })
            setDetailGrabbedCardId(null)
            const label = detail.columns.find((column) => column.id === columnId)?.label ?? columnId
            setDetailAnnouncement(detail.labels.moved(cardId, label))
          },
          onCancelGrab: () => setDetailGrabbedCardId(null),
        },
      }}
    >
      {children}
    </HbarAppUiKanbanProvider>
  )
}
