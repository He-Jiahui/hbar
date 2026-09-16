import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {CalendarDays, ChevronLeft, ChevronRight, Clock3, Filter, Paperclip, Plus, Users} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiSpotlight, HbarAppUiTabs, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type SchedulingProps = HbarAppUiVariantProps

function MonthAgenda({spec, onAction}: SchedulingProps) {
    const [day, setDay] = useState(18);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-scheduling-variant-1"><HbarAppUiToolbar title="Calendar"
                                                                                              detail="Month view beside day agenda"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter'})}><HbarAppUiIcon icon={Filter} tier="sm" />Filter
        events</HbarAppUiButton>
        <div className="hbar-app-ui-month-agenda">
            <div className="hbar-app-ui-month-grid">
                <header><HbarAppUiIcon icon={ChevronLeft} tier="sm" /><strong>September 2026</strong><HbarAppUiIcon icon={ChevronRight} tier="sm" /></header>
                {Array.from({length: 30}, (_, index) => <button type="button"
                                                                className={day === index + 1 ? 'is-selected' : ''}
                                                                key={index}
                                                                onClick={() => setDay(index + 1)}>{index + 1}{[4, 11, 18, 24].includes(index + 1) &&
                    <i/>}</button>)}</div>
            <aside><strong>Thursday,
                Sep {day}</strong>{['Workspace review · 09:00', 'Design sync · 11:30', 'Run handoff · 16:00'].map((event) =>
                <HbarAppUiSpotlight key={event}><HbarAppUiIcon icon={CalendarDays} tier="sm"
                    /><span>{event}<small>Project Atlas</small></span></HbarAppUiSpotlight>)}</aside>
        </div>
    </ActionSurfaceFrame>
}

function TimeRange({spec, onAction}: SchedulingProps) {
    const [duration, setDuration] = useState('60 min');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-scheduling-variant-2"><HbarAppUiToolbar title="Time range"
                                                                                              detail="Start, end and duration chips"/>
        <div className="hbar-app-ui-time-selects"><label>Start<select defaultValue="09:00">
            <option>09:00</option>
            <option>11:30</option>
            <option>14:00</option>
        </select></label><span>to</span><label>End<select defaultValue="10:00">
            <option>10:00</option>
            <option>12:30</option>
            <option>15:00</option>
        </select></label></div>
        <div className="hbar-app-ui-duration-chips">{['30 min', '60 min', '90 min', '2 hours'].map((item) => <button
            type="button" className={duration === item ? 'is-selected' : ''} key={item}
            onClick={() => setDuration(item)}>{item}</button>)}</div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'select',
            value: duration
        })}>Use {duration}</HbarAppUiButton></ActionSurfaceFrame>
}

function NewSchedule({spec, onAction}: SchedulingProps) {
    const [attendees, setAttendees] = useState(['Avery']);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-scheduling-variant-3"><HbarAppUiToolbar title="Schedule a run"
                                                                                              detail="Attendees · date · notes"/><label>Title<input
        defaultValue="Workspace review"/></label><label>Date<input type="date" defaultValue="2026-09-24"/></label>
        <div className="hbar-app-ui-attendee-chips">{attendees.map((attendee) => <span key={attendee}>{attendee}
            <button type="button"
                    onClick={() => setAttendees((current) => current.filter((item) => item !== attendee))}>×</button></span>)}<HbarAppUiButton
            onClick={() => setAttendees((current) => [...current, 'Mina'])}><HbarAppUiIcon icon={Users} tier="sm" />Add
            attendee</HbarAppUiButton></div>
        <div className="hbar-app-ui-two-column-form"><label>Start<input type="time"
                                                                        defaultValue="09:00"/></label><label>End<input
            type="time" defaultValue="10:00"/></label></div>
        <label><HbarAppUiIcon icon={Paperclip} tier="sm" />Attachments<input type="file"/></label><textarea
            placeholder="Notes"/><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'schedule',
            value: attendees.join(',')
        })}>Schedule run</HbarAppUiButton></ActionSurfaceFrame>
}

function DeadlinePicker({spec, onAction}: SchedulingProps) {
    const [preset, setPreset] = useState('Tomorrow');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-scheduling-variant-4"><HbarAppUiToolbar title="Deadline picker"
                                                                                              detail="Quick presets · calendar · time slots"/>
        <div className="hbar-app-ui-preset-row">{['Today', 'Tomorrow', 'Next week'].map((item) => <HbarAppUiButton
            className={preset === item ? 'is-selected' : ''} key={item}
            onClick={() => setPreset(item)}>{item}</HbarAppUiButton>)}</div>
        <div className="hbar-app-ui-deadline-layout">
            <div className="hbar-app-ui-mini-calendar"><strong>September
                2026</strong>{Array.from({length: 14}, (_, index) => <button type="button"
                                                                             key={index}>{index + 17}</button>)}</div>
            <div className="hbar-app-ui-time-slots">{['09:00', '10:30', '13:00', '15:30'].map((time) => <button
                type="button" key={time}
                onClick={() => onAction?.({variantId: spec.id, actionId: 'select', value: `${preset}:${time}`})}><HbarAppUiIcon icon={Clock3} tier="sm"
                />{time}</button>)}</div>
        </div>
    </ActionSurfaceFrame>
}

function Availability({spec, onAction}: SchedulingProps) {
    const [days, setDays] = useState<Record<string, boolean>>({Mon: true, Tue: true, Wed: true, Thu: true, Fri: true});
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-scheduling-variant-5"><HbarAppUiToolbar
        title="Weekly availability" detail="Bookable intervals per day"/>
        <div className="hbar-app-ui-availability">{Object.entries(days).map(([day, enabled]) => <div key={day}>
            <button type="button" role="switch" aria-checked={enabled}
                    className={`hbar-app-ui-switch ${enabled ? 'is-on' : ''}`}
                    onClick={() => setDays((current) => ({...current, [day]: !enabled}))}><i/></button>
            <strong>{day}</strong>{enabled ? <><input type="time" defaultValue="09:00"/><span>–</span><input type="time"
                                                                                                             defaultValue="17:00"/><HbarAppUiButton><HbarAppUiIcon icon={Plus} tier="xs"
            /></HbarAppUiButton></> : <em>Unavailable</em>}</div>)}</div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'save'})}>Save
            availability</HbarAppUiButton></ActionSurfaceFrame>
}

function WeekTimeline({spec, onAction}: SchedulingProps) {
    const [view, setView] = useState('Week');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-scheduling-variant-6"><HbarAppUiToolbar title="Week timeline"
                                                                                              detail="Hour rail · positioned events"/><HbarAppUiTabs
        label="Calendar view" value={view} options={[{id: 'Day', label: 'Day'}, {id: 'Week', label: 'Week'}]}
        onChange={setView}/>
        <div className="hbar-app-ui-week-timeline">
            <aside>{['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'].map((time) => <span
                key={time}>{time}</span>)}</aside>
            <main>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, index) => <div key={day}>
                <strong>{day}</strong>{index === 1 && <HbarAppUiSpotlight
                style={{top: '30%'}}><span>Workspace review</span><small>10:00–11:00</small></HbarAppUiSpotlight>}{index === 3 &&
                <HbarAppUiSpotlight
                    style={{top: '55%'}}><span>Run handoff</span><small>13:00–14:00</small></HbarAppUiSpotlight>}
            </div>)}</main>
        </div>
    </ActionSurfaceFrame>
}

function BookingPage({spec, onAction}: SchedulingProps) {
    const [day, setDay] = useState('Thu 24');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-scheduling-variant-7"><HbarAppUiToolbar
        title="Book a workspace review" detail="Meeting summary · day strip · slots"/><HbarAppUiSpotlight><strong>30-minute
        review</strong><span>With Avery Chen · Project Atlas</span><small>Timezone ·
        Asia/Shanghai</small></HbarAppUiSpotlight>
        <div className="hbar-app-ui-day-strip">{['Tue 22', 'Wed 23', 'Thu 24', 'Fri 25', 'Sat 26'].map((item) => <button
            type="button" className={day === item ? 'is-selected' : ''} key={item}
            onClick={() => setDay(item)}>{item}</button>)}</div>
        <div className="hbar-app-ui-booking-slots">{['09:00', '09:30', '10:00', '14:00', '15:30'].map((time) => <button
            type="button" key={time} onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'book',
            value: `${day}:${time}`
        })}>{time}</button>)}</div>
    </ActionSurfaceFrame>
}

export function Scheduling({spec, onAction}: SchedulingProps) {
    switch (spec.variant) {
        case 1:
            return <MonthAgenda spec={spec} onAction={onAction}/>;
        case 2:
            return <TimeRange spec={spec} onAction={onAction}/>;
        case 3:
            return <NewSchedule spec={spec} onAction={onAction}/>;
        case 4:
            return <DeadlinePicker spec={spec} onAction={onAction}/>;
        case 5:
            return <Availability spec={spec} onAction={onAction}/>;
        case 6:
            return <WeekTimeline spec={spec} onAction={onAction}/>;
        case 7:
            return <BookingPage spec={spec} onAction={onAction}/>;
        default:
            return <MonthAgenda spec={spec} onAction={onAction}/>
    }
}
