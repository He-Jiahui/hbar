import { LumenContentText, LumenAppShell04, LumenFrame } from '@lumen/app-ui'

import { HbarSessionStopNotice } from './session-stop'

import './lumen-workspace-shell.css'
import './sidebar-entry-layout.css'
import './workspace-session-entry.css'
import './sidebar-navigation.css'

import type { HbarWorkspaceShellProps } from './workspace-shell-contract'
import { memo } from 'react'
export const WorkspaceToolRegion = memo(function WorkspaceToolRegion({
  props,
  toolFocusError,
}: {
  readonly props: HbarWorkspaceShellProps
  readonly toolFocusError: { readonly key: string; readonly code: string } | null
}) {
  const shellSlots = props.slots
  const toolRegion = shellSlots?.context ? (
    <LumenAppShell04 toolLabel={props.toolLabel} slots={{ context: shellSlots.context }} />
  ) : props.tool ? (
    <LumenAppShell04
      toolLabel={props.toolLabel}
      slots={{
        context: (
          <LumenFrame className="hbar-app-react-tool-content">
            {props.tool}
            <HbarSessionStopNotice region="tool" />
            {toolFocusError && (
              <LumenContentText context="feedback.message" role="alert" className="hbar-app-react-tool-focus-error">
                {props.labels.error(toolFocusError.code)}
              </LumenContentText>
            )}
          </LumenFrame>
        ),
      }}
    />
  ) : (
    props.tool
  )
  return toolRegion
})
