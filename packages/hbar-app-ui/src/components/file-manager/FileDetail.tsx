import { LumenButton } from '@lumen/app-ui'
import {Copy, Download, Link, Share2} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {selectHbarAppUiFileManagerItem, uniqueHbarAppUiFileManagerItems, type HbarAppUiFileManagerDetailContent} from './FileManagerContent'
import {FileManagerButton, FileManagerFrame, FileManagerIcon} from './FileManagerPrimitives'

export function FileDetail({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFileManagerDetailContent}) {
    const [activeItemId, setActiveItemId] = useState<string | undefined>(content.activeItemId)
    const items = useMemo(() => uniqueHbarAppUiFileManagerItems(content.items), [content.items])
    const activeItem = selectHbarAppUiFileManagerItem(items, activeItemId)
    return <FileManagerFrame spec={spec} onAction={onAction} className="hbar-app-ui-file-manager-detail-surface">
        <section className="hbar-app-ui-file-manager-detail">
            <div className="hbar-app-ui-file-manager-detail-layout">
                <section className="hbar-app-ui-file-manager-detail-left">
                    <header className="hbar-app-ui-file-manager-detail-header">
                        <div><h2>{content.labels.title}</h2><p>{content.labels.summary}</p></div>
                    </header>
                    <nav className="hbar-app-ui-file-manager-detail-list" aria-label={content.labels.title}
                         data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                        {items.map((item) => <LumenButton type="button"
                                                     className={activeItem?.id === item.id ? 'is-selected' : ''}
                                                     aria-label={content.labels.openItem(item.name)} key={item.id}
                                                     onClick={() => {
                                                         setActiveItemId(item.id)
                                                         onAction?.({
                                                             variantId: spec.id,
                                                             actionId: 'open-item',
                                                             value: item.id
                                                         })
                                                     }}><FileManagerIcon kind={item.kind}
                                                                         tier="xs"/><span>{item.name}</span><small>{content.labels.itemSummary(item.format, item.size)}</small>
                        </LumenButton>)}
                        {!items.length && <p className="hbar-app-ui-file-manager-empty">{content.labels.empty}</p>}
                    </nav>
                </section>
                {activeItem && <main className="hbar-app-ui-file-manager-detail-preview">
                    <div className="hbar-app-ui-file-manager-preview-canvas"><FileManagerIcon kind={activeItem.kind} tier="lg" /></div>
                    <header><h3>{activeItem.name}</h3><p>{content.labels.previewSummary(activeItem.version, activeItem.size)}</p></header>
                    <FileManagerButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'download', value: activeItem.id})}><Download className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" />{content.labels.download}</FileManagerButton>
                    <section className="hbar-app-ui-file-manager-detail-metadata" aria-label={content.labels.details}><h4>{content.labels.details}</h4><dl>{activeItem.metadata.map((row) => <div key={row.id}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></section>
                    <section className="hbar-app-ui-file-manager-detail-owners" aria-label={content.labels.sharedWith}><h4>{content.labels.sharedWith}</h4>{activeItem.collaborators.map((owner) => <div key={`${owner.initials}-${owner.name}`}><span>{owner.initials}</span><span>{owner.name}</span><small>{owner.permission}</small></div>)}<p>{activeItem.accessNotice}</p><div className="hbar-app-ui-file-manager-detail-actions"><FileManagerButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'share', value: activeItem.id})}><Share2 className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" />{content.labels.shareItem(activeItem.name)}</FileManagerButton><FileManagerButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'copy-link', value: activeItem.id})}><Link className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" />{content.labels.copyLink}</FileManagerButton><FileManagerButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'make-copy', value: activeItem.id})}><Copy className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" />{content.labels.makeCopy}</FileManagerButton></div></section>
                    <section className="hbar-app-ui-file-manager-detail-activity" aria-label={content.labels.activity}><h4>{content.labels.activity}</h4>{activeItem.activity.map((entry) => <p key={entry.id}>{entry.text}</p>)}</section>
                </main>}
            </div>
        </section>
    </FileManagerFrame>
}
