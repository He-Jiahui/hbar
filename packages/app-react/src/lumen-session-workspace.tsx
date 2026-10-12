import type { HbarSessionWorkspaceProps } from './session-workspace-contract'

import { useHbarRuntime, useHbarRuntimeSelector, useHbarRuntimeState } from './runtime'
import { HbarSessionImageLayer } from './session-images'

import { HbarDeletedSessionWorkspace } from './deleted-session-workspace'

import './lumen-session-workspace.css'

import { SessionWorkspaceHistory } from './session-workspace-history'
export type { HbarSessionWorkspaceProps, HbarSessionWorkspaceLabels } from './session-workspace-contract'
export type { HbarSessionAttachmentSelection } from './composer-attachment-input'
export { awaitComposerWrites } from './session-composer-writes'
export function HbarSessionWorkspace(props: HbarSessionWorkspaceProps) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const deletedId = useHbarRuntimeSelector(runtime.state.directory, (directory) =>
    navigation.sessionId && directory.deletedSessions?.[navigation.sessionId] ? navigation.sessionId : null,
  )
  return (
    <HbarSessionImageLayer options={props.images}>
      {deletedId ? (
        <HbarDeletedSessionWorkspace key={deletedId} {...props} sessionId={deletedId} />
      ) : (
        <SessionWorkspaceHistory {...props} />
      )}
    </HbarSessionImageLayer>
  )
}
