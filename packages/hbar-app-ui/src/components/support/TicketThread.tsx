import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton, LumenTextarea } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {CheckCircle2, LockKeyhole, Paperclip, Send} from 'lucide-react'
import {reportSupportAction, SupportChip, SupportFrame, type SupportSurfaceProps} from './SupportPrimitives'

type ThreadMessage = {
    readonly id: string
    readonly sender: 'You' | 'Sofia Alvarez'
    readonly role?: string
    readonly time: string
    readonly body: string
    readonly attachment?: string
}

const messages: readonly ThreadMessage[] = [
    {
        id: 'one',
        sender: 'You',
        time: 'Mon 09:12',
        body: 'The Monday revenue export landed with headers but no rows. It ran at 06:00 as usual and the run log says it succeeded.',
        attachment: 'export-log-1104.txt'
    },
    {
        id: 'two',
        sender: 'Sofia Alvarez',
        role: 'Support',
        time: 'Mon 09:31',
        body: 'Thanks for the log. The job completed against a filter that excluded every row, which is why it reported success. Was the saved view edited on Sunday?'
    },
    {
        id: 'three',
        sender: 'You',
        time: 'Mon 10:04',
        body: 'Yes, someone narrowed the date range to a single day while testing and left it that way.'
    },
    {
        id: 'four',
        sender: 'Sofia Alvarez',
        role: 'Support',
        time: 'Mon 10:22',
        body: 'That explains it. I have added a warning on scheduled runs that return zero rows, shipping this week. In the meantime the schedule will email you instead of writing an empty file.'
    },
    {
        id: 'five',
        sender: 'You',
        time: 'Mon 11:15',
        body: 'Restored the range and re-ran it, 14,208 rows this time. Is there a way to lock a saved view so a schedule cannot be changed underneath it?'
    },
    {
        id: 'six',
        sender: 'Sofia Alvarez',
        role: 'Support',
        time: 'Mon 11:40',
        body: 'Yes. Open the view, choose Lock for schedules, and edits then require an admin. I have attached the steps for your workspace.',
        attachment: 'lock-a-saved-view.pdf'
    },
]

export function TicketThread({spec, onAction}: SupportSurfaceProps): React.JSX.Element {
    const [resolved, setResolved] = useState(false)
    const [reply, setReply] = useState('')
    const [sentReply, setSentReply] = useState<string | null>(null)
    const sendReply = () => {
        const next = reply.trim()
        if (!next) return
        setSentReply(next)
        setReply('')
        reportSupportAction(onAction, spec, 'reply', next)
    }

    return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-thread">
        <LumenFrame as="header" className="hbar-app-ui-support-thread-heading">
            <LumenFrame>
                <LumenFrame className="hbar-app-ui-support-thread-title"><LumenText as="h1">Scheduled export is empty</LumenText>{!resolved &&
                    <SupportChip tone="light">Awaiting your reply</SupportChip>}</LumenFrame>
                <LumenText as="p">Ticket #4192 · Reports and exports · Normal priority</LumenText></LumenFrame>
            <LumenButton type="button" className="hbar-app-ui-support-button" onClick={() => {
                setResolved((value) => !value);
                reportSupportAction(onAction, spec, resolved ? 'reopen' : 'resolve')
            }}><HbarAppUiIcon icon={CheckCircle2} tier="md" />{resolved ? 'Reopen ticket' : 'Mark resolved'}</LumenButton>
        </LumenFrame>
        <LumenFrame className="hbar-app-ui-support-thread-layout">
            <LumenFrame as="section" className="hbar-app-ui-support-thread-main">
                <LumenCollection as="ol" className="hbar-app-ui-support-messages">{messages.map((message) => <LumenCollectionItem key={message.id}>
                    <LumenFrame as="article"><LumenText as="span"
                        className={`hbar-app-ui-support-message-avatar ${message.sender === 'You' ? 'is-you' : ''}`}>{message.sender === 'You' ? 'You' : 'SA'}</LumenText>
                        <LumenFrame>
                            <LumenFrame as="header"><LumenText as="strong">{message.sender}</LumenText>{message.role && <LumenText as="small">{message.role}</LumenText>}
                                <LumenText as="time">{message.time}</LumenText>
                            </LumenFrame>
                            <LumenText as="p">{message.body}</LumenText>{message.attachment &&
                            <LumenText as="span" className="hbar-app-ui-support-file"><HbarAppUiIcon icon={Paperclip} tier="sm"
                                />{message.attachment}</LumenText>}</LumenFrame>
                    </LumenFrame>
                </LumenCollectionItem>)}{sentReply && <LumenCollectionItem>
                    <LumenFrame as="article"><LumenText as="span" className="hbar-app-ui-support-message-avatar is-you">You</LumenText>
                        <LumenFrame>
                            <LumenFrame as="header"><LumenText as="strong">You</LumenText>
                                <LumenText as="time">Now</LumenText>
                            </LumenFrame>
                            <LumenText as="p">{sentReply}</LumenText></LumenFrame>
                    </LumenFrame>
                </LumenCollectionItem>}</LumenCollection>
                <LumenFrame as="form" className="hbar-app-ui-support-reply" onSubmit={(event) => {
                    event.preventDefault();
                    sendReply()
                }}><LumenTextarea rows={1} value={reply} onChange={(event) => setReply(event.target.value)}
                             placeholder="Reply to Sofia" aria-label="Reply to Sofia"/>
                    <LumenFrame as="footer">
                        <LumenButton type="button" aria-label="Attach a file" className="hbar-app-ui-support-icon-plain"
                                onClick={() => reportSupportAction(onAction, spec, 'attach')}><HbarAppUiIcon icon={Paperclip} tier="md" />
                        </LumenButton>
                        <LumenButton type="submit" className="hbar-app-ui-support-button hbar-app-ui-support-button-light"
                                disabled={!reply.trim()}><HbarAppUiIcon icon={Send} tier="sm" />Send reply
                        </LumenButton>
                    </LumenFrame>
                </LumenFrame>
            </LumenFrame>
            <LumenFrame as="aside" className="hbar-app-ui-support-thread-aside">
                <LumenFrame as="section"><LumenText as="h2">Timeline</LumenText>
                    <LumenCollection as="dl">
                        <LumenFrame>
                            <LumenCollectionItem as="dt">Opened</LumenCollectionItem>
                            <LumenCollectionItem as="dd">Mon 09:12</LumenCollectionItem>
                        </LumenFrame>
                        <LumenFrame>
                            <LumenCollectionItem as="dt">First reply</LumenCollectionItem>
                            <LumenCollectionItem as="dd">19m later</LumenCollectionItem>
                        </LumenFrame>
                        <LumenFrame>
                            <LumenCollectionItem as="dt">Assigned to</LumenCollectionItem>
                            <LumenCollectionItem as="dd">Sofia Alvarez</LumenCollectionItem>
                        </LumenFrame>
                        <LumenFrame>
                            <LumenCollectionItem as="dt">Last update</LumenCollectionItem>
                            <LumenCollectionItem as="dd">Mon 10:22</LumenCollectionItem>
                        </LumenFrame>
                    </LumenCollection>
                </LumenFrame>
                <LumenFrame as="section"><LumenText as="h2">Related article</LumenText><LumenText as="strong">Why a scheduled export can succeed with zero rows</LumenText>
                    <LumenButton type="button" className="hbar-app-ui-support-button"
                            onClick={() => reportSupportAction(onAction, spec, 'open', 'related-article')}>Open article
                    </LumenButton>
                </LumenFrame>
                <LumenFrame as="section" className="hbar-app-ui-support-thread-access"><HbarAppUiIcon icon={LockKeyhole} tier="md" /><LumenText as="p">Only workspace admins
                    and the assigned agent can read this thread.</LumenText></LumenFrame>
            </LumenFrame>
        </LumenFrame>
    </SupportFrame>
}
