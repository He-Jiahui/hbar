import { LumenButton, LumenInput, LumenTextarea, LumenSelect } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {Check, ChevronDown, CreditCard, FileText, Plus, RotateCcw, Send, Trash2} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiMetricStrip,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type FormsProps = HbarAppUiVariantProps

function TokenRecord({spec, onAction}: FormsProps) {
    const [value, setValue] = useState('');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-forms-variant-1"><HbarAppUiToolbar
        title="Create record" detail="Token field · completion meter · revert"/><label
        className="hbar-app-ui-label-left"><span>Name</span><LumenInput placeholder="Record name"/></label><label
        className="hbar-app-ui-label-left"><span>Tags</span><LumenInput value={value}
                                                                   onChange={(event) => setValue(event.target.value)}
                                                                   placeholder="Type a tag and press Enter"/></label><HbarAppUiProgress
        value={value ? 66 : 24} label="Form completion"/>
        <div className="hbar-app-ui-form-actions"><HbarAppUiButton onClick={() => setValue('')}><HbarAppUiIcon icon={RotateCcw} tier="sm" />Revert</HbarAppUiButton><HbarAppUiButton
            tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'save', value})}><HbarAppUiIcon icon={Check} tier="sm" />Save
            record</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function Submission({spec, onAction}: FormsProps) {
    const [kind, setKind] = useState('Bug');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-forms-variant-2"><HbarAppUiToolbar
        title="Submit request" detail="Two-column form with validation"/>
        <div className="hbar-app-ui-two-column-form"><label>Title<LumenInput placeholder="Short summary"/></label><label>Priority<LumenSelect
            defaultValue="Normal">
            <option>Low</option>
            <option>Normal</option>
            <option>High</option>
        </LumenSelect></label>
            <fieldset>
                <legend>Type</legend>
                {['Bug', 'Feature', 'Question'].map((option) => <label key={option}><LumenInput type="radio" name="kind"
                                                                                           checked={kind === option}
                                                                                           onChange={() => setKind(option)}/>{option}
                </label>)}</fieldset>
            <HbarAppUiSpotlight><strong>Checklist</strong><span><HbarAppUiIcon icon={Check} tier="xs" />Title provided</span><span><HbarAppUiIcon icon={Check} tier="xs"
                />Type: {kind}</span><span>○ Details still needed</span></HbarAppUiSpotlight></div>
        <HbarAppUiButton tone="accent"
                         onClick={() => onAction?.({variantId: spec.id, actionId: 'submit', value: kind})}><HbarAppUiIcon icon={Send} tier="sm"
            />Submit</HbarAppUiButton></ActionSurfaceFrame>
}

function Booking({spec, onAction}: FormsProps) {
    const [total, setTotal] = useState(240);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-forms-variant-3"><HbarAppUiToolbar
        title="Booking form" detail="Line items and live totals"/>
        <div className="hbar-app-ui-line-items">
            <header><span>Item</span><span>Qty</span><span>Price</span></header>
            {['Workspace review', 'Implementation session', 'Follow-up'].map((item, index) => <div key={item}>
                <strong>{item}</strong><LumenInput type="number" defaultValue={index + 1} min="1"
                                              onChange={(event) => setTotal(240 + Number(event.target.value) * 20)}/><span>${80 + index * 40}</span>
                <LumenButton type="button"><HbarAppUiIcon icon={Trash2} tier="sm" /></LumenButton>
            </div>)}<HbarAppUiButton onClick={() => setTotal((value) => value + 40)}><HbarAppUiIcon icon={Plus} tier="sm" />Add
            line</HbarAppUiButton></div>
        <HbarAppUiMetricStrip metrics={[{label: 'Subtotal', value: `$${total}`}, {label: 'Tax', value: '$19.20'}, {
            label: 'Total',
            value: `$${total + 19.2}`,
            tone: 'positive'
        }]}/><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'save',
            value: String(total)
        })}>Continue</HbarAppUiButton></ActionSurfaceFrame>
}

function InlineProperty({spec, onAction}: FormsProps) {
    const [editing, setEditing] = useState<string | undefined>();
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-forms-variant-4"><HbarAppUiToolbar
        title="Property panel" detail="Edit one record row at a time"/>
        <div className="hbar-app-ui-property-rows">{['Name', 'Owner', 'Status', 'Deadline'].map((field) => <div
            key={field}><strong>{field}</strong>{editing === field ? <><LumenInput
            defaultValue={field === 'Status' ? 'Open' : 'Workspace sync'}/><HbarAppUiButton tone="accent"
                                                                                            onClick={() => {
                                                                                                setEditing(undefined);
                                                                                                onAction?.({
                                                                                                    variantId: spec.id,
                                                                                                    actionId: 'save',
                                                                                                    value: field
                                                                                                })
                                                                                            }}>Save</HbarAppUiButton></> : <>
            <span>{field === 'Owner' ? 'Avery' : field === 'Status' ? 'Open' : field === 'Deadline' ? 'Sep 30' : 'Workspace sync'}</span><HbarAppUiButton
            onClick={() => setEditing(field)}>Edit</HbarAppUiButton></>}</div>)}</div>
    </ActionSurfaceFrame>
}

function Provisioning({spec, onAction}: FormsProps) {
    const [subdomain, setSubdomain] = useState('october');
    const [created, setCreated] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-forms-variant-5"><HbarAppUiToolbar
        title="Provision workspace" detail="Subdomain, password and success state"/><label>Subdomain
        <div className="hbar-app-ui-input-suffix"><LumenInput value={subdomain}
                                                         onChange={(event) => setSubdomain(event.target.value)}/><span>.hbar.local</span>
        </div>
    </label><HbarAppUiStatus value={subdomain.length > 3 ? 'Available' : 'Taken'}
                             tone={subdomain.length > 3 ? 'positive' : 'warning'}/><label>Admin password<LumenInput
        type="password" defaultValue="password123"/></label><HbarAppUiProgress value={68} label="Password strength"
                                                                               tone="positive"/><HbarAppUiButton
        tone="accent" onClick={() => {
        setCreated(true);
        onAction?.({variantId: spec.id, actionId: 'create', value: subdomain})
    }}>{created ? 'Workspace created' : 'Create workspace'}</HbarAppUiButton></ActionSurfaceFrame>
}

function Checkout({spec, onAction}: FormsProps) {
    const [country, setCountry] = useState('US');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-forms-variant-6">
        <div className="hbar-app-ui-checkout-layout">
            <main><HbarAppUiToolbar title="Checkout" detail="Country-driven regions and card formatting"/><label>Country<LumenSelect
                value={country} onChange={(event) => setCountry(event.target.value)}>
                <option>US</option>
                <option>CA</option>
                <option>GB</option>
            </LumenSelect></label><label>Card number
                <div className="hbar-app-ui-input-icon"><HbarAppUiIcon icon={CreditCard} tier="sm" /><LumenInput
                    placeholder="4242 4242 4242 4242"/></div>
            </label>
                <div className="hbar-app-ui-two-column-form"><label>Expiry<LumenInput placeholder="09 / 28"/></label><label>CVC<LumenInput
                    placeholder="123"/></label></div>
                <HbarAppUiButton tone="accent"
                                 onClick={() => onAction?.({variantId: spec.id, actionId: 'pay', value: country})}>Pay
                    $128.40</HbarAppUiButton></main>
            <HbarAppUiSpotlight><strong>Order summary</strong><span>Workspace plan · $120.00</span><span>Tax ({country}) · $8.40</span><b>Total
                · $128.40</b></HbarAppUiSpotlight></div>
    </ActionSurfaceFrame>
}

function ApplicationForm({spec, onAction}: FormsProps) {
    const [progress, setProgress] = useState(42);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-forms-variant-7"><HbarAppUiToolbar
        title="Application" detail="Dropzone · radio cards · completion"/>
        <div className="hbar-app-ui-dropzone"><HbarAppUiIcon icon={FileText} tier="lg" /><strong>Drop a resume here</strong><small>PDF or DOCX
            · max 10 MB</small><HbarAppUiButton onClick={() => setProgress(72)}>Choose file</HbarAppUiButton></div>
        <fieldset>
            <legend>Work preference</legend>
            <label><LumenInput type="radio" name="work" defaultChecked/>Remote</label><label><LumenInput type="radio"
                                                                                               name="work"/>Hybrid</label><label><LumenInput
            type="radio" name="work"/>On-site</label></fieldset>
        <label>Skills<LumenInput placeholder="Type a skill"/></label><HbarAppUiProgress value={progress}
                                                                                   label="Application completion"/><HbarAppUiButton
            tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'submit'})}>Submit
            application</HbarAppUiButton></ActionSurfaceFrame>
}

function RuleBuilder({spec, onAction}: FormsProps) {
    const [field, setField] = useState('Status');
    const operator = field === 'Updated' ? 'after' : 'is';
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-forms-variant-8"><HbarAppUiToolbar
        title="Rule builder" detail="Operators follow the selected field"/>
        <div className="hbar-app-ui-rule-row"><LumenSelect value={field} onChange={(event) => setField(event.target.value)}>
            <option>Status</option>
            <option>Owner</option>
            <option>Updated</option>
        </LumenSelect><span>{operator}</span><LumenInput placeholder={field === 'Updated' ? '2026-09-01' : 'Running'}/></div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'test',
            value: `${field}:${operator}`
        })}>Test rule</HbarAppUiButton><HbarAppUiSpotlight><HbarAppUiStatus value="Matches 24 records" tone="positive"/>
            <p>Preview updates when the field or operator changes.</p></HbarAppUiSpotlight></ActionSurfaceFrame>
}

function OpeningHours({spec, onAction}: FormsProps) {
    const [enabled, setEnabled] = useState<Record<string, boolean>>({
        Mon: true,
        Tue: true,
        Wed: true,
        Thu: true,
        Fri: true,
        Sat: false,
        Sun: false
    });
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-forms-variant-9"><HbarAppUiToolbar
        title="Opening hours" detail="Intervals, overlap validation and total"/>
        <div className="hbar-app-ui-hours-list">{Object.entries(enabled).map(([day, value]) => <div key={day}>
            <LumenButton type="button" role="switch" aria-checked={value}
                    className={`hbar-app-ui-switch ${value ? 'is-on' : ''}`}
                    onClick={() => setEnabled((current) => ({...current, [day]: !value}))}><i/></LumenButton>
            <strong>{day}</strong>{value ? <><LumenInput type="time" defaultValue="09:00"/><span>to</span><LumenInput type="time"
                                                                                                            defaultValue="17:00"/><small>8h</small></> :
            <em>Closed</em>}</div>)}</div>
        <HbarAppUiStatus value="40 hours / week" tone="positive"/><HbarAppUiButton tone="accent"
                                                                                   onClick={() => onAction?.({
                                                                                       variantId: spec.id,
                                                                                       actionId: 'save'
                                                                                   })}>Save
            hours</HbarAppUiButton></ActionSurfaceFrame>
}

function GuestSurvey({spec, onAction}: FormsProps) {
    const [score, setScore] = useState(8);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-forms-variant-10"><HbarAppUiToolbar title="Guest survey"
                                                                                          detail="0–10 scale and conditional follow-up"/>
        <div className="hbar-app-ui-score-scale">{Array.from({length: 11}, (_, value) => <LumenButton type="button"
                                                                                                 className={score === value ? 'is-selected' : ''}
                                                                                                 key={value}
                                                                                                 onClick={() => setScore(value)}>{value}</LumenButton>)}</div>
        <p>How likely are you to recommend this workspace?</p>
        <div className="hbar-app-ui-rating-matrix">
            <span>Speed</span><span>Clarity</span><span>Reliability</span>{[1, 2, 3].map((row) => <div
            key={row}>{[1, 2, 3, 4, 5].map((value) => <LumenButton type="button" key={value}
                                                              aria-label={`${row}-${value}`}>○</LumenButton>)}</div>)}</div>
        {score < 7 && <label>What could improve?<LumenTextarea placeholder="Tell us more"/></label>}<HbarAppUiButton
            tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'submit', value: String(score)})}>Submit
            survey</HbarAppUiButton></ActionSurfaceFrame>
}

function EnvironmentDialog({spec, onAction}: FormsProps) {
    const [kind, setKind] = useState('Preview');
    const [slug, setSlug] = useState('october-preview');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-forms-variant-11"><HbarAppUiToolbar title="Create environment"
                                                                                          detail="Kind picker and slug availability"/><HbarAppUiTabs
        label="Environment kind" value={kind}
        options={[{id: 'Preview', label: 'Preview'}, {id: 'Staging', label: 'Staging'}, {
            id: 'Production',
            label: 'Production'
        }]} onChange={setKind}/><label>Name<LumenInput defaultValue="October preview"/></label><label>Slug<LumenInput value={slug}
                                                                                                            onChange={(event) => setSlug(event.target.value)}/></label><HbarAppUiStatus
        value={slug.length > 6 ? 'Slug available' : 'Choose a longer slug'}
        tone={slug.length > 6 ? 'positive' : 'warning'}/><HbarAppUiButton tone="accent" onClick={() => onAction?.({
        variantId: spec.id,
        actionId: 'create',
        value: `${kind}:${slug}`
    })}>Create environment</HbarAppUiButton></ActionSurfaceFrame>
}

function QuoteReview({spec, onAction}: FormsProps) {
    const [open, setOpen] = useState('Plan');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-forms-variant-12"><HbarAppUiToolbar title="Quote review"
                                                                                          detail="Expand sections to edit · running premium"/><HbarAppUiMetricStrip
        metrics={[{label: 'Base', value: '$240'}, {label: 'Premium', value: '$48'}, {
            label: 'Total',
            value: '$288',
            tone: 'positive'
        }]}/>
        <div className="hbar-app-ui-quote-sections">{['Plan', 'Seats', 'Support'].map((section) => <div key={section}>
            <LumenButton type="button" onClick={() => setOpen(open === section ? '' : section)}><HbarAppUiIcon icon={ChevronDown} tier="sm"
                                                                                                        className={open === section ? '' : 'is-collapsed'}/><strong>{section}</strong><span>{section === 'Plan' ? 'Team' : section === 'Seats' ? '12' : 'Priority'}</span>
            </LumenButton>
            {open === section &&
                <HbarAppUiSpotlight><p>Edit {section.toLowerCase()} details before confirming this quote.</p>
                    <HbarAppUiButton onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'edit',
                        value: section
                    })}>Edit</HbarAppUiButton></HbarAppUiSpotlight>}</div>)}</div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'confirm'})}>Confirm
            quote</HbarAppUiButton></ActionSurfaceFrame>
}

export function Forms({spec, onAction}: FormsProps) {
    switch (spec.variant) {
        case 1:
            return <TokenRecord spec={spec} onAction={onAction}/>;
        case 2:
            return <Submission spec={spec} onAction={onAction}/>;
        case 3:
            return <Booking spec={spec} onAction={onAction}/>;
        case 4:
            return <InlineProperty spec={spec} onAction={onAction}/>;
        case 5:
            return <Provisioning spec={spec} onAction={onAction}/>;
        case 6:
            return <Checkout spec={spec} onAction={onAction}/>;
        case 7:
            return <ApplicationForm spec={spec} onAction={onAction}/>;
        case 8:
            return <RuleBuilder spec={spec} onAction={onAction}/>;
        case 9:
            return <OpeningHours spec={spec} onAction={onAction}/>;
        case 10:
            return <GuestSurvey spec={spec} onAction={onAction}/>;
        case 11:
            return <EnvironmentDialog spec={spec} onAction={onAction}/>;
        case 12:
            return <QuoteReview spec={spec} onAction={onAction}/>;
        default:
            return <TokenRecord spec={spec} onAction={onAction}/>
    }
}
