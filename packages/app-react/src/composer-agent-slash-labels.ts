import type { AgentComposerState } from '@hbar/app-runtime'
import type { HbarComposerSlashLabels } from './composer-slash-menu'

/** Completion-only profile entries share one Host catalog across first-send and materialized Sessions. */
export function composerAgentSlashLabels(
  labels: HbarComposerSlashLabels,
  catalog: AgentComposerState['profileCatalog'],
): HbarComposerSlashLabels {
  const profiles =
    catalog.status === 'ready'
      ? catalog.profiles.map((profileId) => {
          const copy = labels.agentProfile(profileId)
          return {
            id: `agent ${profileId}` as const,
            label: copy.label,
            argumentHint: labels.agentTaskHint,
            description: copy.description,
          }
        })
      : []
  return {
    ...labels,
    commands: labels.commands.flatMap((item) => (item.id === 'agent' ? [item, ...profiles] : [item])),
  }
}
