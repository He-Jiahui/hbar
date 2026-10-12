import { LumenContentText, LumenButton, LumenFrame } from '@lumen/app-ui'
import { EXTENSION_PAGE_SIZE } from '@hbar/app-runtime'
import { extensionMessages } from './extension-messages'

export interface ExtensionPaginationLabels {
  readonly previous: string
  readonly next: string
  readonly page: (current: number, total: number, count: number) => string
}

export function ExtensionPagination({
  count,
  page,
  onPage,
}: {
  readonly count: number
  readonly page: number
  readonly onPage: (page: number) => void
}) {
  const { t } = extensionMessages.useMessages()
  const labels = t('pagination')
  const pages = Math.ceil(count / EXTENSION_PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <LumenFrame className="hbar-app-react-extension-pagination">
      <LumenContentText context="record.description" role="status">
        {labels.page(page + 1, pages, count)}
      </LumenContentText>
      <LumenButton variant="text" disabled={page === 0} onClick={() => onPage(page - 1)}>
        {labels.previous}
      </LumenButton>
      <LumenButton variant="text" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        {labels.next}
      </LumenButton>
    </LumenFrame>
  )
}
