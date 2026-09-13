import type { ReferenceFixtureProps } from '../../reference-types'
import { ChevronDown, Info, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './scheduling-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/scheduling/scheduling-2. */
export default function Scheduling2(props: ReferenceFixtureProps) {
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [duration, setDuration] = useState('1 hour')
  const times = ['08:30', '09:00', '09:30', '10:00', '10:30']
  const durations = ['15 min', '30 min', '45 min', '1 hour', '90 min', '2 hours', '3 hours', 'Half day', 'Full day', 'Custom']
  return <section className="rb-public-scheduling-2" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><article className="rb-scheduling-2-card"><header><span className="rb-scheduling-2-avatar">AN</span><div><h2>Anna Neary</h2><p>Head of Operations</p></div><button type="button" aria-label="More options"><MoreHorizontal size={15} /></button></header><div className="rb-scheduling-2-form"><label>START<div><select aria-label="Start time" value={start} onChange={(event) => setStart(event.target.value)}>{times.map((time) => <option key={time}>{time}</option>)}</select><ChevronDown size={14} /></div></label><label>END<div><select aria-label="End time" value={end} onChange={(event) => setEnd(event.target.value)}>{['09:30', '10:00', '10:30', '11:00', '11:30'].map((time) => <option key={time}>{time}</option>)}</select><ChevronDown size={14} /></div></label><fieldset><legend>DURATION</legend>{durations.map((value) => <button type="button" key={value} className={duration === value ? 'selected' : ''} onClick={() => setDuration(value)}>{value}</button>)}</fieldset></div><footer><span><Info size={13} />Blocks <strong>{duration}</strong> on the shared calendar</span><div><button type="button">Cancel</button><button type="button" className="apply">Apply</button></div></footer></article></section>
}
