import { LumenButton, LumenTextarea } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {
    AtSign,
    Bold,
    Check,
    FileCode2,
    Heart,
    Italic,
    MessageCircle,
    MoreHorizontal,
    Paperclip,
    Smile,
    X
} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiIconButton,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type CommentsProps = HbarAppUiVariantProps

function ThreadedDiscussion({spec, onAction}: CommentsProps) {
    const [sort, setSort] = useState('Newest');
    const [resolved, setResolved] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-comments-variant-1"><HbarAppUiToolbar title="Threaded discussion"
                                                                                            detail="Replies, reactions and resolve"/><HbarAppUiTabs
        label="Sort comments" value={sort} options={[{id: 'Newest', label: 'Newest'}, {id: 'Oldest', label: 'Oldest'}]}
        onChange={setSort}/><HbarAppUiButton tone={resolved ? 'positive' : 'neutral'} onClick={() => {
        setResolved((value) => !value);
        onAction?.({variantId: spec.id, actionId: 'resolve', value: String(!resolved)})
    }}>{resolved ? <HbarAppUiIcon icon={Check} tier="sm" /> : null}{resolved ? 'Resolved' : 'Resolve'}</HbarAppUiButton>
        <div className="hbar-app-ui-comment-thread"><HbarAppUiSpotlight><span className="hbar-app-ui-avatar">A</span>
            <div><strong>Avery</strong><p>Can we keep this state local to the session?</p><small>5m ago · <LumenButton
                type="button"><HbarAppUiIcon icon={Heart} tier="xs" /> 2</LumenButton></small></div>
            <HbarAppUiIcon icon={MoreHorizontal} tier="sm" /></HbarAppUiSpotlight>
            <div className="hbar-app-ui-comment-replies"><HbarAppUiSpotlight><span
                className="hbar-app-ui-avatar">M</span>
                <div><strong>Mina</strong><p>Agreed — the action feedback is beside the row now.</p><small>2m ago
                    · <LumenButton type="button"><HbarAppUiIcon icon={Smile} tier="xs" /> 1</LumenButton></small></div>
            </HbarAppUiSpotlight></div>
        </div>
        <LumenTextarea placeholder="Reply to this thread" onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onAction?.({variantId: spec.id, actionId: 'reply', value: event.currentTarget.value});
                event.currentTarget.value = ''
            }
        }}/></ActionSurfaceFrame>
}

function Annotation({spec, onAction}: CommentsProps) {
    const [range, setRange] = useState('state local');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-comments-variant-2"><HbarAppUiToolbar title="Document annotation"
                                                                                            detail="Click a highlighted range"/>
        <div className="hbar-app-ui-annotation-layout">
            <article>
                <p>Keep <LumenButton type="button" className={range === 'state local' ? 'is-highlighted' : ''}
                                onClick={() => setRange('state local')}>this state local</LumenButton> to the session and
                    show the result beside the action.
                </p>
                <p>When the operation fails, <LumenButton type="button"
                                                     className={range === 'operation fails' ? 'is-highlighted' : ''}
                                                     onClick={() => setRange('operation fails')}>explain
                    why</LumenButton> and offer a recovery path.
                </p>
            </article>
            <aside><HbarAppUiSpotlight><span className="hbar-app-ui-avatar">A</span><strong>{range}</strong>
                <p>Annotation linked to the selected text range.</p><HbarAppUiButton onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'reply',
                    value: range
                })}>Reply</HbarAppUiButton></HbarAppUiSpotlight></aside>
        </div>
    </ActionSurfaceFrame>
}

function CodeReview({spec, onAction}: CommentsProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-comments-variant-3">
        <div className="hbar-app-ui-review-layout">
            <main><HbarAppUiToolbar title="Code review" detail="Suggested change"/><HbarAppUiStatus value="2 notes"
                                                                                                    tone="warning"/>
                <pre className="hbar-app-ui-diff-code"><span>  const status = getStatus(run)</span><span
                    className="is-removed">− return status</span><span className="is-added">+ return formatStatus(status)</span></pre>
            </main>
            <aside><HbarAppUiSpotlight><HbarAppUiIcon icon={FileCode2} tier="sm" /><strong>Suggestion</strong><p>Use the shared formatter so
                the status reads consistently.</p>
                <div><HbarAppUiButton tone="accent"
                                      onClick={() => onAction?.({variantId: spec.id, actionId: 'accept'})}><HbarAppUiIcon icon={Check} tier="sm"
                    />Accept</HbarAppUiButton><HbarAppUiButton
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'dismiss'})}><HbarAppUiIcon icon={X} tier="sm"
                    />Dismiss</HbarAppUiButton></div>
            </HbarAppUiSpotlight></aside>
        </div>
    </ActionSurfaceFrame>
}

function MentionComposer({spec, onAction}: CommentsProps) {
    const [mention, setMention] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-comments-variant-4"><HbarAppUiToolbar title="Comment composer"
                                                                                            detail="Mentions, attachments and formatting"/>
        <div className="hbar-app-ui-format-toolbar"><HbarAppUiIconButton label="Bold"><HbarAppUiIcon icon={Bold} tier="sm"
            /></HbarAppUiIconButton><HbarAppUiIconButton label="Italic"><HbarAppUiIcon icon={Italic} tier="sm"
            /></HbarAppUiIconButton><HbarAppUiIconButton label="Mention"
                                                                  onClick={() => setMention((value) => !value)}><HbarAppUiIcon icon={AtSign} tier="sm"
            /></HbarAppUiIconButton><HbarAppUiIconButton label="Attach"><HbarAppUiIcon icon={Paperclip} tier="sm"
            /></HbarAppUiIconButton></div>
        {mention && <HbarAppUiSpotlight className="hbar-app-ui-mention-menu">
            <LumenButton type="button" onClick={() => setMention(false)}>Avery Chen</LumenButton>
            <LumenButton type="button" onClick={() => setMention(false)}>Mina Patel</LumenButton>
        </HbarAppUiSpotlight>}<LumenTextarea placeholder="Write a comment…"/>
        <div className="hbar-app-ui-composer-actions"><span>Markdown supported</span><HbarAppUiButton tone="accent"
                                                                                                      onClick={() => onAction?.({
                                                                                                          variantId: spec.id,
                                                                                                          actionId: 'comment'
                                                                                                      })}>Comment</HbarAppUiButton>
        </div>
    </ActionSurfaceFrame>
}

function CommentInbox({spec, onAction}: CommentsProps) {
    const [tab, setTab] = useState('All');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-comments-variant-5"><HbarAppUiToolbar title="Comment inbox"
                                                                                            detail="Resolve from the list"/><HbarAppUiTabs
        label="Comment filter" value={tab} options={['All', 'Unresolved', 'Mentions'].map((id) => ({id, label: id}))}
        onChange={setTab}/>
        <div
            className="hbar-app-ui-comment-inbox">{['Review API contract', 'Mentioned you in activity', 'Suggested change'].map((title, index) =>
            <HbarAppUiSpotlight key={title}><HbarAppUiIcon icon={MessageCircle} tier="sm" />
                <div><strong>{title}</strong><small>{index + 2}m ago · {index === 1 ? '@you' : 'Avery'}</small></div>
                <HbarAppUiStatus value={index === 0 ? 'Unresolved' : 'Resolved'}
                                 tone={index === 0 ? 'warning' : 'positive'}/><HbarAppUiButton
                    onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'resolve',
                        value: title
                    })}>Resolve</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function CanvasComments({spec, onAction}: CommentsProps) {
    const [pin, setPin] = useState(1);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-comments-variant-6">
        <div className="hbar-app-ui-canvas-comments">
            <main>
                <div className="hbar-app-ui-canvas-art"><span>Workspace canvas</span>{[1, 2, 3].map((number) => <LumenButton
                    type="button" className={pin === number ? 'is-active' : ''}
                    style={{left: `${20 + number * 22}%`, top: `${24 + number * 15}%`}} key={number}
                    onClick={() => setPin(number)}>{number}</LumenButton>)}</div>
            </main>
            <aside><HbarAppUiToolbar title="Comments" detail={`Pin ${pin} selected`}/><HbarAppUiSpotlight><span
                className="hbar-app-ui-avatar">{pin}</span><strong>Comment on pin {pin}</strong><p>Keep this region
                aligned with the current activity surface.</p><HbarAppUiButton onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'reply',
                value: String(pin)
            })}>Reply</HbarAppUiButton></HbarAppUiSpotlight></aside>
        </div>
    </ActionSurfaceFrame>
}

export function Comments({spec, onAction}: CommentsProps) {
    switch (spec.variant) {
        case 1:
            return <ThreadedDiscussion spec={spec} onAction={onAction}/>;
        case 2:
            return <Annotation spec={spec} onAction={onAction}/>;
        case 3:
            return <CodeReview spec={spec} onAction={onAction}/>;
        case 4:
            return <MentionComposer spec={spec} onAction={onAction}/>;
        case 5:
            return <CommentInbox spec={spec} onAction={onAction}/>;
        case 6:
            return <CanvasComments spec={spec} onAction={onAction}/>;
        default:
            return <ThreadedDiscussion spec={spec} onAction={onAction}/>
    }
}
