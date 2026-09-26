import type { CommandTextPort, PlanProposalRequestText } from '@hbar/app-runtime'
import { getShellCopy, type ShellLocale } from './shell-copy'

export interface WebRuntimeCopyPort {
  readonly commandText: CommandTextPort
  readonly planProposal: { readonly requestText: PlanProposalRequestText }
}

/** Stable callbacks read current copy without disposing the runtime or storing translated domain data. */
export function createWebRuntimeCopy(readLocale: () => ShellLocale): WebRuntimeCopyPort {
  let locale = readLocale()
  let copy = getShellCopy(locale)
  const current = () => {
    const next = readLocale()
    if (next !== locale) {
      locale = next
      copy = getShellCopy(locale)
    }
    return copy
  }
  return {
    commandText: { resolve: (key) => current().commandPalette.resolve(key) },
    planProposal: { requestText: (input) => current().planProposal.requestText(input) },
  }
}
