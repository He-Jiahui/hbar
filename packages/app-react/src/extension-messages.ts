import { createMessageScope } from './messages'
import type { HbarExtensionWorkspaceLabels } from './extension-workspace'

export const extensionMessages = createMessageScope<HbarExtensionWorkspaceLabels>()
