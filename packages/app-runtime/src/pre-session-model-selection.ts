import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import type { PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
import type { PreSessionModelCatalogState } from './pre-session-model-catalog'

export interface PreSessionModelSelection {
  readonly model: ModelDescriptor | null
  readonly unavailable: 'model' | 'thinking' | null
}

/** Catalog changes describe validity, never rewrite the user's explicit first-send choices. */
export function preSessionModelSelection(
  catalog: PreSessionModelCatalogState,
  draft: Pick<PreSessionDraftState, 'modelId' | 'thinkingLevel'> | undefined,
): PreSessionModelSelection {
  const model = catalog.models.find((value) => value.id === draft?.modelId) ?? null
  if (catalog.status !== 'ready' || !draft?.modelId) return { model, unavailable: null }
  if (!model) return { model, unavailable: 'model' }
  return {
    model,
    unavailable:
      draft.thinkingLevel !== null && !model.thinkingLevels.includes(draft.thinkingLevel) ? 'thinking' : null,
  }
}
