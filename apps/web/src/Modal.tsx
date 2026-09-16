import type { ReactNode, RefObject } from 'react'
import { HbarAppUiDialog } from 'hbar-app-ui'
import { useLocale } from './locale'

export function Modal({
  title,
  onClose,
  children,
  initialFocus,
}: {
  readonly title: string
  readonly onClose: () => void
  readonly children: ReactNode
  readonly initialFocus?: RefObject<HTMLElement | null> | undefined
}) {
  const { t } = useLocale()
  return (
    <HbarAppUiDialog
      open
      title={title}
      closeLabel={t('dialogClose')}
      onClose={onClose}
      className="modal"
      initialFocus={initialFocus}
    >
      {children}
    </HbarAppUiDialog>
  )
}
