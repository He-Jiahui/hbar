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
  const [columns, setColumns] = useState(initial?.columns ?? content.columns)
  const [cards, setCards] = useState(initial?.cards ?? [])
  const [composerColumnId, setComposerColumnId] = useState<string | null>(initial?.composerColumnId ?? null)
  const [draft, setDraft] = useState(initial?.draft ?? '')
  const [grabbedCardId, setGrabbedCardId] = useState<string | null>(initial?.grabbedCardId ?? null)
  const [targetColumnId, setTargetColumnId] = useState<string | null>(initial?.targetColumnId ?? null)
  const [announcement, setAnnouncement] = useState(initial?.announcement ?? '')

  useEffect(() => {
    setColumns(content.referenceBoard?.columns ?? content.columns)
    setCards(content.referenceBoard?.cards ?? [])
    setComposerColumnId(content.referenceBoard?.composerColumnId ?? null)
    setDraft(content.referenceBoard?.draft ?? '')
    setGrabbedCardId(content.referenceBoard?.grabbedCardId ?? null)
    setTargetColumnId(content.referenceBoard?.targetColumnId ?? null)
    setAnnouncement(content.referenceBoard?.announcement ?? '')
  }, [content])

  const flow = content.referenceBoard
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
      }}
    >
      {children}
    </HbarAppUiKanbanProvider>
  )
}
