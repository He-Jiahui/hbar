import type { HbarAppUiVariantProps } from '../types'
import { ActionSurfaceFrame } from './SurfaceFrame'
import { useHbarAppUiUsageContent } from './ai-usage/UsageProvider'
import { HbarAppUiUsageOverview, HbarAppUiModelSpend, HbarAppUiRateLimits, HbarAppUiSeatUsage, HbarAppUiBudgetSettings, HbarAppUiUsageOverage, HbarAppUiUsageRequestLog, HbarAppUiCompactUsage } from '../ai-usage'
export function AiUsage({ spec, onAction }: HbarAppUiVariantProps) {
 const content = useHbarAppUiUsageContent()
 const view = spec.variant === 1 && content.overview ? <HbarAppUiUsageOverview {...content.overview} />
 : spec.variant === 2 && content.modelSpend ? <HbarAppUiModelSpend {...content.modelSpend} />
 : spec.variant === 3 && content.rateLimits ? <HbarAppUiRateLimits {...content.rateLimits} />
 : spec.variant === 4 && content.seats ? <HbarAppUiSeatUsage {...content.seats} />
 : spec.variant === 5 && content.budget ? <HbarAppUiBudgetSettings {...content.budget} />
 : spec.variant === 6 && content.overage ? <HbarAppUiUsageOverage {...content.overage} />
 : spec.variant === 7 && content.requests ? <HbarAppUiUsageRequestLog {...content.requests} />
 : spec.variant === 8 && content.compact ? <HbarAppUiCompactUsage {...content.compact} /> : null
 return <ActionSurfaceFrame spec={spec} onAction={onAction} className={`hbar-app-ui-usage-catalog hbar-app-ui-usage-variant-${spec.variant}`}>{view}</ActionSurfaceFrame>
}
