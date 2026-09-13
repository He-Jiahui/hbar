import type { ReferenceFixtureProps } from '../../reference-types'
import { ArrowDownLeft, ArrowUpRight, Plus, Send } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './card-10.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/card/card-10. */
export default function Card10(props: ReferenceFixtureProps) {
  const [transferred, setTransferred] = useState(false)
  const rows = [['Stripe payout', 'Today, 09:14', '+$4,820.00', ArrowDownLeft], ['Amazon Web Services', 'Yesterday', '−$612.40', ArrowUpRight], ['March payroll', '28 February', '−$18,900.00', ArrowUpRight]] as const
  return <section className="rb-public-card-10" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><article className="rb-card-10-shell"><section className="rb-card-10-balance"><h2>AVAILABLE BALANCE</h2><strong>$46,318.52</strong><p><span>+3.1%</span> against last month · Operating · USD</p></section><dl className="rb-card-10-pending"><div><dt>Pending</dt><dd>$1,204.00</dd></div><div><dt>Reserved</dt><dd>$380.00</dd></div></dl><section className="rb-card-10-activity"><ul>{rows.map(([title, date, amount, Icon]) => <li key={title}><span><Icon size={14} /></span><div><strong>{title}</strong><small>{date}</small></div><b>{amount}</b></li>)}</ul></section><footer><button type="button"><Plus size={14} /> Add money</button><button type="button" onClick={() => setTransferred(true)}><Send size={13} /> {transferred ? 'Transfer queued' : 'Transfer'}</button></footer></article></section>
}
