'use client'

import * as React from 'react'
import {
  AlarmClock,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSearch,
  FileText,
  Images,
  Mail,
  Menu,
  Music,
  PanelRight,
  Pencil,
  Pin,
  Plus,
  Share2,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import { LumenButton, LumenIconButton } from './primitives'
import './app-shell-editorial.css'

const editorialIcons = {
  queue: FileText,
  assignments: ClipboardList,
  copy: Pencil,
  media: Images,
  metro: Building2,
  business: Briefcase,
  culture: Music,
  sport: Trophy,
  investigations: FileSearch,
  newsletters: Mail,
  syndication: Share2,
  audience: Users,
  saved: Pin,
  late: AlarmClock,
}
export interface LumenEditorialLink {
  readonly id: string
  readonly label: string
  readonly href: string
  readonly icon: keyof typeof editorialIcons
  readonly count?: string | undefined
}
export interface LumenEditorialStory {
  readonly id: string
  readonly title: string
  readonly owner: string
  readonly status: string
  readonly publishes: string
  readonly tone: 'neutral' | 'warning'
}
export interface LumenEditorialDay {
  readonly id: string
  readonly label: string
  readonly day: string
  readonly inMonth: boolean
  readonly isToday: boolean
  readonly hasEvents: boolean
}
export interface LumenEditorialEvent {
  readonly id: string
  readonly time: string
  readonly title: string
  readonly detail: string
}
export interface LumenAppShellEditorialContent {
  readonly brand: { readonly mark: string; readonly name: string; readonly desk: string }
  readonly account: { readonly initials: string; readonly name: string; readonly role: string }
  readonly labels: {
    readonly navigation: string
    readonly navigationDialog: string
    readonly openNavigation: string
    readonly closeNavigation: string
    readonly closeOverlay: string
    readonly breadcrumb: string
    readonly section: string
    readonly title: string
    readonly toggleSchedule: string
    readonly schedule: string
    readonly hideSchedule: string
    readonly create: string
    readonly recordsCaption: string
    readonly emptyRecords: string
    readonly emptyNavigation: string
    readonly previousMonth: string
    readonly nextMonth: string
    readonly upNext: string
    readonly emptyScheduleTitle: string
    readonly emptyScheduleDetail: string
    readonly today: string
  }
  /** Pane-owned navigation, intended for up to 50 links; larger inventories should be grouped by the host. */
  readonly sections: readonly {
    readonly id: string
    readonly label: string
    readonly links: readonly LumenEditorialLink[]
  }[]
  readonly currentLinkId: string | null
  readonly onNavigate: (id: string) => void
  readonly filters: readonly { readonly id: string; readonly label: string }[]
  readonly filterId: string | null
  readonly onFilter: (id: string) => void
  readonly onCreate: () => void
  readonly columns: {
    readonly story: string
    readonly owner: string
    readonly status: string
    readonly publishes: string
  }
  /** Main pane owns scrolling. The host pages collections above 100 stories. */
  readonly stories: readonly LumenEditorialStory[]
  readonly month: string
  readonly calendarCaption: string
  readonly weekdays: readonly {
    readonly id: string
    readonly short: string
    readonly label: string
  }[]
  /** A bounded month view, at most six weeks of seven cells. */
  readonly weeks: readonly (readonly LumenEditorialDay[])[]
  readonly selectedDate: string | null
  readonly onDate: (id: string) => void
  readonly onMonth: (direction: -1 | 1) => void
  readonly onToday: () => void
  /** Independently scrolling agenda; the host pages collections above 100 events. */
  readonly events: readonly LumenEditorialEvent[]
  readonly onEvent: (id: string) => void
}
const stable = <T extends { readonly id: string }>(items: readonly T[]): T[] => [
  ...new Map(items.map((item) => [item.id, item])).values(),
]
function Brand({
  content,
  onClose,
}: {
  readonly content: LumenAppShellEditorialContent
  readonly onClose?: (() => void) | undefined
}) {
  return (
    <div className="lumen-editorial-brand">
      <span className="lumen-editorial-mark">{content.brand.mark}</span>
      <div>
        <p>{content.brand.name}</p>
        <p>{content.brand.desk}</p>
      </div>
      {onClose ? (
        <LumenIconButton size="s" label={content.labels.closeNavigation} onClick={onClose}>
          <X className="lumen-editorial-icon" aria-hidden="true" />
        </LumenIconButton>
      ) : null}
    </div>
  )
}
function Navigation({ content }: { readonly content: LumenAppShellEditorialContent }) {
  return (
    <React.Fragment>
      <nav
        className="lumen-editorial-nav"
        aria-label={content.labels.navigation}
        data-lumen-list-strategy="pane-scroll"
      >
        {stable(content.sections).map((section) => (
          <div key={section.id}>
            <p>{section.label}</p>
            <ul>
              {stable(section.links).map((link) => {
                const Icon = editorialIcons[link.icon]
                return (
                  <li key={link.id}>
                    <a
                      href={link.href}
                      aria-current={link.id === content.currentLinkId ? 'page' : undefined}
                      onClick={() => content.onNavigate(link.id)}
                    >
                      <Icon className="lumen-editorial-icon" aria-hidden="true" />
                      <span>{link.label}</span>
                      {link.count ? <span className="lumen-editorial-count">{link.count}</span> : null}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        {content.sections.length ? null : <p>{content.labels.emptyNavigation}</p>}
      </nav>
      <div className="lumen-editorial-account">
        <div>
          <span>{content.account.initials}</span>
          <div>
            <p>{content.account.name}</p>
            <p>{content.account.role}</p>
          </div>
        </div>
      </div>
    </React.Fragment>
  )
}
function Status({ story }: { readonly story: LumenEditorialStory }) {
  return (
    <span className="lumen-editorial-status" data-tone={story.tone}>
      <i aria-hidden="true" />
      {story.status}
    </span>
  )
}
function Stories({ content }: { readonly content: LumenAppShellEditorialContent }) {
  const stories = stable(content.stories)
  return (
    <main data-lumen-list-strategy="pane-scroll">
      {stories.length ? (
        <React.Fragment>
          <table className="lumen-editorial-table">
            <caption className="lumen-editorial-sr">{content.labels.recordsCaption}</caption>
            <thead>
              <tr>
                <th>{content.columns.story}</th>
                <th className="lumen-editorial-owner">{content.columns.owner}</th>
                <th>{content.columns.status}</th>
                <th>{content.columns.publishes}</th>
              </tr>
            </thead>
            <tbody>
              {stories.map((story) => (
                <tr key={story.id} data-story-id={story.id}>
                  <td>
                    <span title={story.title}>{story.title}</span>
                  </td>
                  <td className="lumen-editorial-owner">{story.owner}</td>
                  <td>
                    <Status story={story} />
                  </td>
                  <td>{story.publishes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="lumen-editorial-cards">
            {stories.map((story) => (
              <li key={story.id} data-story-id={story.id}>
                <p>{story.title}</p>
                <dl>
                  <div>
                    <dt>{content.columns.owner}</dt>
                    <dd>{story.owner}</dd>
                  </div>
                  <div>
                    <dt>{content.columns.status}</dt>
                    <dd>
                      <Status story={story} />
                    </dd>
                  </div>
                  <div>
                    <dt>{content.columns.publishes}</dt>
                    <dd>{story.publishes}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </React.Fragment>
      ) : (
        <p className="lumen-editorial-empty-stories">{content.labels.emptyRecords}</p>
      )}
    </main>
  )
}
function Schedule({
  content,
  onClose,
}: {
  readonly content: LumenAppShellEditorialContent
  readonly onClose: () => void
}) {
  const [focusedDate, setFocusedDate] = React.useState(content.selectedDate)
  const days = content.weeks.flat()
  const focusId = days.some((day) => day.id === focusedDate) ? focusedDate : days.find((day) => day.inMonth)?.id
  return (
    <aside className="lumen-editorial-schedule" aria-label={content.labels.schedule}>
      <div className="lumen-editorial-schedule-heading">
        <h2>{content.labels.schedule}</h2>
        <LumenIconButton size="s" label={content.labels.hideSchedule} onClick={onClose}>
          <X className="lumen-editorial-icon" aria-hidden="true" />
        </LumenIconButton>
      </div>
      <div className="lumen-editorial-calendar">
        <div>
          <p>{content.month}</p>
          <LumenIconButton size="s" label={content.labels.previousMonth} onClick={() => content.onMonth(-1)}>
            <ChevronLeft className="lumen-editorial-icon" aria-hidden="true" />
          </LumenIconButton>
          <LumenIconButton size="s" label={content.labels.nextMonth} onClick={() => content.onMonth(1)}>
            <ChevronRight className="lumen-editorial-icon" aria-hidden="true" />
          </LumenIconButton>
        </div>
        <table>
          <caption className="lumen-editorial-sr">{content.calendarCaption}</caption>
          <thead>
            <tr>
              {stable(content.weekdays).map((day) => (
                <th key={day.id}>
                  {day.short}
                  <span className="lumen-editorial-sr">{day.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.weeks.map((week, index) => (
              <tr key={week[0]?.id ?? index}>
                {stable(week).map((day) => (
                  <td key={day.id}>
                    <LumenButton
                      variant="text"
                      size="s"
                      indicator="none"
                      aria-label={day.label}
                      aria-pressed={content.selectedDate === day.id}
                      data-current-month={day.inMonth}
                      data-today={day.isToday}
                      data-calendar-date={day.id}
                      tabIndex={day.id === focusId ? 0 : -1}
                      onFocus={() => setFocusedDate(day.id)}
                      onKeyDown={(event) => {
                        const index = days.findIndex((item) => item.id === day.id)
                        const offsets: Readonly<Record<string, number>> = {
                          ArrowLeft: -1,
                          ArrowRight: 1,
                          ArrowUp: -7,
                          ArrowDown: 7,
                          Home: -(index % 7),
                          End: 6 - (index % 7),
                        }
                        const offset = offsets[event.key]
                        if (offset === undefined) return
                        event.preventDefault()
                        const next = days[index + offset]
                        if (next)
                          event.currentTarget
                            .closest('table')
                            ?.querySelector<HTMLButtonElement>(`button[data-calendar-date="${next.id}"]`)
                            ?.focus()
                      }}
                      onClick={() => content.onDate(day.id)}
                    >
                      {day.day}
                      {day.hasEvents ? <i className="lumen-editorial-date-dot" aria-hidden="true" /> : null}
                    </LumenButton>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lumen-editorial-up-next">{content.labels.upNext}</p>
      <div className="lumen-editorial-agenda-frame">
        <div className="lumen-editorial-agenda" data-lumen-list-strategy="pane-scroll">
          {content.events.length ? (
            <ul>
              {stable(content.events).map((event) => (
                <li key={event.id}>
                  <LumenButton variant="text" indicator="none" onClick={() => content.onEvent(event.id)}>
                    <span className="lumen-editorial-event-line" aria-hidden="true" />
                    <span>{event.time}</span>
                    <span>{event.title}</span>
                    <span>{event.detail}</span>
                  </LumenButton>
                </li>
              ))}
            </ul>
          ) : (
            <div className="lumen-editorial-empty-schedule">
              <p>{content.labels.emptyScheduleTitle}</p>
              <p>{content.labels.emptyScheduleDetail}</p>
              <LumenButton size="s" variant="outlined" indicator="none" onClick={content.onToday}>
                {content.labels.today}
              </LumenButton>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
export function AppShellEditorial({ content }: { readonly content: LumenAppShellEditorialContent }) {
  const root = React.useRef<HTMLDivElement>(null),
    trigger = React.useRef<HTMLButtonElement>(null),
    drawer = React.useRef<HTMLElement>(null)
  const [narrow, setNarrow] = React.useState(false),
    [navigationOpen, setNavigationOpen] = React.useState(true),
    [scheduleOpen, setScheduleOpen] = React.useState<boolean | undefined>(undefined)
  React.useEffect(() => {
    const element = root.current
    if (!element) return
    const observe = () => {
      const next =
        element.clientWidth < 64 * Number.parseFloat(getComputedStyle(element.ownerDocument.documentElement).fontSize)
      setNarrow(next)
      setScheduleOpen((value) => value ?? !next)
    }
    observe()
    const observer = new ResizeObserver(observe)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    if (narrow && navigationOpen) drawer.current?.querySelector('button')?.focus()
  }, [narrow, navigationOpen])
  const closeNavigation = () => {
    setNavigationOpen(false)
    trigger.current?.focus()
  }
  return (
    <div className="lumen-editorial-shell" ref={root}>
      <aside className="lumen-editorial-sidebar">
        <Brand content={content} />
        <Navigation content={content} />
      </aside>
      <div className="lumen-editorial-workspace">
        <div className="lumen-editorial-central">
          <header role="banner">
            <LumenIconButton
              ref={trigger}
              className="lumen-editorial-open-nav"
              size="s"
              label={content.labels.openNavigation}
              aria-expanded={narrow && navigationOpen}
              onClick={() => setNavigationOpen(true)}
            >
              <Menu className="lumen-editorial-icon" aria-hidden="true" />
            </LumenIconButton>
            <nav aria-label={content.labels.breadcrumb}>
              <ol>
                <li>{content.labels.section}</li>
                <ChevronRight className="lumen-editorial-icon" aria-hidden="true" />
                <li>
                  <h1>{content.labels.title}</h1>
                </li>
              </ol>
            </nav>
            <LumenIconButton
              size="s"
              label={content.labels.toggleSchedule}
              aria-pressed={scheduleOpen ?? false}
              onClick={() => setScheduleOpen((value) => !value)}
            >
              <PanelRight className="lumen-editorial-icon" aria-hidden="true" />
            </LumenIconButton>
          </header>
          <div className="lumen-editorial-toolbar">
            <div>
              {stable(content.filters).map((filter) => (
                <LumenButton
                  key={filter.id}
                  size="s"
                  variant="text"
                  indicator="none"
                  aria-pressed={filter.id === content.filterId}
                  onClick={() => content.onFilter(filter.id)}
                >
                  {filter.label}
                </LumenButton>
              ))}
            </div>
            <LumenButton
              size="s"
              variant="outlined"
              indicator="none"
              className="lumen-editorial-create"
              aria-label={content.labels.create}
              onClick={content.onCreate}
            >
              <Plus className="lumen-editorial-icon" aria-hidden="true" />
              <span>{content.labels.create}</span>
            </LumenButton>
          </div>
          <div className="lumen-editorial-main-frame">
            <Stories content={content} />
          </div>
        </div>
        {scheduleOpen ? <Schedule content={content} onClose={() => setScheduleOpen(false)} /> : null}
      </div>
      {narrow && navigationOpen ? (
        <div className="lumen-editorial-overlay">
          <button
            type="button"
            className="lumen-editorial-backdrop"
            aria-label={content.labels.closeOverlay}
            onClick={closeNavigation}
          />
          <aside
            ref={drawer}
            className="lumen-editorial-drawer"
            role="dialog"
            aria-label={content.labels.navigationDialog}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                closeNavigation()
              }
            }}
          >
            <Brand content={content} onClose={closeNavigation} />
            <Navigation content={content} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}
