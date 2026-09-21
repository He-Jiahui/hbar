import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../icon'
import {useState} from 'react'
import {Bell, Heart, Image, Paperclip, Users} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiComposer, HbarAppUiSpotlight, HbarAppUiTabs, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type ChatProps = HbarAppUiVariantProps

function TeamChannel({spec, onAction}: ChatProps) {
    const [channel, setChannel] = useState('operations');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-chat-variant-1">
        <div className="hbar-app-ui-team-chat">
            <aside><strong>Channels</strong>{['operations', 'releases', 'support'].map((item) => <LumenButton type="button"
                                                                                                         className={channel === item ? 'is-selected' : ''}
                                                                                                         key={item}
                                                                                                         onClick={() => setChannel(item)}># {item}</LumenButton>)}<strong>Direct</strong>
                <LumenButton type="button">hbar</LumenButton>
            </aside>
            <main><HbarAppUiToolbar title={`# ${channel}`} detail="Threaded messages"/><HbarAppUiSpotlight><span
                className="hbar-app-ui-avatar">A</span>
                <div><strong>Avery</strong><p>Deployment is ready for review.</p><small>10:18 · <LumenButton type="button">
                    <HbarAppUiIcon icon={Heart} tier="xs" /> 2</LumenButton></small></div>
            </HbarAppUiSpotlight><HbarAppUiSpotlight><span className="hbar-app-ui-avatar">M</span>
                <div><strong>Mina</strong><p>I’ll check the activity panel and reply here.</p><small>10:22 · <LumenButton
                    type="button">Reply</LumenButton></small></div>
            </HbarAppUiSpotlight><HbarAppUiComposer placeholder={`Message #${channel}`}
                                                    onSubmit={(value) => onAction?.({
                                                        variantId: spec.id,
                                                        actionId: 'send',
                                                        value
                                                    })}/></main>
        </div>
    </ActionSurfaceFrame>
}

function DirectInbox({spec, onAction}: ChatProps) {
    const [contact, setContact] = useState('Mina Patel');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-chat-variant-2">
        <div className="hbar-app-ui-direct-chat">
            <aside><HbarAppUiToolbar title="Messages"
                                     detail="Direct inbox"/>{['Mina Patel', 'Jon Bell', 'Sam Rivera'].map((name) =>
                <LumenButton type="button" className={contact === name ? 'is-selected' : ''} key={name}
                        onClick={() => setContact(name)}><span
                    className="hbar-app-ui-avatar">{name[0]}</span><span><strong>{name}</strong><small>Last message · 2m</small></span>
                </LumenButton>)}</aside>
            <main><HbarAppUiToolbar title={contact} detail="Read receipts"/><HbarAppUiSpotlight><p>Can you review the
                latest run?</p><small>Seen 10:22</small></HbarAppUiSpotlight><HbarAppUiSpotlight><p>Yes — I’ll send
                notes shortly.</p><small>Delivered 10:24</small></HbarAppUiSpotlight><HbarAppUiComposer
                placeholder={`Message ${contact}`}
                onSubmit={(value) => onAction?.({variantId: spec.id, actionId: 'send', value})}/></main>
        </div>
    </ActionSurfaceFrame>
}

function SocialThread({spec, onAction}: ChatProps) {
    const [likes, setLikes] = useState(4);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-chat-variant-3"><HbarAppUiSpotlight
        className="hbar-app-ui-lead-post"><span className="hbar-app-ui-avatar hbar-app-ui-avatar-large">A</span>
        <div><strong>Avery Chen</strong><small>10m ago</small><p>What should we improve in the next workspace
            release?</p>
            <LumenButton type="button" onClick={() => setLikes((value) => value + 1)}><HbarAppUiIcon icon={Heart} tier="sm" /> {likes}</LumenButton>
        </div>
    </HbarAppUiSpotlight>
        <div className="hbar-app-ui-nested-replies"><HbarAppUiSpotlight><span className="hbar-app-ui-avatar">M</span>
            <div><strong>Mina</strong><p>Faster recovery feedback.</p><small>3m ago · <LumenButton type="button"><HbarAppUiIcon icon={Heart} tier="xs"
                /> 2</LumenButton></small></div>
        </HbarAppUiSpotlight><HbarAppUiSpotlight><span className="hbar-app-ui-avatar">J</span>
            <div><strong>Jon</strong><p>Keyboard navigation for queues.</p><small>1m ago</small></div>
        </HbarAppUiSpotlight></div>
        <HbarAppUiComposer placeholder="Reply to thread" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'reply',
            value
        })}/></ActionSurfaceFrame>
}

function SupportWidget({spec, onAction}: ChatProps) {
    const [rating, setRating] = useState(0);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-chat-variant-4"><HbarAppUiToolbar
        title="Support chat" detail="Quick replies and attachments"/><HbarAppUiSpotlight><span
        className="hbar-app-ui-avatar">S</span>
        <div><strong>Support assistant</strong><p>I found the answer in your workspace runbook.</p></div>
    </HbarAppUiSpotlight>
        <div className="hbar-app-ui-quick-replies"><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'quick-reply', value: 'connection'})}>Connection
            issue</HbarAppUiButton><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'quick-reply', value: 'billing'})}>Billing
            question</HbarAppUiButton></div>
        <div className="hbar-app-ui-chat-attachments"><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'attach', value: 'screenshot.png'})}><HbarAppUiIcon icon={Paperclip} tier="sm"
            />Attach</HbarAppUiButton><span>screenshot.png</span></div>
        <div className="hbar-app-ui-rating">{[1, 2, 3, 4, 5].map((value) => <LumenButton type="button"
                                                                                    className={rating >= value ? 'is-selected' : ''}
                                                                                    key={value}
                                                                                    onClick={() => setRating(value)}
                                                                                    aria-label={`${value} stars`}>★</LumenButton>)}</div>
        <HbarAppUiComposer placeholder="Ask support" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function GroupChat({spec, onAction}: ChatProps) {
    const [reaction, setReaction] = useState(0);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-chat-variant-5"><HbarAppUiToolbar
        title="Group chat" detail="Attachments · reactions · thread counts"/>
        <div className="hbar-app-ui-avatar-stack"><span>A</span><span>M</span><span>J</span><span>+5</span></div>
        <HbarAppUiButton onClick={() => onAction?.({variantId: spec.id, actionId: 'invite'})}><HbarAppUiIcon icon={Users} tier="sm"
            />Invite</HbarAppUiButton>
        <div className="hbar-app-ui-group-messages"><HbarAppUiSpotlight><span className="hbar-app-ui-avatar">M</span>
            <div><strong>Mina</strong><p>Sharing the updated architecture diagram.</p>
                <div className="hbar-app-ui-message-attachment"><HbarAppUiIcon icon={Image} tier="sm" />architecture.png</div>
                <small>
                    <LumenButton type="button" onClick={() => setReaction((value) => value + 1)}><HbarAppUiIcon icon={Heart} tier="xs"
                        /> {reaction}</LumenButton>
                    · 3 replies</small></div>
        </HbarAppUiSpotlight><HbarAppUiSpotlight><span className="hbar-app-ui-avatar">J</span>
            <div><strong>Jon</strong><p>Looks good — I left a note in the thread.</p><small>2 replies</small></div>
        </HbarAppUiSpotlight></div>
        <HbarAppUiComposer placeholder="Message the group" onSubmit={(value) => onAction?.({
            variantId: spec.id,
            actionId: 'send',
            value
        })}/></ActionSurfaceFrame>
}

function LiveStreamChat({spec, onAction}: ChatProps) {
    const [tab, setTab] = useState('Chat');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-chat-variant-6"><HbarAppUiToolbar
        title="Live stream chat" detail="Pinned notice · host · moderators"/><HbarAppUiTabs label="Live panel"
                                                                                            value={tab} options={[{
        id: 'Chat',
        label: 'Chat'
    }, {id: 'Viewers', label: 'Viewers'}]} onChange={setTab}/>{tab === 'Chat' ?
        <div className="hbar-app-ui-live-chat"><HbarAppUiSpotlight><HbarAppUiIcon icon={Bell} tier="sm" /><strong>Pinned: keep the discussion
            on topic.</strong></HbarAppUiSpotlight>{['Avery · host', 'Mina · moderator', 'Jon'].map((name, index) =>
            <div key={name}><span className="hbar-app-ui-avatar">{name[0]}</span><strong>{name}</strong>
                <p>{index === 0 ? 'Welcome to the workspace stream!' : 'The latest run is now live.'}</p>
            </div>)}<HbarAppUiComposer placeholder="Say something"
                                       onSubmit={(value) => onAction?.({variantId: spec.id, actionId: 'send', value})}/>
        </div> : <div className="hbar-app-ui-viewer-list"><strong>Viewers ·
            128</strong>{['Avery', 'Mina', 'Jon', 'Sam'].map((name) => <span key={name}><span
            className="hbar-app-ui-avatar">{name[0]}</span>{name}</span>)}</div>}</ActionSurfaceFrame>
}

export function Chat({spec, onAction}: ChatProps) {
    switch (spec.variant) {
        case 1:
            return <TeamChannel spec={spec} onAction={onAction}/>;
        case 2:
            return <DirectInbox spec={spec} onAction={onAction}/>;
        case 3:
            return <SocialThread spec={spec} onAction={onAction}/>;
        case 4:
            return <SupportWidget spec={spec} onAction={onAction}/>;
        case 5:
            return <GroupChat spec={spec} onAction={onAction}/>;
        case 6:
            return <LiveStreamChat spec={spec} onAction={onAction}/>;
        default:
            return <TeamChannel spec={spec} onAction={onAction}/>
    }
}
