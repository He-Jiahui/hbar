import { HbarAppUiIcon } from '../../icon'
import {useMemo, useState} from 'react'
import {ChevronRight, Plus, Search} from 'lucide-react'
import {reportSupportAction, SupportChip, SupportFrame, type SupportSurfaceProps} from './SupportPrimitives'

type RequestStatus = 'Waiting on you' | 'Open' | 'Resolved'
type Request = {readonly id: string; readonly title: string; readonly detail: string; readonly status: RequestStatus; readonly updated: string}

const requests: readonly Request[] = [
    {id: '#4192', title: 'Scheduled export is empty', detail: 'Reports and exports · Sofia Alvarez · 4 replies', status: 'Waiting on you', updated: '22m ago'},
    {id: '#4188', title: 'SAML metadata upload fails validation', detail: 'Accounts and access · Marcus Bell · 7 replies', status: 'Open', updated: '3h ago'},
    {id: '#4171', title: 'Two invoices issued for March', detail: 'Billing and plans · Wei Chen · 2 replies', status: 'Open', updated: 'Yesterday'},
    {id: '#4150', title: 'Webhook retries stop after one failure', detail: 'Integrations · Sofia Alvarez · 11 replies', status: 'Resolved', updated: '4 Aug'},
    {id: '#4133', title: 'Seat count did not drop after removing a user', detail: 'Billing and plans · Amelia Whitfield · 3 replies', status: 'Resolved', updated: '1 Aug'},
    {id: '#4110', title: 'Dashboard filter resets between tabs', detail: 'Dashboards · Marcus Bell · 5 replies', status: 'Resolved', updated: '28 Jul'},
]

const tabs = ['All', 'Open', 'Resolved'] as const

export function RequestList({spec, onAction}: SupportSurfaceProps): React.JSX.Element {
    const [tab, setTab] = useState<(typeof tabs)[number]>('All')
    const [query, setQuery] = useState('')
    const [newCount, setNewCount] = useState(0)
    const visibleRequests = useMemo(() => requests.filter((request) => (tab === 'All' || tab === request.status || tab === 'Open' && request.status === 'Waiting on you') && `${request.id} ${request.title} ${request.detail}`.toLowerCase().includes(query.toLowerCase())), [query, tab])

    return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-requests"><main className="hbar-app-ui-support-requests-page"><header className="hbar-app-ui-support-requests-heading"><span><h1>Your requests</h1><p>{3 + newCount} open · 1 waiting on your reply</p></span><button type="button" className="hbar-app-ui-support-button hbar-app-ui-support-button-light" onClick={() => {setNewCount((value) => value + 1); reportSupportAction(onAction, spec, 'open', 'new-request')}}><HbarAppUiIcon icon={Plus} tier="md" />New request</button></header><div className="hbar-app-ui-support-requests-tools"><div role="tablist" aria-label="Request status">{tabs.map((item) => <button type="button" key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'is-selected' : ''} onClick={() => {setTab(item); reportSupportAction(onAction, spec, 'tabs', item)}}>{item}</button>)}</div><label className="hbar-app-ui-support-search"><HbarAppUiIcon icon={Search} tier="md" /><input value={query} onChange={(event) => {setQuery(event.target.value); reportSupportAction(onAction, spec, 'search', event.target.value)}} placeholder="Search by subject or number" aria-label="Search by subject or number"/></label></div><section className="hbar-app-ui-support-request-table" aria-label="Support requests"><header><span>Ticket</span><span>Subject</span><span>Status</span><span>Updated</span></header><ol>{visibleRequests.map((request) => <li key={request.id}><button type="button" onClick={() => reportSupportAction(onAction, spec, 'open', request.id)}><code>{request.id}</code><span><strong>{request.title}</strong><small>{request.detail}</small></span><SupportChip tone={request.status === 'Waiting on you' ? 'light' : 'neutral'}>{request.status}</SupportChip><time>{request.updated}</time><HbarAppUiIcon icon={ChevronRight} tier="md"  aria-hidden="true"/></button></li>)}</ol></section><p className="hbar-app-ui-support-requests-note">Resolved requests stay readable for 12 months. Replying to one reopens it.</p></main></SupportFrame>
}
