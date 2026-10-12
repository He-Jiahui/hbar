import { LumenCollection, LumenCollectionItem, LumenFrame, LumenText, LumenButton, LumenInput, LumenTextarea, LumenSelect } from '@lumen/app-ui'
import { LumenOption } from '@lumen/app-ui/catalog'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {FileText, Paperclip, X} from 'lucide-react'
import {reportSupportAction, SupportChip, SupportFrame, type SupportSurfaceProps} from './SupportPrimitives'

const areaOptions = ['Reports and exports', 'Billing and plans', 'Accounts and access', 'Integrations and API'] as const
const workspaceOptions = ['Northwind · Production', 'Northwind · Staging', 'Meridian'] as const
const suggestedArticles = ['Scheduled export arrives with no rows', 'Export runs but the file never lands in storage', 'Column order changes between runs'] as const
const priorityOptions = ['Low', 'Normal', 'Urgent'] as const

export function TicketForm({spec, onAction}: SupportSurfaceProps): React.JSX.Element {
    const [area, setArea] = useState<(typeof areaOptions)[number]>('Reports and exports')
    const [workspace, setWorkspace] = useState<(typeof workspaceOptions)[number]>('Northwind · Production')
    const [priority, setPriority] = useState<(typeof priorityOptions)[number]>('Normal')
    const [subject, setSubject] = useState('Scheduled export is empty')
    const [details, setDetails] = useState('')
    const [attachment, setAttachment] = useState(true)
    const [submitted, setSubmitted] = useState(false)

    const submit = () => {
        setSubmitted(true)
        reportSupportAction(onAction, spec, 'submit', priority)
    }

    return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-ticket">
        <LumenFrame as="main" className="hbar-app-ui-support-ticket-page">
            <LumenFrame as="header" className="hbar-app-ui-support-ticket-heading"><LumenText as="h1">Open a ticket</LumenText><LumenText as="p">The more detail you give us
                up front, the fewer round trips it takes.</LumenText></LumenFrame>
            <LumenFrame className="hbar-app-ui-support-ticket-layout">
                <LumenFrame as="form" className="hbar-app-ui-support-ticket-form" onSubmit={(event) => {
                    event.preventDefault();
                    submit()
                }}>
                    <LumenFrame className="hbar-app-ui-support-ticket-selects"><LumenFrame as="label">Area<LumenSelect value={area}
                                                                                           onChange={(event) => setArea(event.target.value as (typeof areaOptions)[number])}>{areaOptions.map((option) =>
                        <LumenOption key={option}>{option}</LumenOption>)}</LumenSelect></LumenFrame><LumenFrame as="label">Workspace<LumenSelect
                        value={workspace}
                        onChange={(event) => setWorkspace(event.target.value as (typeof workspaceOptions)[number])}>{workspaceOptions.map((option) =>
                        <LumenOption key={option}>{option}</LumenOption>)}</LumenSelect></LumenFrame></LumenFrame>
                    <LumenFrame as="label">Subject<LumenInput value={subject} onChange={(event) => setSubject(event.target.value)}/></LumenFrame>
                    <LumenFrame as="section" className="hbar-app-ui-support-suggestions"><LumenText as="h2">These may answer it
                        already</LumenText>{suggestedArticles.map((article) => <LumenButton type="button" key={article}
                                                                                onClick={() => reportSupportAction(onAction, spec, 'open', article)}>
                        <HbarAppUiIcon icon={FileText} tier="sm"  aria-hidden="true"/><LumenText as="span">{article}</LumenText></LumenButton>)}</LumenFrame>
                    <LumenFrame as="fieldset" className="hbar-app-ui-support-priority">
                        <LumenText as="legend">Priority</LumenText>
                        <LumenFrame role="radiogroup" aria-label="Priority">{priorityOptions.map((option) => <LumenButton
                            type="button" role="radio" aria-checked={priority === option}
                            className={priority === option ? 'is-selected' : ''} key={option} onClick={() => {
                            setPriority(option);
                            reportSupportAction(onAction, spec, 'priority', option)
                        }}>{option}</LumenButton>)}</LumenFrame>
                    </LumenFrame>
                    <LumenFrame as="label">What happened?<LumenTextarea value={details} onChange={(event) => setDetails(event.target.value)}
                                                   placeholder="What you did, what you expected, and what happened instead."/></LumenFrame>
                    <LumenFrame className="hbar-app-ui-support-attachments">
                        <LumenButton type="button" className="hbar-app-ui-support-button" onClick={() => {
                            setAttachment(true);
                            reportSupportAction(onAction, spec, 'attach')
                        }}><HbarAppUiIcon icon={Paperclip} tier="md" />Attach files
                        </LumenButton>
                        {attachment && <LumenText as="span">export-log-1104.txt<LumenButton type="button"
                                                                        aria-label="Remove export-log-1104.txt"
                                                                        onClick={() => setAttachment(false)}><HbarAppUiIcon icon={X} tier="sm"
                            /></LumenButton></LumenText>}</LumenFrame>
                    <LumenFrame as="footer">
                        <LumenButton type="button" className="hbar-app-ui-support-button hbar-app-ui-support-button-quiet"
                                onClick={() => reportSupportAction(onAction, spec, 'save', subject)}>Save draft
                        </LumenButton>
                        <LumenButton type="submit"
                                className="hbar-app-ui-support-button hbar-app-ui-support-button-light">{submitted ? 'Ticket submitted' : 'Submit ticket'}</LumenButton>
                    </LumenFrame>
                </LumenFrame>
                <LumenFrame as="aside" className="hbar-app-ui-support-ticket-aside">
                    <LumenFrame as="section"><LumenText as="h2">First response</LumenText>
                        <LumenText as="strong">{priority === 'Urgent' ? '1 hour' : priority === 'Low' ? '1 business day' : '8 hours'}</LumenText>
                        <LumenText as="p">Based on your plan and the priority you selected.</LumenText></LumenFrame>
                    <LumenFrame as="section"><LumenText as="h2">Sent with your ticket</LumenText>
                        <LumenCollection as="dl">
                            <LumenFrame>
                                <LumenCollectionItem as="dt">Plan</LumenCollectionItem>
                                <LumenCollectionItem as="dd">Pro</LumenCollectionItem>
                            </LumenFrame>
                            <LumenFrame>
                                <LumenCollectionItem as="dt">Region</LumenCollectionItem>
                                <LumenCollectionItem as="dd">eu-west</LumenCollectionItem>
                            </LumenFrame>
                            <LumenFrame>
                                <LumenCollectionItem as="dt">App version</LumenCollectionItem>
                                <LumenCollectionItem as="dd">4.19.2</LumenCollectionItem>
                            </LumenFrame>
                        </LumenCollection>
                    </LumenFrame>
                    <LumenFrame as="section"><LumenText as="h2">Before you send</LumenText><LumenText as="p">Name the report or schedule, not just the screen it appeared
                        on.</LumenText><LumenText as="p">Include the run time and time zone if the problem is intermittent.</LumenText><LumenText as="p">Attach the
                        run log rather than a screenshot of it where you can.</LumenText></LumenFrame>
                    <LumenFrame as="section"><LumenText as="h2">Recent tickets</LumenText>
                        <LumenFrame className="hbar-app-ui-support-recent-ticket">
                            <LumenText as="span">Webhook retries stop</LumenText><SupportChip>Resolved</SupportChip></LumenFrame>
                        <LumenFrame className="hbar-app-ui-support-recent-ticket">
                            <LumenText as="span">Two invoices in March</LumenText><SupportChip>Open</SupportChip></LumenFrame>
                    </LumenFrame>
                </LumenFrame>
            </LumenFrame>
        </LumenFrame>
    </SupportFrame>
}
