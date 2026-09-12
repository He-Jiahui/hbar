import { ArrowRight, BookOpen, CreditCard, KeyRound, MessageSquare, PlugZap, Search } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './support-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/support/support-1. */
export default function Support1({ onInteraction }: ReferenceFixtureProps) {
  const [query, setQuery] = useState('')
  const [contacted, setContacted] = useState(false)
  const categories = [['Accounts and access', 'Sign in, SSO, roles and invitations.', '24', KeyRound], ['Billing and plans', 'Invoices, seats, upgrades and refunds.', '18', CreditCard], ['Integrations', 'Warehouses, webhooks and the API.', '31', PlugZap], ['Reports and exports', 'Scheduling, formats and delivery.', '27', BookOpen]] as const
  const articles = ['Why did my scheduled export arrive empty?', 'Move a workspace to a different owner', 'Set up SAML with your identity provider', 'Understand seat counts on the Pro plan']
  return <section className="rb-public-support-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-support-shell"><header className="rb-support-hero"><h1>How can we help?</h1><p>Search the guides, or open a ticket and a person will reply. Median<br />first response today is 11 minutes.</p></header><label className="rb-support-search"><Search size={15} /><input aria-label="Search help articles" placeholder="Search articles, guides and answers" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="rb-support-categories">{categories.map(([title, desc, count, Icon]) => <button type="button" key={title} onClick={() => setQuery(title)}><span className="rb-support-icon"><Icon size={16} /></span><span><strong>{title}</strong><small>{desc}</small></span><em>{count}</em></button>)}</div><section className="rb-support-popular"><h2>READ MOST THIS WEEK</h2><div>{articles.filter((item) => item.toLowerCase().includes(query.toLowerCase())).map((article, index) => <button type="button" key={article}><strong>{article}</strong><span>{['4.2k','3.1k','2.8k','2.4k'][index] ?? '1.8k'} <ArrowRight size={14} /></span></button>)}</div></section><div className="rb-support-contact"><span className="rb-support-icon"><MessageSquare size={16} /></span><div><strong>Still stuck?</strong><p>Support is online now, 09:00 to 21:00 UTC on weekdays.</p></div><button type="button" onClick={() => setContacted(true)}>{contacted ? 'Request sent' : 'Contact support'}</button></div></div><button type="button" className="rb-support-theme">◉&nbsp; Theme</button></section>
}
