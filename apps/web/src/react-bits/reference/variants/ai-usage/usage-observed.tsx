import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Check, ChevronDown, ExternalLink, Info, Palette, Search } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './usage-observed.css'

export type UsageObservedVariant =
  | 'ai-usage-3'
  | 'ai-usage-4'
  | 'ai-usage-5'
  | 'ai-usage-6'
  | 'ai-usage-7'
  | 'ai-usage-8'

type Limit = { label: string; hint: string; used: string; total: string; unit: string; percent: number }

const limitTiers: Record<string, readonly Limit[]> = {
  'Tier 1': [
    { label: 'Requests per minute', hint: 'Rolling 60 second window', used: '412', total: '500', unit: 'req', percent: 82 },
    { label: 'Tokens per minute', hint: 'Input and output combined', used: '148,000', total: '400,000', unit: 'tok', percent: 37 },
    { label: 'Concurrent requests', hint: 'In flight right now', used: '18', total: '40', unit: 'req', percent: 45 },
    { label: 'Queued batch jobs', hint: 'Waiting for a worker', used: '3', total: '25', unit: 'jobs', percent: 12 },
  ],
  'Tier 2': [
    { label: 'Requests per minute', hint: 'Rolling 60 second window', used: '840', total: '1,000', unit: 'req', percent: 84 },
    { label: 'Tokens per minute', hint: 'Input and output combined', used: '318,000', total: '800,000', unit: 'tok', percent: 40 },
    { label: 'Concurrent requests', hint: 'In flight right now', used: '28', total: '80', unit: 'req', percent: 35 },
    { label: 'Queued batch jobs', hint: 'Waiting for a worker', used: '8', total: '50', unit: 'jobs', percent: 16 },
  ],
  'Tier 3': [
    { label: 'Requests per minute', hint: 'Rolling 60 second window', used: '1,220', total: '2,000', unit: 'req', percent: 61 },
    { label: 'Tokens per minute', hint: 'Input and output combined', used: '680,000', total: '1,200,000', unit: 'tok', percent: 57 },
    { label: 'Concurrent requests', hint: 'In flight right now', used: '42', total: '120', unit: 'req', percent: 35 },
    { label: 'Queued batch jobs', hint: 'Waiting for a worker', used: '12', total: '100', unit: 'jobs', percent: 12 },
  ],
}

function LimitRow({ item }: { item: Limit }) {
  return <article className="rb-observed-usage-limit-row">
    <div className="rb-observed-usage-limit-heading"><div><strong>{item.label}</strong><small>{item.hint}</small></div><p><b>{item.used}</b> / {item.total} {item.unit}</p></div>
    <div className="rb-observed-usage-progress" role="progressbar" aria-valuenow={item.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${item.label} utilisation`}><i style={{ width: `${item.percent}%` }} /></div>
  </article>
}

function Usage3({ onInteraction }: ReferenceFixtureProps) {
  const [tier, setTier] = useState('Tier 1')
  const limits: readonly Limit[] = limitTiers[tier] ?? limitTiers['Tier 1']!
  return <section className="rb-observed-usage-surface rb-observed-usage-3" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <div className="rb-observed-usage-3-content">
      <header><div><h1>Rate limits</h1><p><i />1 limit near capacity</p></div><nav role="tablist">{Object.keys(limitTiers).map((item) => <button type="button" role="tab" aria-selected={tier === item} className={tier === item ? 'selected' : ''} key={item} onClick={() => setTier(item)}>{item}</button>)}</nav></header>
      <section className="rb-observed-usage-3-card"><div className="rb-observed-usage-3-inner"><div>{limits.map((item) => <LimitRow item={item} key={item.label} />)}</div><footer><p><Info size={13} />Limits rise automatically once spend clears the next threshold.</p><button type="button">Request an increase</button></footer></div></section>
    </div>
  </section>
}

const members = [
  ['PN', 'Priya Nandakumar', 'Platform', '42M', '77%', '$500', '$384', 77],
  ['MB', 'Marcus Bell', 'Support', '28M', '87%', '$300', '$261', 87],
  ['SA', 'Sofia Alvarez', 'Platform', '22M', '41%', '$500', '$203', 41],
  ['TG', 'Tomás Guerrero', 'Research', '20M', '90%', '$200', '$180', 90],
  ['WC', 'Wei Chen', 'Support', '11M', '34%', '$300', '$103', 34],
  ['AW', 'Amelia Whitfield', 'Research', '6.4M', '30%', '$200', '$59', 30],
  ['JV', 'Jonas Vikander', 'Platform', '2.9M', '5%', '$500', '$27', 5],
] as const

function Usage4({ onInteraction }: ReferenceFixtureProps) {
  const [team, setTeam] = useState('All teams')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => members.filter((member) => (team === 'All teams' || member[2] === team) && member[1].toLowerCase().includes(query.toLowerCase())), [query, team])
  return <section className="rb-observed-usage-surface rb-observed-usage-4" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <div className="rb-observed-usage-4-content">
      <header><div><h1>Usage by member</h1><p>$1,217 across 7 seats this month.</p></div><label><Search size={14} /><input aria-label="Search members" placeholder="Search members" value={query} onChange={(event) => setQuery(event.target.value)} /></label></header>
      <section className="rb-observed-usage-4-card"><nav role="tablist">{['All teams', 'Platform', 'Support', 'Research'].map((item) => <button type="button" role="tab" aria-selected={team === item} className={team === item ? 'selected' : ''} key={item} onClick={() => setTeam(item)}>{item}</button>)}</nav><div className="rb-observed-usage-4-rows">{visible.map((member) => <article key={member[1]}><span className="rb-observed-usage-avatar">{member[0]}</span><div className="member-copy"><strong>{member[1]}</strong><small>{member[2]} · {member[3]} tokens</small></div><div className="member-meter"><i><b style={{ width: `${member[7]}%` }} /></i><small>{member[4]} of {member[5]} cap</small></div><strong className="member-cost">{member[6]}</strong></article>)}</div></section>
    </div><button type="button" className="rb-observed-usage-theme"><Palette size={14} />Theme</button>
  </section>
}

function Usage5({ onInteraction }: ReferenceFixtureProps) {
  const [cap, setCap] = useState(2500)
  const [threshold, setThreshold] = useState('75% of cap')
  const [pause, setPause] = useState(true)
  const [digest, setDigest] = useState(false)
  return <section className="rb-observed-usage-surface rb-observed-usage-5" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <div className="rb-observed-usage-5-content"><header><h1>Budget and alerts</h1><p>Cap monthly model spend and decide who hears about it.</p></header><section className="rb-observed-usage-5-card">
      <div className="budget-summary"><div><span>This month</span><strong>$1,840<small> of $2,500</small></strong></div><div className="budget-line"><i style={{ width: '73.6%' }} /></div><p><b>•</b>Projected $2,613 at current pace, over budget on the 26th.</p></div>
      <div className="budget-cap"><label htmlFor="budget-cap">Monthly cap</label><div className="cap-range"><input id="budget-cap" aria-label="Monthly cap" type="range" min="1000" max="11000" step="100" value={cap} onChange={(event) => setCap(Number(event.target.value))} /><output>${cap.toLocaleString()}</output></div><p>Notify at</p><div className="thresholds">{['50% of cap', '75% of cap', '90% of cap'].map((item) => <button type="button" className={threshold === item ? 'selected' : ''} key={item} onClick={() => setThreshold(item)}>{item}</button>)}</div></div>
      <div className="budget-toggles"><ToggleRow title="Pause requests at 100%" detail="New calls return a quota error until the next cycle." value={pause} onChange={() => setPause((value) => !value)} /><ToggleRow title="Weekly spend digest" detail="Sent to workspace admins every Monday." value={digest} onChange={() => setDigest((value) => !value)} /></div>
    </section></div>
  </section>
}

function ToggleRow({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: () => void }) {
  return <div className="budget-toggle-row"><div><strong>{title}</strong><small>{detail}</small></div><button type="button" aria-pressed={value} className={value ? 'on' : ''} onClick={onChange}><i /></button></div>
}

function Usage6({ onInteraction }: ReferenceFixtureProps) {
  const [plan, setPlan] = useState('Scale')
  const allowancePlans = [
    ['Scale', '$400/mo · $1.80 per M over', ['250M tokens included', 'Tier 2 rate limits', 'Priority routing on Atlas Pro']],
    ['Enterprise', '$1400/mo · $1.20 per M over', ['1B tokens included', 'Tier 3 rate limits', 'Dedicated capacity and a support channel']],
  ] as const
  return <section className="rb-observed-usage-surface rb-observed-usage-6" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <div className="rb-observed-usage-6-content"><header><h1>You are over your included tokens</h1><p>Requests keep working. Anything past the allowance bills at $2.40 per million.</p></header><section className="rb-observed-usage-6-card">
      <div className="over-summary"><div><span>Tokens used</span><strong>128M <small>of 100M included</small></strong></div><div className="over-line"><i /><b /></div><p><span className="dot included" />Included <span className="dot overage" />Overage 28M · $68 so far</p></div>
      <div className="over-plans"><p>Move to a larger allowance</p><div>{allowancePlans.map(([name, price, bullets]) => <button type="button" className={plan === name ? 'selected' : ''} key={name} onClick={() => setPlan(name)}><div><strong>{name}</strong>{plan === name && <Check size={13} />}<small>{price}</small></div><ul>{bullets.map((item) => <li key={item}>✓ {item}</li>)}</ul></button>)}</div></div>
      <footer><p>Changes apply immediately and prorate against this cycle.</p><div><button type="button">Stay on overage</button><button type="button" className="upgrade">Upgrade <ArrowRight size={13} /></button></div></footer>
    </section></div>
  </section>
}

const requests = [
  ['14:32:08', '/v1/messages', 'Atlas Pro', '14k', '4.2s', '$0.0666'],
  ['14:31:54', '/v1/messages', 'Atlas', '3.9k', '1.2s', '$0.0142'],
  ['14:31:41', '/v1/embeddings', 'Ember', '48k', '0.6s', '$0.0048'],
  ['14:31:22', '/v1/messages', 'Atlas Long', '187k', '12.9s', '$0.5884'],
  ['14:30:58', '/v1/messages', 'Atlas Pro', '10k', '3.2s', '$0.0439'],
  ['14:30:31', '/v1/rerank', 'Ember Mini', '23k', '0.4s', '$0.0011'],
  ['14:30:12', '/v1/messages', 'Quill', '7.0k', '2.0s', '$0.0225'],
  ['14:29:47', '/v1/embeddings', 'Ember', '31k', '0.5s', '$0.0031'],
] as const

function Usage7({ onInteraction }: ReferenceFixtureProps) {
  const [filter, setFilter] = useState('All')
  const [expanded, setExpanded] = useState(3)
  const visible = filter === 'All' ? requests : filter === 'Capped' ? requests.filter((_, index) => index === 3) : requests.filter((_, index) => index === 5)
  return <section className="rb-observed-usage-surface rb-observed-usage-7" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <div className="rb-observed-usage-7-content"><header><div><h1>Request log</h1><p>Last 8 calls · $0.7446 billed</p></div><nav role="tablist">{['All', 'Capped', 'Errors'].map((item) => <button type="button" role="tab" aria-selected={filter === item} className={filter === item ? 'selected' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>)}</nav></header><section className="rb-observed-usage-7-card"><div className="request-table"><div className="request-head"><span>Time</span><span>Request</span><span>Model</span><span>Tokens</span><span>Latency</span><span>Cost</span></div>{visible.map((request) => { const originalIndex = requests.indexOf(request); const isExpanded = originalIndex === expanded; return <div className={`request-row-wrap${isExpanded ? ' expanded' : ''}`} key={request[0]}><button type="button" className="request-row" onClick={() => setExpanded(isExpanded ? -1 : originalIndex)}><span>{request[0]}</span><span className="request-name"><i />{request[1]}</span><span>{request[2]}</span><span>{request[3]}</span><span>{request[4]}</span><span className="request-cost">{request[5]} <ChevronDown size={13} /></span></button>{isExpanded && <div className="request-detail">{[['Request ID', 'req_8f2183'], ['Model', 'Atlas Long'], ['Status', 'Truncated at max tokens'], ['Input tokens', '185k'], ['Output tokens', '2.3k'], ['Latency', '12.94s']].map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>}</div> })}</div></section></div><button type="button" className="rb-observed-usage-theme"><Palette size={14} />Theme</button>
  </section>
}

function Usage8({ onInteraction }: ReferenceFixtureProps) {
  const [details, setDetails] = useState(false)
  return <section className="rb-observed-usage-surface rb-observed-usage-8" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-observed-usage-8-content"><header><div><h1>Plan usage</h1><p>Northwind · Team plan</p></div><button type="button" onClick={() => setDetails((value) => !value)}>Details <ExternalLink size={13} /></button></header><section className="rb-observed-usage-8-card"><div className="plan-primary"><div className="plan-primary-heading"><div><span>Assistant messages</span><strong>1,842<small>/ 2,000</small></strong></div><div className="plan-spark"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div><div className="plan-line"><i style={{ width: '92%' }} /></div><p><b />92% used · Resets 1 Jul</p></div><div className="plan-rows">{[['Agent runs', '96 / 250', 38], ['Indexed documents', '4,310 / 10,000', 43], ['Member seats', '12 / 20', 60]].map(([label, value, percent]) => <div key={label}><div><strong>{label}</strong><span>{value}</span></div><i><b style={{ width: `${percent}%` }} /></i></div>)}</div><footer><p>✣&nbsp; Unlimited messages on Scale.</p><button type="button">Upgrade</button></footer>{details && <div className="plan-details">Billing cycle resets on 1 Jul · contact an admin to change plan.</div>}</section></div></section>
}

export function UsageObserved({ variant, ...props }: { variant: UsageObservedVariant } & ReferenceFixtureProps) {
  const Component: (props: ReferenceFixtureProps) => ReactNode = variant === 'ai-usage-3' ? Usage3 : variant === 'ai-usage-4' ? Usage4 : variant === 'ai-usage-5' ? Usage5 : variant === 'ai-usage-6' ? Usage6 : variant === 'ai-usage-7' ? Usage7 : Usage8
  return <Component {...props} />
}
