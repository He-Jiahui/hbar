import { LumenButton } from '@lumen/app-ui'
import {CloudUpload, Pause, Play, RotateCcw, X} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {uniqueHbarAppUiFileManagerItems, type HbarAppUiFileManagerUploadContent, type HbarAppUiFileManagerUploadItem, type HbarAppUiFileManagerUploadState} from './FileManagerContent'
import {FileManagerButton, FileManagerFrame, FileManagerIcon} from './FileManagerPrimitives'

function labelForState(labels: HbarAppUiFileManagerUploadContent['labels'], state: HbarAppUiFileManagerUploadState): string {
    switch (state) {
        case 'uploaded':
            return labels.uploaded
        case 'uploading':
            return labels.uploading
        case 'failed':
            return labels.failed
        case 'queued':
            return labels.queued
    }
}

export function UploadQueue({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFileManagerUploadContent}) {
    const [recoveredIds, setRecoveredIds] = useState<ReadonlySet<string>>(() => new Set())
    const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set())
    const [pausedIds, setPausedIds] = useState<ReadonlySet<string>>(() => new Set())
    const items = useMemo(() => uniqueHbarAppUiFileManagerItems(content.items).filter((item) => !removedIds.has(item.id)), [content.items, removedIds])
    const resolvedState = (item: HbarAppUiFileManagerUploadItem): HbarAppUiFileManagerUploadState => recoveredIds.has(item.id) ? 'uploading' : item.state
    const progressFor = (item: HbarAppUiFileManagerUploadItem): number => recoveredIds.has(item.id) ? Math.max(item.progress, 1) : item.progress
    const transferSummary = content.labels.transferSummary

    return <FileManagerFrame spec={spec} onAction={onAction} className="hbar-app-ui-file-manager-upload-surface">
        <section className="hbar-app-ui-file-manager-upload">
            <header className="hbar-app-ui-file-manager-upload-header">
                <div><h2>{content.labels.title}</h2><p>{content.labels.summary}</p></div>
                <FileManagerButton type="button" aria-label={content.labels.dismiss}
                                   onClick={() => onAction?.({variantId: spec.id, actionId: 'dismiss'})}><X
                    className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs"
                    aria-hidden="true"/></FileManagerButton></header>
            <LumenButton type="button" className="hbar-app-ui-file-manager-drop-zone"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'browse'})}><CloudUpload
                className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-lg"
                aria-hidden="true"/><strong>{content.labels.dropTitle}</strong><small>{content.labels.dropDescription}</small>
            </LumenButton>
            <section className="hbar-app-ui-file-manager-upload-queue" aria-label={content.labels.queue}>
                <h3>{content.labels.queue}</h3>
                <ul data-hbar-app-ui-list-strategy={content.listStrategy.kind}>{items.map((item) => {
                    const state = resolvedState(item)
                    const progress = Math.max(0, Math.min(100, progressFor(item)))
                    const paused = pausedIds.has(item.id)
                    const statusDetail = item.statusDetail ?? (state === 'uploading' ? content.labels.progress(progress, item.remaining) : undefined)
                    return <li key={item.id} className={`is-${state}`}><FileManagerIcon kind={item.kind} tier="sm"/>
                        <div><strong>{item.name}</strong><span>{labelForState(content.labels, state)}{statusDetail &&
                            <small>{statusDetail}</small>}</span>{state === 'uploading' && !paused &&
                            <div className="hbar-app-ui-file-manager-meter" role="progressbar" aria-label={item.name}
                                 aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span
                                style={{inlineSize: `${progress}%`}}/></div>}</div>
                        <small>{item.size}</small>{state === 'uploading' && <FileManagerButton type="button"
                                                                                               aria-label={paused ? content.labels.start(item.name) : content.labels.pause(item.name)}
                                                                                               onClick={() => {
                                                                                                   setPausedIds((current) => new Set(paused ? [...current].filter((id) => id !== item.id) : [...current, item.id]));
                                                                                                   onAction?.({
                                                                                                       variantId: spec.id,
                                                                                                       actionId: paused ? 'start' : 'pause',
                                                                                                       value: item.id
                                                                                                   })
                                                                                               }}>{paused ?
                            <Play className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true"/> :
                            <Pause className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs"
                                   aria-hidden="true"/>}</FileManagerButton>}{state === 'failed' &&
                            <FileManagerButton type="button" aria-label={content.labels.retry(item.name)}
                                               onClick={() => {
                                                   setRecoveredIds((current) => new Set([...current, item.id]));
                                                   onAction?.({variantId: spec.id, actionId: 'retry', value: item.id})
                                               }}><RotateCcw
                                className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs"
                                aria-hidden="true"/></FileManagerButton>}<FileManagerButton type="button"
                                                                                            aria-label={content.labels.remove(item.name)}
                                                                                            onClick={() => {
                                                                                                setRemovedIds((current) => new Set([...current, item.id]));
                                                                                                onAction?.({
                                                                                                    variantId: spec.id,
                                                                                                    actionId: 'remove',
                                                                                                    value: item.id
                                                                                                })
                                                                                            }}><X
                            className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs"
                            aria-hidden="true"/></FileManagerButton></li>
                })}</ul>
                {!items.length && <p className="hbar-app-ui-file-manager-empty">{content.labels.empty}</p>}</section>
            <footer className="hbar-app-ui-file-manager-upload-footer"><span>{transferSummary}</span>
                <div><FileManagerButton type="button" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'cancel-all'
                })}>{content.labels.cancelAll}</FileManagerButton><FileManagerButton tone="accent" type="button"
                                                                                     onClick={() => onAction?.({
                                                                                         variantId: spec.id,
                                                                                         actionId: 'clear-completed'
                                                                                     })}>{content.labels.clearCompleted}</FileManagerButton>
                </div>
            </footer>
        </section>
    </FileManagerFrame>
}
