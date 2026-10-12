'use client'

import * as React from 'react'
import LumenField from '../LumenField'
import LumenIndicator from '../LumenIndicator'
import LumenSurface from '../LumenSurface'
import { LumenFormField, LumenInput, LumenFileButton } from '../forms'
import { LumenButton } from '../primitives'
import styles from './empty-state.module.css'

interface EmptyBaseProps {
  glassStrength?: number | undefined
}

interface EmptyHeadingProps {
  heading: string
  detail: string
}

interface EmptyActionCopy {
  title: string
  description: string
  action: string
}

export interface HbarAppUiEmptyState01Props extends EmptyBaseProps {
  copy: EmptyHeadingProps & {
    connect: EmptyActionCopy
    create: EmptyActionCopy
    tour: EmptyActionCopy
  }
  actions: {
    onConnect: () => void
    onCreate: () => void
    onTour: () => void
  }
}

export interface HbarAppUiEmptyState02Props extends EmptyBaseProps {
  copy: EmptyHeadingProps & {
    queryLabel: string
    noMatches: (query: string) => string
    guidance: string
    removeFilter: (label: string) => string
    suggestions: string
  }
  content: {
    query: string
    filters: readonly { id: string; label: string }[]
    suggestions: readonly { id: string; label: string; query: string }[]
  }
  actions: {
    onQueryChange: (query: string) => void
    onRemoveFilter: (id: string) => void
    onSelectSuggestion: (id: string, query: string) => void
  }
}

export interface HbarAppUiEmptyState03Props extends EmptyBaseProps {
  copy: EmptyHeadingProps & { create: string; history: string }
  actions: { onCreate: () => void; onOpenHistory: () => void }
}

export interface HbarAppUiEmptyState04Props extends EmptyBaseProps {
  copy: EmptyHeadingProps & {
    retryingHeading: string
    retryingDetail: string
    recoveredHeading: string
    recoveredDetail: string
    retry: string
    retrying: string
    requestId: string
    traceId: string
    lastAttempt: string
  }
  content: { requestId: string; traceId: string; lastAttempt: string }
  state: { status: 'failed' | 'retrying' | 'recovered'; error: string | null }
  actions: { onRetry: () => void }
}

export interface HbarAppUiEmptyState05Props extends EmptyBaseProps {
  copy: EmptyHeadingProps & {
    drop: string
    release: string
    supported: string
    choose: string
    storage: string
  }
  content: { accept: string; multiple: boolean }
  actions: { onUpload: (files: readonly File[], origin: 'drop' | 'picker') => void }
}

function Frame({
  id,
  heading,
  detail,
  tone = 'neutral',
  state = 'selected',
  glassStrength,
  children,
}: {
  id: string
  heading: string
  detail: string
  tone?: 'neutral' | 'info' | 'success' | 'danger' | undefined
  state?: 'selected' | 'running' | 'failed' | undefined
  glassStrength?: number | undefined
  children: React.ReactNode
}) {
  return (
    <LumenSurface
      className={styles.frame}
      glassStrength={glassStrength}
      data-hbar-app-ui-component={id}
      data-hbar-app-ui-variant={id}
    >
      <section className={styles.body} aria-labelledby={`${id}-title`}>
        <header className={styles.header}>
          <div>
            <h2 id={`${id}-title`}>{heading}</h2>
            <p>{detail}</p>
          </div>
          <LumenIndicator edge="left" state={state} tone={tone} />
        </header>
        {children}
      </section>
    </LumenSurface>
  )
}

function Action({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <LumenButton className={styles.action} variant="outlined" indicatorState="idle" onClick={onClick}>
      {children}
    </LumenButton>
  )
}

function uniqueIds<Item extends { id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function HbarAppUiEmptyState01({ copy, actions, glassStrength }: HbarAppUiEmptyState01Props) {
  const choices = [
    { id: 'connect', copy: copy.connect, action: actions.onConnect },
    { id: 'create', copy: copy.create, action: actions.onCreate },
    { id: 'tour', copy: copy.tour, action: actions.onTour },
  ]
  return (
    <Frame id="hbar-app-ui-empty-state-1" {...copy} glassStrength={glassStrength}>
      <div className={styles.choices}>
        {choices.map((choice) => (
          <section className={styles.choice} key={choice.id}>
            <strong>{choice.copy.title}</strong>
            <p>{choice.copy.description}</p>
            <Action onClick={choice.action}>{choice.copy.action}</Action>
          </section>
        ))}
      </div>
    </Frame>
  )
}

export function HbarAppUiEmptyState02({ copy, content, actions, glassStrength }: HbarAppUiEmptyState02Props) {
  return (
    <Frame id="hbar-app-ui-empty-state-2" {...copy} glassStrength={glassStrength}>
      <div className={styles.stack}>
        <LumenField className={styles.query} boundary="horizontal">
          <LumenFormField controlId="hbar-app-ui-empty-state-query" label={copy.queryLabel}>
            <LumenInput
              type="text"
              inputMode="search"
              value={content.query}
              onChange={(event) => actions.onQueryChange(event.target.value)}
            />
          </LumenFormField>
        </LumenField>
        <strong>{copy.noMatches(content.query)}</strong>
        <p>{copy.guidance}</p>
        <div className={styles.actions}>
          {uniqueIds(content.filters).map((filter) => (
            <Action key={filter.id} onClick={() => actions.onRemoveFilter(filter.id)}>
              {copy.removeFilter(filter.label)}
            </Action>
          ))}
        </div>
        <h3>{copy.suggestions}</h3>
        <div className={styles.actions}>
          {uniqueIds(content.suggestions).map((suggestion) => (
            <Action key={suggestion.id} onClick={() => actions.onSelectSuggestion(suggestion.id, suggestion.query)}>
              {suggestion.label}
            </Action>
          ))}
        </div>
      </div>
    </Frame>
  )
}

export function HbarAppUiEmptyState03({ copy, actions, glassStrength }: HbarAppUiEmptyState03Props) {
  return (
    <Frame id="hbar-app-ui-empty-state-3" {...copy} tone="success" glassStrength={glassStrength}>
      <div className={styles.centered}>
        <div className={styles.actions}>
          <Action onClick={actions.onCreate}>{copy.create}</Action>
          <Action onClick={actions.onOpenHistory}>{copy.history}</Action>
        </div>
      </div>
    </Frame>
  )
}

export function HbarAppUiEmptyState04({ copy, content, state, actions, glassStrength }: HbarAppUiEmptyState04Props) {
  const appearance = {
    failed: { heading: copy.heading, detail: copy.detail, tone: 'danger', state: 'failed' },
    retrying: {
      heading: copy.retryingHeading,
      detail: copy.retryingDetail,
      tone: 'info',
      state: 'running',
    },
    recovered: {
      heading: copy.recoveredHeading,
      detail: copy.recoveredDetail,
      tone: 'success',
      state: 'selected',
    },
  } as const
  return (
    <Frame id="hbar-app-ui-empty-state-4" {...appearance[state.status]} glassStrength={glassStrength}>
      <div className={styles.centered}>
        {state.error && <p role="alert">{state.error}</p>}
        {state.status !== 'recovered' && (
          <LumenButton
            className={styles.action}
            variant="outlined"
            indicatorState={state.status === 'retrying' ? 'running' : 'idle'}
            disabled={state.status === 'retrying'}
            onClick={actions.onRetry}
          >
            {state.status === 'retrying' ? copy.retrying : copy.retry}
          </LumenButton>
        )}
        <dl className={styles.details}>
          <div>
            <dt>{copy.requestId}</dt>
            <dd>{content.requestId}</dd>
          </div>
          <div>
            <dt>{copy.traceId}</dt>
            <dd>{content.traceId}</dd>
          </div>
          <div>
            <dt>{copy.lastAttempt}</dt>
            <dd>{content.lastAttempt}</dd>
          </div>
        </dl>
      </div>
    </Frame>
  )
}

export function HbarAppUiEmptyState05({ copy, content, actions, glassStrength }: HbarAppUiEmptyState05Props) {
  const [dragging, setDragging] = React.useState(false)
  return (
    <Frame id="hbar-app-ui-empty-state-5" {...copy} glassStrength={glassStrength}>
      <div
        className={['lumen-effect lumen-dropzone', styles.dropzone].join(' ')}
        data-lumen-dropzone
        data-dragging={dragging}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const files = Array.from(event.dataTransfer.files)
          if (files.length) {
            actions.onUpload(files, 'drop')
          }
        }}
      >
        <strong>{dragging ? copy.release : copy.drop}</strong>
        <p>{copy.supported}</p>
        <LumenFileButton
          className={styles.action}
          label={copy.choose}
          variant="outlined"
          indicatorState="idle"
          accept={content.accept}
          multiple={content.multiple}
          onFiles={(files) => actions.onUpload(files, 'picker')}
        />
        <small>{copy.storage}</small>
      </div>
    </Frame>
  )
}
