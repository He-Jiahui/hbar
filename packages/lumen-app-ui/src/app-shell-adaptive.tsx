'use client'

import * as React from 'react'
import {
  Ban,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  Flag,
  Inbox,
  Menu,
  Package,
  Plus,
  Search,
  Truck,
  X,
} from 'lucide-react'
import './app-shell-adaptive.css'

const icons = {
  today: ClipboardList,
  unassigned: Inbox,
  progress: Truck,
  parts: Package,
  tomorrow: CalendarDays,
  week: CalendarDays,
  completed: CheckCheck,
  cancelled: Ban,
}
export type LumenAdaptiveQueueIcon = keyof typeof icons
export interface LumenAdaptiveQueue {
  readonly id: string
  readonly label: string
  readonly icon: LumenAdaptiveQueueIcon
  readonly group: 'dispatch' | 'upcoming' | 'archive'
  readonly count?: number
  readonly mobile?: boolean
}
export interface LumenAdaptiveJob {
  readonly id: string
  readonly customer: string
  readonly summary: string
  readonly engineer: string
  readonly arrival: string
  readonly status: string
  readonly tone: 'neutral' | 'warning' | 'danger'
  readonly queueIds: readonly string[]
  readonly flagged?: boolean
}
export interface LumenAppShellAdaptiveContent {
  readonly brand: string
  readonly brandMark: string
  readonly brandDetail: string
  readonly date: string
  readonly labels: {
    readonly queues: string
    readonly dispatch: string
    readonly upcoming: string
    readonly archive: string
    readonly openQueues: string
    readonly closeQueues: string
    readonly closeOverlay: string
    readonly search: string
    readonly hideSearch: string
    readonly clearSearch: string
    readonly empty: string
    readonly emptyDetail: string
    readonly emptyQueue: string
    readonly emptyQueueDetail: string
    readonly emptyCancelled: string
    readonly emptyCancelledDetail: string
    readonly sort: string
    readonly time: string
    readonly customer: string
    readonly arrival: string
    readonly engineer: string
    readonly book: string
    readonly coverage: string
    readonly coverageDetail: string
    readonly assign: string
    readonly accountName: string
    readonly accountInitials: string
    readonly accountRole: string
    readonly flag: (id: string) => string
    readonly clearFlag: (id: string) => string
    readonly jobCount: (count: number) => string
  }
  readonly queues: readonly LumenAdaptiveQueue[]
  readonly jobs: readonly LumenAdaptiveJob[]
  readonly selectedQueueId: string
  readonly query: string
  readonly sort: 'time' | 'customer'
  readonly onQueue: (id: string) => void
  readonly onQuery: (value: string) => void
  readonly onSort: (value: 'time' | 'customer') => void
  readonly onFlag: (id: string) => void
  readonly onAction: (action: 'book' | 'assign') => void
}
const unique = <T extends { readonly id: string }>(items: readonly T[]) => [
  ...new Map(items.map((item) => [item.id, item])).values(),
]

export function selectAdaptiveJobs(content: LumenAppShellAdaptiveContent) {
  const query = content.query.trim().toLocaleLowerCase()
  const jobs = unique(content.jobs).filter(
    (job) =>
      job.queueIds.includes(content.selectedQueueId) &&
      (!query || [job.customer, job.id, job.engineer].some((field) => field.toLocaleLowerCase().includes(query))),
  )
  return content.sort === 'customer' ? jobs.sort((left, right) => left.customer.localeCompare(right.customer)) : jobs
}

export function AppShellAdaptive({ content }: { readonly content: LumenAppShellAdaptiveContent }) {
  const [drawer, setDrawer] = React.useState(false)
  const [mobileSearch, setMobileSearch] = React.useState(false)
  const drawerTrigger = React.useRef<HTMLButtonElement>(null)
  const searchField = React.useRef<HTMLInputElement>(null)
  const queues = unique(content.queues)
  const selected = queues.find((queue) => queue.id === content.selectedQueueId) ?? queues[0]
  const jobs = selectAdaptiveJobs(content)
  React.useEffect(() => {
    if (mobileSearch) searchField.current?.focus()
  }, [mobileSearch])
  React.useEffect(() => {
    if (!drawer) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawer(false)
        drawerTrigger.current?.focus()
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [drawer])
  const choose = (id: string) => {
    content.onQueue(id)
    setDrawer(false)
  }
  const navigation = (compact: boolean) => (
    <nav aria-label={content.labels.queues} className="lumen-adaptive-queue-nav">
      {(['dispatch', 'upcoming', 'archive'] as const).map((group) => {
        const entries = queues.filter((item) => item.group === group)
        return entries.length ? (
          <section key={group}>
            {!compact && <p className="lumen-adaptive-group-label">{content.labels[group]}</p>}
            <ul>
              {entries.map((item) => {
                const Icon = icons[item.icon]
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      title={compact ? item.label : undefined}
                      aria-label={compact ? item.label : undefined}
                      aria-current={item.id === selected?.id ? 'page' : undefined}
                      onClick={() => choose(item.id)}
                    >
                      <Icon className="lumen-adaptive-icon" aria-hidden="true" />
                      {!compact && (
                        <>
                          <span className="lumen-adaptive-queue-label">{item.label}</span>
                          {item.count !== undefined && <span className="lumen-adaptive-count">{item.count}</span>}
                        </>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null
      })}
    </nav>
  )
  const sidebar = (mobile: boolean) => (
    <>
      <div className="lumen-adaptive-brand">
        <span className="lumen-adaptive-mark">{content.brandMark}</span>
        <span>
          <p>{content.brand}</p>
          <p>{content.brandDetail}</p>
        </span>
        {mobile && (
          <button
            type="button"
            className="lumen-adaptive-close"
            aria-label={content.labels.closeQueues}
            onClick={() => {
              setDrawer(false)
              drawerTrigger.current?.focus()
            }}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      {navigation(false)}
      <div className="lumen-adaptive-side-footer">
        <div className="lumen-adaptive-coverage">
          <p>{content.labels.coverage}</p>
          <p>{content.labels.coverageDetail}</p>
          <button type="button" onClick={() => content.onAction('assign')}>
            {content.labels.assign}
          </button>
        </div>
        <div className="lumen-adaptive-account">
          <span aria-hidden="true">{content.labels.accountInitials}</span>
          <div>
            {content.labels.accountName}
            <small>{content.labels.accountRole}</small>
          </div>
        </div>
      </div>
    </>
  )
  return (
    <div className="lumen-adaptive-shell">
      <aside className="lumen-adaptive-rail" aria-label={content.labels.queues}>
        <span className="lumen-adaptive-mark">{content.brandMark}</span>
        {navigation(true)}
        <span className="lumen-adaptive-rail-avatar" title={content.labels.accountName}>
          {content.labels.accountInitials}
        </span>
      </aside>
      <aside className="lumen-adaptive-sidebar" aria-label={content.labels.queues}>
        {sidebar(false)}
      </aside>
      <div className="lumen-adaptive-workspace">
        <header role="banner" className="lumen-adaptive-header">
          <button
            ref={drawerTrigger}
            type="button"
            className="lumen-adaptive-mobile-menu"
            aria-label={content.labels.openQueues}
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <Menu aria-hidden="true" />
          </button>
          <div className="lumen-adaptive-heading">
            <h1>{selected?.label ?? content.labels.queues}</h1>
            <p>
              {content.date} · {content.labels.jobCount(jobs.length)}
            </p>
          </div>
          <button
            type="button"
            className="lumen-adaptive-mobile-search"
            aria-label={mobileSearch ? content.labels.hideSearch : content.labels.search}
            aria-expanded={mobileSearch}
            onClick={() => setMobileSearch(!mobileSearch)}
          >
            {mobileSearch ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
          </button>
          <button type="button" className="lumen-adaptive-book" onClick={() => content.onAction('book')}>
            <Plus aria-hidden="true" />
            {content.labels.book}
          </button>
        </header>
        <div className={`lumen-adaptive-toolbar${mobileSearch ? ' lumen-adaptive-search-open' : ''}`}>
          <label className="lumen-adaptive-search">
            <Search aria-hidden="true" />
            <input
              ref={searchField}
              type="search"
              aria-label={content.labels.search}
              placeholder={content.labels.search}
              value={content.query}
              onChange={(event) => content.onQuery(event.target.value)}
            />
          </label>
          <div className="lumen-adaptive-sort" role="group" aria-label={content.labels.sort}>
            {(['time', 'customer'] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={content.sort === value}
                onClick={() => content.onSort(value)}
              >
                {content.labels[value]}
              </button>
            ))}
          </div>
        </div>
        <main className="lumen-adaptive-main">
          {jobs.length ? (
            <>
              <ul className="lumen-adaptive-jobs lumen-adaptive-card-list">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <div className="lumen-adaptive-job-title">
                      <p title={job.customer}>{job.customer}</p>
                      <p title={job.summary}>{job.summary}</p>
                    </div>
                    <button
                      type="button"
                      className="lumen-adaptive-flag"
                      aria-pressed={Boolean(job.flagged)}
                      aria-label={job.flagged ? content.labels.clearFlag(job.id) : content.labels.flag(job.id)}
                      onClick={() => content.onFlag(job.id)}
                    >
                      <Flag aria-hidden="true" />
                    </button>
                    <dl className="lumen-adaptive-job-detail">
                      <div>
                        <dt>{content.labels.arrival}</dt>
                        <dd>{job.arrival}</dd>
                      </div>
                      <div>
                        <dt>{content.labels.engineer}</dt>
                        <dd>{job.engineer}</dd>
                      </div>
                    </dl>
                    <div className="lumen-adaptive-job-tail">
                      <div className={`lumen-adaptive-job-status lumen-adaptive-tone-${job.tone}`}>
                        <span aria-hidden="true" />
                        {job.status}
                      </div>
                      <span className="lumen-adaptive-mobile-id">{job.id}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <ul className="lumen-adaptive-jobs lumen-adaptive-row-list">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <div className="lumen-adaptive-job-id">{job.id}</div>
                    <div className="lumen-adaptive-job-title">
                      <span title={job.customer}>{job.customer}</span>
                      <span title={job.summary}>{job.summary}</span>
                    </div>
                    <div className="lumen-adaptive-job-engineer">{job.engineer}</div>
                    <div className="lumen-adaptive-job-window">{job.arrival}</div>
                    <div className={`lumen-adaptive-job-status lumen-adaptive-tone-${job.tone}`}>
                      <span aria-hidden="true" />
                      {job.status}
                    </div>
                    <button
                      type="button"
                      className="lumen-adaptive-flag"
                      aria-pressed={Boolean(job.flagged)}
                      aria-label={job.flagged ? content.labels.clearFlag(job.id) : content.labels.flag(job.id)}
                      onClick={() => content.onFlag(job.id)}
                    >
                      <Flag aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="lumen-adaptive-empty">
              {content.query.trim() ? (
                <Search aria-hidden="true" />
              ) : selected?.id === 'cancelled' ? (
                <Ban aria-hidden="true" />
              ) : (
                <Inbox aria-hidden="true" />
              )}
              <p>
                {content.query.trim()
                  ? content.labels.empty
                  : selected?.id === 'cancelled'
                    ? content.labels.emptyCancelled
                    : content.labels.emptyQueue}
              </p>
              <p>
                {content.query.trim()
                  ? content.labels.emptyDetail
                  : selected?.id === 'cancelled'
                    ? content.labels.emptyCancelledDetail
                    : content.labels.emptyQueueDetail}
              </p>
              {content.query.trim() && (
                <button type="button" onClick={() => content.onQuery('')}>
                  {content.labels.clearSearch}
                </button>
              )}
            </div>
          )}
        </main>
      </div>
      <nav className="lumen-adaptive-bottom-nav" aria-label={content.labels.queues}>
        <ul>
          {queues
            .filter((item) => item.mobile)
            .map((item) => {
              const Icon = icons[item.icon]
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={item.id === selected?.id ? 'page' : undefined}
                    onClick={() => choose(item.id)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                </li>
              )
            })}
        </ul>
      </nav>
      {drawer && (
        <div className="lumen-adaptive-drawer-layer">
          <button
            className="lumen-adaptive-backdrop"
            type="button"
            aria-label={content.labels.closeOverlay}
            onClick={() => {
              setDrawer(false)
              drawerTrigger.current?.focus()
            }}
          />
          <div role="dialog" aria-modal="true" aria-label={content.brand} className="lumen-adaptive-drawer">
            {sidebar(true)}
          </div>
        </div>
      )}
    </div>
  )
}
