import type { ReactNode } from 'react'
import { LumenFrame } from '@lumen/app-ui'
import { HbarSessionProjectContext, type HbarSessionProjectContextProps } from './session-project-context'

/** The host owns launch controls; confirmed project content uses the same public facts in both placements. */
export type HbarSessionWorkspaceContextContent =
  | { readonly kind: 'launch'; readonly slot: ReactNode }
  | { readonly kind: 'project'; readonly props: HbarSessionProjectContextProps }
  | { readonly kind: 'empty' }

export function HbarSessionWorkspaceContext({
  placement,
  content,
}: {
  readonly placement: 'toolbar' | 'below'
  readonly content: HbarSessionWorkspaceContextContent
}) {
  return (
    <LumenFrame
      className={
        placement === 'toolbar' ? 'hbar-session-project-context-toolbar' : 'hbar-session-project-context-below'
      }
    >
      {content.kind === 'launch' ? (
        content.slot
      ) : content.kind === 'project' ? (
        <HbarSessionProjectContext {...content.props} />
      ) : null}
    </LumenFrame>
  )
}
