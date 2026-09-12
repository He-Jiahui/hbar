import { Check, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './integrations-1.css'

const integrations = [['Northwind', 'Analytics', 'Stream product events into Northwind dashboards.', 'NW', true], ['Cedar Labs', 'Developer', 'Open an issue whenever a deploy check fails.', 'CL', true], ['Harbor', 'Messaging', 'Post alerts and approvals into a shared channel.', 'HB', false], ['Meridian', 'Storage', 'Archive exports to a bucket you control.', 'MD', false], ['Alder', 'Analytics', 'Warehouse sync for usage and billing tables.', 'AL', false], ['Fernrock', 'Developer', 'Run a workflow when an environment is promoted.', 'FR', false], ['Tidepool', 'Messaging', 'Send customer events to your support room.', 'TP', false], ['Quarry', 'Security', 'Review sign-in events with your team.', 'QR', false]] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/integrations/integrations-1. */
export default function Integrations1({ onInteraction }: ReferenceFixtureProps) {
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [connected, setConnected] = useState<string[]>(integrations.filter((item) => item[4]).map((item) => item[0]))
  const toggle = (name: string) => setConnected((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])
  const visible = integrations.filter(([name, kind]) => (category === 'All' || kind === category) && `${name} ${kind}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="rb-public-integrations-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><div><h2>Integrations</h2><p><strong>{connected.length}</strong> connected · <strong>{integrations.length + 1 - connected.length}</strong> available</p></div><label><Search size={14} /><input aria-label="Search integrations" placeholder="Search integrations" value={query} onChange={(event) => setQuery(event.target.value)} /></label><nav role="tablist">{['All', 'Analytics', 'Developer', 'Messaging', 'Storage', 'Security'].map((item) => <button type="button" role="tab" aria-selected={category === item} className={category === item ? 'selected' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</nav></header><main className="rb-integration-grid">{visible.map(([name, kind, description, initials]) => { const isConnected = connected.includes(name); return <article key={name}><div className="rb-integration-title"><span>{initials}</span><div><h3>{name}</h3><p>{kind}</p></div></div><p className="rb-integration-description">{description}</p><button type="button" className={isConnected ? 'connected' : 'connect'} onClick={() => toggle(name)}>{isConnected ? <><Check size={13} /> Connected</> : <><Plus size={13} /> Connect</>}</button></article> })}</main><button type="button" className="rb-integrations-theme">◉&nbsp; Theme</button></section>
}
