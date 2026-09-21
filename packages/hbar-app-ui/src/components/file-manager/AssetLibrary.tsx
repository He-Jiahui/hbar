import { LumenButton } from '@lumen/app-ui'
import {ArrowDownUp, Ellipsis, Share2, Trash2} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {uniqueHbarAppUiFileManagerItems, type HbarAppUiFileKind, type HbarAppUiFileManagerAssetContent} from './FileManagerContent'
import {FileManagerButton, FileManagerFrame, FileManagerIcon} from './FileManagerPrimitives'

type AssetFilter = 'all' | 'images' | 'video' | 'documents'

function matchesFilter(kind: HbarAppUiFileKind, filter: AssetFilter): boolean {
    if (filter === 'all') return true
    if (filter === 'images') return kind === 'image'
    if (filter === 'video') return kind === 'video'
    return kind === 'document'
}

export function AssetLibrary({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFileManagerAssetContent}) {
    const [filter, setFilter] = useState<AssetFilter>('all')
    const [selectedIds, setSelectedIds] = useState<readonly string[]>(() => content.assets.filter((asset) => asset.selectedByDefault).map((asset) => asset.id))
    const folders = useMemo(() => uniqueHbarAppUiFileManagerItems(content.folders), [content.folders])
    const assets = useMemo(() => uniqueHbarAppUiFileManagerItems(content.assets), [content.assets])
    const visibleAssets = assets.filter((asset) => matchesFilter(asset.kind, filter))
    const options: readonly {readonly id: AssetFilter; readonly label: string}[] = [
        {id: 'all', label: content.labels.all},
        {id: 'images', label: content.labels.images},
        {id: 'video', label: content.labels.video},
        {id: 'documents', label: content.labels.documents},
    ]
    const toggleSelection = (id: string) => {
        setSelectedIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id])
        onAction?.({variantId: spec.id, actionId: 'select-asset', value: id})
    }

    return <FileManagerFrame spec={spec} onAction={onAction} className="hbar-app-ui-file-manager-assets-surface">
        <section className="hbar-app-ui-file-manager-assets">
            <header className="hbar-app-ui-file-manager-assets-header">
                <p>{content.labels.breadcrumb}</p>
                <div><h2>{content.labels.title}</h2><span>{content.labels.summary}</span></div>
                <div className="hbar-app-ui-file-manager-asset-controls">
                    <div className="hbar-app-ui-file-manager-filter-row" role="group"
                         aria-label={content.labels.title}>{options.map((option) => <LumenButton type="button"
                                                                                            key={option.id}
                                                                                            aria-pressed={filter === option.id}
                                                                                            className={filter === option.id ? 'is-selected' : ''}
                                                                                            onClick={() => setFilter(option.id)}>{option.label}</LumenButton>)}</div>
                    <FileManagerButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'sort'})}><ArrowDownUp
                        className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs"
                        aria-hidden="true"/>{content.labels.sort}</FileManagerButton>
                </div>
            </header>
            <section className="hbar-app-ui-file-manager-asset-section" aria-label={content.labels.folders}>
                <h3>{content.labels.folders}</h3>
                <div className="hbar-app-ui-file-manager-folder-cards"
                     data-hbar-app-ui-list-strategy={content.listStrategy.kind}>{folders.map((folder) => <LumenButton
                    type="button" key={folder.id}
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'open-folder', value: folder.id})}>
                    <FileManagerIcon kind={folder.kind ?? 'folder'}
                                     tier="sm"/><span>{folder.name}</span>{folder.detail &&
                    <small>{folder.detail}</small>}</LumenButton>)}</div>
            </section>
            <section className="hbar-app-ui-file-manager-asset-section hbar-app-ui-file-manager-asset-files" aria-label={content.labels.files}>
                <h3>{content.labels.files}</h3>
                <div className="hbar-app-ui-file-manager-asset-grid"
                     data-hbar-app-ui-list-strategy={content.listStrategy.kind}>{visibleAssets.map((asset) => <LumenButton
                    type="button" className={selectedIds.includes(asset.id) ? 'is-selected' : ''}
                    aria-label={content.labels.selectAsset(asset.name)} key={asset.id}
                    onClick={() => toggleSelection(asset.id)}><span
                    className="hbar-app-ui-file-manager-asset-preview"><FileManagerIcon kind={asset.kind}
                                                                                        tier="md"/></span><span>{asset.name}</span><small>{content.labels.assetSummary(asset.format, asset.size)}</small>
                </LumenButton>)}</div>
                {!visibleAssets.length && <p className="hbar-app-ui-file-manager-empty">{content.labels.empty}</p>}
            </section>
            <footer className="hbar-app-ui-file-manager-selection-footer">
                <span>{content.labels.selected(selectedIds.length)}</span>
                <div><FileManagerButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'share', value: selectedIds.join(',')})}><Share2 className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" />{content.labels.share}</FileManagerButton><FileManagerButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'delete', value: selectedIds.join(',')})}><Trash2 className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" />{content.labels.delete}</FileManagerButton><FileManagerButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'more', value: selectedIds.join(',')})}><Ellipsis className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" />{content.labels.more}</FileManagerButton></div>
            </footer>
        </section>
    </FileManagerFrame>
}
