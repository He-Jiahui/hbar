import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
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
      <LumenFrame as="header" className="hbar-web-global-page-header">
        <LumenButton variant="text" size="s" indicator="none" onClick={onBack}>
          <LumenIcon icon={ArrowLeft} tier="sm" />
          <LumenContentText context="control.label">{backLabel}</LumenContentText>
        </LumenButton>
        <LumenContentText context="workspace.title">{title}</LumenContentText>
      </LumenFrame>
      <LumenFrame className="hbar-web-global-page-body">{children}</LumenFrame>
    </LumenFrame>
  )
}
