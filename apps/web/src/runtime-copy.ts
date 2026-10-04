import type { CommandTextPort, PlanProposalRequestText } from '@hbar/app-runtime'
import { getShellCopy, type ShellLocale } from './shell-copy'

export interface WebRuntimeCopyPort {
  readonly commandText: CommandTextPort
  readonly planProposal: { readonly requestText: PlanProposalRequestText }
  readonly refresh: () => void
}

/** Stable callbacks read current copy without disposing the runtime or storing translated domain data. */
export function createWebRuntimeCopy(readLocale: () => ShellLocale): WebRuntimeCopyPort {
  let locale = readLocale()
  let publishedLocale = locale
  let copy = getShellCopy(locale)
  const listeners = new Set<() => void>()
  const current = () => {
    const next = readLocale()
    if (next !== locale) {
      locale = next
      copy = getShellCopy(locale)
    }
    return copy
  }
  return {
    commandText: {
      resolve: (key) => current().commandPalette.resolve(key),
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    planProposal: { requestText: (input) => current().planProposal.requestText(input) },
    refresh() {
      const next = readLocale()
      if (next === publishedLocale) return
      publishedLocale = next
      current()
      for (const listener of [...listeners]) listener()
    },
  }
}
