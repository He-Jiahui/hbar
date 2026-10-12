import type {
  LumenFileManagerAssetContent,
  LumenFileManagerDetailContent,
  LumenFileManagerDriveContent,
  LumenFileManagerUploadContent,
  LumenFileManagerUploadItem,
} from './file-manager'

export interface LumenFileManagerReferenceLabels {
  readonly unavailable: string
  readonly clearSelection: string
  readonly selected: (count: number) => string
  readonly viewGroup: string
  readonly filterGroup: string
  readonly breadcrumb: string
  readonly reopen: string
  readonly paused: string
  readonly cancelled: string
  readonly sortLabel: (field: string, descending: boolean) => string
  readonly progressLabel: (name: string) => string
  readonly selectedAction: (action: string, ids: readonly string[]) => string
  readonly clearSearch: string
  readonly nothingHere: string
  readonly emptySearch: (query: string, location: string) => string
  readonly fileSummary: (size: string, detail: string | undefined) => string
}
export interface LumenFileManagerReferenceFolderContents {
  readonly folderId: string
  readonly assets: LumenFileManagerAssetContent['assets']
}
interface ReferenceBase {
  readonly available: boolean
  readonly labels: LumenFileManagerReferenceLabels
  readonly notice?: string | undefined
  readonly onChange: (fieldId: string, value: string) => void
  readonly onAction: (actionId: string, value?: string) => void
}
export interface LumenFileManagerReferenceMenuAction {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}
export interface LumenFileManagerReferenceUpload extends Omit<LumenFileManagerUploadItem, 'state'> {
  readonly state: 'queued' | 'uploading' | 'uploaded' | 'failed' | 'paused' | 'cancelled'
}
export type LumenFileManagerReferenceContent =
  | (ReferenceBase & {
      readonly kind: 'drive'
      readonly content: LumenFileManagerDriveContent
      readonly locationId: string
      readonly folderId: string
      readonly folderLabel: string
      readonly query: string
      readonly view: 'list' | 'grid'
      readonly sortId: 'name' | 'size' | 'modified'
      readonly descending: boolean
      readonly selectedIds: readonly string[]
      readonly expandedIds: readonly string[]
      readonly focusedId: string
      readonly menuId: string
      readonly menuActions: readonly LumenFileManagerReferenceMenuAction[]
    })
  | (ReferenceBase & {
      readonly kind: 'assets'
      readonly content: LumenFileManagerAssetContent
      readonly filterId: 'all' | 'images' | 'video' | 'documents'
      readonly descending: boolean
      readonly selectedIds: readonly string[]
      readonly breadcrumbItems: readonly { readonly id: string; readonly label: string }[]
      readonly folderContents: readonly LumenFileManagerReferenceFolderContents[]
    })
  | (ReferenceBase & {
      readonly kind: 'detail'
      readonly content: LumenFileManagerDetailContent
      readonly detailAvailable: boolean
    })
  | (ReferenceBase & {
      readonly kind: 'upload'
      readonly content: LumenFileManagerUploadContent
      readonly items: readonly LumenFileManagerReferenceUpload[]
      readonly open: boolean
      readonly onFiles: (
        files: readonly { readonly name: string; readonly size: number; readonly type: string }[],
      ) => void
    })
