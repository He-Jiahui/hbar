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

const permissionPlan: AuditSamplingPlan = {
  revision: 1,
  lumenEntries: ['agent-approval.tsx', 'LumenProvider.tsx'],
  samples: [
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '1:toggle',
      change: 'Unchecked scope has muted strike-through feedback; other scopes remain selected',
    },
    { viewport: 'desktop', theme: 'dark', suffix: '0:focus', change: 'Native checkbox focus feedback' },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '3:click',
      change: 'Disclosure shows original request payload without hiding scopes',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '4:click',
      change: 'Rejection locks scopes and replaces actions with Skipped result',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: 'permission-partial-open:5:press-space',
      change: 'Partial approval records two of three scopes and replaces expanded request with result',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: '3:click',
      change: 'Narrow disclosure preserves wrapping, timer and pane scrolling',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'permission-open:3:click',
      change: 'Collapse restores narrow natural content flow',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'permission-open:6:scroll-arrowright',
      change: 'Long request payload supports native horizontal keyboard scroll',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'permission-empty:5:click',
      change: 'Capture the disabled zero-scope approval guard; no forced click or outcome is invented',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'permission-empty:0:toggle',
      change: 'Selecting one scope restores approval availability',
    },
  ],
  inferences: [
    {
      scope: 'Other scope combinations and full-selection approval',
      basis:
        'Each scope uses the same ID-keyed controlled checkbox and shared count formatter. Pure state tests cover all selection subsets; browser evidence covers partial, zero and recovery.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Equivalent button gestures, hover and repeated focus on the other rows',
      basis:
        'Native button/checkbox semantics are reused; keyboard approval and checkbox focus are captured, while shared decision controls were sampled in Approval 3. No individual match is claimed for omitted gestures.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Repeated interactions at other viewport/theme combinations',
      basis:
        'Eight static pairs cover layout/theme; dynamic cases use desktop and narrow wrapping/overflow boundaries. Decision logic has no viewport or theme branch.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Exact countdown second synchronization',
      basis:
        'Source and local are real independent running timers; digit values may differ at capture. Host timer progression, pause after decision and zero clamp are tested locally. The original public request payload remains static when checkboxes change.',
      verification: 'inferred-not-replayed',
    },
  ],
}

const costPlan: AuditSamplingPlan = {
  revision: 1,
  lumenEntries: ['agent-approval.tsx', 'LumenProvider.tsx'],
  samples: [
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '0:click',
      change: 'Request disclosure preserves estimates and changes the centered card height',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '1:click',
      change: 'Rejection replaces actions with Skipped while retaining the estimate',
    },
    { viewport: 'desktop', theme: 'dark', suffix: '2:hover', change: 'Representative decision button visual feedback' },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: 'cost-request-open:2:press-space',
      change: 'Keyboard approval from expanded request shows background-running result',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: '0:click',
      change: 'Narrow disclosure changes content height and scroll position',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'cost-request-open:0:click',
      change: 'Narrow collapse restores the estimate/action flow',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'cost-request-open:1:press-enter',
      change: 'Narrow expanded rejection removes the payload and reflows the result',
    },
  ],
  inferences: [
    {
      scope: 'Other native button gestures and repeated decisions at other themes/sizes',
      basis:
        'One host-confirmed decision transition and shared native button semantics; both distinct outcomes, pointer feedback and keyboard activation are sampled. Eight static pairs cover themes and widths.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Repeated static cost rows, spend bar and request text',
      basis:
        'These are passive estimates, not executable controls. Counts/duplicates/localization and bounded bar values have unit coverage; no invented metric editing or paid operation is tested.',
      verification: 'inferred-not-replayed',
    },
  ],
}

const historyPlan: AuditSamplingPlan = {
  revision: 1,
  lumenEntries: ['agent-approval.tsx', 'LumenProvider.tsx'],
  samples: [
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '0:press-enter',
      change: 'Export: observe real download/no-op result without inventing success feedback',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '3:click',
      change: 'Pressed filter reduces eight records to four approved decisions',
    },
    { viewport: 'desktop', theme: 'dark', suffix: '1:focus', change: 'Search control keyboard focus feedback' },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '1:fill',
      change: 'Unmatched search replaces the list with a recovery empty state',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: 'history-match:4:click',
      change: 'Detail search matches Maya; composing with skipped filter produces no results',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: '3:press-space',
      change: 'Narrow keyboard filter preserves stacked controls and hidden timestamps',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'history-empty:6:click',
      change: 'Clear resets both query and approved filter and restores all records',
    },
  ],
  inferences: [
    {
      scope: 'Other filter values and query strings',
      basis:
        'The same ID membership and case-insensitive title/detail predicate is used; all filter counts, composed matches, empty/recovery, stale IDs and duplicate entries have unit coverage.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Passive history rows and repeated gestures/themes/viewport combinations',
      basis:
        'Rows have no controls. Shared native button behavior is sampled by click and Space; search focus and eight static viewport/theme pairs cover visual boundaries without a Cartesian replay.',
      verification: 'inferred-not-replayed',
    },
  ],
}

const checklistPlan: AuditSamplingPlan = {
  revision: 1,
  lumenEntries: ['agent-plan.tsx', 'LumenProvider.tsx'],
  samples: [
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '0:click',
      change: 'Stop changes the running status and live announcement to paused, retaining progress and disclosure',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '1:click',
      change: 'Completed step disclosure replaces the running step detail, not the running state',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '3:click',
      change: 'Activating the expanded step collapses all details',
    },
    { viewport: 'desktop', theme: 'dark', suffix: '1:hover', change: 'Shared full-row pointer feedback' },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: '4:press-enter',
      change: 'Narrow queued-step disclosure wraps the description and metadata',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'plan-paused:0:press-space',
      change: 'Narrow Resume restores the running status without changing progress or open detail',
    },
  ],
  inferences: [
    {
      scope: 'Other step IDs and repeated row gestures',
      basis:
        'All seven host-owned descriptions/targets/estimates are populated from rendered disclosures. One shared single-open toggle handles done/running/queued/skipped rows; unit coverage checks data and duplicate/stale/capacity behavior.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Repeated pause/disclosure sequences across remaining themes and sizes',
      basis:
        'Pause and disclosure are independent states. Desktop and narrow samples cover both transitions and both keyboard gestures; eight static source/local pairs cover four widths and two themes. Passive progress is not treated as a control.',
      verification: 'inferred-not-replayed',
    },
  ],
}

const planReviewPlan: AuditSamplingPlan = {
  revision: 1,
  lumenEntries: ['agent-plan.tsx', 'LumenProvider.tsx'],
  samples: [
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '1:click',
      change: 'Move first step down, preserving target focus and announcing the new position',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '2:click',
      change: 'Skip retains the row, changes styling/action label and both counts',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '17:press-space',
      change: 'Restore the initially skipped row and increment the included count',
    },
    { viewport: 'desktop', theme: 'dark', suffix: '27:fill', change: 'Draft input enables Add without creating a row' },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: 'plan-draft:28:click',
      change: 'Add appends a stable-ID row, clears the draft and announces the addition',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '29:click',
      change: 'Start locks all editing and replaces the footer with the Stop recovery action',
    },
    { viewport: 'desktop', theme: 'dark', suffix: '1:hover', change: 'Shared row/icon-button pointer feedback' },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'plan-draft:27:press-enter',
      change: 'Narrow Enter submits the input while retaining the horizontal row and input focus',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'plan-running:29:press-space',
      change: 'Narrow Stop unlocks the unchanged plan and restores boundary-disabled controls',
    },
  ],
  inferences: [
    {
      scope: 'Every other row target, ordering permutation and repeated gestures/themes',
      basis:
        'Stable-ID adjacent movement, skip toggling and native buttons share one implementation. Unit tests cover both boundaries, all-skipped recovery, duplicate/stale IDs and controller isolation; eight static pairs cover responsive structure.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Blank input, empty/one/bound/over-bound plans and host failures',
      basis:
        'State/render tests cover validation, disabled controls, host error preservation and over-capacity retention; a local browser check verifies actual long-list scroll, localized controls and input keyboard behavior. These are not claimed as extra source/local screenshot cases.',
      verification: 'inferred-not-replayed',
    },
  ],
}

export function auditSamplingPlan(variantId: string): AuditSamplingPlan | undefined {
  if (variantId === 'hbar-app-ui-agent-approval-3') return queuePlan
  if (variantId === 'hbar-app-ui-agent-approval-4') return permissionPlan
  if (variantId === 'hbar-app-ui-agent-approval-5') return costPlan
  if (variantId === 'hbar-app-ui-agent-approval-6') return historyPlan
  if (variantId === 'hbar-app-ui-agent-plan-1') return checklistPlan
  if (variantId === 'hbar-app-ui-agent-plan-2') return planReviewPlan
  return undefined
}

export function sampledInteractionIds(variantId: string, viewport: string, theme: string): readonly string[] {
  const plan = auditSamplingPlan(variantId)
  if (!plan)
    throw new Error(`Missing reviewed interaction sampling plan for ${variantId}; inspect its behavior groups first`)
  return plan.samples
    .filter((sample) => sample.viewport === viewport && sample.theme === theme)
    .map((sample) => `${variantId}:${sample.suffix}`)
}
