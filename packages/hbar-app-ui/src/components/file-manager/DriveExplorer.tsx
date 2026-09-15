import {ChevronDown, ChevronRight, Ellipsis, FolderPlus, Grid2X2, List, Search, Star, Upload} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {selectHbarAppUiFileManagerItem, uniqueHbarAppUiFileManagerItems, type HbarAppUiFileManagerDriveContent} from './FileManagerContent'
import {FileManagerButton, FileManagerFrame, FileManagerIcon} from './FileManagerPrimitives'

export function DriveExplorer({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFileManagerDriveContent}) {
    const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(content.folders[0]?.id)
    const [expandedFolderIds, setExpandedFolderIds] = useState<ReadonlySet<string>>(() => new Set(content.folders.filter((folder) => folder.expandable).map((folder) => folder.id)))
    const [selectedRowId, setSelectedRowId] = useState<string | undefined>()
    const [selectedRowIds, setSelectedRowIds] = useState<ReadonlySet<string>>(() => new Set())
    const [query, setQuery] = useState('')
    const folders = useMemo(() => uniqueHbarAppUiFileManagerItems(content.folders), [content.folders])
    const rows = useMemo(() => uniqueHbarAppUiFileManagerItems(content.rows), [content.rows])
    const activeFolder = selectHbarAppUiFileManagerItem(folders, selectedFolderId)
    const selectedRow = selectHbarAppUiFileManagerItem(rows, selectedRowId)
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const visibleRows = normalizedQuery ? rows.filter((row) => row.name.toLocaleLowerCase().includes(normalizedQuery)) : rows
    const storagePercent = Math.max(0, Math.min(100, content.storagePercent))
    const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedRowIds.has(row.id))

    const toggleSelectedRow = (id: string, selected: boolean) => {
        setSelectedRowIds((current) => new Set(selected ? [...current, id] : [...current].filter((currentId) => currentId !== id)))
        onAction?.({variantId: spec.id, actionId: 'select-item', value: id})
    }

    return <FileManagerFrame spec={spec} onAction={onAction} className="hbar-app-ui-file-manager-drive-surface">
        <header className="hbar-app-ui-file-manager-drive-header">
            <div><h2>{content.labels.title}</h2><p>{content.labels.description}</p></div>
            <div className="hbar-app-ui-file-manager-header-actions">
                <FileManagerButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'new-folder'})}><FolderPlus className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-sm" aria-hidden="true" />{content.labels.newFolder}</FileManagerButton>
                <FileManagerButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'upload'})}><Upload className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-sm" aria-hidden="true" />{content.labels.upload}</FileManagerButton>
            </div>
        </header>
        <div className="hbar-app-ui-file-manager-drive-body">
            <aside className="hbar-app-ui-file-manager-drive-sidebar">
                <button className="hbar-app-ui-file-manager-location" type="button" onClick={() => setSelectedFolderId(folders[0]?.id)}><ChevronDown className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" /><span>{content.labels.myDrive}</span></button>
                <nav className="hbar-app-ui-file-manager-folder-nav" aria-label={content.labels.myDrive}>
                    {folders.filter((folder) => !folder.parentId || expandedFolderIds.has(folder.parentId)).map((folder) => <div className="hbar-app-ui-file-manager-folder-row" key={folder.id}><button type="button" className={activeFolder?.id === folder.id ? 'is-selected' : ''} aria-label={content.labels.openFolder(folder.name)} onClick={() => {
                        setSelectedFolderId(folder.id)
                        onAction?.({variantId: spec.id, actionId: 'open-folder', value: folder.id})
                    }}><FileManagerIcon kind={folder.kind ?? 'folder'} tier="xs" /><span>{folder.name}</span>{folder.detail && <small>{folder.detail}</small>}</button>{folder.expandable && <button type="button" className="hbar-app-ui-file-manager-folder-toggle" aria-label={expandedFolderIds.has(folder.id) ? content.labels.collapseFolder(folder.name) : content.labels.expandFolder(folder.name)} onClick={() => setExpandedFolderIds((current) => new Set(current.has(folder.id) ? [...current].filter((id) => id !== folder.id) : [...current, folder.id]))}>{expandedFolderIds.has(folder.id) ? <ChevronDown className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" /> : <ChevronRight className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" />}</button>}</div>)}
                </nav>
                <nav className="hbar-app-ui-file-manager-drive-secondary" aria-label={content.labels.shared}>
                    <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'shared'})}>{content.labels.shared}</button>
                    <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'recent'})}>{content.labels.recent}</button>
                    <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'starred'})}>{content.labels.starred}</button>
                    <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'bin'})}>{content.labels.bin}</button>
                </nav>
                <section className="hbar-app-ui-file-manager-storage" aria-label={content.labels.storage}>
                    <div><span>{content.labels.storage}</span><span>{content.labels.storageProgress}</span></div>
                    <div className="hbar-app-ui-file-manager-meter" role="progressbar" aria-label={content.labels.storage} aria-valuemin={0} aria-valuemax={100} aria-valuenow={storagePercent}><span style={{inlineSize: `${storagePercent}%`}} /></div>
                    <small>{content.labels.storageSummary(content.storageUsed, content.storageTotal)}</small>
                </section>
            </aside>
            <main className="hbar-app-ui-file-manager-drive-main">
                <header className="hbar-app-ui-file-manager-drive-toolbar">
                    <strong>{activeFolder?.name ?? content.labels.myDrive}</strong>
                    <label className="hbar-app-ui-file-manager-search"><Search className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={content.labels.search} aria-label={content.labels.search} /></label>
                    <div className="hbar-app-ui-file-manager-view-actions"><button type="button" aria-label={content.labels.listView}><List className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" /></button><button type="button" aria-label={content.labels.gridView}><Grid2X2 className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" /></button></div>
                </header>
                <div className="hbar-app-ui-file-manager-table-wrap" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                    <table className="hbar-app-ui-file-manager-drive-table">
                        <thead><tr><th><label className="hbar-app-ui-file-manager-select-all"><input type="checkbox" aria-label={content.labels.selectAll} checked={allVisibleSelected} onChange={(event) => {const next = event.currentTarget.checked; setSelectedRowIds((current) => new Set(next ? [...current, ...visibleRows.map((row) => row.id)] : [...current].filter((id) => !visibleRows.some((row) => row.id === id))))}} /><span>{content.labels.name}</span></label></th><th>{content.labels.size}</th><th>{content.labels.modified}</th><th>{content.labels.owner}</th><th>{content.labels.actions}</th></tr></thead>
                        <tbody>
                            {visibleRows.map((row) => <tr key={row.id} className={selectedRow?.id === row.id ? 'is-selected' : ''}>
                                <td><div className="hbar-app-ui-file-manager-row-select"><input type="checkbox" aria-label={content.labels.selectItem(row.name)} checked={selectedRowIds.has(row.id)} onChange={(event) => toggleSelectedRow(row.id, event.currentTarget.checked)} /><FileManagerIcon kind={row.kind} tier="xs" /><button type="button" className="hbar-app-ui-file-manager-drive-row-open" aria-label={row.kind === 'folder' ? content.labels.openFolder(row.name) : content.labels.openItem(row.name)} onClick={() => {setSelectedRowId(row.id); onAction?.({variantId: spec.id, actionId: 'open-item', value: row.id})}}><span>{row.name}</span>{row.detail && <small>{row.detail}</small>}</button><button type="button" aria-label={row.starred ? content.labels.unstarItem(row.name) : content.labels.starItem(row.name)} onClick={() => onAction?.({variantId: spec.id, actionId: row.starred ? 'unstar' : 'star', value: row.id})}><Star className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" /></button></div></td>
                                <td>{row.size}</td><td>{row.modified}</td><td><span className="hbar-app-ui-file-manager-owner">{row.owner.initials}</span><span>{row.owner.name}</span></td><td><button type="button" aria-label={content.labels.itemActions(row.name)} onClick={() => onAction?.({variantId: spec.id, actionId: 'item-actions', value: row.id})}><Ellipsis className="hbar-app-ui-file-manager-icon hbar-app-ui-icon-xs" aria-hidden="true" /></button></td>
                            </tr>)}
                        </tbody>
                    </table>
                    {!visibleRows.length && <p className="hbar-app-ui-file-manager-empty">{content.labels.empty}</p>}
                </div>
            </main>
        </div>
    </FileManagerFrame>
}
