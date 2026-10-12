'use client'

import * as React from 'react'
import { LumenSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import { BoardReference } from './kanban/BoardReference'
import SwimlanesReference from './kanban/SwimlanesReference'
import RegroupReference from './kanban/RegroupReference'
import DetailReference from './kanban/DetailReference'
import SprintReference from './kanban/SprintReference'
import CompactReference from './kanban/CompactReference'
import './kanban.css'
import './kanban-reference.css'
import './kanban-swimlanes-reference.css'
import './kanban-regroup-reference.css'
import './kanban-detail-reference.css'
import './kanban-sprint-reference.css'
import './kanban-compact-reference.css'

export interface LumenKanbanListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenKanbanChoice {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
}

export interface LumenKanbanCard extends LumenKanbanChoice {
  readonly tag: string
  readonly assignee: string
  readonly comments?: number | undefined
  readonly files?: number | undefined
  readonly points?: number | undefined
  readonly blocked?: boolean | undefined
  readonly groupValues?: Readonly<Record<string, string>> | undefined
  readonly actions?:
    | readonly {
        readonly id: string
        readonly label: string
        readonly runId?: string | undefined
        readonly disabled?: boolean
      }[]
    | undefined
}

export interface LumenKanbanColumn extends LumenKanbanChoice {
  readonly cardIds: readonly string[]
  readonly limit?: number | undefined
  readonly points?: number | undefined
  readonly progress?: number | undefined
}

export interface LumenKanbanLane extends LumenKanbanChoice {
  readonly columns: readonly LumenKanbanColumn[]
}

export interface LumenKanbanMetric extends LumenKanbanChoice {
  readonly value: string
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenKanbanReferenceCard {
  readonly id: string
  readonly label: string
  readonly tag: string
  readonly assignee: string
  readonly assigneeName: string
  readonly priority: 'high' | 'medium' | 'low'
  readonly comments?: number | undefined
  readonly files?: number | undefined
}

export interface LumenKanbanSwimlaneCard {
  readonly id: string
  readonly label: string
  readonly points: number
  readonly stageId: string
}

export interface LumenKanbanReferenceLane {
  readonly id: string
  readonly label: string
  readonly avatar: string
  readonly cards: readonly LumenKanbanSwimlaneCard[]
}

export interface LumenKanbanRegroupCard {
  readonly id: string
  readonly label: string
  readonly tag: string
  readonly statusId: string
  readonly assigneeId: string
  readonly priorityId: string
  readonly priorityTone: 'strong' | 'medium' | 'soft'
}

export interface LumenKanbanRegroupColumn extends LumenKanbanChoice {
  readonly avatar?: string | undefined
  readonly tone?: 'strong' | 'medium' | 'soft' | undefined
}

export interface LumenKanbanDetailActivity {
  readonly id: string
  readonly avatar: string
  readonly name: string
  readonly time: string
  readonly text: string
}

export interface LumenKanbanDetailCard {
  readonly id: string
  readonly label: string
  readonly statusId: string
  readonly tone: 'strong' | 'medium' | 'soft'
  readonly points: number
  readonly assignee: string
  readonly assigneeName: string
  readonly priority?: string | undefined
  readonly description?: string | undefined
  readonly activity?: readonly LumenKanbanDetailActivity[] | undefined
  /** Indicates that the preview did not capture this card's detail pane data. */
  readonly detailAvailability?: 'available' | 'unavailable' | undefined
  /** Captured comment count when activity rows are not part of the card payload. */
  readonly activityCount?: number | undefined
}

export interface LumenKanbanSprintCard {
  readonly id: string
  readonly label: string
  readonly points: number
  readonly assignee: string
  readonly blocked: boolean
  readonly stageId: string
}

export interface LumenKanbanSprintStage extends LumenKanbanChoice {
  readonly capacity?: number | undefined
}

export interface LumenKanbanCompactCard {
  readonly id: string
  readonly label: string
  readonly tag: string
  readonly assignee: string
  readonly completed: number
  readonly total: number
  readonly columnId: string
}

export interface LumenKanbanContent {
  readonly labels: {
    readonly boardTitle: string
    readonly boardDetail: (count: number) => string
    readonly board: string
    readonly participants: string
    readonly add: (column: string) => string
    readonly newCard: string
    readonly move: string
    readonly theme: string
    readonly standard: string
    readonly swimlaneTitle: string
    readonly swimlaneDetail: string
    readonly workstream: string
    readonly regroupTitle: string
    readonly regroupDetail: string
    readonly groupBy: string
    readonly detailTitle: string
    readonly detailDetail: string
    readonly addCard: string
    readonly properties: string
    readonly assignee: string
    readonly priority: string
    readonly activity: string
    readonly save: string
    readonly sprintTitle: string
    readonly sprintDetail: string
    readonly blocked: string
    readonly capacity: (label: string) => string
    readonly moved: string
    readonly compactTitle: string
    readonly compactDetail: string
    readonly column: string
    readonly steps: string
    readonly nextStep: string
    readonly more: string
    readonly empty: string
    readonly emptyColumn: string
  }
  readonly participants: readonly string[]
  readonly columns: readonly LumenKanbanColumn[]
  readonly cards: readonly LumenKanbanCard[]
  readonly lanes: readonly LumenKanbanLane[]
  readonly groups: readonly LumenKanbanChoice[]
  readonly initialGroupId: string
  readonly assignees: readonly LumenKanbanChoice[]
  readonly priorities: readonly LumenKanbanChoice[]
  readonly metrics: readonly LumenKanbanMetric[]
  readonly compactColumns: readonly LumenKanbanColumn[]
  readonly initialCompactColumnId: string
  readonly listStrategy: LumenKanbanListStrategy
  readonly referenceBoard?:
    | {
        readonly labels: {
          readonly detail: (count: number) => string
          readonly card: (card: LumenKanbanReferenceCard) => string
          readonly newCardIn: (column: string) => string
          readonly placeholder: string
          readonly add: string
          readonly cancel: string
          readonly newCardTag: string
          readonly grabbed: (cardId: string) => string
          readonly dropped: (cardId: string, column: string) => string
          readonly added: (title: string) => string
        }
        readonly columns: readonly LumenKanbanColumn[]
        readonly cards: readonly LumenKanbanReferenceCard[]
        readonly composerColumnId: string | null
        readonly draft: string
        readonly grabbedCardId: string | null
        readonly targetColumnId: string | null
        readonly announcement: string
        readonly onOpenComposer: (columnId: string) => void
        readonly onDraftChange: (value: string) => void
        readonly onCancelComposer: () => void
        readonly onAddCard: () => void
        readonly onGrab: (cardId: string, columnId: string) => void
        readonly onTargetChange: (columnId: string) => void
        readonly onDrop: (cardId: string, columnId: string) => void
        readonly onCancelGrab: () => void
      }
    | undefined
  readonly referenceSwimlanes?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: string
          readonly collapseAll: string
          readonly expandAll: string
          readonly shipped: (done: number, total: number) => string
          readonly points: (count: number) => string
          readonly card: (card: LumenKanbanSwimlaneCard, lane: string, stage: string) => string
          readonly draggableCard: string
          readonly grabbed: (cardId: string) => string
          readonly dropped: (cardId: string) => string
        }
        readonly stages: readonly LumenKanbanChoice[]
        readonly lanes: readonly LumenKanbanReferenceLane[]
        readonly collapsedLaneIds: readonly string[]
        readonly grabbedCardId: string | null
        readonly announcement: string
        readonly onToggleLane: (laneId: string) => void
        readonly onToggleAll: () => void
        readonly onGrab: (cardId: string) => void
        readonly onMove: (cardId: string, laneId: string, stageId: string) => void
        readonly onDrop: (cardId: string) => void
        readonly onCancelGrab: () => void
      }
    | undefined
  readonly referenceRegroup?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: string
          readonly groupBy: string
          readonly card: (card: LumenKanbanRegroupCard, group: string, column: string) => string
          readonly grabbed: (cardId: string, group: string) => string
          readonly dropped: (cardId: string, column: string) => string
        }
        readonly groups: readonly LumenKanbanChoice[]
        readonly columns: Readonly<Record<string, readonly LumenKanbanRegroupColumn[]>>
        readonly cards: readonly LumenKanbanRegroupCard[]
        readonly groupId: string
        readonly grabbedCardId: string | null
        readonly announcement: string
        readonly onGroupChange: (groupId: string) => void
        readonly onGrab: (cardId: string) => void
        readonly onMove: (cardId: string, groupId: string, columnId: string) => void
        readonly onDrop: (cardId: string, columnId: string) => void
        readonly onCancelGrab: () => void
      }
    | undefined
  readonly referenceDetail?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: (count: number) => string
          readonly card: (card: LumenKanbanDetailCard) => string
          readonly details: (cardId: string) => string
          readonly close: string
          readonly assignee: string
          readonly priority: string
          readonly estimate: string
          readonly points: (count: number) => string
          readonly shortPoints: (count: number) => string
          readonly moveTo: string
          readonly activity: string
          readonly noActivity: string
          readonly detailUnavailable?: string | undefined
          readonly moved: (cardId: string, column: string) => string
        }
        readonly columns: readonly LumenKanbanChoice[]
        readonly cards: readonly LumenKanbanDetailCard[]
        readonly selectedCardId: string | null
        readonly grabbedCardId: string | null
        readonly announcement: string
        readonly onSelect: (cardId: string) => void
        readonly onClose: () => void
        readonly onGrab: (cardId: string) => void
        readonly onMove: (cardId: string, columnId: string) => void
        readonly onCancelGrab: () => void
      }
    | undefined
  readonly referenceSprint?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: string
          readonly committed: string
          readonly accepted: string
          readonly burned: string
          readonly points: (count: number) => string
          readonly capacity: (stage: string) => string
          readonly capacityPoints: (points: number, capacity: number) => string
          readonly burnedValue: (percent: number) => string
          readonly blocked: string
          readonly card: (card: LumenKanbanSprintCard) => string
          readonly grabbed: (cardId: string) => string
          readonly dropped: (cardId: string, stage: string) => string
        }
        readonly stages: readonly LumenKanbanSprintStage[]
        readonly cards: readonly LumenKanbanSprintCard[]
        readonly grabbedCardId: string | null
        readonly announcement: string
        readonly onGrab: (cardId: string) => void
        readonly onMove: (cardId: string, stageId: string) => void
        readonly onDrop: (cardId: string, stageId: string) => void
        readonly onCancelGrab: () => void
      }
    | undefined
  readonly referenceCompact?:
    | {
        readonly labels: {
          readonly title: string
          readonly detail: (count: number) => string
          readonly column: string
          readonly progress: (completed: number, total: number) => string
          readonly shortProgress: (completed: number, total: number) => string
          readonly card: (card: LumenKanbanCompactCard) => string
          readonly movePrevious: (card: string, column: string) => string
          readonly moveNext: (card: string, column: string) => string
          readonly moved: (card: string, column: string) => string
        }
        readonly columns: readonly LumenKanbanChoice[]
        readonly cards: readonly LumenKanbanCompactCard[]
        readonly selectedColumnId: string
        readonly announcement: string
        readonly onSelectColumn: (columnId: string) => void
        readonly onMove: (cardId: string, columnId: string) => void
      }
    | undefined
}

export interface LumenKanbanProviderProps {
  readonly content: LumenKanbanContent
  readonly children: React.ReactNode
}

export interface LumenKanbanAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenKanbanProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenKanbanContent | undefined
  readonly onAction?: ((event: LumenKanbanAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  /** Disable board mutations while retaining the reference layout and selection actions. */
  readonly readOnly?: boolean | undefined
}

export type LumenKanbanVariantProps = Omit<LumenKanbanProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenKanbanContent | undefined>(undefined)

export function LumenKanbanProvider({ content, children }: LumenKanbanProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenKanbanContent() {
  return React.useContext(Context)
}

export function uniqueLumenKanbanItems<T extends { readonly id: string }>(items: readonly T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenKanbanItem<T extends { readonly id: string }>(items: readonly T[], id: string | undefined) {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenKanbanProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { name: 'plus' | 'drag' | 'comment' | 'file' | 'blocked' | 'more' | 'next' }) {
  const paths = {
    plus: 'M8 3v10M3 8h10',
    drag: 'M6 3h.1M10 3h.1M6 8h.1M10 8h.1M6 13h.1M10 13h.1',
    comment: 'M3 3h10v8H7l-3 3v-3H3z',
    file: 'M4 2h5l3 3v9H4zM9 2v3h3',
    blocked: 'M8 2 14 13H2zM8 6v3M8 11h.1',
    more: 'M3 8h.1M8 8h.1M13 8h.1',
    next: 'm6 3 5 5-5 5',
  } as const
  return (
    <svg className="lumen-kanban-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

function Root({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenKanbanProps, 'content' | 'onAction'> & { children: React.ReactNode }) {
  const contentClassName = [
    'lumen-kanban-stage',
    `hbar-app-ui-kanban-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as={variant <= 6 ? 'div' : 'section'}
      boundary={variant <= 6 ? 'none' : 'horizontal'}
      className="lumen-kanban-stage-surface"
      contentClassName={contentClassName}
      data-lumen-component="kanban"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({ title, detail, actions }: { title: string; detail: string; actions?: React.ReactNode }) {
  return (
    <header className="lumen-kanban-header">
      <div>
        <LumenText as="h1" variant="title">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {detail}
        </LumenText>
      </div>
      {actions}
    </header>
  )
}

function Empty({ children }: { children: string }) {
  return (
    <LumenText as="p" className="lumen-kanban-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function Card({
  card,
  onOpen,
  onMove,
  moveLabel,
  onAction,
}: {
  card: LumenKanbanCard
  onOpen: () => void
  onMove?: (() => void) | undefined
  moveLabel?: string | undefined
  onAction?: LumenKanbanProps['onAction'] | undefined
}) {
  return (
    <article className="lumen-kanban-card">
      <LumenButton
        variant="text"
        draggable={Boolean(onMove)}
        onDragEnd={onMove}
        onKeyDown={(event) => {
          if (onMove && (event.key === ' ' || event.key === 'ArrowRight')) {
            event.preventDefault()
            onMove()
          }
        }}
        onClick={onOpen}
      >
        <span className="lumen-kanban-card-top">
          <code>{card.id}</code>
          <Glyph name="drag" />
        </span>
        <strong>{card.label}</strong>
        <small>{card.detail}</small>
        <footer>
          <span>{card.tag}</span>
          {card.blocked ? <Glyph name="blocked" /> : null}
          {card.comments !== undefined ? (
            <span>
              <Glyph name="comment" />
              {card.comments}
            </span>
          ) : null}
          {card.files !== undefined ? (
            <span>
              <Glyph name="file" />
              {card.files}
            </span>
          ) : null}
          <i>{card.assignee}</i>
        </footer>
      </LumenButton>
      {onMove && moveLabel ? (
        <LumenButton variant="outlined" onClick={onMove}>
          {moveLabel}
          <Glyph name="next" />
        </LumenButton>
      ) : null}
      {card.actions?.length ? (
        <footer>
          {card.actions.map((action) => (
            <LumenButton
              key={action.id}
              variant="outlined"
              disabled={action.disabled}
              onClick={() => report(onAction, action.id, action.runId ?? card.id)}
            >
              {action.label}
            </LumenButton>
          ))}
        </footer>
      ) : null}
    </article>
  )
}

function Board(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  if (props.content.referenceBoard) {
    return (
      <Root {...props} className={[props.className, 'hbar-app-ui-kanban-reference'].filter(Boolean).join(' ')}>
        <BoardReference content={props.content} onAction={props.onAction} />
      </Root>
    )
  }
  return <LegacyBoard {...props} />
}

function LegacyBoard(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  const sourceCards = uniqueLumenKanbanItems(props.content.cards)
  const sourceColumns = uniqueLumenKanbanItems(props.content.columns)
  const hostColumnCards = React.useMemo(
    () =>
      Object.fromEntries(
        sourceColumns.map((column) => [
          column.id,
          column.cardIds.filter(
            (id, index, ids) => ids.indexOf(id) === index && sourceCards.some((card) => card.id === id),
          ),
        ]),
      ) as Record<string, readonly string[]>,
    [sourceCards, sourceColumns],
  )
  const [localColumnCards, setLocalColumnCards] = React.useState<Record<string, readonly string[]>>(hostColumnCards)
  const hostProjectionKey = sourceColumns.map((column) => `${column.id}:${column.cardIds.join(',')}`).join('|')
  const [lastHostProjectionKey, setLastHostProjectionKey] = React.useState(hostProjectionKey)
  React.useEffect(() => {
    if (lastHostProjectionKey !== hostProjectionKey) {
      setLastHostProjectionKey(hostProjectionKey)
      setLocalColumnCards(hostColumnCards)
    }
  }, [hostColumnCards, hostProjectionKey, lastHostProjectionKey])
  const columnCards = props.readOnly ? hostColumnCards : localColumnCards
  const count = Object.values(columnCards).reduce((total, ids) => total + ids.length, 0)
  const move = (cardId: string, fromId: string) => {
    const index = sourceColumns.findIndex((column) => column.id === fromId)
    const destination = sourceColumns[index + 1]
    if (!destination) {
      return
    }
    setLocalColumnCards((current) => ({
      ...current,
      [fromId]: (current[fromId] ?? []).filter((id) => id !== cardId),
      [destination.id]: [...(current[destination.id] ?? []), cardId],
    }))
    report(props.onAction, 'move', `${cardId}:${fromId}:${destination.id}`)
  }
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.boardTitle}
        detail={props.content.labels.boardDetail(count)}
        actions={
          <div className="lumen-kanban-participants" aria-label={props.content.labels.participants}>
            {props.content.participants.map((item) => (
              <i key={item}>{item}</i>
            ))}
          </div>
        }
      />
      <main
        className="lumen-kanban-board"
        aria-label={props.content.labels.board}
        data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
      >
        {sourceColumns.length ? (
          sourceColumns.map((column) => {
            const ids = columnCards[column.id] ?? []
            return (
              <section key={column.id}>
                <header>
                  <LumenText as="h2" variant="heading">
                    {column.label}
                  </LumenText>
                  <span>{column.limit ? `${ids.length}/${column.limit}` : ids.length}</span>
                  {props.readOnly ? null : (
                    <LumenIconButton
                      label={props.content.labels.add(column.label)}
                      onClick={() => report(props.onAction, 'add', column.id)}
                    >
                      <Glyph name="plus" />
                    </LumenIconButton>
                  )}
                </header>
                <div>
                  {ids.map((id) => {
                    const card = sourceCards.find((item) => item.id === id)
                    return card ? (
                      <Card
                        key={card.id}
                        card={card}
                        onOpen={() => report(props.onAction, 'open', card.id)}
                        onMove={props.readOnly ? undefined : () => move(card.id, column.id)}
                        onAction={props.onAction}
                      />
                    ) : null
                  })}
                  {ids.length ? null : <Empty>{props.content.labels.emptyColumn}</Empty>}
                </div>
              </section>
            )
          })
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </main>
    </Root>
  )
}

function Swimlanes(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  if (props.content.referenceSwimlanes) {
    return (
      <Root
        {...props}
        className={[props.className, 'hbar-app-ui-kanban-swimlanes-reference'].filter(Boolean).join(' ')}
      >
        <SwimlanesReference content={props.content} />
      </Root>
    )
  }
  return <LegacySwimlanes {...props} />
}

function LegacySwimlanes(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  const lanes = uniqueLumenKanbanItems(props.content.lanes)
  const cards = uniqueLumenKanbanItems(props.content.cards)
  const [closed, setClosed] = React.useState<ReadonlySet<string>>(new Set())
  return (
    <Root {...props}>
      <Header title={props.content.labels.swimlaneTitle} detail={props.content.labels.swimlaneDetail} />
      <main className="lumen-kanban-swimlanes" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        <div className="lumen-kanban-swimlane-head">
          <span>{props.content.labels.workstream}</span>
          {uniqueLumenKanbanItems(props.content.columns).map((column) => (
            <span key={column.id}>{column.label}</span>
          ))}
        </div>
        {lanes.length ? (
          lanes.map((lane) => (
            <section key={lane.id}>
              <LumenButton
                variant="text"
                aria-expanded={!closed.has(lane.id)}
                onClick={() =>
                  setClosed((current) => {
                    const next = new Set(current)
                    if (next.has(lane.id)) {
                      next.delete(lane.id)
                    } else {
                      next.add(lane.id)
                    }
                    return next
                  })
                }
              >
                {lane.label}
              </LumenButton>
              {closed.has(lane.id)
                ? null
                : lane.columns.map((column) => (
                    <div key={column.id}>
                      {column.cardIds.map((id) => {
                        const card = cards.find((item) => item.id === id)
                        return card ? (
                          <Card key={id} card={card} onOpen={() => report(props.onAction, 'open', id)} />
                        ) : null
                      })}
                    </div>
                  ))}
            </section>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </main>
    </Root>
  )
}

function Regroup(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  if (props.content.referenceRegroup) {
    return (
      <Root {...props} className={[props.className, 'hbar-app-ui-kanban-regroup-reference'].filter(Boolean).join(' ')}>
        <RegroupReference content={props.content} />
      </Root>
    )
  }
  return <LegacyRegroup {...props} />
}

function LegacyRegroup(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  const groups = uniqueLumenKanbanItems(props.content.groups)
  const cards = uniqueLumenKanbanItems(props.content.cards)
  const [groupId, setGroupId] = React.useState(props.content.initialGroupId)
  const group = selectLumenKanbanItem(groups, groupId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.regroupTitle}
        detail={props.content.labels.regroupDetail}
        actions={
          <div className="lumen-kanban-tabs" role="tablist" aria-label={props.content.labels.groupBy}>
            {groups.map((item) => (
              <LumenButton
                key={item.id}
                variant="text"
                role="tab"
                aria-selected={item.id === group?.id}
                onClick={() => {
                  setGroupId(item.id)
                  report(props.onAction, 'group', item.id)
                }}
              >
                {item.label}
              </LumenButton>
            ))}
          </div>
        }
      />
      <main className="lumen-kanban-regroup" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {cards.length ? (
          cards.map((card) => (
            <LumenButton
              key={card.id}
              variant="outlined"
              draggable
              onDragEnd={() => report(props.onAction, 'drop', `${card.id}:${group?.id}`)}
            >
              <Glyph name="drag" />
              <span>
                <strong>{card.label}</strong>
                <small>{card.detail}</small>
              </span>
              <LumenStatus value={card.groupValues?.[group?.id ?? ''] ?? card.tag} />
            </LumenButton>
          ))
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </main>
    </Root>
  )
}

function Detail(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  if (props.content.referenceDetail) {
    return (
      <Root {...props} className={[props.className, 'hbar-app-ui-kanban-detail-reference'].filter(Boolean).join(' ')}>
        <DetailReference content={props.content} />
      </Root>
    )
  }
  return <LegacyDetail {...props} />
}

function LegacyDetail(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  const cards = uniqueLumenKanbanItems(props.content.cards)
  const assignees = uniqueLumenKanbanItems(props.content.assignees)
  const priorities = uniqueLumenKanbanItems(props.content.priorities)
  const [cardId, setCardId] = React.useState(cards[0]?.id)
  const card = selectLumenKanbanItem(cards, cardId)
  return (
    <Root {...props}>
      <div className="lumen-kanban-detail">
        <main>
          <Header
            title={props.content.labels.detailTitle}
            detail={props.content.labels.detailDetail}
            actions={
              <LumenButton tone="primary" onClick={() => report(props.onAction, 'add')}>
                <Glyph name="plus" />
                {props.content.labels.addCard}
              </LumenButton>
            }
          />
          {cards.length ? (
            cards.map((item) => (
              <LumenButton
                key={item.id}
                variant="text"
                aria-pressed={item.id === card?.id}
                onClick={() => setCardId(item.id)}
              >
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <LumenStatus value={item.tag} />
              </LumenButton>
            ))
          ) : (
            <Empty>{props.content.labels.empty}</Empty>
          )}
        </main>
        {card ? (
          <aside>
            <Header
              title={card.label}
              detail={props.content.labels.properties}
              actions={<LumenStatus value={card.tag} tone="warning" />}
            />
            <label>
              {props.content.labels.assignee}
              <LumenSelect defaultValue={assignees[0]?.id}>
                {assignees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </LumenSelect>
            </label>
            <label>
              {props.content.labels.priority}
              <LumenSelect defaultValue={priorities[0]?.id}>
                {priorities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </LumenSelect>
            </label>
            <LumenText as="p" tone="muted">
              {props.content.labels.activity} {String.fromCharCode(0x00b7)} {card.detail}
            </LumenText>
            <LumenButton tone="primary" onClick={() => report(props.onAction, 'save', card.id)}>
              {props.content.labels.save}
            </LumenButton>
          </aside>
        ) : null}
      </div>
    </Root>
  )
}

function Sprint(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  if (props.content.referenceSprint) {
    return (
      <Root {...props} className={[props.className, 'hbar-app-ui-kanban-sprint-reference'].filter(Boolean).join(' ')}>
        <SprintReference content={props.content} />
      </Root>
    )
  }
  return <LegacySprint {...props} />
}

function LegacySprint(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  const cards = uniqueLumenKanbanItems(props.content.cards)
  const columns = uniqueLumenKanbanItems(props.content.columns).slice(0, 3)
  const [movedId, setMovedId] = React.useState<string>()
  return (
    <Root {...props}>
      <Header title={props.content.labels.sprintTitle} detail={props.content.labels.sprintDetail} />
      <div className="lumen-kanban-metrics">
        {props.content.metrics.map((metric) => (
          <article key={metric.id}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
      <main className="lumen-kanban-sprint">
        {columns.map((column) => {
          const progress = Math.max(0, Math.min(100, column.progress ?? 0))
          return (
            <section key={column.id}>
              <header>
                <strong>{column.label}</strong>
                <span>{column.points}</span>
              </header>
              <div
                className="lumen-kanban-progress"
                role="progressbar"
                aria-label={props.content.labels.capacity(column.label)}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i style={{ inlineSize: `${progress}%` }} />
              </div>
              {column.cardIds.map((id) => {
                const card = cards.find((item) => item.id === id)
                return card ? (
                  <Card
                    key={id}
                    card={card}
                    onOpen={() => report(props.onAction, 'open', id)}
                    onMove={
                      props.readOnly
                        ? undefined
                        : () => {
                            setMovedId(id)
                            report(props.onAction, 'move', id)
                          }
                    }
                    moveLabel={
                      props.readOnly
                        ? undefined
                        : movedId === id
                          ? props.content.labels.moved
                          : props.content.labels.move
                    }
                  />
                ) : null
              })}
            </section>
          )
        })}
      </main>
    </Root>
  )
}

function Compact(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  if (props.content.referenceCompact) {
    return (
      <Root {...props} className={[props.className, 'hbar-app-ui-kanban-compact-reference'].filter(Boolean).join(' ')}>
        <CompactReference content={props.content} />
      </Root>
    )
  }
  return <LegacyCompact {...props} />
}

function LegacyCompact(props: Omit<LumenKanbanProps, 'content'> & { content: LumenKanbanContent }) {
  const columns = uniqueLumenKanbanItems(props.content.compactColumns)
  const cards = uniqueLumenKanbanItems(props.content.cards)
  const [columnId, setColumnId] = React.useState(props.content.initialCompactColumnId)
  const column = selectLumenKanbanItem(columns, columnId)
  const card = cards.find((item) => item.id === column?.cardIds[0])
  return (
    <Root {...props}>
      <Header title={props.content.labels.compactTitle} detail={props.content.labels.compactDetail} />
      <div className="lumen-kanban-tabs" role="tablist" aria-label={props.content.labels.column}>
        {columns.map((item) => (
          <LumenButton
            key={item.id}
            variant="text"
            role="tab"
            aria-selected={item.id === column?.id}
            onClick={() => setColumnId(item.id)}
          >
            {item.label}
          </LumenButton>
        ))}
      </div>
      <main className="lumen-kanban-compact">
        {card ? (
          <article>
            <strong>{card.label}</strong>
            <small>{props.content.labels.steps}</small>
            <div>
              {props.readOnly ? null : (
                <>
                  <LumenButton tone="primary" onClick={() => report(props.onAction, 'step', column?.id)}>
                    {props.content.labels.nextStep}
                  </LumenButton>
                  <LumenIconButton label={props.content.labels.more}>
                    <Glyph name="more" />
                  </LumenIconButton>
                </>
              )}
            </div>
          </article>
        ) : (
          <Empty>{props.content.labels.emptyColumn}</Empty>
        )}
      </main>
    </Root>
  )
}

function empty(props: LumenKanbanProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenKanban(props: LumenKanbanProps) {
  const providerContent = useLumenKanbanContent()
  const content = props.content ?? providerContent
  if (!content) {
    return empty(props)
  }
  if (props.variant === 1) {
    return <Board {...props} content={content} />
  }
  if (props.variant === 2) {
    return <Swimlanes {...props} content={content} />
  }
  if (props.variant === 3) {
    return <Regroup {...props} content={content} />
  }
  if (props.variant === 4) {
    return <Detail {...props} content={content} />
  }
  if (props.variant === 5) {
    return <Sprint {...props} content={content} />
  }
  if (props.variant === 6) {
    return <Compact {...props} content={content} />
  }
  return empty(props)
}

function variant(value: number, props: LumenKanbanVariantProps) {
  return <LumenKanban {...props} variant={value} variantId={`hbar-app-ui-kanban-${value}`} />
}

export const LumenKanban01 = (props: LumenKanbanVariantProps) => variant(1, props),
  LumenKanban02 = (props: LumenKanbanVariantProps) => variant(2, props),
  LumenKanban03 = (props: LumenKanbanVariantProps) => variant(3, props),
  LumenKanban04 = (props: LumenKanbanVariantProps) => variant(4, props),
  LumenKanban05 = (props: LumenKanbanVariantProps) => variant(5, props),
  LumenKanban06 = (props: LumenKanbanVariantProps) => variant(6, props)
