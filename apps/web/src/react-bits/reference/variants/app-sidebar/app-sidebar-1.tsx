import { Activity, BarChart3, BriefcaseBusiness, CalendarClock, ChevronDown, CreditCard, Grid2X2, LayoutDashboard, PanelLeftClose, Settings, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './app-sidebar-1.css'

const groups: readonly [string, readonly [string, number | undefined, LucideIcon][]][] = [
  ['WORKSPACE', [['Command center', 8, Grid2X2], ['Inbox', 12, BriefcaseBusiness], ['Approvals', 5, CalendarClock], ['Automations', undefined, Grid2X2], ['Projects', undefined, BriefcaseBusiness]]],
  ['INSIGHTS', [['Performance', undefined, LayoutDashboard], ['Usage', undefined, BarChart3], ['Activity log', undefined, Activity]]],
  ['ACCOUNT', [['Members', undefined, Users], ['Billing', undefined, CreditCard], ['Settings', undefined, Settings]]],
]

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/app-sidebar/app-sidebar-1. */
export default function AppSidebar1(props: ReferenceFixtureProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [selected, setSelected] = useState('Command center')
  return <div className={`rb-public-sidebar-1${collapsed ? ' collapsed' : ''}`} onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><aside><header><span>M</span><div><p>Meridian</p><small>Operations</small></div></header><nav>{groups.map(([group, items]) => <section key={group}><p>{group}</p><ul>{items.map(([label, count, Icon]) => <li key={label}><button type="button" className={selected === label ? 'selected' : ''} onClick={() => setSelected(label)}><Icon size={15} /><span>{label}</span>{count !== undefined && <small>{count}</small>}</button></li>)}</ul></section>)}</nav><footer><button type="button" className="collapse-toggle" onClick={() => setCollapsed((value) => !value)}><PanelLeftClose size={15} /><span>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span></button><button type="button" className="profile"><span>IR</span><span><b>Iris Renner</b><small>Operations lead</small></span><ChevronDown size={13} /></button></footer></aside><button type="button" className="rb-public-sidebar-1-theme" aria-label="Theme">◉&nbsp; Theme</button></div>
}
