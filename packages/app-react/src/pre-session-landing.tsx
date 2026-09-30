import { LumenFrame, LumenPromptComposer, type LumenPromptComposerProps, type LumenPromptLabels } from '@lumen/app-ui'
import { HbarSessionEmptyHero, type HbarSessionEmptyHeroLabels } from './session-empty-hero'
import { HbarComposerAttachmentDropTarget } from './composer-attachments'
import './lumen-session-workspace.css'
import './pre-session-landing.css'

export interface HbarPreSessionLandingLabels {
  readonly hero: HbarSessionEmptyHeroLabels
  readonly prompt: LumenPromptLabels
}

export interface HbarPreSessionLandingProps {
  readonly labels: HbarPreSessionLandingLabels
  /** The host owns the unsaved draft and all toolbar actions; this view owns only their layout. */
  readonly composer: Omit<LumenPromptComposerProps, 'boundary' | 'canStop' | 'labels' | 'onStop'>
  /** Optional file drop/paste intake, scoped to the composer rather than the whole landing page. */
  readonly attachmentDrop?: {
    readonly enabled: boolean
    readonly label: string
    readonly onAdd: (files: readonly File[]) => void
  }
}

/** The no-tab entry is a flowing page, not a simulated Host Session. */
export function HbarPreSessionLanding({ labels, composer, attachmentDrop }: HbarPreSessionLandingProps) {
  const prompt = (
    <LumenPromptComposer
      {...composer}
      labels={labels.prompt}
      boundary="none"
      canStop={false}
      onStop={() => undefined}
    />
  )
  return (
    <LumenFrame className="hbar-pre-session-landing">
      <LumenFrame className="hbar-pre-session-landing-main">
        <HbarSessionEmptyHero labels={labels.hero} headingAs="h1" />
      </LumenFrame>
      <LumenFrame className="hbar-pre-session-landing-footer">
        {attachmentDrop ? (
          <HbarComposerAttachmentDropTarget {...attachmentDrop}>{prompt}</HbarComposerAttachmentDropTarget>
        ) : (
          prompt
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
