import {useState} from 'react'
import {Camera, Check, ChevronRight, Filter, MessageCircle, Send, Star, Tag, ThumbsUp} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiMetricStrip,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type FeedbackProps = HbarAppUiVariantProps

function Widget({spec, onAction}: FeedbackProps) {
    const [kind, setKind] = useState('Bug');
    const [sent, setSent] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-feedback-variant-1"><HbarAppUiToolbar title="Share feedback"
                                                                                            detail="Type, screenshot and sent state"/><HbarAppUiTabs
        label="Feedback type" value={kind} options={['Bug', 'Idea', 'Question'].map((id) => ({id, label: id}))}
        onChange={setKind}/>{sent ? <HbarAppUiSpotlight><Check size={22}/><strong>Thanks for the feedback</strong>
            <p>Your {kind.toLowerCase()} report was sent to the workspace team.</p><HbarAppUiButton
                onClick={() => setSent(false)}>Send another</HbarAppUiButton></HbarAppUiSpotlight> :
        <div className="hbar-app-ui-feedback-form"><label>What happened?<textarea
            placeholder="Tell us what you saw"/></label><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'attach', value: 'screenshot.png'})}><Camera
            size={13}/>Attach screenshot</HbarAppUiButton><HbarAppUiButton tone="accent" onClick={() => {
            setSent(true);
            onAction?.({variantId: spec.id, actionId: 'send', value: kind})
        }}><Send size={13}/>Send feedback</HbarAppUiButton></div>}</ActionSurfaceFrame>
}

function Recommendation({spec, onAction}: FeedbackProps) {
    const [score, setScore] = useState(8);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-feedback-variant-2"><HbarAppUiToolbar
        title="Recommendation survey" detail="Eleven-point scale"/>
        <div className="hbar-app-ui-score-scale">{Array.from({length: 11}, (_, value) => <button type="button"
                                                                                                 className={score === value ? 'is-selected' : ''}
                                                                                                 key={value}
                                                                                                 onClick={() => setScore(value)}>{value}</button>)}</div>
        <p>How likely are you to recommend this workspace?</p>{score < 7 &&
            <label>What could improve?<textarea placeholder="Tell us more"/></label>}<HbarAppUiButton tone="accent"
                                                                                                      onClick={() => onAction?.({
                                                                                                          variantId: spec.id,
                                                                                                          actionId: 'submit',
                                                                                                          value: String(score)
                                                                                                      })}>Submit
            score</HbarAppUiButton></ActionSurfaceFrame>
}

function PostResolution({spec, onAction}: FeedbackProps) {
    const [stars, setStars] = useState(0);
    const [reason, setReason] = useState('');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-feedback-variant-3"><HbarAppUiToolbar title="How did we do?"
                                                                                            detail="Reasons follow the score"/>
        <div className="hbar-app-ui-rating">{[1, 2, 3, 4, 5].map((value) => <button type="button"
                                                                                    className={stars >= value ? 'is-selected' : ''}
                                                                                    key={value}
                                                                                    onMouseEnter={() => setStars(value)}
                                                                                    onClick={() => setStars(value)}
                                                                                    aria-label={`${value} stars`}><Star
            size={20}/></button>)}</div>
        {stars > 0 &&
            <div className="hbar-app-ui-reason-chips">{['Fast', 'Clear', 'Helpful', 'Incomplete'].map((item) => <button
                type="button" className={reason === item ? 'is-selected' : ''} key={item}
                onClick={() => setReason(item)}>{item}</button>)}</div>}<HbarAppUiButton tone="accent" disabled={!stars}
                                                                                         onClick={() => onAction?.({
                                                                                             variantId: spec.id,
                                                                                             actionId: 'submit',
                                                                                             value: `${stars}:${reason}`
                                                                                         })}>Send
            rating</HbarAppUiButton></ActionSurfaceFrame>
}

function FeatureBoard({spec, onAction}: FeedbackProps) {
    const [sort, setSort] = useState('Trending');
    const [votes, setVotes] = useState<string[]>([]);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-feedback-variant-4"><HbarAppUiToolbar title="Feature requests"
                                                                                            detail="Vote, filter and sort"/><HbarAppUiTabs
        label="Sort requests" value={sort}
        options={[{id: 'Trending', label: 'Trending'}, {id: 'Newest', label: 'Newest'}, {id: 'Top', label: 'Top'}]}
        onChange={setSort}/>
        <div
            className="hbar-app-ui-feature-board">{['Export run history', 'Keyboard shortcuts', 'Saved filters'].map((feature, index) =>
            <HbarAppUiSpotlight key={feature}>
                <button type="button" className={votes.includes(feature) ? 'is-voted' : ''}
                        onClick={() => setVotes((current) => current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature])}>
                    <ThumbsUp size={14}/><b>{42 - index * 9 + (votes.includes(feature) ? 1 : 0)}</b></button>
                <div><strong>{feature}</strong><small>{index === 1 ? 'Planned' : 'Under review'} · {sort}</small></div>
                <HbarAppUiStatus value={index === 1 ? 'Planned' : 'Open'}
                                 tone={index === 1 ? 'positive' : 'neutral'}/><ChevronRight
                size={13}/></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function TriageInbox({spec, onAction}: FeedbackProps) {
    const [selected, setSelected] = useState('Export run history');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-feedback-variant-5">
        <div className="hbar-app-ui-feedback-triage">
            <aside><HbarAppUiToolbar title="Feedback inbox"
                                     detail="Tag and triage"/>{['Export run history', 'Keyboard shortcuts', 'Mobile layout'].map((item) =>
                <button type="button" className={selected === item ? 'is-selected' : ''} key={item}
                        onClick={() => setSelected(item)}><MessageCircle size={13}/>{item}<small>2m</small></button>)}
            </aside>
            <main><HbarAppUiToolbar title={selected} detail="Feedback detail"/><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'tag', value: selected})}><Tag size={13}/>Add
                tag</HbarAppUiButton><HbarAppUiSpotlight><p>It would help to export a compact history for handoffs.</p>
                <div className="hbar-app-ui-tag-row"><span>Product</span><span>Requested</span></div>
                <HbarAppUiButton tone="accent"
                                 onClick={() => onAction?.({variantId: spec.id, actionId: 'resolve', value: selected})}>Mark
                    reviewed</HbarAppUiButton></HbarAppUiSpotlight></main>
        </div>
    </ActionSurfaceFrame>
}

function Insights({spec, onAction}: FeedbackProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-feedback-variant-6"><HbarAppUiToolbar title="Feedback insights"
                                                                                            detail="Sentiment, themes and daily volume"/><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'filter', value: '30d'})}><Filter size={13}/>Last 30
        days</HbarAppUiButton><HbarAppUiMetricStrip metrics={[{label: 'Positive', value: '68%', tone: 'positive'}, {
        label: 'Neutral',
        value: '22%'
    }, {label: 'Negative', value: '10%', tone: 'warning'}]}/>
        <div className="hbar-app-ui-sentiment-split"><span className="is-positive" style={{width: '68%'}}/><span
            className="is-neutral" style={{width: '22%'}}/><span className="is-negative" style={{width: '10%'}}/></div>
        <div className="hbar-app-ui-theme-list"><strong>Top themes</strong><span>Reliability <b>42</b></span><span>Keyboard flow <b>28</b></span><span>Exporting <b>19</b></span>
        </div>
        <div className="hbar-app-ui-response-volume">{Array.from({length: 14}, (_, index) => <i
            style={{height: `${12 + (index * 7) % 38}px`}} key={index}/>)}</div>
    </ActionSurfaceFrame>
}

export function Feedback({spec, onAction}: FeedbackProps) {
    switch (spec.variant) {
        case 1:
            return <Widget spec={spec} onAction={onAction}/>;
        case 2:
            return <Recommendation spec={spec} onAction={onAction}/>;
        case 3:
            return <PostResolution spec={spec} onAction={onAction}/>;
        case 4:
            return <FeatureBoard spec={spec} onAction={onAction}/>;
        case 5:
            return <TriageInbox spec={spec} onAction={onAction}/>;
        case 6:
            return <Insights spec={spec} onAction={onAction}/>;
        default:
            return <Widget spec={spec} onAction={onAction}/>
    }
}
