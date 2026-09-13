import type { ReferenceFixtureProps } from '../../reference-types'
import { ArrowRight, Check } from 'lucide-react'
import { reportFixtureClick } from '../../reference-interactions'
import './empty-state-3.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/empty-state/empty-state-3. */
export default function EmptyState3(props: ReferenceFixtureProps) {
  const tasks = [['3 tickets waiting on the customer', 'Nothing to do until they reply. We will nudge each one after 48 hours.'], ['2 drafts you never sent', 'Both are from yesterday afternoon and are still editable.'], ['Team queue has 5 unassigned', 'Outside your view, but you have permission to pick them up.']] as const
  return <section className="rb-public-empty-3" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-empty-3-shell"><div className="rb-empty-3-check"><Check size={20} /></div><h2>Inbox zero, and it is only 3pm</h2><p className="rb-empty-3-intro">Nothing is assigned to you and nothing is overdue. New tickets<br /> will appear here the moment they are routed.</p><div className="rb-empty-3-metrics"><div><strong>14</strong><span>Resolved</span></div><div><strong>6</strong><span>Assigned on</span></div><div><strong>9m</strong><span>Median first reply</span></div></div><h3>IF YOU WANT SOMETHING TO DO</h3><div className="rb-empty-3-tasks">{tasks.map(([title, detail]) => <button type="button" key={title}><strong>{title}</strong><span>{detail}</span><ArrowRight size={15} /></button>)}</div><footer>Last refreshed a moment ago · updates arrive automatically</footer></div></section>
}
