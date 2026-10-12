'use client'

import * as React from 'react'
import { LumenToggleControl } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import './card.css'
import LumenCardReference from './card-reference'
import { type LumenCardReferenceContent } from './card-reference-contracts'
import { LumenBadge, LumenChip, LumenTabs } from './ui-controls'

export interface LumenCardListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenCardMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenCardChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenCardMemberContent {
  readonly labels: {
    readonly online: string
    readonly connected: string
    readonly connect: string
    readonly disconnect: string
  }
  readonly member: {
    readonly id: string
    readonly initials: string
    readonly name: string
    readonly role: string
  }
  readonly metrics: readonly LumenCardMetric[]
  readonly initiallyConnected: boolean
}

export interface LumenCardIntegration {
  readonly id: string
  readonly name: string
  readonly disconnectedDetail: string
  readonly connectedDetail: string
}

export interface LumenCardIntegrationsContent {
  readonly labels: {
    readonly toggle: (name: string) => string
    readonly empty: string
  }
  readonly integrations: readonly LumenCardIntegration[]
  readonly initialConnectedIds: readonly string[]
  readonly listStrategy: LumenCardListStrategy
}

export interface LumenCardOnboardingStep {
  readonly id: string
  readonly title: string
  readonly disabled?: boolean | undefined
}

export interface LumenCardOnboardingContent {
  readonly labels: {
    readonly title: string
    readonly detail: (completed: number, total: number) => string
    readonly reset: string
    readonly done: string
    readonly start: string
    readonly empty: string
  }
  readonly steps: readonly LumenCardOnboardingStep[]
  readonly initialCompletedCount: number
  readonly listStrategy: LumenCardListStrategy
}

export interface LumenCardAgendaContent {
  readonly labels: {
    readonly rsvp: string
    readonly going: string
    readonly attendees: string
    readonly overflowAttendees: (count: number) => string
  }
  readonly date: { readonly day: string; readonly month: string }
  readonly title: string
  readonly detail: string
  readonly attendees: readonly {
    readonly id: string
    readonly initials: string
    readonly name: string
  }[]
  readonly maximumVisibleAttendees: number
  readonly initiallyGoing: boolean
}

export interface LumenCardPlan {
  readonly id: string
  readonly name: string
  readonly prices: Readonly<Record<string, string>>
  readonly priceSuffix: string
  readonly features: readonly LumenCardChoice[]
  readonly current?: boolean | undefined
  readonly featured?: boolean | undefined
}

export interface LumenCardPlansContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly periods: string
    readonly choose: string
    readonly current: string
    readonly empty: string
  }
  readonly periods: readonly LumenCardChoice[]
  readonly initialPeriodId: string
  readonly plans: readonly LumenCardPlan[]
  readonly listStrategy: LumenCardListStrategy
}

export interface LumenCardMetricsContent {
  readonly labels: { readonly title: string; readonly ranges: string; readonly empty: string }
  readonly ranges: readonly LumenCardChoice[]
  readonly initialRangeId: string
  readonly metrics: readonly LumenCardMetric[]
  readonly listStrategy: LumenCardListStrategy
}

export interface LumenCardChangelogContent {
  readonly labels: { readonly bookmark: string; readonly removeBookmark: string }
  readonly meta: string
  readonly title: string
  readonly body: string
  readonly author: { readonly initials: string; readonly name: string; readonly detail: string }
  readonly initiallyBookmarked: boolean
}

export interface LumenCardFile {
  readonly id: string
  readonly name: string
  readonly meta: string
  readonly preview: string
  readonly disabled?: boolean | undefined
}

export interface LumenCardFilesContent {
  readonly labels: {
    readonly title: string
    readonly detail: (name: string) => string
    readonly open: string
    readonly files: string
    readonly preview: string
    readonly empty: string
  }
  readonly files: readonly LumenCardFile[]
  readonly initialFileId: string
  readonly listStrategy: LumenCardListStrategy
}

export interface LumenCardProfileContent {
  readonly labels: {
    readonly follow: string
    readonly following: string
    readonly message: string
    readonly tags: string
  }
  readonly profile: {
    readonly id: string
    readonly initials: string
    readonly name: string
    readonly detail: string
  }
  readonly tags: readonly LumenCardChoice[]
  readonly metrics: readonly LumenCardMetric[]
  readonly initiallyFollowing: boolean
}

export interface LumenCardBalanceContent {
  readonly labels: {
    readonly balance: string
    readonly pending: string
    readonly reserved: string
    readonly transfer: string
    readonly deposit: string
  }
  readonly value: string
  readonly pending: string
  readonly reserved: string
  readonly recent: string
}

export interface LumenCardInvoiceLine {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
  readonly value: string
  readonly section?: 'items' | 'summary' | undefined
  readonly emphasized?: boolean | undefined
}

export interface LumenCardInvoiceContent {
  readonly labels: { readonly eyebrow: string; readonly download: string }
  readonly invoiceId: string
  readonly meta: string
  readonly status: string
  readonly lines: readonly LumenCardInvoiceLine[]
  readonly listStrategy: LumenCardListStrategy
}

export interface LumenCardContent {
  readonly reference?: LumenCardReferenceContent | undefined
  readonly onAction?: ((event: LumenCardAction) => void) | undefined
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  readonly member?: LumenCardMemberContent | undefined
  readonly integrations?: LumenCardIntegrationsContent | undefined
  readonly onboarding?: LumenCardOnboardingContent | undefined
  readonly agenda?: LumenCardAgendaContent | undefined
  readonly plans?: LumenCardPlansContent | undefined
  readonly metrics?: LumenCardMetricsContent | undefined
  readonly changelog?: LumenCardChangelogContent | undefined
  readonly files?: LumenCardFilesContent | undefined
  readonly profile?: LumenCardProfileContent | undefined
  readonly balance?: LumenCardBalanceContent | undefined
  readonly invoice?: LumenCardInvoiceContent | undefined
}

export interface LumenCardProviderProps {
  readonly content: LumenCardContent
  readonly children: React.ReactNode
}

export interface LumenCardAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenCardProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenCardContent | undefined
  readonly onAction?: ((event: LumenCardAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenCardVariantProps = Omit<LumenCardProps, 'variant' | 'variantId'>

const CardContext = React.createContext<LumenCardContent | undefined>(undefined)

export function LumenCardProvider({ content, children }: LumenCardProviderProps) {
  return <CardContext.Provider value={content}>{children}</CardContext.Provider>
}

export function useLumenCardContent() {
  return React.useContext(CardContext)
}

export function uniqueLumenCardItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenCardItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenCardProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { name: 'branch' | 'check' | 'bookmark' | 'file' | 'download' }) {
  const paths = {
    branch:
      'M5 3a2 2 0 1 1-2-2 2 2 0 0 1 2 2Zm8 0a2 2 0 1 1-2-2 2 2 0 0 1 2 2ZM5 13a2 2 0 1 1-2-2 2 2 0 0 1 2 2ZM3 5v6m2-3h3a4 4 0 0 0 4-4',
    check: 'm3 8 3 3 7-7',
    bookmark: 'M4 2h8v12L8 11l-4 3Z',
    file: 'M4 2h5l3 3v9H4Zm5 0v3h3',
    download: 'M8 2v8m-3-3 3 3 3-3M3 12v2h10v-2',
  }
  return (
    <svg className="lumen-card-glyph" viewBox="0 0 16 16" aria-hidden="true">
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
}: Omit<LumenCardProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-card-family',
    `hbar-app-ui-card-variant-${variant}`,
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
      as="section"
      boundary="horizontal"
      className="lumen-card-family-surface"
      contentClassName={contentClassName}
      data-lumen-component="card"
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
    <header className="lumen-card-header">
      <div>
        <LumenText as="h2" variant="heading">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {detail}
        </LumenText>
      </div>
      {actions}
    </header>
  )
}

function Avatar({ initials, large = false }: { initials: string; large?: boolean | undefined }) {
  return (
    <span className={large ? 'lumen-card-avatar is-large' : 'lumen-card-avatar'} aria-hidden="true">
      {initials}
    </span>
  )
}

function Metrics({ metrics }: { metrics: readonly LumenCardMetric[] }) {
  return (
    <dl className="lumen-card-metrics">
      {uniqueLumenCardItems(metrics).map((metric) => (
        <div key={metric.id} data-tone={metric.tone}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
          {metric.detail ? <small>{metric.detail}</small> : null}
        </div>
      ))}
    </dl>
  )
}

function Member(props: Omit<LumenCardProps, 'content'> & { content: LumenCardMemberContent }) {
  const [connected, setConnected] = React.useState(props.content.initiallyConnected)
  return (
    <Root {...props}>
      <article className="lumen-card-panel lumen-card-member">
        <Avatar initials={props.content.member.initials} large />
        <LumenStatus value={connected ? props.content.labels.connected : props.content.labels.online} tone="success" />
        <LumenText as="h2" variant="heading">
          {props.content.member.name}
        </LumenText>
        <LumenText as="p" tone="muted">
          {props.content.member.role}
        </LumenText>
        <Metrics metrics={props.content.metrics} />
        <LumenButton
          tone={connected ? 'success' : 'primary'}
          onClick={() => {
            const next = !connected
            setConnected(next)
            report(props.onAction, next ? 'connect' : 'disconnect', props.content.member.id)
          }}
        >
          {connected ? props.content.labels.disconnect : props.content.labels.connect}
        </LumenButton>
      </article>
    </Root>
  )
}

function Integrations(props: Omit<LumenCardProps, 'content'> & { content: LumenCardIntegrationsContent }) {
  const integrations = uniqueLumenCardItems(props.content.integrations)
  const initialIds = uniqueLumenCardItems(props.content.initialConnectedIds.map((id) => ({ id })))
    .map((item) => item.id)
    .filter((id) => integrations.some((item) => item.id === id))
  const [connectedIds, setConnectedIds] = React.useState<readonly string[]>(initialIds)
  return (
    <Root {...props}>
      <div className="lumen-card-integration-list" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {integrations.length ? (
          integrations.map((integration) => {
            const connected = connectedIds.includes(integration.id)
            return (
              <article key={integration.id}>
                <Glyph name="branch" />
                <div>
                  <LumenText as="strong" variant="label">
                    {integration.name}
                  </LumenText>
                  <LumenText as="small" tone="muted">
                    {connected ? integration.connectedDetail : integration.disconnectedDetail}
                  </LumenText>
                </div>
                <LumenToggleControl
                  className="lumen-card-switch"
                  aria-label={props.content.labels.toggle(integration.name)}
                  checked={connected}
                  onChange={(event) => {
                    const next = event.currentTarget.checked
                    setConnectedIds((current) =>
                      next
                        ? [...current.filter((id) => id !== integration.id), integration.id]
                        : current.filter((id) => id !== integration.id),
                    )
                    report(props.onAction, next ? 'connect' : 'disconnect', integration.id)
                  }}
                />
              </article>
            )
          })
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function Onboarding(props: Omit<LumenCardProps, 'content'> & { content: LumenCardOnboardingContent }) {
  const steps = uniqueLumenCardItems(props.content.steps)
  const [completed, setCompleted] = React.useState(
    Math.max(0, Math.min(steps.length, props.content.initialCompletedCount)),
  )
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail(completed, steps.length)}
        actions={
          <LumenButton
            variant="outlined"
            disabled={completed === 0}
            onClick={() => {
              setCompleted(0)
              report(props.onAction, 'reset')
            }}
          >
            {props.content.labels.reset}
          </LumenButton>
        }
      />
      <div className="lumen-card-onboarding-grid" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {steps.length ? (
          steps.map((step, index) => {
            const done = index < completed
            return (
              <article key={step.id} data-complete={done || undefined}>
                <span>{done ? <Glyph name="check" /> : index + 1}</span>
                <LumenText as="strong" variant="label">
                  {step.title}
                </LumenText>
                <LumenButton
                  variant={done ? 'text' : 'outlined'}
                  disabled={step.disabled}
                  onClick={() => {
                    setCompleted((value) => Math.max(value, index + 1))
                    report(props.onAction, 'step', step.id)
                  }}
                >
                  {done ? props.content.labels.done : props.content.labels.start}
                </LumenButton>
              </article>
            )
          })
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function Agenda(props: Omit<LumenCardProps, 'content'> & { content: LumenCardAgendaContent }) {
  const attendees = uniqueLumenCardItems(props.content.attendees)
  const visible = attendees.slice(0, Math.max(0, props.content.maximumVisibleAttendees))
  const overflow = Math.max(0, attendees.length - visible.length)
  const [going, setGoing] = React.useState(props.content.initiallyGoing)
  return (
    <Root {...props}>
      <article className="lumen-card-panel lumen-card-agenda">
        <time>
          <strong>{props.content.date.day}</strong>
          <small>{props.content.date.month}</small>
        </time>
        <div>
          <LumenText as="h2" variant="heading">
            {props.content.title}
          </LumenText>
          <LumenText as="p" tone="muted">
            {props.content.detail}
          </LumenText>
          <div className="lumen-card-avatar-stack" aria-label={props.content.labels.attendees}>
            {visible.map((attendee) => (
              <Avatar key={attendee.id} initials={attendee.initials} />
            ))}
            {overflow ? <LumenBadge value={props.content.labels.overflowAttendees(overflow)} /> : null}
          </div>
        </div>
        <LumenButton
          tone={going ? 'success' : 'primary'}
          onClick={() => {
            const next = !going
            setGoing(next)
            report(props.onAction, 'rsvp', String(next))
          }}
        >
          {going ? props.content.labels.going : props.content.labels.rsvp}
        </LumenButton>
      </article>
    </Root>
  )
}

function Plans(props: Omit<LumenCardProps, 'content'> & { content: LumenCardPlansContent }) {
  const periods = uniqueLumenCardItems(props.content.periods)
  const plans = uniqueLumenCardItems(props.content.plans)
  const [periodId, setPeriodId] = React.useState(props.content.initialPeriodId)
  const period = selectLumenCardItem(periods, periodId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenTabs
        className="lumen-card-tabs"
        label={props.content.labels.periods}
        items={periods}
        selectedId={period?.id ?? null}
        onChange={setPeriodId}
      />
      <div className="lumen-card-plan-grid" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {plans.length ? (
          plans.map((plan) => (
            <article key={plan.id} data-featured={plan.featured || undefined}>
              <LumenText as="h3" variant="heading">
                {plan.name}
              </LumenText>
              <p className="lumen-card-price">
                <strong>{plan.prices[period?.id ?? ''] ?? ''}</strong>
                <small>{plan.priceSuffix}</small>
              </p>
              <ul>
                {uniqueLumenCardItems(plan.features).map((feature) => (
                  <li key={feature.id}>
                    <Glyph name="check" />
                    {feature.label}
                  </li>
                ))}
              </ul>
              <LumenButton
                tone={plan.featured ? 'primary' : 'neutral'}
                disabled={plan.current}
                onClick={() => report(props.onAction, 'choose-plan', plan.id)}
              >
                {plan.current ? props.content.labels.current : props.content.labels.choose}
              </LumenButton>
            </article>
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function AccountMetrics(props: Omit<LumenCardProps, 'content'> & { content: LumenCardMetricsContent }) {
  const ranges = uniqueLumenCardItems(props.content.ranges)
  const [rangeId, setRangeId] = React.useState(props.content.initialRangeId)
  const range = selectLumenCardItem(ranges, rangeId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={range?.label ?? props.content.labels.empty} />
      <LumenTabs
        className="lumen-card-tabs"
        label={props.content.labels.ranges}
        items={ranges}
        selectedId={range?.id ?? null}
        onChange={(id) => {
          setRangeId(id)
          report(props.onAction, 'range', id)
        }}
      />
      <div data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {props.content.metrics.length ? (
          <Metrics metrics={props.content.metrics} />
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function Changelog(props: Omit<LumenCardProps, 'content'> & { content: LumenCardChangelogContent }) {
  const [bookmarked, setBookmarked] = React.useState(props.content.initiallyBookmarked)
  return (
    <Root {...props}>
      <article className="lumen-card-panel lumen-card-changelog">
        <LumenText as="small" tone="muted">
          {props.content.meta}
        </LumenText>
        <LumenText as="h2" variant="title">
          {props.content.title}
        </LumenText>
        <LumenText as="p">{props.content.body}</LumenText>
        <footer>
          <Avatar initials={props.content.author.initials} />
          <span>
            <strong>{props.content.author.name}</strong>
            <small>{props.content.author.detail}</small>
          </span>
          <LumenIconButton
            label={bookmarked ? props.content.labels.removeBookmark : props.content.labels.bookmark}
            tone={bookmarked ? 'primary' : 'neutral'}
            onClick={() => {
              const next = !bookmarked
              setBookmarked(next)
              report(props.onAction, 'bookmark', String(next))
            }}
          >
            <Glyph name="bookmark" />
          </LumenIconButton>
        </footer>
      </article>
    </Root>
  )
}

function Files(props: Omit<LumenCardProps, 'content'> & { content: LumenCardFilesContent }) {
  const files = uniqueLumenCardItems(props.content.files)
  const [fileId, setFileId] = React.useState(props.content.initialFileId)
  const selected = selectLumenCardItem(files, fileId)
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={selected ? props.content.labels.detail(selected.name) : props.content.labels.empty}
        actions={
          <LumenButton
            variant="outlined"
            disabled={!selected}
            onClick={() => report(props.onAction, 'open-file', selected?.id)}
          >
            {props.content.labels.open}
          </LumenButton>
        }
      />
      <div
        className="lumen-card-file-grid"
        aria-label={props.content.labels.files}
        data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
      >
        {files.map((file) => (
          <LumenButton
            key={file.id}
            variant={selected?.id === file.id ? 'solid' : 'outlined'}
            aria-pressed={selected?.id === file.id}
            disabled={file.disabled}
            onClick={() => setFileId(file.id)}
          >
            <Glyph name="file" />
            <strong>{file.name}</strong>
            <small>{file.meta}</small>
          </LumenButton>
        ))}
      </div>
      {selected ? (
        <article className="lumen-card-file-preview" aria-label={props.content.labels.preview}>
          <Glyph name="file" />
          <div>
            <LumenText as="strong" variant="heading">
              {selected.name}
            </LumenText>
            <LumenText as="p" tone="muted">
              {selected.preview}
            </LumenText>
          </div>
        </article>
      ) : null}
    </Root>
  )
}

function Profile(props: Omit<LumenCardProps, 'content'> & { content: LumenCardProfileContent }) {
  const [following, setFollowing] = React.useState(props.content.initiallyFollowing)
  const tags = uniqueLumenCardItems(props.content.tags)
  return (
    <Root {...props}>
      <article className="lumen-card-panel lumen-card-profile">
        <Avatar initials={props.content.profile.initials} large />
        <LumenText as="h2" variant="heading">
          {props.content.profile.name}
        </LumenText>
        <LumenText as="p" tone="muted">
          {props.content.profile.detail}
        </LumenText>
        <div className="lumen-card-tags" aria-label={props.content.labels.tags}>
          {tags.map((tag) => (
            <LumenChip key={tag.id} label={tag.label} />
          ))}
        </div>
        <Metrics metrics={props.content.metrics} />
        <footer>
          <LumenButton
            tone={following ? 'success' : 'primary'}
            onClick={() => {
              const next = !following
              setFollowing(next)
              report(props.onAction, 'follow', String(next))
            }}
          >
            {following ? props.content.labels.following : props.content.labels.follow}
          </LumenButton>
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'message', props.content.profile.id)}>
            {props.content.labels.message}
          </LumenButton>
        </footer>
      </article>
    </Root>
  )
}

function Balance(props: Omit<LumenCardProps, 'content'> & { content: LumenCardBalanceContent }) {
  return (
    <Root {...props}>
      <article className="lumen-card-panel lumen-card-balance">
        <LumenText as="small" tone="muted">
          {props.content.labels.balance}
        </LumenText>
        <LumenText as="strong" variant="title">
          {props.content.value}
        </LumenText>
        <dl>
          <div>
            <dt>{props.content.labels.pending}</dt>
            <dd>{props.content.pending}</dd>
          </div>
          <div>
            <dt>{props.content.labels.reserved}</dt>
            <dd>{props.content.reserved}</dd>
          </div>
        </dl>
        <footer>
          <LumenButton tone="primary" onClick={() => report(props.onAction, 'transfer')}>
            {props.content.labels.transfer}
          </LumenButton>
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'deposit')}>
            {props.content.labels.deposit}
          </LumenButton>
        </footer>
        <LumenText as="small" tone="muted">
          {props.content.recent}
        </LumenText>
      </article>
    </Root>
  )
}

function Invoice(props: Omit<LumenCardProps, 'content'> & { content: LumenCardInvoiceContent }) {
  const lines = uniqueLumenCardItems(props.content.lines)
  const itemLines = lines.filter((line) => line.section !== 'summary')
  const summaryLines = lines.filter((line) => line.section === 'summary')
  return (
    <Root {...props}>
      <article className="lumen-card-panel lumen-card-invoice">
        <div className="lumen-card-invoice-header">
          <LumenText as="p" variant="supporting" tone="muted">
            {props.content.labels.eyebrow}
          </LumenText>
          <div className="lumen-card-invoice-heading">
            <LumenText as="h2" variant="heading">
              {props.content.invoiceId}
            </LumenText>
            <LumenStatus value={props.content.status} tone="success" />
          </div>
          <LumenText as="p" tone="muted" variant="supporting">
            {props.content.meta}
          </LumenText>
        </div>
        <div className="lumen-card-invoice-items">
          <ul data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
            {itemLines.map((line) => (
              <li key={line.id} data-emphasized={line.emphasized || undefined}>
                <span>
                  <strong>{line.label}</strong>
                  {line.detail ? <small>{line.detail}</small> : null}
                </span>
                <span>{line.value}</span>
              </li>
            ))}
          </ul>
        </div>
        {summaryLines.length > 0 ? (
          <dl className="lumen-card-invoice-summary">
            {summaryLines.map((line) => (
              <div key={line.id} data-emphasized={line.emphasized || undefined}>
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="lumen-card-invoice-actions">
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'download', props.content.invoiceId)}>
            <Glyph name="download" />
            {props.content.labels.download}
          </LumenButton>
        </div>
      </article>
    </Root>
  )
}

function empty(props: LumenCardProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenCard(props: LumenCardProps) {
  const inheritedContent = useLumenCardContent()
  const content = props.content ?? inheritedContent
  const controlled = content?.onAction ? { ...props, onAction: content.onAction } : props
  const result = content?.reference ? (
    <Root {...controlled} className={[props.className, 'lumen-card-reference'].filter(Boolean).join(' ')}>
      <LumenCardReference content={content.reference} onAction={controlled.onAction} />
    </Root>
  ) : (
    renderCard(controlled, content)
  )
  return content?.presentation ? (
    <div className="lumen-card-preview-owner" data-hbar-preview-owner={content.presentation.ownerId}>
      {content.presentation.notice && (
        <p className="lumen-card-preview-notice" role="status">
          {content.presentation.notice}
        </p>
      )}
      {result}
    </div>
  ) : (
    result
  )
}

function renderCard(props: LumenCardProps, content: LumenCardContent | undefined) {
  if (props.variant === 1) {
    return content?.member ? <Member {...props} content={content.member} /> : empty(props)
  }
  if (props.variant === 2) {
    return content?.integrations ? <Integrations {...props} content={content.integrations} /> : empty(props)
  }
  if (props.variant === 3) {
    return content?.onboarding ? <Onboarding {...props} content={content.onboarding} /> : empty(props)
  }
  if (props.variant === 4) {
    return content?.agenda ? <Agenda {...props} content={content.agenda} /> : empty(props)
  }
  if (props.variant === 5) {
    return content?.plans ? <Plans {...props} content={content.plans} /> : empty(props)
  }
  if (props.variant === 6) {
    return content?.metrics ? <AccountMetrics {...props} content={content.metrics} /> : empty(props)
  }
  if (props.variant === 7) {
    return content?.changelog ? <Changelog {...props} content={content.changelog} /> : empty(props)
  }
  if (props.variant === 8) {
    return content?.files ? <Files {...props} content={content.files} /> : empty(props)
  }
  if (props.variant === 9) {
    return content?.profile ? <Profile {...props} content={content.profile} /> : empty(props)
  }
  if (props.variant === 10) {
    return content?.balance ? <Balance {...props} content={content.balance} /> : empty(props)
  }
  if (props.variant === 11) {
    return content?.invoice ? <Invoice {...props} content={content.invoice} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenCardVariantProps) {
  return <LumenCard {...props} variant={value} variantId={`hbar-app-ui-card-${value}`} />
}

export const LumenCard01 = (props: LumenCardVariantProps) => variant(1, props)

export const LumenCard02 = (props: LumenCardVariantProps) => variant(2, props)

export const LumenCard03 = (props: LumenCardVariantProps) => variant(3, props)

export const LumenCard04 = (props: LumenCardVariantProps) => variant(4, props)

export const LumenCard05 = (props: LumenCardVariantProps) => variant(5, props)

export const LumenCard06 = (props: LumenCardVariantProps) => variant(6, props)

export const LumenCard07 = (props: LumenCardVariantProps) => variant(7, props)

export const LumenCard08 = (props: LumenCardVariantProps) => variant(8, props)

export const LumenCard09 = (props: LumenCardVariantProps) => variant(9, props)

export const LumenCard10 = (props: LumenCardVariantProps) => variant(10, props)

export const LumenCard11 = (props: LumenCardVariantProps) => variant(11, props)
