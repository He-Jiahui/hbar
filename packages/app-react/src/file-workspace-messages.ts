import { createMessageScope } from './messages'
import type { HbarFileChangesLabels } from './file-workspace-changes'
import type { HbarFileTreeLabels } from './file-workspace-tree'
import type { HbarFileWorkspaceLabels } from './lumen-file-workspace'

export const fileChangesMessages = createMessageScope<HbarFileChangesLabels>()
export const fileTreeMessages = createMessageScope<HbarFileTreeLabels>()
export const fileWorkspaceMessages = createMessageScope<HbarFileWorkspaceLabels>()
