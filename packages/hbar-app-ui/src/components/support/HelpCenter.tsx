import { HbarAppUiIcon } from '../../icon'
import {useMemo, useState} from 'react'
import {BookOpen, ChevronRight, CreditCard, KeyRound, MessageSquare, Plug, Search} from 'lucide-react'
import {reportSupportAction, SupportFrame, type SupportSurfaceProps} from './SupportPrimitives'

type HelpTopic = {
    readonly id: string
    readonly title: string
    readonly detail: string
    readonly count: string
    readonly icon: typeof KeyRound
}

const topics: readonly HelpTopic[] = [
    {id: 'accounts', title: 'Accounts and access', detail: 'Sign in, SSO, roles and invitations.', count: '24', icon: KeyRound},
    {id: 'billing', title: 'Billing and plans', detail: 'Invoices, seats, upgrades and refunds.', count: '18', icon: CreditCard},
    {id: 'integrations', title: 'Integrations', detail: 'Warehouses, webhooks and the API.', count: '31', icon: Plug},
    {id: 'reports', title: 'Reports and exports', detail: 'Scheduling, formats and delivery.', count: '27', icon: BookOpen},
]

const articles = [
    {id: 'empty-export', title: 'Why did my scheduled export arrive empty?', views: '4.2k'},
    {id: 'owner', title: 'Move a workspace to a different owner', views: '3.1k'},
    {id: 'saml', title: 'Set up SAML with your identity provider', views: '2.8k'},
    {id: 'seats', title: 'Understand seat counts on the Pro plan', views: '2.4k'},
] as const

export function HelpCenter({spec, onAction}: SupportSurfaceProps): React.JSX.Element {
    const [query, setQuery] = useState('')
    const matchingTopics = useMemo(() => topics.filter((topic) => `${topic.title} ${topic.detail}`.toLowerCase().includes(query.toLowerCase())), [query])
    const matchingArticles = useMemo(() => articles.filter((article) => article.title.toLowerCase().includes(query.toLowerCase())), [query])

    return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-help"><main className="hbar-app-ui-support-help-page">
        <header className="hbar-app-ui-support-help-heading"><h1>How can we help?</h1><p>Search the guides, or open a ticket and a person will reply. Median first response today is 11 minutes.</p></header>
        <label className="hbar-app-ui-support-search"><HbarAppUiIcon icon={Search} tier="md"  aria-hidden="true"/><input value={query} onChange={(event) => {
            setQuery(event.target.value)
            reportSupportAction(onAction, spec, 'search', event.target.value)
        }} placeholder="Search articles, guides and answers" aria-label="Search articles, guides and answers"/></label>
        <section className="hbar-app-ui-support-topic-grid" aria-label="Help topics">{matchingTopics.map((topic) => {const Icon = topic.icon; return <button type="button" key={topic.id} onClick={() => reportSupportAction(onAction, spec, 'open', topic.id)}><span className="hbar-app-ui-support-topic-icon"><HbarAppUiIcon icon={Icon} tier="md"  strokeWidth={1.6}/></span><span><strong>{topic.title}</strong><small>{topic.detail}</small></span><em>{topic.count}</em></button>})}</section>
        <section className="hbar-app-ui-support-articles"><h2>Read most this week</h2>{matchingArticles.length ? <div>{matchingArticles.map((article) => <button type="button" key={article.id} onClick={() => reportSupportAction(onAction, spec, 'open', article.id)}><strong>{article.title}</strong><span>{article.views}</span><HbarAppUiIcon icon={ChevronRight} tier="md"  strokeWidth={1.5} aria-hidden="true"/></button>)}</div> : <p>No guides match this search.</p>}</section>
        <footer className="hbar-app-ui-support-contact"><span className="hbar-app-ui-support-topic-icon"><HbarAppUiIcon icon={MessageSquare} tier="md"  strokeWidth={1.6}/></span><span><strong>Still stuck?</strong><small>Support is online now, 09:00 to 21:00 UTC on weekdays.</small></span><button type="button" className="hbar-app-ui-support-button hbar-app-ui-support-button-light" onClick={() => reportSupportAction(onAction, spec, 'contact')}>Contact support</button></footer>
    </main></SupportFrame>
}
