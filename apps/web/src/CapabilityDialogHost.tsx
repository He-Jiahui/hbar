import SessionCapabilityDialog from './SessionCapabilityDialog'
import { useSessionCapabilities } from './session-capabilities'

/** Lives outside layout engines so a viewport change cannot discard an open editor. */
export function CapabilityDialogHost() {
  const dialog = useSessionCapabilities((state) => state.dialog)
  return (
    dialog && (
      <SessionCapabilityDialog
        key={dialog.sessionId}
        sessionId={dialog.sessionId}
        initialTab={dialog.tab}
        onClose={() => useSessionCapabilities.getState().closeDialog()}
      />
    )
  )
}
