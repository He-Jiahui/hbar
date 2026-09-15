import type {HbarAppUiFileManagerContent, HbarAppUiFileManagerDriveRow, HbarAppUiFileManagerUploadItem} from '../../packages/hbar-app-ui/src/index'

const driveRows: readonly HbarAppUiFileManagerDriveRow[] = [
    {id: 'brand-library', name: 'Brand Library', kind: 'folder', detail: '8 items', size: '102.2 MB', modified: 'Last week', owner: {initials: 'TP', name: 'Theo Park'}},
    {id: 'brand-tokens', name: 'brand-tokens.json', kind: 'file', size: '64.0 KB', modified: 'Last week', owner: {initials: 'KT', name: 'Kenji Tan'}},
    {id: 'client-deliverables', name: 'Client Deliverables', kind: 'folder', detail: '11 items', size: '482.2 MB', modified: 'Yesterday', owner: {initials: 'PP', name: 'Priya Patel'}, starred: true},
    {id: 'harbor-menu', name: 'Harbor menu board.pdf', kind: 'document', size: '5.4 MB', modified: '2 days ago', owner: {initials: 'MS', name: 'Mira Stone'}},
    {id: 'onboarding', name: 'New Hire Onboarding.pdf', kind: 'document', size: '16.0 MB', modified: '3 weeks ago', owner: {initials: 'MS', name: 'Mira Stone'}},
    {id: 'northwind-key-visual', name: 'Northwind key visual.png', kind: 'image', size: '12.4 MB', modified: 'Today', owner: {initials: 'PP', name: 'Priya Patel'}},
    {id: 'studio-plan', name: 'Q3 Studio Plan.pdf', kind: 'document', size: '11.0 MB', modified: 'Today', owner: {initials: 'NV', name: 'Nora Vale'}, starred: true},
    {id: 'specimen', name: 'specimen-grotesk.pdf', kind: 'document', size: '3.1 MB', modified: 'Yesterday', owner: {initials: 'KT', name: 'Kenji Tan'}},
    {id: 'spring-campaign', name: 'Spring Campaign', kind: 'folder', detail: '10 items', size: '988.2 MB', modified: 'Today', owner: {initials: 'LG', name: 'Leo Grant'}, starred: true},
    {id: 'studio-operations', name: 'Studio Operations', kind: 'folder', detail: '4 items', size: '246.0 MB', modified: '2 days ago', owner: {initials: 'NV', name: 'Nora Vale'}},
    {id: 'studio-reel', name: 'Studio Reel 2026.mp4', kind: 'video', size: '64.0 MB', modified: 'Today', owner: {initials: 'LG', name: 'Leo Grant'}},
    {id: 'wordmark', name: 'wordmark-lockup.png', kind: 'image', size: '2.8 MB', modified: 'Last week', owner: {initials: 'TP', name: 'Theo Park'}},
]

const uploadItems: readonly HbarAppUiFileManagerUploadItem[] = [
    {id: 'hero-still', name: 'hero-still-a.png', kind: 'image', size: '4.2 MB', state: 'uploaded', progress: 100},
    {id: 'campaign-brief', name: 'campaign-brief.pdf', kind: 'document', size: '1.1 MB', state: 'uploaded', progress: 100},
    {id: 'sizzle', name: 'sizzle-30s.mp4', kind: 'video', size: '164.0 MB', state: 'uploading', progress: 62, remaining: '23 s left'},
    {id: 'press-kit', name: 'press-kit.zip', kind: 'archive', size: '240.0 MB', state: 'queued', progress: 0},
    {id: 'billboard-upload', name: 'billboard-2400.png', kind: 'image', size: '12.4 MB', state: 'failed', progress: 0, statusDetail: 'Connection lost'},
]

export const HBAR_APP_UI_FILE_MANAGER_FIXTURES: HbarAppUiFileManagerContent = {
    drive: {
        labels: {title: 'Halcyon Drive', description: 'Shared studio files and folders', newFolder: 'New folder', upload: 'Upload', myDrive: 'My Drive', shared: 'Shared with me', recent: 'Recent', starred: 'Starred', bin: 'Bin', search: 'Search files', name: 'Name', size: 'Size', modified: 'Modified', owner: 'Owner', actions: 'Actions', storage: 'Storage', storageProgress: '88% full', storageSummary: (used, total) => `${used} of ${total} used`, empty: 'No files match this search.', collapseFolder: (name) => `Collapse ${name}`, expandFolder: (name) => `Expand ${name}`, openFolder: (name) => `Open ${name}`, openItem: (name) => `Open ${name}`, itemActions: (name) => `Actions for ${name}`, selectAll: 'Select all files', selectItem: (name) => `Select ${name}`, starItem: (name) => `Star ${name}`, unstarItem: (name) => `Unstar ${name}`, listView: 'List view', gridView: 'Grid view'},
        folders: [{id: 'my-drive', name: 'My Drive', kind: 'folder', expandable: true}, {id: 'client', name: 'Client Deliverables', kind: 'folder', expandable: true}, {id: 'northwind', name: 'Northwind Rebrand', kind: 'folder', parentId: 'client'}, {id: 'harbor', name: 'Harbor Coffee', kind: 'folder', parentId: 'client'}, {id: 'brand-library-folder', name: 'Brand Library', kind: 'folder'}, {id: 'spring-folder', name: 'Spring Campaign', kind: 'folder', expandable: true}, {id: 'studio-folder', name: 'Studio Operations', kind: 'folder'}],
        rows: driveRows,
        storageUsed: '1.77 TB',
        storageTotal: '2.00 TB',
        storagePercent: 88,
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 24},
    },
    assets: {
        labels: {breadcrumb: 'Halcyon Drive / Spring Campaign / Assets', title: 'Assets', summary: '3 folders · 8 files · 520.3 MB', folders: 'Folders', files: 'Files', all: 'All', images: 'Images', video: 'Video', documents: 'Documents', sort: 'Name', selected: (count) => `${count} selected`, share: 'Share', delete: 'Delete', more: 'More', empty: 'No assets match this filter.', selectAsset: (name) => `Select ${name}`, assetSummary: (format, size) => `${format} · ${size}`},
        folders: [{id: 'key-art', name: 'Key art', kind: 'folder', detail: '3 items'}, {id: 'social', name: 'Social cutdowns', kind: 'folder', detail: '2 items'}, {id: 'print', name: 'Print exports', kind: 'folder', detail: '3 items'}],
        assets: [{id: 'billboard', name: 'billboard-2400.png', kind: 'image', format: 'PNG', size: '12.4 MB', selectedByDefault: true}, {id: 'brief', name: 'campaign-brief.pdf', kind: 'document', format: 'PDF', size: '1.1 MB', selectedByDefault: true}, {id: 'hero-a', name: 'hero-still-a.png', kind: 'image', format: 'PNG', size: '4.2 MB'}, {id: 'hero-b', name: 'hero-still-b.png', kind: 'image', format: 'PNG', size: '3.8 MB'}, {id: 'launch', name: 'launch-cut.mp4', kind: 'video', format: 'MP4', size: '42.0 MB'}, {id: 'packaging', name: 'packaging-notes.pdf', kind: 'document', format: 'PDF', size: '860 KB'}, {id: 'social-pack', name: 'social-pack.zip', kind: 'archive', format: 'ZIP', size: '6.1 MB'}, {id: 'logo-motion', name: 'wordmark-motion.mp4', kind: 'video', format: 'MP4', size: '18.3 MB'}],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 24},
    },
    detail: {
        labels: {title: 'Client Deliverables', summary: '5 files · 1.24 GB', download: 'Download', shareItem: (name) => `Share ${name}`, details: 'Details', sharedWith: 'Shared with', activity: 'Activity', copyLink: 'Copy link', makeCopy: 'Make a copy', openItem: (name) => `Open ${name}`, itemSummary: (format, size) => `${format} · ${size}`, previewSummary: (version, size) => `${version} · ${size}`, empty: 'No deliverable is available.'},
        items: [{id: 'northwind-visual', name: 'Northwind key visual.png', kind: 'image', format: 'PNG', size: '12.4 MB', previewLabel: 'Northwind key visual.png', version: 'Version 4', metadata: [{id: 'type', label: 'Type', value: 'PNG image'}, {id: 'size', label: 'Size', value: '12.4 MB'}, {id: 'dimensions', label: 'Dimensions', value: '4000 × 2500'}, {id: 'owner', label: 'Owner', value: 'Priya Patel'}, {id: 'modified', label: 'Modified', value: 'Today, 09:24'}, {id: 'location', label: 'Location', value: 'Client Deliverables'}], collaborators: [{initials: 'PP', name: 'Priya Patel', permission: 'Owner'}, {initials: 'TP', name: 'Theo Park', permission: 'Can edit'}, {initials: 'NV', name: 'Nora Vale', permission: 'Can view'}], accessNotice: 'Restricted to invited people', activity: [{id: 'uploaded', text: 'Priya Patel uploaded version 4 · Today'}, {id: 'comment', text: 'Theo Park left a comment · Yesterday'}, {id: 'shared', text: 'Nora Vale shared with the studio · Tue'}]}, {id: 'guidelines', name: 'Brand guidelines.pdf', kind: 'document', format: 'PDF', size: '8.1 MB', previewLabel: 'Brand guidelines.pdf', version: 'Version 2', metadata: [{id: 'type', label: 'Type', value: 'PDF document'}], collaborators: [{initials: 'PP', name: 'Priya Patel', permission: 'Owner'}], accessNotice: 'Restricted to invited people', activity: []}, {id: 'film', name: 'Launch film master.mp4', kind: 'video', format: 'MP4', size: '1.2 GB', previewLabel: 'Launch film master.mp4', version: 'Version 1', metadata: [{id: 'type', label: 'Type', value: 'Video'}], collaborators: [{initials: 'MS', name: 'Mira Stone', permission: 'Owner'}], accessNotice: 'Restricted to invited people', activity: []}, {id: 'specimen-detail', name: 'Typography specimen.pdf', kind: 'document', format: 'PDF', size: '2.6 MB', previewLabel: 'Typography specimen.pdf', version: 'Version 1', metadata: [{id: 'type', label: 'Type', value: 'PDF document'}], collaborators: [{initials: 'KT', name: 'Kenji Tan', permission: 'Owner'}], accessNotice: 'Restricted to invited people', activity: []}, {id: 'packaging-detail', name: 'Packaging mock.png', kind: 'image', format: 'PNG', size: '8.8 MB', previewLabel: 'Packaging mock.png', version: 'Version 3', metadata: [{id: 'type', label: 'Type', value: 'PNG image'}], collaborators: [{initials: 'NV', name: 'Nora Vale', permission: 'Owner'}], accessNotice: 'Restricted to invited people', activity: []}],
        activeItemId: 'northwind-visual',
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 18},
    },
    upload: {
        labels: {title: 'Upload to Spring Campaign', summary: '2 of 5 complete · 421.7 MB total', dismiss: 'Dismiss upload dialog', dropTitle: 'Drop files here or click to browse', dropDescription: 'Up to 2 GB per file. Images, video, PDF and archives.', queue: 'Queue', uploaded: 'Uploaded', uploading: 'Uploading', failed: 'Failed', queued: 'Waiting', cancelAll: 'Cancel all', clearCompleted: 'Clear completed', transferSummary: '111.2 MB of 421.7 MB transferred', progress: (percent, remaining) => `${percent}%${remaining ? ` · ${remaining}` : ''}`, pause: (name) => `Pause ${name}`, start: (name) => `Start ${name}`, retry: (name) => `Retry ${name}`, remove: (name) => `Remove ${name}`, empty: 'The upload queue is empty.'},
        items: uploadItems,
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 16},
    },
}

export function createHbarAppUiFileManagerOverflowFixtures(): HbarAppUiFileManagerContent {
    const base = HBAR_APP_UI_FILE_MANAGER_FIXTURES
    const additionalRows = Array.from({length: 28}, (_, index) => ({id: `overflow-row-${index}`, name: `Additional asset ${index + 1}.pdf`, kind: 'document' as const, size: '1.0 MB', modified: 'Today', owner: {initials: 'AD', name: `Additional designer ${index + 1}`}}))
    const additionalAssets = Array.from({length: 32}, (_, index) => ({id: `overflow-asset-${index}`, name: `Additional visual ${index + 1}.png`, kind: 'image' as const, format: 'PNG', size: '1.2 MB'}))
    const additionalUploads = Array.from({length: 24}, (_, index) => ({id: `overflow-upload-${index}`, name: `Additional upload ${index + 1}.zip`, kind: 'archive' as const, size: '24 MB', state: 'queued' as const, progress: 0}))
    return {
        ...base,
        drive: base.drive && {...base.drive, rows: [...base.drive.rows, ...additionalRows]},
        assets: base.assets && {...base.assets, assets: [...base.assets.assets, ...additionalAssets]},
        detail: base.detail && {...base.detail, items: [...base.detail.items, ...Array.from({length: 20}, (_, index) => ({id: `overflow-detail-${index}`, name: `Additional detail ${index + 1}.pdf`, kind: 'document' as const, format: 'PDF', size: '900 KB', previewLabel: `Additional detail ${index + 1}.pdf`, version: 'Version 1', metadata: [], collaborators: [], accessNotice: 'Restricted to invited people', activity: []}))]},
        upload: base.upload && {...base.upload, items: [...base.upload.items, ...additionalUploads]},
    }
}

export function createHbarAppUiFileManagerLocalizedFixtures(): HbarAppUiFileManagerContent {
    const base = HBAR_APP_UI_FILE_MANAGER_FIXTURES
    return {
        ...base,
        drive: base.drive && {...base.drive, labels: {...base.drive.labels, title: 'Halcyon-Dateiablage', description: 'Geteilte Studio-Dateien und Ordner', newFolder: 'Neuer Ordner', upload: 'Hochladen', myDrive: 'Meine Ablage', shared: 'Mit mir geteilt', recent: 'Zuletzt verwendet', starred: 'Markiert', bin: 'Papierkorb', search: 'Dateien durchsuchen', name: 'Name', size: 'Größe', modified: 'Geändert', owner: 'Besitzer', actions: 'Aktionen', storage: 'Speicher', storageProgress: '88% belegt', storageSummary: (used, total) => `${used} von ${total} verwendet`, empty: 'Keine Dateien entsprechen dieser Suche.', collapseFolder: (name) => `${name} einklappen`, expandFolder: (name) => `${name} ausklappen`, openFolder: (name) => `${name} öffnen`, openItem: (name) => `${name} öffnen`, itemActions: (name) => `Aktionen für ${name}`, selectAll: 'Alle Dateien auswählen', selectItem: (name) => `${name} auswählen`, starItem: (name) => `${name} markieren`, unstarItem: (name) => `Markierung für ${name} entfernen`, listView: 'Listenansicht', gridView: 'Rasteransicht'}},
        assets: base.assets && {...base.assets, labels: {...base.assets.labels, breadcrumb: 'Halcyon-Dateiablage / Frühlingskampagne / Materialien', title: 'Materialien', summary: '3 Ordner · 8 Dateien · 520,3 MB', folders: 'Ordner', files: 'Dateien', images: 'Bilder', video: 'Video', documents: 'Dokumente', sort: 'Name', selected: (count) => `${count} ausgewählt`, share: 'Teilen', delete: 'Löschen', more: 'Mehr', empty: 'Keine Materialien entsprechen diesem Filter.', selectAsset: (name) => `${name} auswählen`, assetSummary: (format, size) => `${format} · ${size}`}},
        detail: base.detail && {...base.detail, labels: {...base.detail.labels, title: 'Kundenlieferungen', summary: '5 Dateien · 1,24 GB', download: 'Herunterladen', shareItem: (name) => `${name} teilen`, details: 'Details', sharedWith: 'Geteilt mit', activity: 'Aktivität', copyLink: 'Link kopieren', makeCopy: 'Kopie erstellen', openItem: (name) => `${name} öffnen`, itemSummary: (format, size) => `${format} · ${size}`, previewSummary: (version, size) => `${version} · ${size}`, empty: 'Keine Lieferung ist verfügbar.'}},
        upload: base.upload && {...base.upload, labels: {...base.upload.labels, title: 'In Frühlingskampagne hochladen', summary: '2 von 5 abgeschlossen · 421,7 MB gesamt', dismiss: 'Upload-Dialog schließen', dropTitle: 'Dateien hier ablegen oder zum Durchsuchen klicken', dropDescription: 'Bis zu 2 GB je Datei. Bilder, Videos, PDF und Archive.', queue: 'Warteschlange', uploaded: 'Hochgeladen', uploading: 'Wird hochgeladen', failed: 'Fehlgeschlagen', queued: 'Wartend', cancelAll: 'Alle abbrechen', clearCompleted: 'Abgeschlossene entfernen', transferSummary: '111,2 MB von 421,7 MB übertragen', progress: (percent, remaining) => `${percent}%${remaining ? ` · ${remaining}` : ''}`, pause: (name) => `${name} pausieren`, start: (name) => `${name} starten`, retry: (name) => `${name} erneut versuchen`, remove: (name) => `${name} entfernen`, empty: 'Die Upload-Warteschlange ist leer.'}},
    }
}
