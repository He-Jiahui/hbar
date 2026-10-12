'use client'

import * as React from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Database,
  FileText,
  FolderOpen,
  Inbox,
  Link2,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { LumenInput } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton } from './primitives'
import {
  HbarAppUiEmptyState01,
  HbarAppUiEmptyState02,
  HbarAppUiEmptyState03,
  HbarAppUiEmptyState04,
  HbarAppUiEmptyState05,
} from './variants'
import type {
  HbarAppUiEmptyState01Props,
  HbarAppUiEmptyState02Props,
  HbarAppUiEmptyState03Props,
  HbarAppUiEmptyState04Props,
  HbarAppUiEmptyState05Props,
} from './variants'
import type {
  LumenEmptyStateAction,
  LumenEmptyStateCaughtUpContent,
  LumenEmptyStateChoice,
  LumenEmptyStateContent,
  LumenEmptyStateFirstRunContent,
  LumenEmptyStateFolderContent,
  LumenEmptyStateItem,
  LumenEmptyStateLoadFailureContent,
  LumenEmptyStateNoResultsContent,
} from './empty-state/content'

export interface LumenEmptyStateProviderProps {
  readonly content: LumenEmptyStateContent
  readonly children: React.ReactNode
}

export interface LumenEmptyStateProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenEmptyStateContent | undefined
  readonly onAction?: ((action: LumenEmptyStateAction) => void) | undefined
  readonly className?: string | undefined
}

export interface LumenEmptyStateVariantProps extends Omit<LumenEmptyStateProps, 'variant' | 'variantId'> {}

const ContentContext = React.createContext<LumenEmptyStateContent | undefined>(undefined)

export function LumenEmptyStateProvider({ content, children }: LumenEmptyStateProviderProps) {
  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>
}

export function useLumenEmptyStateContent(): LumenEmptyStateContent | undefined {
  return React.useContext(ContentContext)
}

export function uniqueLumenEmptyStateItems<Item extends LumenEmptyStateItem>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function reportAction(onAction: LumenEmptyStateProps['onAction'], actionId: string, value?: string) {
  if (value === undefined) {
    onAction?.({ actionId })
  } else {
    onAction?.({ actionId, value })
  }
}

function Surface({
  variant,
  variantId,
  className,
  missingContent,
  children,
}: {
  readonly variant: number
  readonly variantId: string
  readonly className?: string | undefined
  readonly missingContent?: boolean | undefined
  readonly children: React.ReactNode
}) {
  const contentClassName = ['lumen-empty-state-stage', `hbar-app-ui-empty-state-variant-${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <LumenSurface
      as="div"
      material="solid"
      className="lumen-empty-state-surface"
      contentClassName={contentClassName}
      data-lumen-component="empty-state"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-variant={variantId}
      data-hbar-app-ui-region="root"
      data-hbar-app-ui-state={missingContent ? 'missing-content' : undefined}
    >
      {children}
    </LumenSurface>
  )
}

export function LumenEmptyState(props: LumenEmptyStateProps) {
  const providerContent = useLumenEmptyStateContent()
  const content = props.content ?? providerContent
  if (!content) {
    return (
      <Surface variant={props.variant} variantId={props.variantId} className={props.className} missingContent>
        {null}
      </Surface>
    )
  }

  if (props.variant === 1 && content.firstRun) {
    return (
      <Surface variant={props.variant} variantId={props.variantId} className={props.className}>
        <FirstRunSurface content={content.firstRun} onAction={props.onAction} />
      </Surface>
    )
  }
  if (props.variant === 2 && content.noResults) {
    return (
      <Surface variant={props.variant} variantId={props.variantId} className={props.className}>
        <NoResultsSurface content={content.noResults} />
      </Surface>
    )
  }
  if (props.variant === 3 && content.caughtUp) {
    return (
      <Surface variant={props.variant} variantId={props.variantId} className={props.className}>
        <CaughtUpSurface content={content.caughtUp} onAction={props.onAction} />
      </Surface>
    )
  }
  if (props.variant === 4 && content.loadFailure) {
    return (
      <Surface variant={props.variant} variantId={props.variantId} className={props.className}>
        <LoadFailureSurface content={content.loadFailure} onAction={props.onAction} />
      </Surface>
    )
  }
  if (props.variant === 5 && content.folder) {
    return (
      <Surface variant={props.variant} variantId={props.variantId} className={props.className}>
        <FolderSurface content={content.folder} onAction={props.onAction} />
      </Surface>
    )
  }
  return (
    <Surface variant={props.variant} variantId={props.variantId} className={props.className} missingContent>
      {null}
    </Surface>
  )
}

function ChoiceIcon({ name }: { readonly name: LumenEmptyStateChoice['icon'] }) {
  if (name === 'database') return <Database aria-hidden="true" className="lumen-empty-state-choice-icon" />
  if (name === 'upload') return <Upload aria-hidden="true" className="lumen-empty-state-choice-icon" />
  if (name === 'sample') return <Sparkles aria-hidden="true" className="lumen-empty-state-choice-icon" />
  if (name === 'clock') return <Clock aria-hidden="true" className="lumen-empty-state-choice-icon" />
  if (name === 'draft') return <FileText aria-hidden="true" className="lumen-empty-state-choice-icon" />
  if (name === 'inbox') return <Inbox aria-hidden="true" className="lumen-empty-state-choice-icon" />
  return null
}

function FirstRunSurface({
  content,
  onAction,
}: {
  readonly content: LumenEmptyStateFirstRunContent
  readonly onAction: LumenEmptyStateProps['onAction']
}) {
  const headingId = React.useId()
  const choices = uniqueLumenEmptyStateItems(content.choices)
  return (
    <section className="lumen-empty-state-view lumen-empty-state-first-run" aria-labelledby={headingId}>
      <div className="lumen-empty-state-ghost-table" aria-hidden="true">
        <div className="lumen-empty-state-ghost-row">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="lumen-empty-state-ghost-row">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="lumen-empty-state-ghost-row">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      <header
        className="lumen-empty-state-heading lumen-empty-state-heading-centered"
        data-hbar-app-ui-region="heading"
      >
        <h2 id={headingId}>{content.labels.title}</h2>
        <p>{content.labels.description}</p>
      </header>

      {choices.length ? (
        <div
          className="lumen-empty-state-first-run-choices"
          data-hbar-app-ui-region="choices"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        >
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className="lumen-empty-state-choice-card"
              disabled={!onAction}
              data-hbar-app-ui-action="select-choice"
              data-hbar-app-ui-value={choice.id}
              onClick={() => reportAction(onAction, 'select-choice', choice.id)}
            >
              <span className="lumen-empty-state-choice-icon-wrap">
                <ChoiceIcon name={choice.icon} />
              </span>
              <span className="lumen-empty-state-choice-title-row">
                <strong>{choice.title}</strong>
                <ArrowRight aria-hidden="true" className="lumen-empty-state-inline-icon" />
              </span>
              <span className="lumen-empty-state-choice-description">{choice.description}</span>
              {choice.meta ? <span className="lumen-empty-state-choice-meta">{choice.meta}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="lumen-empty-state-muted" data-hbar-app-ui-region="choices">
          {content.labels.emptyChoices}
        </p>
      )}

      <div
        className="lumen-empty-state-actions lumen-empty-state-actions-centered"
        data-hbar-app-ui-region="footer-actions"
      >
        <LumenButton
          type="button"
          variant="solid"
          indicator="none"
          className="lumen-empty-state-primary-action"
          disabled={!onAction}
          data-hbar-app-ui-action="add-source"
          onClick={() => reportAction(onAction, 'add-source')}
        >
          {content.labels.addSource}
        </LumenButton>
        <LumenButton
          type="button"
          variant="text"
          indicator="none"
          className="lumen-empty-state-secondary-action"
          disabled={!onAction}
          data-hbar-app-ui-action="setup-guide"
          onClick={() => reportAction(onAction, 'setup-guide')}
        >
          {content.labels.setupGuide}
        </LumenButton>
      </div>
    </section>
  )
}

function NoResultsSurface({ content }: { readonly content: LumenEmptyStateNoResultsContent }) {
  const headingId = React.useId()
  const queryId = React.useId()
  const filters = uniqueLumenEmptyStateItems(content.filters)
  const suggestions = uniqueLumenEmptyStateItems(content.suggestions)

  return (
    <section className="lumen-empty-state-view lumen-empty-state-no-results" aria-labelledby={headingId}>
      <div className="lumen-empty-state-search-tools" data-hbar-app-ui-region="search">
        <label htmlFor={queryId}>{content.labels.search}</label>
        <div className="lumen-empty-state-search-control">
          <Search aria-hidden="true" className="lumen-empty-state-inline-icon" />
          <LumenInput
            id={queryId}
            variant="plain"
            type="search"
            inputMode="search"
            autoComplete="off"
            value={content.query}
            onChange={(event) => content.onQueryChange(event.currentTarget.value)}
          />
        </div>

        {filters.length ? (
          <div className="lumen-empty-state-filter-toolbar" data-hbar-app-ui-region="filters">
            <ul
              className="lumen-empty-state-filter-list"
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}
              data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
            >
              {filters.map((filter) => (
                <li className="lumen-empty-state-filter-chip" key={filter.id}>
                  <span className="lumen-empty-state-filter-copy">
                    <span className="lumen-empty-state-filter-label">{filter.label}</span>
                    <span>{filter.value}</span>
                  </span>
                  <button
                    type="button"
                    className="lumen-empty-state-icon-action"
                    aria-label={content.labels.removeFilter(filter.label)}
                    data-hbar-app-ui-action="remove-filter"
                    data-hbar-app-ui-value={filter.id}
                    onClick={() => content.onRemoveFilter(filter.id)}
                  >
                    <X aria-hidden="true" className="lumen-empty-state-small-icon" />
                  </button>
                </li>
              ))}
            </ul>
            <LumenButton
              type="button"
              variant="text"
              indicator="none"
              className="lumen-empty-state-clear-action"
              data-hbar-app-ui-action="clear-filters"
              onClick={content.onClear}
            >
              {content.labels.clearAll}
            </LumenButton>
          </div>
        ) : null}
      </div>

      <section className="lumen-empty-state-no-results-panel" aria-labelledby={headingId}>
        <span className="lumen-empty-state-search-mark" aria-hidden="true">
          <Search className="lumen-empty-state-large-icon" />
        </span>
        <div className="lumen-empty-state-heading lumen-empty-state-heading-centered">
          <h2 id={headingId}>{content.labels.title(content.query)}</h2>
          <p>{content.labels.description(filters.length)}</p>
        </div>
        {suggestions.length ? (
          <ul
            className="lumen-empty-state-suggestions"
            data-hbar-app-ui-region="suggestions"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          >
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  className="lumen-empty-state-suggestion"
                  data-hbar-app-ui-action="select-suggestion"
                  data-hbar-app-ui-value={suggestion.id}
                  onClick={() => content.onSuggestionSelect(suggestion.id)}
                >
                  <Search aria-hidden="true" className="lumen-empty-state-small-icon" />
                  <span>{suggestion.label}</span>
                  <span className="lumen-empty-state-suggestion-count">{suggestion.count}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="lumen-empty-state-muted" data-hbar-app-ui-region="suggestions">
            {content.labels.emptySuggestions}
          </p>
        )}
      </section>

      <p className="lumen-empty-state-footer" data-hbar-app-ui-region="footer">
        {content.labels.footer}
      </p>
    </section>
  )
}

function CaughtUpSurface({
  content,
  onAction,
}: {
  readonly content: LumenEmptyStateCaughtUpContent
  readonly onAction: LumenEmptyStateProps['onAction']
}) {
  const headingId = React.useId()
  const metrics = uniqueLumenEmptyStateItems(content.metrics)
  const choices = uniqueLumenEmptyStateItems(content.choices)

  return (
    <section className="lumen-empty-state-view lumen-empty-state-caught-up" aria-labelledby={headingId}>
      <span className="lumen-empty-state-success-mark" aria-hidden="true">
        <Check className="lumen-empty-state-medium-icon" />
      </span>
      <header
        className="lumen-empty-state-heading lumen-empty-state-heading-centered"
        data-hbar-app-ui-region="heading"
      >
        <h2 id={headingId}>{content.labels.title}</h2>
        <p>{content.labels.description}</p>
      </header>

      {metrics.length ? (
        <dl
          className="lumen-empty-state-metrics"
          data-hbar-app-ui-region="metrics"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
        >
          {metrics.map((metric) => (
            <div className="lumen-empty-state-metric" key={metric.id}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="lumen-empty-state-choice-group" data-hbar-app-ui-region="choices">
        <p className="lumen-empty-state-eyebrow">{content.labels.prompt}</p>
        {choices.length ? (
          <ul
            className="lumen-empty-state-action-choices"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          >
            {choices.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  className="lumen-empty-state-action-choice"
                  disabled={!onAction}
                  data-hbar-app-ui-action="select-choice"
                  data-hbar-app-ui-value={choice.id}
                  onClick={() => reportAction(onAction, 'select-choice', choice.id)}
                >
                  <span className="lumen-empty-state-action-choice-copy">
                    <strong>{choice.title}</strong>
                    <span>{choice.description}</span>
                    {choice.meta ? <small>{choice.meta}</small> : null}
                  </span>
                  <ChevronRight aria-hidden="true" className="lumen-empty-state-inline-icon" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="lumen-empty-state-muted">{content.labels.emptyChoices}</p>
        )}
      </div>

      <p className="lumen-empty-state-footer" data-hbar-app-ui-region="footer">
        {content.labels.footer}
      </p>
    </section>
  )
}

function LoadFailureSurface({
  content,
  onAction,
}: {
  readonly content: LumenEmptyStateLoadFailureContent
  readonly onAction: LumenEmptyStateProps['onAction']
}) {
  const headingId = React.useId()
  const details = uniqueLumenEmptyStateItems(content.details)

  return (
    <section className="lumen-empty-state-view lumen-empty-state-load-failure" aria-labelledby={headingId}>
      <div className="lumen-empty-state-failure-panel">
        <header className="lumen-empty-state-failure-heading" data-hbar-app-ui-region="heading">
          <AlertTriangle aria-hidden="true" className="lumen-empty-state-failure-icon" />
          <div className="lumen-empty-state-heading">
            <h2 id={headingId}>{content.labels.title}</h2>
            <p>{content.labels.description}</p>
          </div>
        </header>

        {content.error ? (
          <p className="lumen-empty-state-error" role="alert" data-hbar-app-ui-region="error">
            {content.error}
          </p>
        ) : null}

        {details.length ? (
          <dl
            className="lumen-empty-state-details"
            data-hbar-app-ui-region="details"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          >
            {details.map((detail) => (
              <div key={detail.id}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="lumen-empty-state-actions" data-hbar-app-ui-region="actions">
          <LumenButton
            type="button"
            variant="solid"
            tone="primary"
            indicator="none"
            loading={content.retrying}
            className="lumen-empty-state-primary-action"
            data-hbar-app-ui-action="retry"
            onClick={content.onRetry}
          >
            {content.retrying ? content.labels.retrying : content.labels.retry}
          </LumenButton>
          <LumenButton
            type="button"
            variant="outlined"
            indicator="none"
            className="lumen-empty-state-secondary-action"
            disabled={!onAction}
            data-hbar-app-ui-action="service-status"
            onClick={() => reportAction(onAction, 'service-status')}
          >
            {content.labels.serviceStatus}
          </LumenButton>
        </div>
      </div>
      <p className="lumen-empty-state-footer" data-hbar-app-ui-region="footer">
        {content.labels.footer}
      </p>
    </section>
  )
}

function FolderSurface({
  content,
  onAction,
}: {
  readonly content: LumenEmptyStateFolderContent
  readonly onAction: LumenEmptyStateProps['onAction']
}) {
  const headingId = React.useId()
  const fileInput = React.useRef<HTMLInputElement>(null)
  const dragDepth = React.useRef(0)
  const [isDragging, setIsDragging] = React.useState(false)
  const breadcrumbs = uniqueLumenEmptyStateItems(content.breadcrumbs)
  const fileTypes = uniqueLumenEmptyStateItems(content.fileTypes)

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }
  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) {
      setIsDragging(false)
    }
  }
  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) {
      content.onUpload(files, 'drop')
    }
  }

  return (
    <section className="lumen-empty-state-view lumen-empty-state-folder-view" aria-labelledby={headingId}>
      {breadcrumbs.length ? (
        <nav aria-label={content.labels.breadcrumb} data-hbar-app-ui-region="breadcrumbs">
          <ol
            className="lumen-empty-state-breadcrumbs"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          >
            {breadcrumbs.map((breadcrumb, index) => (
              <li key={breadcrumb.id}>
                <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{breadcrumb.label}</span>
                {index < breadcrumbs.length - 1 ? (
                  <ChevronRight aria-hidden="true" className="lumen-empty-state-small-icon" />
                ) : null}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <section
        className="lumen-empty-state-drop-area"
        aria-labelledby={headingId}
        data-hbar-app-ui-region="drop-area"
        data-hbar-app-ui-action="upload-drop"
        data-dragging={isDragging || undefined}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="lumen-empty-state-folder-mark" aria-hidden="true">
          <FolderOpen className="lumen-empty-state-large-icon" />
        </span>
        <div className="lumen-empty-state-heading lumen-empty-state-heading-centered" data-hbar-app-ui-region="heading">
          <h2 id={headingId}>{content.labels.title}</h2>
          <p>{content.labels.description}</p>
        </div>
        {isDragging ? (
          <p className="lumen-empty-state-drop-release" role="status">
            {content.labels.release}
          </p>
        ) : null}

        <div className="lumen-empty-state-actions lumen-empty-state-actions-centered" data-hbar-app-ui-region="actions">
          <LumenButton
            type="button"
            variant="solid"
            indicator="none"
            className="lumen-empty-state-primary-action"
            data-hbar-app-ui-action="upload-picker"
            onClick={() => fileInput.current?.click()}
          >
            <Upload aria-hidden="true" className="lumen-empty-state-small-icon" />
            {content.labels.upload}
          </LumenButton>
          <LumenButton
            type="button"
            variant="outlined"
            indicator="none"
            className="lumen-empty-state-secondary-action"
            disabled={!onAction}
            data-hbar-app-ui-action="import-link"
            onClick={() => reportAction(onAction, 'import-link')}
          >
            <Link2 aria-hidden="true" className="lumen-empty-state-small-icon" />
            {content.labels.importLink}
          </LumenButton>
        </div>

        {fileTypes.length ? (
          <ul
            className="lumen-empty-state-file-types"
            data-hbar-app-ui-region="file-types"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
          >
            {fileTypes.map((fileType) => (
              <li key={fileType.id}>{fileType.label}</li>
            ))}
          </ul>
        ) : null}

        {content.feedback ? (
          <p className="lumen-empty-state-feedback" role="status" aria-live="polite">
            {content.feedback}
          </p>
        ) : null}

        <input
          ref={fileInput}
          type="file"
          hidden
          accept={content.accept}
          multiple={content.multiple}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            if (files.length) {
              content.onUpload(files, 'picker')
            }
          }}
        />
      </section>

      <p className="lumen-empty-state-footer" data-hbar-app-ui-region="footer">
        {content.labels.footer}
      </p>
    </section>
  )
}

function variant(value: number, props: LumenEmptyStateVariantProps) {
  return <LumenEmptyState {...props} variant={value} variantId={`hbar-app-ui-empty-state-${value}`} />
}

export function LumenEmptyState01(props: LumenEmptyStateVariantProps | HbarAppUiEmptyState01Props) {
  return 'copy' in props ? <HbarAppUiEmptyState01 {...props} /> : variant(1, props)
}

export function LumenEmptyState02(props: LumenEmptyStateVariantProps | HbarAppUiEmptyState02Props) {
  return 'copy' in props ? <HbarAppUiEmptyState02 {...props} /> : variant(2, props)
}

export function LumenEmptyState03(props: LumenEmptyStateVariantProps | HbarAppUiEmptyState03Props) {
  return 'copy' in props ? <HbarAppUiEmptyState03 {...props} /> : variant(3, props)
}

export function LumenEmptyState04(props: LumenEmptyStateVariantProps | HbarAppUiEmptyState04Props) {
  return 'copy' in props ? <HbarAppUiEmptyState04 {...props} /> : variant(4, props)
}

export function LumenEmptyState05(props: LumenEmptyStateVariantProps | HbarAppUiEmptyState05Props) {
  return 'copy' in props ? <HbarAppUiEmptyState05 {...props} /> : variant(5, props)
}
