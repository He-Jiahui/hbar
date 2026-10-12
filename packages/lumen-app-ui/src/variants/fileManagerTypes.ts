export interface FileManagerCopy {
  title: string
  detail: string
  empty: string
}

export interface FileManagerItem {
  id: string
  name: string
  kind: 'file' | 'folder'
  description: string
  updated: string
}

export interface FileManagerOption {
  id: string
  label: string
}

export interface HbarAppUiFileManager01Props {
  copy: FileManagerCopy & {
    search: string
    folders: string
    suggested: string
    files: string
    storage: (used: string, total: string) => string
    upload: string
  }
  content: {
    id: string
    folders: readonly FileManagerOption[]
    suggested: readonly FileManagerItem[]
    files: readonly FileManagerItem[]
    storage: { used: string; total: string; percent: number }
    accept: string
  }
  state: { folderId: string | null; selectedId: string | null; query: string }
  actions: {
    onFolder: (driveId: string, folderId: string) => void
    onFile: (driveId: string, fileId: string) => void
    onQuery: (driveId: string, value: string) => void
    onUpload: (driveId: string, files: readonly File[]) => void
  }
}

export interface HbarAppUiFileManager02Props {
  copy: FileManagerCopy & { filter: string; selection: (count: number) => string; open: string }
  content: {
    id: string
    breadcrumbs: readonly FileManagerOption[]
    filters: readonly FileManagerOption[]
    assets: readonly FileManagerItem[]
  }
  state: { filterId: string | null; selectedIds: readonly string[] }
  actions: {
    onBreadcrumb: (libraryId: string, breadcrumbId: string) => void
    onFilter: (libraryId: string, filterId: string) => void
    onSelect: (libraryId: string, assetId: string) => void
    onOpen: (libraryId: string, assetId: string) => void
  }
}

export interface FileManagerDetailItem extends FileManagerItem {
  preview: string
  metadata: readonly { id: string; label: string; value: string }[]
  collaborators: readonly FileManagerOption[]
  activity: readonly { id: string; text: string }[]
}

export interface HbarAppUiFileManager03Props {
  copy: FileManagerCopy & {
    files: string
    preview: string
    metadata: string
    collaborators: string
    activity: string
    share: string
    download: string
    retry: string
  }
  content: { id: string; files: readonly FileManagerDetailItem[] }
  state: { selectedId: string | null; busy: boolean; error: string | null }
  actions: {
    onSelect: (browserId: string, fileId: string) => void
    onShare: (browserId: string, fileId: string) => void
    onDownload: (browserId: string, fileId: string) => void
    onRetry: (browserId: string, fileId: string) => void
  }
}

export interface FileManagerTransfer {
  id: string
  name: string
  progress: number
  status: 'queued' | 'uploading' | 'ready' | 'failed' | 'cancelled'
}

export interface HbarAppUiFileManager04Props {
  copy: FileManagerCopy & {
    drop: string
    release: string
    choose: string
    summary: (finished: number, total: number) => string
    retry: (name: string) => string
    cancel: (name: string) => string
    progress: (name: string, value: number) => string
    percentage: (value: number) => string
    status: Record<FileManagerTransfer['status'], string>
  }
  content: {
    id: string
    accept: string
    multiple: boolean
    transfers: readonly FileManagerTransfer[]
  }
  actions: {
    onUpload: (queueId: string, files: readonly File[], origin: 'drop' | 'picker') => void
    onRetry: (queueId: string, transferId: string) => void
    onCancel: (queueId: string, transferId: string) => void
  }
}
