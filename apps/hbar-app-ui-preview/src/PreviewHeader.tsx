import { LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { HbarAppUiIconButton } from 'hbar-app-ui/catalog'
import { Maximize2, Moon, RotateCcw, Sun } from 'lucide-react'
import type { PreviewWorkspaceCopy } from '../../../tests/fixtures/preview-workspace-copy'
import type { PreviewTheme } from './preview-workspace-store'

export interface PreviewHeaderProps {
  readonly theme: PreviewTheme
  readonly fullscreen: boolean
  readonly fullscreenError: boolean
  readonly copy: PreviewWorkspaceCopy
  readonly onTheme: () => void
  readonly onReset: () => void
  readonly onFullscreen: () => void
}
export function PreviewHeader({
  theme,
  fullscreen,
  fullscreenError,
  copy,
  onTheme,
  onReset,
  onFullscreen,
}: PreviewHeaderProps) {
  return (
    <LumenFrame as="header" className="hbar-app-ui-preview-header">
      <LumenFrame className="hbar-app-ui-preview-brand">
        <LumenText as="span" className="hbar-app-ui-preview-mark">
          {copy.mark}
        </LumenText>
        <LumenFrame>
          <LumenText as="strong">{copy.brand}</LumenText>
          <LumenText as="small">{copy.catalog}</LumenText>
        </LumenFrame>
      </LumenFrame>
      <LumenFrame className="hbar-app-ui-preview-header-actions">
        {fullscreenError && (
          <LumenText as="small" role="alert">
            {copy.fullscreenError}
          </LumenText>
        )}
        <HbarAppUiIconButton label={theme === 'dark' ? copy.lightTheme : copy.darkTheme} onClick={onTheme}>
          <LumenIcon icon={theme === 'dark' ? Sun : Moon} tier="sm" />
        </HbarAppUiIconButton>
        <HbarAppUiIconButton label={copy.reset} onClick={onReset}>
          <LumenIcon icon={RotateCcw} tier="sm" />
        </HbarAppUiIconButton>
        <HbarAppUiIconButton label={fullscreen ? copy.exitFullscreen : copy.enterFullscreen} onClick={onFullscreen}>
          <LumenIcon icon={Maximize2} tier="sm" />
        </HbarAppUiIconButton>
      </LumenFrame>
    </LumenFrame>
  )
}
