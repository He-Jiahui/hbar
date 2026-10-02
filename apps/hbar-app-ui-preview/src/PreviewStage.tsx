import { LumenFrame, LumenNavigationButton, LumenText } from '@lumen/app-ui'
import { HBAR_APP_UI_CATEGORY_COUNTS, HbarAppUiStatus } from 'hbar-app-ui/catalog'
import type { PreviewWorkspaceCopy } from '../../../tests/fixtures/preview-workspace-copy'
import type { PreviewSceneProps } from './preview-scene-contract'
import { PREVIEW_VIEWPORTS, previewViewportWidths, type PreviewViewport } from './preview-workspace-store'
import { PreviewScene } from './PreviewScene'

export interface PreviewStageProps extends PreviewSceneProps {
  readonly viewport: PreviewViewport
  readonly copy: PreviewWorkspaceCopy
  readonly onViewport: (viewport: PreviewViewport) => void
}
export function PreviewToolbar({ selected, viewport, copy, onViewport }: Omit<PreviewStageProps, 'onAction'>) {
  return (
    <LumenFrame className="hbar-app-ui-preview-toolbar">
      <LumenFrame>
        <LumenText as="span" className="hbar-app-ui-preview-eyebrow">
          {copy.categoryName(selected.spec.category)}
        </LumenText>
        <LumenText as="h1">{selected.spec.title}</LumenText>
      </LumenFrame>
      <LumenFrame className="hbar-app-ui-preview-viewports" role="group" aria-label={copy.viewport}>
        {PREVIEW_VIEWPORTS.map((option) => (
          <LumenNavigationButton
            key={option}
            size="s"
            selected={viewport === option}
            indicatorEdge="bottom"
            onClick={() => onViewport(option)}
          >
            {copy.viewports[option]}
          </LumenNavigationButton>
        ))}
      </LumenFrame>
    </LumenFrame>
  )
}
export function PreviewStage({ selected, viewport, copy, onAction }: Omit<PreviewStageProps, 'onViewport'>) {
  return (
    <LumenFrame as="section" className="hbar-app-ui-preview-stage" aria-label={copy.stage}>
      <LumenFrame className="hbar-app-ui-preview-stage-meta">
        <HbarAppUiStatus
          value={copy.variantCount(selected.spec.variant, HBAR_APP_UI_CATEGORY_COUNTS[selected.spec.category])}
          tone="positive"
        />
        <LumenText as="code">{selected.spec.id}</LumenText>
      </LumenFrame>
      <LumenFrame
        className={`hbar-app-ui-preview-frame hbar-app-ui-preview-frame-${viewport}`}
        style={{ maxWidth: previewViewportWidths[viewport] }}
      >
        <LumenFrame
          className={`hbar-app-ui-preview-component-canvas hbar-app-ui-surface-${selected.spec.profile.surface} hbar-app-ui-state-${selected.spec.profile.initialState} hbar-app-ui-visual-${selected.spec.profile.visualMode}`}
          data-hbar-app-ui-variant={selected.spec.id}
          data-hbar-app-ui-profile={selected.spec.profile.key}
          data-hbar-app-ui-surface={selected.spec.profile.surface}
          data-hbar-app-ui-state={selected.spec.profile.initialState}
        >
          <PreviewScene selected={selected} onAction={onAction} />
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}
