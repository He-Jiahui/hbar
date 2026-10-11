import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon, LumenPageHeader } from '@lumen/app-ui'
import type { GlobalFeaturePageId } from './global-feature-copy'
import './GlobalFeaturePage.css'

export interface GlobalFeaturePageProps {
  readonly pageId: GlobalFeaturePageId
  readonly title: string
  readonly backLabel: string
  readonly onBack: () => void
  readonly children: ReactNode
}

/** The main workspace owns global pages; session tools keep their separate outlet. */
export function GlobalFeaturePage({ pageId, title, backLabel, onBack, children }: GlobalFeaturePageProps) {
  return (
    <LumenFrame className="hbar-web-global-page" data-global-page={pageId}>
      <LumenPageHeader
        layout="page"
        title={title}
        className="hbar-web-global-page-header"
        leading={
          <LumenButton variant="text" size="s" indicator="none" onClick={onBack}>
            <LumenIcon icon={ArrowLeft} tier="sm" />
            <LumenContentText context="control.label">{backLabel}</LumenContentText>
          </LumenButton>
        }
      />
      <LumenFrame className="hbar-web-global-page-body">{children}</LumenFrame>
    </LumenFrame>
  )
}
