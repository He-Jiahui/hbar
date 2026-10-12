'use client'
import * as React from 'react'
import { LumenToggleControl } from './forms'
import { LumenButton, LumenText } from './primitives'
import type {
  LumenCardReferenceContent,
  LumenCardReferenceIcon,
  LumenCardReferenceListStrategy,
} from './card-reference-contracts'

interface CardReferenceProps {
  readonly content: LumenCardReferenceContent
  readonly onAction?: ((event: { readonly actionId: string; readonly value?: string | undefined }) => void) | undefined
}
const unique = <T extends { readonly id: string }>(items: readonly T[]) => {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}
function Glyph({
  name,
  tier = 'md',
}: {
  readonly name: LumenCardReferenceIcon
  readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | undefined
}) {
  const paths: Record<LumenCardReferenceIcon, string> = {
    branch: 'M4 2v12M4 6h5a3 3 0 0 0 3-3M2 2h4M2 14h4M10 2h4',
    chat: 'M2 2h12v8H7l-3 3v-3H2z',
    calendar: 'M3 3h10v11H3zM5 1v4M11 1v4M3 7h10',
    warehouse: 'M2 3h12v11H2zM2 7h12M7 3v11',
    ticket: 'M2 4h12v3a2 2 0 0 0 0 4v2H2v-2a2 2 0 0 0 0-4zM8 4v9',
    cloud: 'M5 12H3a2 2 0 0 1 0-4 4 4 0 0 1 8-1 3 3 0 0 1 0 6H5',
    check: 'm3 8 3 3 7-7',
    bookmark: 'M4 2h8v12l-4-3-4 3z',
    file: 'M4 2h5l3 3v9H4zM9 2v3h3M6 8h4M6 11h4',
    download: 'M8 2v8m-3-3 3 3 3-3M3 12v2h10v-2',
    arrow: 'M4 12 12 4M5 4h7v7',
    user: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 14a5 5 0 0 1 10 0',
    location: 'M8 15s5-5 5-9A5 5 0 0 0 3 6c0 4 5 9 5 9zM8 4v4',
    card: 'M2 3h12v10H2zM2 6h12M4 10h3',
    repeat: 'M3 4h10l-3-3M13 12H3l3 3M13 4v4M3 12V8',
    plus: 'M8 3v10M3 8h10',
  }
  return (
    <svg className={`lumen-card-glyph lumen-card-icon-${tier}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
function Avatar({ initials }: { readonly initials: string }) {
  return (
    <span className="lumen-card-avatar is-large" aria-hidden="true">
      {initials}
    </span>
  )
}
function Collection({
  className,
  strategy,
  children,
}: {
  readonly className: string
  readonly strategy: LumenCardReferenceListStrategy
  readonly children: React.ReactNode
}) {
  return (
    <ul
      className={className}
      data-hbar-app-ui-list-strategy={strategy.kind}
      data-hbar-app-ui-expected-maximum={strategy.expectedMaximum}
    >
      {React.Children.map(children, (child) => (
        <li className="lumen-card-reference-item">{child}</li>
      ))}
    </ul>
  )
}
function Empty({ text }: { readonly text: string }) {
  return (
    <LumenText as="p" tone="muted">
      {text}
    </LumenText>
  )
}
function Metadata({
  items,
}: {
  readonly items: readonly {
    readonly id: string
    readonly label: string
    readonly value: string
  }[]
}) {
  return (
    <dl className="lumen-card-plan-metadata">
      {unique(items).map((item) => (
        <div key={item.id}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

interface CardReferenceCaseProps<Kind extends LumenCardReferenceContent['kind']> extends Omit<
  CardReferenceProps,
  'content'
> {
  readonly content: Extract<LumenCardReferenceContent, { readonly kind: Kind }>
}

function MemberCards({ content, onAction }: CardReferenceCaseProps<'members'>) {
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  const items = unique(content.items)
  return (
    <Collection className="lumen-card-member-grid" strategy={content.listStrategy}>
      {items.length ? (
        items.map((item) => (
          <article key={item.id} className="lumen-card-reference-card">
            <div className="lumen-card-reference-box lumen-card-member-body">
              <span className="lumen-card-member-avatar">
                <Avatar initials={item.initials} />
                <i data-online={item.online} aria-hidden="true" />
              </span>
              <LumenText as="h2" variant="heading">
                {item.name}
              </LumenText>
              <LumenText as="p" tone="muted">
                {item.role}
              </LumenText>
              <LumenText as="p">{item.description}</LumenText>
            </div>
            <LumenButton
              className="lumen-card-reference-footer"
              variant={item.connected ? 'outlined' : 'solid'}
              aria-pressed={item.connected}
              aria-label={content.copy.toggle(item.name, item.connected)}
              disabled={item.disabled}
              onClick={() =>
                content.onToggle ? content.onToggle(item.id, !item.connected) : request('connect', item.id)
              }
            >
              {item.connected ? content.copy.connected : content.copy.connect}
            </LumenButton>
          </article>
        ))
      ) : (
        <Empty text={content.copy.empty} />
      )}
    </Collection>
  )
}

function IntegrationCards({ content, onAction }: CardReferenceCaseProps<'integrations'>) {
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  const items = unique(content.items)
  return (
    <Collection className="lumen-card-integration-list" strategy={content.listStrategy}>
      {items.length ? (
        items.map((item) => (
          <article key={item.id}>
            <Glyph name={item.icon} tier="lg" />
            <div>
              <LumenText as="strong">
                {item.name}
                {item.premium && <small className="lumen-card-premium">{item.premium}</small>}
              </LumenText>
              <LumenText as="p" tone="muted">
                {item.description}
              </LumenText>
            </div>
            <LumenToggleControl
              aria-label={content.copy.toggle(item.name)}
              checked={item.connected}
              disabled={item.disabled}
              onChange={(event) =>
                content.onToggle ? content.onToggle(item.id, event.currentTarget.checked) : request('connect', item.id)
              }
            />
          </article>
        ))
      ) : (
        <Empty text={content.copy.empty} />
      )}
    </Collection>
  )
}

function OnboardingCards({ content, onAction }: CardReferenceCaseProps<'onboarding'>) {
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  const items = unique(content.items)
  const count = items.filter((item) => item.complete).length
  return (
    <React.Fragment>
      <header className="lumen-card-reference-header">
        <p>{content.copy.progress(count, items.length)}</p>
        <LumenButton
          variant="outlined"
          disabled={count === 0}
          onClick={() => (content.onReset ? content.onReset() : request('reset'))}
        >
          {content.copy.reset}
        </LumenButton>
      </header>
      <Collection className="lumen-card-onboarding-grid" strategy={content.listStrategy}>
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="lumen-card-reference-card" data-complete={item.complete}>
              <div className="lumen-card-reference-box lumen-card-step-body">
                <small>{item.number}</small>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </div>
              </div>
              <LumenButton
                variant={item.complete ? 'outlined' : 'solid'}
                className="lumen-card-reference-footer"
                aria-pressed={item.complete}
                aria-label={content.copy.toggle(item.title, item.complete)}
                disabled={item.disabled}
                onClick={() =>
                  content.onToggle ? content.onToggle(item.id, !item.complete) : request('step', item.id)
                }
              >
                {item.complete && <Glyph name="check" tier="sm" />}
                {item.complete ? content.copy.completed : content.copy.start}
              </LumenButton>
            </article>
          ))
        ) : (
          <Empty text={content.copy.empty} />
        )}
      </Collection>
    </React.Fragment>
  )
}

function AgendaCards({ content, onAction }: CardReferenceCaseProps<'agenda'>) {
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  const items = unique(content.items)
  return (
    <Collection className="lumen-card-agenda-list" strategy={content.listStrategy}>
      {items.length ? (
        items.map((item) => (
          <article key={item.id} className="lumen-card-reference-card lumen-card-agenda">
            <time className="lumen-card-reference-box">
              <strong>{item.day}</strong>
              <small>{item.month}</small>
            </time>
            <div className="lumen-card-agenda-main">
              <section className="lumen-card-reference-box">
                <h2>{item.title}</h2>
                <p className="lumen-card-event-meta">
                  <span>{item.time}</span>
                  <span>
                    <Glyph name="location" tier="sm" />
                    {item.location}
                  </span>
                  <span>
                    <Glyph name="user" tier="sm" />
                    {item.attendees}
                  </span>
                </p>
              </section>
              <footer className="lumen-card-reference-footer">
                <LumenButton
                  variant={item.going ? 'solid' : 'outlined'}
                  aria-label={content.copy.respond(item.title, true)}
                  aria-pressed={item.going}
                  disabled={item.disabled}
                  onClick={() =>
                    content.onRespond ? content.onRespond(item.id, 'going', !item.going) : request('rsvp', item.id)
                  }
                >
                  {content.copy.going}
                </LumenButton>
                <LumenButton
                  variant={item.declined ? 'solid' : 'outlined'}
                  aria-label={content.copy.respond(item.title, false)}
                  aria-pressed={item.declined}
                  disabled={item.disabled}
                  onClick={() =>
                    content.onRespond
                      ? content.onRespond(item.id, 'decline', !item.declined)
                      : request('decline', item.id)
                  }
                >
                  {content.copy.decline}
                </LumenButton>
              </footer>
            </div>
          </article>
        ))
      ) : (
        <Empty text={content.copy.empty} />
      )}
    </Collection>
  )
}

function PlanCards({ content, onAction }: CardReferenceCaseProps<'plans'>) {
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  const items = unique(content.items)
  return (
    <Collection className="lumen-card-plan-grid" strategy={content.listStrategy}>
      {items.length ? (
        items.map((item) => (
          <article key={item.id} className="lumen-card-reference-card">
            <section className="lumen-card-reference-box lumen-card-plan-intro">
              <header>
                <h2>{item.name}</h2>
                {item.badge && <small>{item.badge}</small>}
              </header>
              <p className="lumen-card-price">
                <strong>{item.price}</strong>
                <small>{item.suffix}</small>
              </p>
              <p>{item.description}</p>
            </section>
            <Metadata items={item.metadata} />
            <ul className="lumen-card-reference-box lumen-card-plan-features">
              {unique(item.features).map((feature) => (
                <li key={feature.id}>
                  <Glyph name="check" tier="sm" />
                  {feature.label}
                </li>
              ))}
            </ul>
            <LumenButton
              className="lumen-card-reference-footer"
              variant={item.current ? 'outlined' : 'solid'}
              disabled={item.disabled}
              aria-pressed={item.current}
              onClick={() => request('choose-plan', item.id)}
            >
              {item.current ? content.copy.current : content.copy.choose(item.name)}
              {!item.current && <Glyph name="arrow" tier="sm" />}
            </LumenButton>
          </article>
        ))
      ) : (
        <Empty text={content.copy.empty} />
      )}
    </Collection>
  )
}

function AccountCards({ content, onAction }: CardReferenceCaseProps<'accounts'>) {
  const rangeName = React.useId()
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  const ranges = unique(content.ranges)
  const enabled = ranges.filter((range) => !range.disabled)
  const selected = enabled.find((range) => range.id === content.selectedRangeId) ?? enabled[0]
  return (
    <React.Fragment>
      <header className="lumen-card-reference-header">
        <h2>{content.copy.title}</h2>
        <div className="lumen-card-tabs" role="radiogroup" aria-label={content.copy.ranges}>
          {ranges.map((range) => (
            <label key={range.id} data-selected={range.id === selected?.id}>
              <input
                type="radio"
                name={rangeName}
                checked={range.id === selected?.id}
                disabled={range.disabled}
                onChange={() => (content.onRange ? content.onRange(range.id) : request('range', range.id))}
              />
              {range.label}
            </label>
          ))}
        </div>
      </header>
      <Collection className="lumen-card-account-grid" strategy={content.listStrategy}>
        {selected?.metrics.length ? (
          unique(selected.metrics).map((metric) => (
            <article key={metric.id} className="lumen-card-reference-card">
              <div className="lumen-card-reference-box">
                <p className="lumen-card-metric-label">
                  <Glyph name={metric.icon} tier="sm" />
                  {metric.label}
                </p>
                <strong className="lumen-card-metric-value">{metric.value}</strong>
                <p className="lumen-card-metric-comparison">
                  <span data-positive={metric.positive}>{metric.change}</span>
                  <small>{metric.comparison}</small>
                </p>
                <svg className="lumen-card-bars" viewBox="0 0 240 48" aria-hidden="true">
                  {metric.bars.map((bar, index) => {
                    const width = 240 / Math.max(1, metric.bars.length)
                    const height = Math.max(0, Math.min(48, bar))
                    return (
                      <rect
                        key={index}
                        x={index * width}
                        y={48 - height}
                        width={Math.max(1, width - 4)}
                        height={height}
                        rx="3"
                        data-last={index === metric.bars.length - 1}
                      />
                    )
                  })}
                </svg>
              </div>
            </article>
          ))
        ) : (
          <Empty text={content.copy.empty} />
        )}
      </Collection>
      {selected && <p className="lumen-card-account-summary">{selected.summary}</p>}
    </React.Fragment>
  )
}

function UpdateCards({ content, onAction }: CardReferenceCaseProps<'updates'>) {
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  const items = unique(content.items)
  return (
    <Collection className="lumen-card-changelog-grid" strategy={content.listStrategy}>
      {items.length ? (
        items.map((item) => (
          <article key={item.id} className="lumen-card-panel lumen-card-changelog">
            <header className="lumen-card-reference-header">
              <small>{item.meta}</small>
              <LumenButton
                variant={item.bookmarked ? 'solid' : 'text'}
                indicator="none"
                aria-label={content.copy.bookmark(item.title, item.bookmarked)}
                aria-pressed={item.bookmarked}
                onClick={() =>
                  content.onToggle ? content.onToggle(item.id, !item.bookmarked) : request('bookmark', item.id)
                }
              >
                <Glyph name="bookmark" tier="sm" />
              </LumenButton>
            </header>
            <h3>
              <a
                href={item.href}
                onClick={(event) => {
                  event.preventDefault()
                  request('open-update', item.id)
                }}
              >
                {item.title}
              </a>
            </h3>
            <p>{item.body}</p>
            <footer>
              <span className="lumen-card-avatar" aria-hidden="true">
                {item.initials}
              </span>
              <span>{item.author}</span>
              <small>{item.reading}</small>
            </footer>
          </article>
        ))
      ) : (
        <Empty text={content.copy.empty} />
      )}
    </Collection>
  )
}

function FileCards({ content, onAction }: CardReferenceCaseProps<'files'>) {
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  const items = unique(content.items)
  const count = items.filter((item) => item.selected).length
  return (
    <React.Fragment>
      <header className="lumen-card-reference-header">
        <p>{content.copy.count(count, items.length)}</p>
        <div>
          <LumenButton
            variant="text"
            disabled={count === 0}
            onClick={() => (content.onClear ? content.onClear() : request('clear'))}
          >
            {content.copy.clear}
          </LumenButton>
          <LumenButton
            disabled={count === 0}
            onClick={() => (content.onDownload ? content.onDownload() : request('download'))}
          >
            <Glyph name="download" tier="sm" />
            {content.copy.download}
          </LumenButton>
        </div>
      </header>
      <Collection className="lumen-card-file-grid" strategy={content.listStrategy}>
        {items.length ? (
          items.map((item) => (
            <LumenButton
              key={item.id}
              className="lumen-card-reference-card"
              variant="text"
              indicator="none"
              aria-pressed={item.selected}
              disabled={item.disabled}
              onClick={() =>
                content.onToggle ? content.onToggle(item.id, !item.selected) : request('select-file', item.id)
              }
            >
              <span className="lumen-card-reference-box lumen-card-file-picture">
                <span className="lumen-card-file-check" data-selected={item.selected}>
                  {item.selected && <Glyph name="check" tier="xs" />}
                </span>
                <Glyph name="file" tier="xl" />
              </span>
              <span className="lumen-card-reference-box lumen-card-file-description">
                <strong>{item.name}</strong>
                <small>{item.meta}</small>
                <small>{item.edited}</small>
              </span>
            </LumenButton>
          ))
        ) : (
          <Empty text={content.copy.empty} />
        )}
      </Collection>
    </React.Fragment>
  )
}

function ProfileCard({ content, onAction }: CardReferenceCaseProps<'profile'>) {
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  return (
    <article className="lumen-card-reference-card lumen-card-reference-single">
      <section className="lumen-card-reference-box lumen-card-profile-body">
        <header className="lumen-card-profile-header">
          <Avatar initials={content.initials} />
          <div>
            <h2>
              {content.name}
              <span aria-label={content.copy.verified} role="img">
                <Glyph name="check" tier="sm" />
              </span>
            </h2>
            <p>{content.role}</p>
            <p>
              <Glyph name="location" tier="sm" />
              {content.location}
            </p>
          </div>
        </header>
        <p>{content.body}</p>
        <div className="lumen-card-tags" aria-label={content.copy.tags}>
          {unique(content.tags).map((tag) => (
            <span key={tag.id}>{tag.label}</span>
          ))}
        </div>
      </section>
      <dl className="lumen-card-profile-metrics">
        {unique(content.metrics).map((metric) => (
          <div key={metric.id} className="lumen-card-reference-box">
            <dd>{metric.value}</dd>
            <dt>{metric.label}</dt>
          </div>
        ))}
      </dl>
      <footer className="lumen-card-reference-footer">
        <LumenButton
          variant="outlined"
          aria-label={content.copy.toggle(content.name, content.following)}
          aria-pressed={content.following}
          onClick={() => (content.onFollow ? content.onFollow(!content.following) : request('follow', content.id))}
        >
          {content.following ? content.copy.following : content.copy.follow}
        </LumenButton>
        <a
          className="lumen-card-message"
          href={content.messageHref}
          onClick={(event) => {
            event.preventDefault()
            request('message', content.id)
          }}
        >
          {content.copy.message}
        </a>
      </footer>
    </article>
  )
}

function BalanceCard({ content, onAction }: CardReferenceCaseProps<'balance'>) {
  const request = (actionId: string, value?: string) =>
    onAction?.(value === undefined ? { actionId } : { actionId, value })
  return (
    <article className="lumen-card-reference-card lumen-card-reference-single">
      <section className="lumen-card-reference-box lumen-card-balance-intro">
        <small>{content.copy.balance}</small>
        <strong className="lumen-card-metric-value">{content.value}</strong>
        <p>
          <span data-positive="true">{content.change}</span> {content.detail}
        </p>
      </section>
      <dl className="lumen-card-balance-metadata">
        {unique(content.metadata).map((item) => (
          <div key={item.id} className="lumen-card-reference-box">
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="lumen-card-reference-box lumen-card-transactions">
        {unique(content.transactions).map((item) => (
          <li key={item.id}>
            <Glyph name={item.incoming ? 'download' : 'arrow'} tier="sm" />
            <span>
              <strong>{item.title}</strong>
              <small>{item.time}</small>
            </span>
            <span>{item.value}</span>
          </li>
        ))}
      </ul>
      <footer className="lumen-card-reference-footer">
        <LumenButton variant="outlined" onClick={() => request('deposit', content.id)}>
          <Glyph name="plus" tier="sm" />
          {content.copy.add}
        </LumenButton>
        <LumenButton variant="outlined" onClick={() => request('transfer', content.id)}>
          <Glyph name="arrow" tier="sm" />
          {content.copy.transfer}
        </LumenButton>
      </footer>
    </article>
  )
}

export default function LumenCardReference({ content, onAction }: CardReferenceProps) {
  switch (content.kind) {
    case 'members':
      return <MemberCards content={content} onAction={onAction} />
    case 'integrations':
      return <IntegrationCards content={content} onAction={onAction} />
    case 'onboarding':
      return <OnboardingCards content={content} onAction={onAction} />
    case 'agenda':
      return <AgendaCards content={content} onAction={onAction} />
    case 'plans':
      return <PlanCards content={content} onAction={onAction} />
    case 'accounts':
      return <AccountCards content={content} onAction={onAction} />
    case 'updates':
      return <UpdateCards content={content} onAction={onAction} />
    case 'files':
      return <FileCards content={content} onAction={onAction} />
    case 'profile':
      return <ProfileCard content={content} onAction={onAction} />
    case 'balance':
      return <BalanceCard content={content} onAction={onAction} />
    default:
      return null
  }
}
