import { workspaceFilePageSchema } from '@hbar/contracts/commands/files'
import { workspaceFindResultSchema } from '@hbar/contracts/workspace-query'

/** Validate untrusted Host results before they enter the composer suggestion state. */
export const parseComposerFilePage = (value: unknown) => workspaceFilePageSchema.parse(value)
export const parseComposerPathSearch = (value: unknown) => workspaceFindResultSchema.parse(value)
