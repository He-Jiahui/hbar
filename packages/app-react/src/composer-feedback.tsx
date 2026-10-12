import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { CircleAlert, Info, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
import { createMessageScope } from './messages'
import type { ComposerBlockedReason } from '@hbar/app-runtime'
import './composer-feedback.css'

export interface HbarComposerFeedbackScope {
  readonly workspaceId: string
  readonly sessionId: string
}

export interface HbarComposerFeedbackDetailsLabels {
  readonly title: string
  readonly empty: string
  readonly close: string
  readonly summary: (count: number) => string
}

export interface HbarComposerFeedbackLabels {
  readonly title: string
  readonly empty: string
  readonly close: string
  readonly summary: (count: number) => string
  readonly blockedReason: (reason: ComposerBlockedReason) => string
}

interface FeedbackEntry {
  readonly content: ReactNode
  readonly tone: 'neutral' | 'danger'
  readonly priority: 'information' | 'recovery' | 'blocking'
  readonly scope?: HbarComposerFeedbackScope
}

const noticeRank = { information: 0, recovery: 1, blocking: 2 } as const
export function primaryComposerFeedback<Entry extends Pick<FeedbackEntry, 'tone' | 'priority'>>(
  entries: ReadonlyMap<string, Entry>,
): string | null {
  let selected: string | null = null
  let rank = -1
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
const FeedbackRegistryContext = createContext<ReturnType<typeof createFeedbackStore> | null>(null)
const FeedbackScopeContext = createContext<{
  readonly scope: HbarComposerFeedbackScope
  readonly registry: ReturnType<typeof createFeedbackStore> | null
} | null>(null)
const ComposerFeedbackMessages = createMessageScope<HbarComposerFeedbackLabels>()
const FeedbackDetailsMessages = createMessageScope<HbarComposerFeedbackDetailsLabels>()

/** Runtime-owned transient view registrations shared by sibling composer and session-tool panels. */
export function HbarComposerFeedbackRegistryProvider({ children }: { readonly children: ReactNode }) {
  const [store] = useState(createFeedbackStore)
  return <FeedbackRegistryContext.Provider value={store}>{children}</FeedbackRegistryContext.Provider>
}

/** One scope per composer/session; switching sessions releases every transient view registration. */
export function HbarComposerFeedbackProvider({
  labels,
  children,
}: {
  readonly labels: HbarComposerFeedbackLabels
  readonly children: ReactNode
}) {
  return (
    <HbarComposerFeedbackSessionProvider labels={labels} scope={{ workspaceId: '', sessionId: '' }}>
      {children}
    </HbarComposerFeedbackSessionProvider>
  )
}

/** Registers notices against an immutable workspace/session pair in the runtime scope. */
export function HbarComposerFeedbackSessionProvider({
  scope,
  labels,
  children,
}: {
  readonly scope: HbarComposerFeedbackScope
  readonly labels: HbarComposerFeedbackLabels
  readonly children: ReactNode
}) {
  const registry = useContext(FeedbackRegistryContext)
  const workspaceId = scope.workspaceId
  const sessionId = scope.sessionId
  const isScoped = Boolean(workspaceId && sessionId)
  const activeRegistry = isScoped ? registry : null
  const store = useMemo(() => activeRegistry ?? createFeedbackStore(), [activeRegistry])
  const stableScope = useMemo(() => ({ workspaceId, sessionId }), [workspaceId, sessionId])
  const registrationScope = useMemo(
    () => ({ scope: stableScope, registry: activeRegistry }),
    [stableScope, activeRegistry],
  )
  return (
    <FeedbackScopeContext.Provider value={registrationScope}>
      <FeedbackContext.Provider value={store}>
        <ComposerFeedbackMessages.Provider messages={labels}>{children}</ComposerFeedbackMessages.Provider>
      </FeedbackContext.Provider>
    </FeedbackScopeContext.Provider>
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
  const scopeStore = useContext(FeedbackScopeContext)
  const id = useId()
  const scope = scopeStore?.scope
  const workspaceId = scope?.workspaceId
  const sessionId = scope?.sessionId
  useLayoutEffect(() => {
    if (!store) return
    store.setState((state) => {
      const entries = new Map(state.entries)
      if (active)
        entries.set(id, {
          content: children,
          tone,
          priority,
          ...(scope && workspaceId && sessionId ? { scope } : {}),
        })
      else entries.delete(id)
      return { entries }
    })
  }, [store, id, active, children, tone, priority, scope, workspaceId, sessionId])
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
  const scope = useContext(FeedbackScopeContext)?.scope
  return store ? <FeedbackTrigger store={store} scope={scope} /> : null
}

export function useHbarComposerFeedbackShared(): boolean {
  const context = useContext(FeedbackScopeContext)
  return Boolean(context?.registry && context.scope.workspaceId && context.scope.sessionId)
}

export function HbarComposerBlockedNotice({ reason }: { readonly reason: ComposerBlockedReason }) {
  const { t } = ComposerFeedbackMessages.useMessages()
  return (
    <HbarComposerFeedback priority="blocking">
      <LumenContentText context="feedback.message" role="status">
        {t('blockedReason')(reason)}
      </LumenContentText>
    </HbarComposerFeedback>
  )
}

/** Session-scoped details render in the owning tool panel while preserving registered actions. */
export function HbarComposerFeedbackDetails({
  scope,
  labels,
}: {
  readonly scope: HbarComposerFeedbackScope
  readonly labels: HbarComposerFeedbackDetailsLabels
}) {
  const store = useContext(FeedbackRegistryContext)
  return store ? (
    <FeedbackDetailsMessages.Provider messages={labels}>
      <FeedbackDetails store={store} scope={scope} />
    </FeedbackDetailsMessages.Provider>
  ) : null
}

function FeedbackDetails({
  store,
  scope,
}: {
  readonly store: ReturnType<typeof createFeedbackStore>
  readonly scope: HbarComposerFeedbackScope
}) {
  const { t } = FeedbackDetailsMessages.useMessages()
  const entries = useStore(store, (state) => state.entries)
  const workspaceId = scope.workspaceId
  const sessionId = scope.sessionId
  const scoped = useMemo(
    () => selectScopedEntries(entries, { workspaceId, sessionId }),
    [entries, workspaceId, sessionId],
  )
  const primary = primaryComposerFeedback(scoped)
  const details = [...scoped].filter(([key]) => key !== primary)
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const id = useId()
  const danger = [...scoped.values()].some((entry) => entry.tone === 'danger')
  if (!scoped.size) return null
  return (
    <LumenFrame className="hbar-composer-panel-details" data-tone={danger ? 'danger' : 'neutral'}>
      <LumenFrame className="hbar-composer-feedback-heading">
        <LumenContentText context="section.title">{t('title')}</LumenContentText>
        <LumenButton
          ref={anchor}
          type="button"
          size="s"
          variant="text"
          indicator="none"
          aria-label={open ? t('close') : t('summary')(scoped.size)}
          title={t('summary')(scoped.size)}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <LumenIcon icon={open ? X : danger ? CircleAlert : Info} tier="sm" />
        </LumenButton>
      </LumenFrame>
      <LumenFrame
        id={id}
        className="hbar-composer-feedback-list"
        role="log"
        aria-live="polite"
        tabIndex={open ? 0 : -1}
        hidden={!open}
      >
        {details.length ? (
          details.map(([key, entry]) => (
            <LumenFrame key={key} className="hbar-composer-feedback-item" data-tone={entry.tone}>
              {entry.content}
            </LumenFrame>
          ))
        ) : (
          <LumenContentText context="feedback.message" role="status">
            {t('empty')}
          </LumenContentText>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}

function selectScopedEntries(
  entries: ReadonlyMap<string, FeedbackEntry>,
  scope: HbarComposerFeedbackScope | undefined,
): Map<string, FeedbackEntry> {
  if (!scope?.workspaceId || !scope.sessionId)
    return new Map([...entries].filter(([, entry]) => entry.scope === undefined))
  return new Map(
    [...entries].filter(
      ([, entry]) => entry.scope?.workspaceId === scope.workspaceId && entry.scope.sessionId === scope.sessionId,
    ),
  )
}

/** The composer reserves one nearby notice; remaining feedback is reachable in its details surface. */
export function HbarComposerPrimaryNotice() {
  const store = useContext(FeedbackContext)
  const scope = useContext(FeedbackScopeContext)?.scope
  return store ? <PrimaryNotice store={store} scope={scope} /> : null
}
function PrimaryNotice({
  store,
  scope,
}: {
  readonly store: ReturnType<typeof createFeedbackStore>
  readonly scope: HbarComposerFeedbackScope | undefined
}) {
  const allEntries = useStore(store, (state) => state.entries)
  const workspaceId = scope?.workspaceId
  const sessionId = scope?.sessionId
  const entries = useMemo(
    () => selectScopedEntries(allEntries, workspaceId && sessionId ? { workspaceId, sessionId } : undefined),
    [allEntries, workspaceId, sessionId],
  )
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
  scope,
}: {
  readonly store: ReturnType<typeof createFeedbackStore>
  readonly scope: HbarComposerFeedbackScope | undefined
}) {
  const { t } = ComposerFeedbackMessages.useMessages()
  const allEntries = useStore(store, (state) => state.entries)
  const workspaceId = scope?.workspaceId
  const sessionId = scope?.sessionId
  const entries = useMemo(
    () => selectScopedEntries(allEntries, workspaceId && sessionId ? { workspaceId, sessionId } : undefined),
    [allEntries, workspaceId, sessionId],
  )
  const primary = primaryComposerFeedback(entries)
  const details = [...entries].filter(([key]) => key !== primary)
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const handlers = useFloatingTrigger(open, setOpen)
  const id = useId()
  const danger = [...entries.values()].some((entry) => entry.tone === 'danger')
  const summary = t('summary')(entries.size)
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
        label={t('title')}
        className="hbar-composer-feedback-surface"
        onBlurCapture={(event) => {
          const next = event.relatedTarget
          if (next instanceof Node && !event.currentTarget.contains(next) && !anchor.current?.contains(next)) {
            setOpen(false)
          }
        }}
      >
        <LumenFrame className="hbar-composer-feedback-heading">
          <LumenContentText context="section.title">{t('title')}</LumenContentText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={t('close')}
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
              {t('empty')}
            </LumenContentText>
          )}
        </LumenFrame>
      </FloatingSurface>
    </>
  )
}
