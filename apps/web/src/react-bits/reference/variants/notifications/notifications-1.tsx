import { AtSign, CheckCheck, GitPullRequest, MessageSquare, ShieldCheck, UserRoundPlus } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './notifications-1.css'

const notifications = [
  ['Ana Reyes', 'mentioned you in', 'Q3 rollout plan', 'Can you confirm the migration window before we lock the schedule with Northwind?', '12m', AtSign, true],
  ['Wei Chen', 'requested review on', 'Billing usage meter', '14 files changed across the metering service and the invoice job.', '48m', GitPullRequest, true],
  ['Marco Silva', 'replied in', 'Onboarding checklist', 'Moved the workspace step ahead of the invite step. Looks cleaner.', '2h', MessageSquare, true],
  ['Priya Nandakumar', 'joined', 'Cedar Labs', 'Invited by you as an editor.', '5h', UserRoundPlus, false],
] as const
const yesterday = [
  ['Halcyon', 'signed in from a new device on', 'macOS · Lisbon', 'If this was not you, revoke the session and rotate your keys.', 'Yesterday', ShieldCheck, false],
  ['Sofia Alvarez', 'mentioned you in', 'Retention teardown', 'Pulled your cohort chart into the summary. Shout if that is stale.', 'Yesterday', AtSign, false],
] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/notifications/notifications-1. */
export default function Notifications1({ onInteraction }: ReferenceFixtureProps) {
  const [tab, setTab] = useState('All')
  const [read, setRead] = useState<string[]>([])
  const markAll = () => setRead(notifications.map(([name]) => name ?? ''))
  const toggleRead = (name: string | undefined) => { const value = name ?? ''; setRead((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]) }
  return <section className="rb-public-notifications-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header className="rb-notifications-header"><h2>Notifications <span>4</span></h2><button type="button" onClick={markAll}><CheckCheck size={14} /> Mark all read</button></header><div className="rb-notifications-tabs"><div role="tablist">{[['All','8'],['Unread','4'],['Mentions','2']].map(([label, count]) => { const tabLabel = label ?? ''; const tabCount = count ?? ''; return <button type="button" role="tab" aria-selected={tab === tabLabel} className={tab === tabLabel ? 'selected' : ''} key={tabLabel} onClick={() => setTab(tabLabel)}><span>{tabLabel}</span><small>{tabCount}</small></button> })}</div></div><div className="rb-notifications-content"><NotificationGroup title="TODAY" items={notifications} read={read} onRead={toggleRead} /><NotificationGroup title="YESTERDAY" items={yesterday} read={read} onRead={toggleRead} /><h3 className="earlier">EARLIER</h3></div><button type="button" className="rb-notifications-theme">◉&nbsp; Theme</button></section>
}

function NotificationGroup({ title, items, read, onRead }: { title: string; items: readonly (readonly [string, string, string, string, string, typeof AtSign, boolean])[]; read: string[]; onRead: (name: string) => void }) { return <section className="rb-notification-group"><h3>{title}</h3><ul>{items.map(([name, verb, subject, detail, time, Icon, unread]) => <li className={read.includes(name ?? '') || !unread ? 'read' : ''} key={name ?? subject}><button type="button" className="rb-notification-icon" aria-label={`Mark ${name ?? ''} read`} onClick={() => onRead(name ?? '')}><Icon size={15} /></button><div><p><strong>{name}</strong> {verb} <b>{subject}</b></p><p>{detail}</p></div><time>{time}</time></li>)}</ul></section> }
