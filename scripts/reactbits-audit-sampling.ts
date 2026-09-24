export interface AuditInteractionSample {
  readonly viewport: 'desktop' | 'tablet' | 'mobile' | 'stress'
  readonly theme: 'dark' | 'light'
  readonly suffix: string
  readonly change: string
}

export interface AuditSamplingPlan {
  readonly revision: number
  readonly lumenEntries: readonly string[]
  readonly samples: readonly AuditInteractionSample[]
  readonly inferences: readonly Readonly<{ scope: string; basis: string; verification: 'inferred-not-replayed' }>[]
}

/** Reviewed behavioral groups, not a Cartesian product of every input gesture. */
const queuePlan: AuditSamplingPlan = {
  revision: 1,
  lumenEntries: ['agent-approval.tsx', 'LumenProvider.tsx'],
  samples: [
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '0:click',
      change: 'First request disclosure adds payload without losing summary',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '1:click',
      change: 'Reject resolves first row and promotes the next request',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '2:click',
      change: 'Approve has its own completed label and announcement',
    },
    { viewport: 'desktop', theme: 'dark', suffix: '2:hover', change: 'Shared decision control pointer feedback' },
    { viewport: 'desktop', theme: 'dark', suffix: '2:focus', change: 'Shared native decision control focus feedback' },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: 'queue-start-open:1:press-space',
      change: 'Keyboard decision from an expanded request',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: 'queue-a-open:1:click',
      change: 'Second payload, in-place promotion and mixed decision history',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: '0:click',
      change: 'Narrow disclosure changes wrapping and scroll content',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'queue-start-open:0:click',
      change: 'Collapse restores the narrow queue flow',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'queue-start-open:3:scroll-end',
      change: 'Focusable overflowing payload supports native scrolling',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'queue-ar-open:2:click',
      change: 'Third payload and terminal queue after mixed decisions',
    },
  ],
  inferences: [
    {
      scope: 'Other approval/rejection history permutations',
      basis:
        'One shared host decision transition keyed by item ID; all eight pure state paths are unit-tested. Browser sampling checks both outcomes and a mixed terminal path.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Repeated Enter/Space/click gestures and per-row hover/focus',
      basis:
        'Native button semantics and the same Lumen control and CSS rules are reused. Representative pointer, keyboard and focus cases are captured; no separate match is claimed for omitted gestures.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Repeated interactions at tablet/mobile and the other theme combinations',
      basis:
        'Eight static pairs cover layout and theme; state logic has no viewport/theme branch. Dynamic screenshots use desktop and the narrow wrapping/overflow boundary.',
      verification: 'inferred-not-replayed',
    },
  ],
}

export function auditSamplingPlan(variantId: string): AuditSamplingPlan | undefined {
  return variantId === 'hbar-app-ui-agent-approval-3' ? queuePlan : undefined
}

export function sampledInteractionIds(variantId: string, viewport: string, theme: string): readonly string[] {
  const plan = auditSamplingPlan(variantId)
  if (!plan)
    throw new Error(`Missing reviewed interaction sampling plan for ${variantId}; inspect its behavior groups first`)
  return plan.samples
    .filter((sample) => sample.viewport === viewport && sample.theme === theme)
    .map((sample) => `${variantId}:${sample.suffix}`)
}
