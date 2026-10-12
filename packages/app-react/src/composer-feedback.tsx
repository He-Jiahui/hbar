import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { CircleAlert, Info, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
import './composer-feedback.css'

export interface HbarComposerFeedbackLabels {
  readonly title: string
  readonly empty: string
  readonly close: string
  readonly summary: (count: number) => string
}

interface FeedbackEntry {
  readonly content: ReactNode
  readonly tone: 'neutral' | 'danger'
  readonly priority: 'information' | 'recovery' | 'blocking'
}

const noticeRank = { information: 0, recovery: 1, blocking: 2 } as const
export function primaryComposerFeedback<Entry extends Pick<FeedbackEntry, 'tone' | 'priority'>>(
  entries: ReadonlyMap<string, Entry>,
): string | null {
  let selected: string | null = null
  let rank = 0
  for (const [id, entry] of entries) {
    const candidate = noticeRank[entry.priority] * 2 + Number(entry.tone === 'danger')
    if (candidate > rank) {
      selected = id
      rank = candidate
    }
  }
  return selected
}

/** View registrations only: feature state and recovery actions stay with their owning ViewModels. */
function createFeedbackStore() {
  return createStore(() => ({ entries: new Map<string, FeedbackEntry>() }))
}
const FeedbackContext = createContext<ReturnType<typeof createFeedbackStore> | null>(null)
const FeedbackLabelsContext = createContext<HbarComposerFeedbackLabels | null>(null)

/** One scope per composer/session; switching sessions releases every transient view registration. */
export function HbarComposerFeedbackProvider({
  labels,
  children,
}: {
  readonly labels: HbarComposerFeedbackLabels
  readonly children: ReactNode
}) {
  const [store] = useState(createFeedbackStore)
  return (
    <FeedbackContext.Provider value={store}>
      <FeedbackLabelsContext.Provider value={labels}>{children}</FeedbackLabelsContext.Provider>
    </FeedbackContext.Provider>
  )
}

export function useHbarComposerFeedbackManaged(): boolean {
  return useContext(FeedbackContext) !== null
}

/** Transient messages never participate in the editor's sizing; standalone consumers retain inline feedback. */
export function HbarComposerFeedback({
  children,
  active = true,
  tone = 'neutral',
  priority = tone === 'danger' ? 'recovery' : 'information',
}: {
  readonly children: ReactNode
  readonly active?: boolean
  readonly tone?: FeedbackEntry['tone']
  readonly priority?: FeedbackEntry['priority']
}) {
  const store = useContext(FeedbackContext)
  const id = useId()
  useLayoutEffect(() => {
    if (!store) return
    store.setState((state) => {
      const entries = new Map(state.entries)
      if (active) entries.set(id, { content: children, tone, priority })
      else entries.delete(id)
      return { entries }
    })
  }, [store, id, active, children, tone, priority])
  useLayoutEffect(
    () => () => {
      store?.setState((state) => {
        const entries = new Map(state.entries)
        entries.delete(id)
        return { entries }
      })
    },
    [store, id],
  )
  return !store && active ? children : null
}

export function HbarComposerFeedbackTrigger() {
  const store = useContext(FeedbackContext)
  const labels = useContext(FeedbackLabelsContext)
  return store && labels ? <FeedbackTrigger store={store} labels={labels} /> : null
}

/** The composer reserves one nearby notice; remaining feedback is reachable in its details surface. */
export function HbarComposerPrimaryNotice() {
  const store = useContext(FeedbackContext)
  return store ? <PrimaryNotice store={store} /> : null
}
function PrimaryNotice({ store }: { readonly store: ReturnType<typeof createFeedbackStore> }) {
  const entries = useStore(store, (state) => state.entries)
  const id = primaryComposerFeedback(entries)
  const entry = id ? entries.get(id) : undefined
  return entry ? (
    <LumenFrame className="hbar-composer-primary-notice" data-priority={entry.priority}>
      {entry.content}
    </LumenFrame>
  ) : null
}

/** Fixed feature groups and the existing bounded attachment/queue collections own these registrations. */
function FeedbackTrigger({
  store,
  labels,
}: {
  readonly store: ReturnType<typeof createFeedbackStore>
  readonly labels: HbarComposerFeedbackLabels
}) {
  const entries = useStore(store, (state) => state.entries)
  const primary = primaryComposerFeedback(entries)
  const details = [...entries].filter(([key]) => key !== primary)
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const handlers = useFloatingTrigger(open, setOpen)
  const id = useId()
  const danger = [...entries.values()].some((entry) => entry.tone === 'danger')
  const summary = labels.summary(entries.size)
  return (
    <>
      <LumenButton
        {...handlers}
        ref={anchor}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-composer-feedback-trigger"
        data-tone={danger ? 'danger' : 'neutral'}
        data-feedback-count={entries.size}
        aria-label={summary}
        title={summary}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
      >
        <LumenIcon icon={danger ? CircleAlert : Info} tier="sm" />
      </LumenButton>
      <FloatingSurface
        id={id}
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchor}
        label={labels.title}
        className="hbar-composer-feedback-surface"
      >
        <LumenFrame className="hbar-composer-feedback-heading">
          <LumenContentText context="section.title">{labels.title}</LumenContentText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={labels.close}
            onClick={() => setOpen(false)}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        <LumenFrame className="hbar-composer-feedback-list" role="log" aria-live="polite" tabIndex={0}>
          {details.length ? (
            details.map(([key, entry]) => (
              <LumenFrame key={key} className="hbar-composer-feedback-item" data-tone={entry.tone}>
                {entry.content}
              </LumenFrame>
            ))
          ) : (
            <LumenContentText context="feedback.message" role="status">
              {labels.empty}
            </LumenContentText>
          )}
        </LumenFrame>
      </FloatingSurface>
    </>
  )
}
