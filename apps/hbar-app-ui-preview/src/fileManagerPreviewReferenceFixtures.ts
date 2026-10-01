import type { LumenFileManagerReferenceContent as Content, LumenFileManagerReferenceLabels } from '@lumen/app-ui'
import { HBAR_APP_UI_FILE_MANAGER_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-file-manager-fixtures'

const labels: LumenFileManagerReferenceLabels = {
  unavailable: 'This reference does not include the selected folder, membership or complete file details.',
  clearSelection: 'Clear selection',
  selected: (count) => `${count} selected`,
  viewGroup: 'View mode',
  filterGroup: 'Filter by type',
  breadcrumb: 'Breadcrumb',
  reopen: 'Reopen uploader',
  paused: 'Paused',
  cancelled: 'Cancelled locally',
  sortLabel: (field, descending) => `Sort by ${field.toLocaleLowerCase()}, ${descending ? 'descending' : 'ascending'}`,
  progressLabel: (name) => `Upload progress for ${name}`,
  selectedAction: (action, ids) => `${action}: ${ids.join(', ')} requested only; no external files were changed.`,
  clearSearch: 'Clear search',
  nothingHere: 'Nothing here',
  emptySearch: (query, location) => `No files match “${query}” in ${location}.`,
  fileSummary: (size, detail) => `${size}${detail ? ` · ${detail}` : ''}`,
}
const common = {
  available: true,
  labels,
  onChange: (_field: string, _value: string) => {},
  onAction: (_action: string, _value?: string) => {},
}
export function createFileManagerPreviewReferenceContent(variant: number, mode = 'default'): Content {
  const { drive, assets, detail, upload } = HBAR_APP_UI_FILE_MANAGER_FIXTURES
  if (!drive || !assets || !detail || !upload) throw new Error('Expected complete file-manager preview content')
  let reference: Content
  switch (variant) {
    case 1:
      reference = {
        ...common,
        kind: 'drive',
        content: {
          ...drive,
          folders: [
            { id: 'my-drive', name: 'My Drive', expandable: true },
            { id: 'client', parentId: 'my-drive', name: 'Client Deliverables', expandable: true },
            { id: 'northwind', parentId: 'client', name: 'Northwind Rebrand' },
            { id: 'harbor', parentId: 'client', name: 'Harbor Coffee' },
            { id: 'brand-library-folder', parentId: 'my-drive', name: 'Brand Library', expandable: true },
            { id: 'spring-folder', parentId: 'my-drive', name: 'Spring Campaign', expandable: true },
            { id: 'studio-folder', parentId: 'my-drive', name: 'Studio Operations' },
          ],
          listStrategy: { kind: 'pane-scroll', expectedMaximum: 80 },
        },
        locationId: 'drive',
        folderId: 'my-drive',
        folderLabel: 'My Drive',
        query: '',
        view: 'list',
        sortId: 'name',
        descending: false,
        selectedIds: [],
        expandedIds: ['my-drive', 'client'],
        focusedId: '',
        menuId: '',
        menuActions: [
          { id: 'download', label: 'Download' },
          { id: 'share', label: 'Share' },
          { id: 'make-copy', label: 'Make a copy' },
        ],
      }
      break
    case 2:
      reference = {
        ...common,
        kind: 'assets',
        content: {
          ...assets,
          labels: { ...assets.labels, selectAsset: (name) => `Select ${name}` },
          assets: [
            { id: 'billboard', name: 'billboard-2400.png', kind: 'image', format: 'PNG', size: '12.4 MB' },
            { id: 'brief', name: 'campaign-brief.pdf', kind: 'document', format: 'PDF', size: '1.1 MB' },
            {
              id: 'hero-a',
              name: 'hero-still-a.png',
              kind: 'image',
              format: 'PNG',
              size: '4.2 MB',
              selectedByDefault: true,
            },
            { id: 'hero-b', name: 'hero-still-b.png', kind: 'image', format: 'PNG', size: '3.9 MB' },
            { id: 'press-kit', name: 'press-kit.zip', kind: 'archive', format: 'ZIP', size: '240.0 MB' },
            { id: 'sizzle', name: 'sizzle-30s.mp4', kind: 'video', format: 'MP4', size: '164.0 MB' },
            { id: 'storyboard', name: 'storyboard-v4.pdf', kind: 'document', format: 'PDF', size: '6.7 MB' },
            {
              id: 'teaser',
              name: 'teaser-15s.mp4',
              kind: 'video',
              format: 'MP4',
              size: '88.0 MB',
              selectedByDefault: true,
            },
          ],
          listStrategy: { kind: 'pane-scroll', expectedMaximum: 80 },
        },
        filterId: 'all',
        descending: false,
        selectedIds: ['hero-a', 'teaser'],
        breadcrumbItems: [
          { id: 'drive', label: 'Halcyon Drive' },
          { id: 'campaign', label: 'Spring Campaign' },
          { id: 'assets', label: 'Assets' },
        ],
        folderContents: [
          {
            folderId: 'key-art',
            assets: [
              { id: 'brief', name: 'campaign-brief.pdf', kind: 'document', format: 'PDF', size: '1.1 MB' },
              { id: 'hero-a', name: 'hero-still-a.png', kind: 'image', format: 'PNG', size: '4.2 MB' },
              { id: 'hero-b', name: 'hero-still-b.png', kind: 'image', format: 'PNG', size: '3.9 MB' },
            ],
          },
        ],
      }
      break
    case 3:
      reference = {
        ...common,
        kind: 'detail',
        content: {
          ...detail,
          items: detail.items.map((item) => (item.id === 'packaging-detail' ? { ...item, size: '9.8 MB' } : item)),
          listStrategy: { kind: 'pane-scroll', expectedMaximum: 80 },
        },
        detailAvailable: true,
      }
      break
    default:
      reference = {
        ...common,
        kind: 'upload',
        content: {
          ...upload,
          labels: { ...upload.labels, dismiss: 'Close uploader' },
          listStrategy: { kind: 'pane-scroll', expectedMaximum: 80 },
        },
        items: upload.items,
        open: true,
        onFiles: (_files) => {},
      }
      break
  }
  if (['empty', 'one', 'boundary', 'overflow'].includes(mode)) {
    const maximum = 80
    const count = mode === 'empty' ? 0 : mode === 'one' ? 1 : mode === 'boundary' ? maximum : maximum + 1
    if (reference.kind === 'drive') {
      const first = reference.content.rows[0]
      reference = {
        ...reference,
        content: {
          ...reference.content,
          rows: first
            ? Array.from({ length: count }, (_, index) => ({
                ...first,
                id: `capacity-file-${index}`,
                name: `Workspace file ${index + 1}.pdf`,
                kind: 'document',
                detail: undefined,
              }))
            : [],
        },
      }
    } else if (reference.kind === 'assets') {
      const first = reference.content.assets[0]
      reference = {
        ...reference,
        selectedIds: [],
        content: {
          ...reference.content,
          folders: [],
          assets: first
            ? Array.from({ length: count }, (_, index) => ({
                ...first,
                id: `capacity-asset-${index}`,
                name: `Workspace asset ${index + 1}.png`,
                selectedByDefault: false,
              }))
            : [],
        },
      }
    } else if (reference.kind === 'detail') {
      const first = reference.content.items[0]
      reference = {
        ...reference,
        content: {
          ...reference.content,
          activeItemId: count ? 'capacity-detail-0' : undefined,
          items: first
            ? Array.from({ length: count }, (_, index) => ({
                ...first,
                id: `capacity-detail-${index}`,
                name: `Workspace detail ${index + 1}.png`,
              }))
            : [],
        },
      }
    } else {
      const first = reference.items[0]
      const items = first
        ? Array.from({ length: count }, (_, index) => ({
            ...first,
            id: `capacity-upload-${index}`,
            name: `Workspace upload ${index + 1}.png`,
          }))
        : []
      reference = { ...reference, items }
    }
  }
  if (mode === 'localized' || mode === 'long') {
    const title = '工作区文件与协作材料 — 较长项目名称下的浏览、选择和本地队列'
    const localizedLabels: LumenFileManagerReferenceLabels = {
      ...labels,
      unavailable: '参考中未提供此文件夹、归属或完整文件详情。',
      clearSelection: '清除选择',
      selected: (count) => `已选择 ${count} 项`,
      reopen: '重新打开上传队列',
      paused: '已暂停',
      cancelled: '已在本地取消',
    }
    switch (reference.kind) {
      case 'drive':
        {
          const driveReference = reference
          reference = {
            ...driveReference,
            labels: localizedLabels,
            content: { ...driveReference.content, labels: { ...driveReference.content.labels, title } },
          }
        }
        break
      case 'assets':
        {
          const assetsReference = reference
          reference = {
            ...assetsReference,
            labels: localizedLabels,
            content: { ...assetsReference.content, labels: { ...assetsReference.content.labels, title } },
          }
        }
        break
      case 'detail':
        {
          const detailReference = reference
          reference = {
            ...detailReference,
            labels: localizedLabels,
            content: { ...detailReference.content, labels: { ...detailReference.content.labels, title } },
          }
        }
        break
      case 'upload':
        {
          const uploadReference = reference
          reference = {
            ...uploadReference,
            labels: localizedLabels,
            content: { ...uploadReference.content, labels: { ...uploadReference.content.labels, title } },
          }
        }
        break
      default:
        break
    }
  }
  return reference
}
export function fileManagerPreviewNotice(actionId: string, value?: string): string {
  return `${actionId}${value ? `: ${value}` : ''} requested only; no external files were changed.`
}
export function fileManagerBytes(value: string): number {
  const match = /([\d.]+)\s*(KB|MB|GB|TB|B)/i.exec(value)
  if (!match) return 0
  const amount = Number(match[1])
  const multipliers: Readonly<Record<string, number>> = {
    B: 1,
    KB: 1000,
    MB: 1000000,
    GB: 1000000000,
    TB: 1000000000000,
  }
  return Number.isFinite(amount) ? amount * (multipliers[match[2]?.toUpperCase() ?? 'B'] ?? 1) : 0
}
