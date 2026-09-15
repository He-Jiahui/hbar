import {createContext, useContext, type ReactNode} from 'react'

/** Hosts choose the capacity model for each file-oriented collection. */
export type HbarAppUiFileManagerListStrategy =
    | {readonly kind: 'content-grown'; readonly expectedMaximum: number}
    | {readonly kind: 'pane-scroll'; readonly expectedMaximum: number}

export type HbarAppUiFileKind = 'folder' | 'image' | 'document' | 'video' | 'archive' | 'file'

export interface HbarAppUiFileManagerFolder {
    readonly id: string
    readonly name: string
    readonly kind?: HbarAppUiFileKind | undefined
    readonly detail?: string | undefined
    readonly parentId?: string | undefined
    readonly expandable?: boolean | undefined
}

export interface HbarAppUiFileManagerOwner {
    readonly initials: string
    readonly name: string
}

export interface HbarAppUiFileManagerCollaborator extends HbarAppUiFileManagerOwner {
    readonly permission: string
}

export interface HbarAppUiFileManagerActivity {
    readonly id: string
    readonly text: string
}

export interface HbarAppUiFileManagerDriveRow {
    readonly id: string
    readonly name: string
    readonly kind: HbarAppUiFileKind
    readonly detail?: string | undefined
    readonly size: string
    readonly modified: string
    readonly owner: HbarAppUiFileManagerOwner
    readonly starred?: boolean | undefined
}

export interface HbarAppUiFileManagerDriveContent {
    readonly labels: {
        readonly title: string
        readonly description: string
        readonly newFolder: string
        readonly upload: string
        readonly myDrive: string
        readonly shared: string
        readonly recent: string
        readonly starred: string
        readonly bin: string
        readonly search: string
        readonly name: string
        readonly size: string
        readonly modified: string
        readonly owner: string
        readonly actions: string
        readonly storage: string
        readonly storageProgress: string
        readonly storageSummary: (used: string, total: string) => string
        readonly empty: string
        readonly collapseFolder: (name: string) => string
        readonly expandFolder: (name: string) => string
        readonly openFolder: (name: string) => string
        readonly openItem: (name: string) => string
        readonly itemActions: (name: string) => string
        readonly selectAll: string
        readonly selectItem: (name: string) => string
        readonly starItem: (name: string) => string
        readonly unstarItem: (name: string) => string
        readonly listView: string
        readonly gridView: string
    }
    readonly folders: readonly HbarAppUiFileManagerFolder[]
    readonly rows: readonly HbarAppUiFileManagerDriveRow[]
    readonly storageUsed: string
    readonly storageTotal: string
    readonly storagePercent: number
    readonly listStrategy: HbarAppUiFileManagerListStrategy
}

export interface HbarAppUiFileManagerAsset {
    readonly id: string
    readonly name: string
    readonly kind: HbarAppUiFileKind
    readonly format: string
    readonly size: string
    readonly selectedByDefault?: boolean | undefined
}

export interface HbarAppUiFileManagerAssetContent {
    readonly labels: {
        readonly breadcrumb: string
        readonly title: string
        readonly summary: string
        readonly folders: string
        readonly files: string
        readonly all: string
        readonly images: string
        readonly video: string
        readonly documents: string
        readonly sort: string
        readonly selected: (count: number) => string
        readonly share: string
        readonly delete: string
        readonly more: string
        readonly empty: string
        readonly selectAsset: (name: string) => string
        readonly assetSummary: (format: string, size: string) => string
    }
    readonly folders: readonly HbarAppUiFileManagerFolder[]
    readonly assets: readonly HbarAppUiFileManagerAsset[]
    readonly listStrategy: HbarAppUiFileManagerListStrategy
}

export interface HbarAppUiFileManagerMetadata {
    readonly id: string
    readonly label: string
    readonly value: string
}

export interface HbarAppUiFileManagerDetailItem {
    readonly id: string
    readonly name: string
    readonly kind: HbarAppUiFileKind
    readonly format: string
    readonly size: string
    readonly previewLabel: string
    readonly version: string
    readonly metadata: readonly HbarAppUiFileManagerMetadata[]
    readonly collaborators: readonly HbarAppUiFileManagerCollaborator[]
    readonly accessNotice: string
    readonly activity: readonly HbarAppUiFileManagerActivity[]
}

export interface HbarAppUiFileManagerDetailContent {
    readonly labels: {
        readonly title: string
        readonly summary: string
        readonly download: string
        readonly shareItem: (name: string) => string
        readonly details: string
        readonly sharedWith: string
        readonly activity: string
        readonly copyLink: string
        readonly makeCopy: string
        readonly openItem: (name: string) => string
        readonly itemSummary: (format: string, size: string) => string
        readonly previewSummary: (version: string, size: string) => string
        readonly empty: string
    }
    readonly items: readonly HbarAppUiFileManagerDetailItem[]
    readonly activeItemId?: string | undefined
    readonly listStrategy: HbarAppUiFileManagerListStrategy
}

export type HbarAppUiFileManagerUploadState = 'queued' | 'uploading' | 'uploaded' | 'failed'

export interface HbarAppUiFileManagerUploadItem {
    readonly id: string
    readonly name: string
    readonly kind: HbarAppUiFileKind
    readonly size: string
    readonly state: HbarAppUiFileManagerUploadState
    readonly progress: number
    readonly remaining?: string | undefined
    readonly statusDetail?: string | undefined
}

export interface HbarAppUiFileManagerUploadContent {
    readonly labels: {
        readonly title: string
        readonly summary: string
        readonly dismiss: string
        readonly dropTitle: string
        readonly dropDescription: string
        readonly queue: string
        readonly uploaded: string
        readonly uploading: string
        readonly failed: string
        readonly queued: string
        readonly cancelAll: string
        readonly clearCompleted: string
        readonly transferSummary: string
        readonly progress: (percent: number, remaining: string | undefined) => string
        readonly pause: (name: string) => string
        readonly start: (name: string) => string
        readonly retry: (name: string) => string
        readonly remove: (name: string) => string
        readonly empty: string
    }
    readonly items: readonly HbarAppUiFileManagerUploadItem[]
    readonly listStrategy: HbarAppUiFileManagerListStrategy
}

export interface HbarAppUiFileManagerContent {
    readonly drive?: HbarAppUiFileManagerDriveContent | undefined
    readonly assets?: HbarAppUiFileManagerAssetContent | undefined
    readonly detail?: HbarAppUiFileManagerDetailContent | undefined
    readonly upload?: HbarAppUiFileManagerUploadContent | undefined
}

export interface HbarAppUiFileManagerProviderProps {
    readonly content: HbarAppUiFileManagerContent
    readonly children: ReactNode
}

export function uniqueHbarAppUiFileManagerItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiFileManagerItem<T extends {readonly id: string}>(items: readonly T[], selectedId: string | undefined): T | undefined {
    return items.find((item) => item.id === selectedId) ?? items[0]
}

const fileManagerContentContext = createContext<HbarAppUiFileManagerContent | undefined>(undefined)

export function HbarAppUiFileManagerProvider({content, children}: HbarAppUiFileManagerProviderProps) {
    return <fileManagerContentContext.Provider value={content}>{children}</fileManagerContentContext.Provider>
}

export function useHbarAppUiFileManagerContent(): HbarAppUiFileManagerContent | undefined {
    return useContext(fileManagerContentContext)
}
