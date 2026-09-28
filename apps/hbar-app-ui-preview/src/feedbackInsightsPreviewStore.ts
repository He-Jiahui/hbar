import { createStore } from 'zustand/vanilla'
import type { HbarAppUiFeedbackInsightsReferenceContent } from 'hbar-app-ui/catalog'
import {
  selectHbarAppUiFeedbackInsightsReferencePeriod,
  uniqueHbarAppUiFeedbackInsightsReferencePeriods,
} from 'hbar-app-ui/catalog'

type Insights = HbarAppUiFeedbackInsightsReferenceContent

function projection(content: Insights | undefined) {
  const periods = uniqueHbarAppUiFeedbackInsightsReferencePeriods(content?.periods ?? [])
  return {
    reportId: content?.reportId,
    periods,
    selectedPeriodId: selectHbarAppUiFeedbackInsightsReferencePeriod(periods, content?.initialPeriodId)?.id,
  }
}

interface InsightsState extends ReturnType<typeof projection> {
  readonly reset: (content: Insights | undefined) => void
  readonly selectPeriod: (reportId: string, periodId: string) => void
}

/** The selected reporting window belongs to this host-owned preview store. */
export function createFeedbackInsightsPreviewStore(content: Insights | undefined) {
  return createStore<InsightsState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    selectPeriod: (reportId, periodId) =>
      set((state) =>
        state.reportId === reportId && state.periods.some((period) => period.id === periodId)
          ? { selectedPeriodId: periodId }
          : {},
      ),
  }))
}
