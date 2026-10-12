import { useMemo } from 'react'
import type { HbarSessionWorkspaceProps } from './session-workspace-contract'

import { useHbarRuntime, useHbarRuntimeSelector, useHbarRuntimeState } from './runtime'
import { HbarSessionImageLayer } from './session-images'

import { HbarDeletedSessionWorkspace } from './deleted-session-workspace'
import {
  SessionComposerMessagesProvider,
  SessionHeaderMessagesProvider,
  SessionHistoryMessagesProvider,
  sessionComposerMessages,
  sessionHeaderMessages,
  sessionHistoryMessages,
} from './session-workspace-messages'

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
  const { labels, ...sessionProps } = props
  const headerMessages = useMemo(() => sessionHeaderMessages(labels), [labels])
  const historyMessages = useMemo(() => sessionHistoryMessages(labels), [labels])
  const composerMessages = useMemo(() => sessionComposerMessages(labels), [labels])
  const content = deletedId ? (
    <HbarDeletedSessionWorkspace key={deletedId} {...props} sessionId={deletedId} />
  ) : (
    <SessionHeaderMessagesProvider messages={headerMessages}>
      <SessionWorkspaceHistory {...sessionProps} />
    </SessionHeaderMessagesProvider>
  )
  return (
    <HbarSessionImageLayer options={props.images}>
      <SessionHistoryMessagesProvider messages={historyMessages}>
        <SessionComposerMessagesProvider messages={composerMessages}>{content}</SessionComposerMessagesProvider>
      </SessionHistoryMessagesProvider>
    </HbarSessionImageLayer>
  )
}
