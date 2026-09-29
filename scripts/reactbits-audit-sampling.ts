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
  readonly inferences: readonly Readonly<{
    scope: string
    basis: string
    verification: 'inferred-not-replayed' | 'restricted-unverified'
  }>[]
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

const planTreePlan: AuditSamplingPlan = {
  revision: 1,
  lumenEntries: ['agent-plan.tsx', 'LumenProvider.tsx'],
  samples: [
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: 'tree-shipping-open:3:click',
      change:
        'With completed groups collapsed, reveal staging beside shipping so all six previously missing subtasks are visible in a paired screenshot',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '0:click',
      change: 'Collapse a completed group without changing its counts or the other group',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '3:click',
      change: 'Reveal the three real shipping tasks and grow the scroll content',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '4:click',
      change: 'Reveal the three distinct staging tasks, not an empty placeholder',
    },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '2:click',
      change: 'Retry replaces Failed with Running and removes only that retry action',
    },
    { viewport: 'desktop', theme: 'dark', suffix: '0:hover', change: 'Group row hover feedback' },
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: '2:hover',
      change: 'Nested retry control and parent row hover feedback',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: '3:press-enter',
      change: 'Narrow keyboard expansion preserves nested indentation and scrolling',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: '2:press-space',
      change: 'Narrow keyboard retry retains the status column and lets the title expand',
    },
  ],
  inferences: [
    {
      scope: 'Other disclosure combinations and repeated native gestures/themes',
      basis:
        'Groups share independent ID-keyed disclosure; their content is supplied separately. Eight static pairs cover responsive structure; selected dynamic pairs cover collapse, both previously missing groups, and narrow keyboard expansion.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Stale/duplicate targets, empty and over-bound trees, host retry failure and locale changes',
      basis:
        'State/render tests cover target isolation, busy and repeat guards, host failure/recovery, content bounds and localization. A local browser checks actual overflow, retained focus and long labels; these are not additional source/local screenshot claims.',
      verification: 'inferred-not-replayed',
    },
  ],
}

const planActualPlan: AuditSamplingPlan = {
  revision: 1,
  lumenEntries: ['agent-plan.tsx', 'LumenProvider.tsx'],
  samples: [
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: 'passive-row:0:hover',
      change: 'Observed passive table row highlight without changing values or inventing an action',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'passive-row:0:hover',
      change: 'Narrow row highlight after the Duration diagram column is hidden',
    },
  ],
  inferences: [
    {
      scope: 'Other table rows and repeated viewport/theme hover states',
      basis:
        'The live reference has no buttons or other actionable controls. All data rows share the same hover rule; desktop/narrow representative pairs and eight static pairs cover the differing column layouts. No click/focus/press behavior is invented.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Passive metrics, planned markers and actual-duration tracks',
      basis:
        'These are read-only values, not progress controls. Host/render tests cover independent planned/actual ratios, missing actual values, clamping, empty/duplicate/bound/over-bound rows and localization; a browser check verifies native table scrolling.',
      verification: 'inferred-not-replayed',
    },
  ],
}

const planBoardPlan: AuditSamplingPlan = {
  revision: 1,
  lumenEntries: ['agent-plan.tsx', 'LumenProvider.tsx'],
  samples: [
    {
      viewport: 'desktop',
      theme: 'dark',
      suffix: 'board-column:0:scroll:end',
      change: 'Native wheel reaches an individual column end while other columns and headings stay fixed',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'board-stack:scroll:middle',
      change: 'Native wheel reveals the middle Implement phase and its running task in the stacked layout',
    },
    {
      viewport: 'stress',
      theme: 'light',
      suffix: 'board-stack:scroll:end',
      change: 'Native wheel reaches Verify and the final handoff task while the global heading stays fixed',
    },
  ],
  inferences: [
    {
      scope: 'Card click, drag, focus and hover feedback',
      basis:
        'The real reference has no actionable or draggable elements. Representative done/running/queued cards retain the same background, border and text on hover; no card interaction is invented.',
      verification: 'inferred-not-replayed',
    },
    {
      scope: 'Other columns and repeated wheel positions, themes and viewports',
      basis:
        'Three equal columns share the wide-screen scroll mechanism, while narrow sizes share the stacked owner. Three real wheel cases cover the different owners and middle/end content; eight static pairs and local overflow/locale tests cover layout boundaries.',
      verification: 'inferred-not-replayed',
    },
  ],
}

export function auditSamplingPlan(variantId: string): AuditSamplingPlan | undefined {
  if (variantId === 'hbar-app-ui-forms-6')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-6-reference.tsx',
        'forms-6-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '8:toggle',
          change: 'Uncheck Billing address matches delivery and verify the billing fields enter normal flow',
        },
      ],
      inferences: [
        {
          scope: 'Country-driven province options and shipping-total updates',
          basis:
            'A prior safe live source probe observed Canada switching the region control to Province and Express changing the summary total. This pass pairs the billing checkbox mechanism; the focused local verifier and store tests cover the country and shipping projections without multiplying the browser sample.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Pay and Back to cart outcomes',
          basis:
            'Pay remains disabled until required payment data is complete, and Back navigation has no verified source outcome in this safe audit. The preview does not submit payment or claim navigation success; Back remains a host callback intent.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Repeated checkbox and address edits at other viewport/theme combinations',
          basis:
            'Eight static captures cover the four responsive sizes and both themes. The checkbox transition uses one host-owned draft boolean with no viewport/theme-specific branch; no Cartesian interaction replay is claimed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-7')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-7-reference.tsx',
        'forms-7-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [],
      inferences: [
        {
          scope: 'Summary character count/progress and consent completion projections',
          basis:
            'The authorized full-audit-v1 static source capture and full-interactions-v3 safe interaction cache were produced from different source hashes (24575105…d41d128 and 94c36f7a…04e85). Their evidence is not combined as a fresh paired interaction run; local host tests cover the recorded 12-character summary and consent projections.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Focus-area expansion and all other unpaired or unobserved interactions',
          basis:
            'The interaction cache contains a safe focus-area expansion observation but does not share the static baseline hash. Tag, file, Save draft, Submit, funding selection and other dynamic outcomes remain unpaired or unobserved; host actions are callback-only and no remote outcome is claimed.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Equivalent control states across viewport and theme combinations',
          basis:
            'Eight static captures are authorized for comparison. The interaction cache is dark/mobile only and was not replayed against the static run, so no viewport/theme interaction Cartesian match is claimed.',
          verification: 'restricted-unverified',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-8')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-8-reference.tsx',
        'forms-8-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Switch the condition matcher to Match any and inspect the updated summary',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:click',
          change: 'Open the first condition field menu without selecting an unverified field value',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '15:click',
          change: 'Add one draft condition and inspect the new source row and summary count',
        },
      ],
      inferences: [
        {
          scope: 'Save rule and Test rule outcomes',
          basis:
            'Neither action is triggered by this safe sample. The local host emits typed callback requests only; no saved state, test result, or remote persistence is claimed.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Action-picker option selection',
          basis:
            'The live Route to zone target menu exposes Bay 1–4, Cold store and Overflow, but this round does not select an action option. The local action picker remains callback-only; no chosen target or remote outcome is claimed.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Unobserved options and field profiles outside the sampled menu',
          basis:
            'The initial Frozen choice is source-observed, while incomplete option catalogs are marked partial or unobserved in the host fixture. Eight static pairs verify the default controls; no unobserved field options are promoted to complete catalogs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated condition edits at other viewport/theme combinations',
          basis:
            'The eight static captures cover four viewports and both themes. Match mode, field-menu disclosure, and one Add action sample distinct mechanisms without a control-by-viewport Cartesian replay.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-onboarding-7')
    return {
      revision: 1,
      lumenEntries: [
        'onboarding.tsx',
        'onboarding-7-reference.tsx',
        'onboarding-7-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '0:fill',
          change: 'Edit workspace name independently of the slug and URL hint',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:select',
          change: 'Choose United States in the three-option native region select',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '3:click',
          change: 'Toggle the private-workspace checked state independently of other values',
        },
      ],
      inferences: [
        {
          scope: 'Fresh strict source/local acceptance',
          basis:
            'full-static-v10 and full-interactions-v4 share target hash c769fb52bac854061e34445b9722cc24da504e6c6561b21d7b40eda062a5888d, but the legacy interaction cache has no current protocol and a different source-directory hash. Raw AX changes are mechanism clues, not fresh strict pairs.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Slug derivation, Back/Continue results and context stepper scope',
          basis:
            'Slug edit and derived URL were not sampled; navigation and creation outcomes remain unverified. The context image includes a stepper outside the form AX root, so its ownership is ambiguous. The local form emits typed requests and does not invent a stepper or a completed workspace.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Legacy comparator false negatives',
          basis:
            'The old summary says source-no-op, while raw AX records Northwind→audit sample, Europe→United States and checked true→false. Local state follows those three independent observed mechanisms.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Other region IDs and responsive flow',
          basis:
            'Three options share native selection. Eight local static views, German long copy and one real 320x420 scroll cover flow without repeating each control by theme and viewport. Source scroll ownership and a region-count cap were not captured.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-onboarding-6')
    return {
      revision: 1,
      lumenEntries: [
        'onboarding.tsx',
        'onboarding-6-reference.tsx',
        'onboarding-6-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '0:click',
          change: 'Open workspace remains a typed request with no observed in-frame navigation',
        },
      ],
      inferences: [
        {
          scope: 'Current-round strict source/local acceptance',
          basis:
            'full-static-v10 and full-interactions-v4 target source hashes match, but the legacy interaction cache lacks the current capture protocol and has a different source directory hash; no fresh strict pair exists.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Take the two-minute tour and external outcomes',
          basis:
            'The first CTA click/Enter/Space has identical captured before/after AX in-frame, while Tour was not sampled. Actual workspace navigation and tour side effects remain unverified; both are distinct typed host requests.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Repeated summary rows and responsive flow',
          basis:
            'Four host-provided definition pairs share one passive row structure. Eight static local combinations, long German and a 320x420 real-scroll check cover flow without multiplying passive rows by actions or layouts.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-onboarding-5')
    return {
      revision: 1,
      lumenEntries: [
        'onboarding.tsx',
        'onboarding-5-reference.tsx',
        'onboarding-5-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:fill',
          change: 'Update the first invitation email draft without mutating the second row',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '2:select',
          change: 'Select Member in the first role native select without changing the other row',
        },
      ],
      inferences: [
        {
          scope: 'Current-round source interaction acceptance',
          basis:
            'full-static-v10 and full-interactions-v4 share target source hash, but the interaction report is legacy schemaVersion 1 without the current protocol; its source directory hash differs and no fresh strict source/local pair exists.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Legacy comparator false negatives for email and native role selection',
          basis:
            'Raw before/after AX shows first email priya@northwind.co→audit sample and first role Admin→Member. The old sourceChanged=false summaries omit same-length value/selected-option state; the host store models the raw observed local changes.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Copy, Add another, Remove, Skip and Send outcomes',
          basis:
            'Copy label stays Copy in observed click/Enter/Space. Clipboard, row add/remove, remote send and navigation outcomes were not captured; all remain typed host requests rather than invented local results.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Repeated rows, themes and responsive controls',
          basis:
            'Two rows share one email/select pattern. Eight static local states and one 320x420 real-scroll check cover flow and capacity stress; one email edit and one role selection cover distinct mechanisms instead of replaying every row-by-layout combination.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-paywall-1')
    return {
      revision: 1,
      lumenEntries: ['paywall.tsx', 'paywall.css', 'index.ts', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '0:click',
          change: 'Membership CTA has no reliable visible result in the captured prototype; keep a typed host action',
        },
      ],
      inferences: [
        {
          scope: 'Fresh strict source/local interaction acceptance',
          basis:
            'full-static-v10 and full-interactions-v4 share target hash 2c7a0feef5f9cfa5e5426b14d1c2d5a48a9c48f74359fb32aa90c6262078c5ed, but the legacy interaction schema lacks the current capture protocol. Five desktop samples failed with control-index-not-found; only mobile first-CTA probes were captured.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Second sign-in action and remote outcomes',
          basis:
            'Both source buttons are visible in all static views, but the legacy interaction subset does not establish a sign-in destination or a membership completion result. Both local buttons emit distinct typed host actions without faking navigation.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Fade teaser and responsive inline card',
          basis:
            'The source page identifies an article lock with fade-out and inline member card. Eight static views establish a 680px desktop article and stacked narrow card. Local desktop/mobile/short-height snapshots sample the structural flow; the intended teaser mask is the sole bounded visual crop.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Over-capacity benefits',
          basis:
            'The three source benefit rows share one static list pattern. The host fixture separately tests 21 items using an opt-in keyboard-scroll list, not twenty-one repeated row interactions.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-onboarding-4')
    return {
      revision: 1,
      lumenEntries: [
        'onboarding.tsx',
        'onboarding-4-reference.tsx',
        'onboarding-4-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:click',
          change: 'Select Plan a roadmap instead of Run sprints within the six-choice radio group',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '7:press-space',
          change: 'Press Just me instead of 2–10 in the four-choice team-size segment',
        },
      ],
      inferences: [
        {
          scope: 'Current-round source interaction acceptance',
          basis:
            'full-static-v10 and full-interactions-v4 have the same source hash, but the interaction cache is legacy schemaVersion 1 without the current capture protocol. The static eight views and two raw transitions are restricted evidence, not a fresh strict pair.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Legacy comparator false negative for the use-case radio',
          basis:
            'Raw dark/mobile AX before/after for both Plan a roadmap click and Enter change checked from Run sprints to Plan a roadmap. The old comparison says source-no-op because its signature omits radio checked. Local state follows the raw AX evidence.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Other choices in the same two mutually exclusive groups',
          basis:
            'The six use cases share one radio mechanism, and four sizes share one pressed-state mechanism. Remaining labels use stable IDs and the same state model; they are inferred rather than independently replayed at every viewport/theme.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Back, Continue, template application, persistence and source scroll owner',
          basis:
            'No reliable outcome or source scroll ownership is captured. Navigation remains typed host requests; local narrow flow uses a reachable document scroll instead of inventing a source result.',
          verification: 'restricted-unverified',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-onboarding-3')
    return {
      revision: 1,
      lumenEntries: [
        'onboarding.tsx',
        'onboarding-3-reference.tsx',
        'onboarding-3-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:click',
          change: 'Uncheck the completed Profile task and reduce progress from 2/6 to 1/6',
        },
      ],
      inferences: [
        {
          scope: 'Current-round source interaction acceptance',
          basis:
            'The full-static-v10 and full-interactions-v4 target hashes match, but the interaction report is legacy schemaVersion 1 without the current capture protocol. It does not constitute a fresh strict source/local pair.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Legacy comparator false negative for Profile uncheck',
          basis:
            'The dark/mobile before/after AX snapshots and image show Profile checked→unchecked and 2/6→1/6, with progress fill 75.95→39.13px. The old report says source-no-op because its delta signature omits checkbox checked and AX progress text. The observed transition is modeled despite that summary.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Other checkboxes, per-task links and persistence',
          basis:
            'No other completion state or link destination is reliably captured. They remain typed host requests rather than inferred progress or navigation.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Repeated rows and responsive combinations',
          basis:
            'Six tasks share one row pattern. Static source views show narrow truncation but no horizontal overflow; local flow preserves readable content. One Profile checkbox covers the observed state mechanism, not six tasks times four viewports.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-onboarding-2')
    return {
      revision: 1,
      lumenEntries: [
        'onboarding.tsx',
        'onboarding-2-reference.tsx',
        'onboarding-2-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '6:fill',
          change: 'A Profile name fill updates its textbox draft',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '8:click',
          change: 'Continue moves from Profile to Role with Product selected and four radio options',
        },
      ],
      inferences: [
        {
          scope: 'Current-round source interaction acceptance',
          basis:
            'The full-static-v10 and full-interactions-v4 caches share the Onboarding 2 source hash, but the latter is schemaVersion 1 without a current capture protocol. The live documentation text was visible but its iframe was not exposed for a fresh replay.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Back, changing the selected role, rail navigation and four later step bodies',
          basis:
            'The cache shows Profile Continue entering Role, but no reliable result for Back, choosing another radio, or visiting Source/Workspace/Goals/Invite. Those controls stay typed request-only; missing bodies are not invented.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Other step buttons, theme and viewport combinations',
          basis:
            'Eight static source views cover desktop rail and narrow Step N of 6 replacement in both themes. One Profile draft and Continue represent distinct changes; local browser checks cover desktop and narrow transitions without a six-step by four-viewport action matrix.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-onboarding-1')
    return {
      revision: 1,
      lumenEntries: [
        'onboarding.tsx',
        'onboarding-1-reference.tsx',
        'onboarding-1-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:fill',
          change: 'A single Full name fill changes its native textbox draft',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '3:select',
          change: 'Timezone select reaches the placeholder, not a different city option',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '4:toggle',
          change: 'Product updates toggles from checked to unchecked',
        },
      ],
      inferences: [
        {
          scope: 'Current-round source interaction acceptance',
          basis:
            'The full-static-v10 and full-interactions-v4 caches share the Onboarding 1 source hash, but use legacy schemaVersion 1 without the current capture protocol. The official page is unavailable in this round. These samples are mechanism clues, not fresh strict source/local pairs.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Desktop directory-preview changes after form edits',
          basis:
            'The cached interaction samples were captured only on dark mobile, where the directory preview is hidden. The host projection is locally tested, but there is no paired desktop source after-state.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Other timezone choices, photo upload, empty-name validation and Continue result',
          basis:
            'The timezone sample selected its placeholder; photo and Continue have no captured workflow outcome. The preview keeps their callbacks as typed requests rather than fabricating upload or navigation.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Repeated controls across desktop, tablet, mobile and stress themes',
          basis:
            'Static source pairs cover the responsive form and optional aside in light and dark. The local verifier samples distinct input, select and checkbox mechanisms once, with narrow flow/reachability checks, rather than replaying every control in every layout.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-12')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-12-reference.tsx',
        'forms-12-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:press-enter',
          change: 'Open Business details and inspect its three editor fields, Cancel/Save and the other disabled Edit controls',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:toggle',
          change: 'Toggle the first consent checkbox without requesting a bound quote',
        },
      ],
      inferences: [
        {
          scope: 'Current-round source interaction acceptance',
          basis:
            'The full-static-v9 and full-interactions-v4 caches share the Forms 12 source hash, but the interaction cache is schemaVersion 1 without the current capture protocol. The official page was unavailable this round. These are older same-hash mechanism clues, not fresh strict source/local pairs.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Consent state equivalence',
          basis:
            'The first checkbox appears checked in the cached source-after snapshot, while the old comparator records sourceChanged false and a local control-index mismatch. Local consent toggling is tested, but no strict matched source delta is claimed.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Other section editors, Save/Cancel, premium recalculation and bound-quote result',
          basis:
            'Only Business editor opening is usefully captured. Its draft does not mutate the host-provided premium snapshot, and Save/Cancel/Request only emit typed host requests. No result or post-consent CTA enabled state is inferred.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Repeated Edit controls and layout combinations',
          basis:
            'Eight local light/dark screenshots cover desktop, tablet, mobile and 320px normal flow. One Business Edit and one consent cover distinct change mechanisms; source narrow vertical scroll owner was not captured, while local mouse-wheel scrolling reaches the footer without horizontal overflow.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-11')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-11-reference.tsx',
        'forms-11-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '5:fill',
          change: 'Fill the required name and inspect its derived deploy target and Create enabled state',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '6:click',
          change: 'Open the Region combobox and inspect its four visible options',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '8:toggle',
          change: 'Toggle Auto-deploy on push from checked to unchecked',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '9:fill',
          change: 'Fill Description and inspect its 160-character counter',
        },
      ],
      inferences: [
        {
          scope: 'Current-round source/static interaction acceptance',
          basis:
            'The full-static-v10 and full-interactions-v4 caches share the Forms 11 source hash, but both use the older unversioned capture protocol and were recorded on 2026-09-23. The official page was not reachable in this round. These four source control indices identify distinct cached mechanisms, not fresh strict pairs with the current implementation.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Alternate environment-kind descriptions and copy-variable sources',
          basis:
            'The cache shows the three kind names and the default Preview description, but no reliable alternate-kind state or variable-source menu. The host keeps those catalogs partial and does not invent their selection effects.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Slug availability, Create, Cancel and Close outcomes',
          basis:
            'One cached name sample shows a local slug and enabled Create; no asynchronous availability result or remote action outcome was observed. The host only emits typed requests and does not show unconfirmed success.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Repeated controls across all viewport and theme combinations',
          basis:
            'Eight final local stills cover four sizes and two themes; safe local checks sample name, region, switch and description once by mechanism. The authorized source narrow capture has an unmeasured scroll owner, while the local dialog body has independent scrolling and a reachable footer.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-10')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-10-reference.tsx',
        'forms-10-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:click',
          change: 'Choose NPS 0 and inspect the conditional low-score follow-up and question count',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '15:toggle',
          change: 'Choose one room-cleanliness matrix rating and inspect its selected state',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '38:toggle',
          change: 'Choose one highlight and inspect the checkbox and progress state',
        },
      ],
      inferences: [
        {
          scope: 'Current-version NPS branch, dynamic denominator, matrix and highlight feedback',
          basis:
            'The same-hash full-interactions-v4 cache has no useful Forms 10 state changes. These three source control indices come from the current static control inventory, but only a different-hash v3 cache observed the state transitions. The local mechanism check is not a fresh matched source replay.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Property menu catalog and anchored overlay',
          basis:
            'Four property options and non-expanding root geometry were observed only in the older, different-hash v3 interaction cache. The host catalog is partial and the overlay is scoped to this proven menu; current-version options are not claimed complete.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Submit completion and remote result',
          basis:
            'The current static source shows Submit disabled. Local enablement is derived from the host-required-answer model; no source enabled state or submit outcome was safely observed, and the host only emits a typed request.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Repeated score, matrix cell, highlight, viewport and theme combinations',
          basis:
            'Eight local static captures cover four sizes and two themes, with narrow matrix overflow kept inside an accessible local scroll container. One representative from each distinct change mechanism suffices for local validation; the authorized source cache is static visual reference, not eight fresh live pairs.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-9')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-9-reference.tsx',
        'forms-9-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Copy Monday to weekdays and inspect the source-visible unsaved state',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:click',
          change: 'Close Monday and verify its draft intervals are retained while the weekly total becomes 40 h',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '48:click',
          change: 'Toggle public-holiday bookings and inspect the checkbox state without saving',
        },
      ],
      inferences: [
        {
          scope: 'Add hours, Remove time range, and Save hours results',
          basis:
            'Those remote or mutable source outcomes are not part of the safe sample. The host emits typed callback requests only for Add/Remove/Save; no new interval or persistence success is claimed.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Reset result and time-zone/time option catalogs',
          basis:
            'Reset is locally modeled as returning to the preview baseline, not as an observed remote source result. Time-zone and interval time menus remain explicitly partial, using only values visible in the authorized source baseline.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated day, interval, and holiday changes across viewport/theme combinations',
          basis:
            'Eight local captures cover the four viewport sizes and two themes; the authorized source cache is visual reference only. Copy, open-day switch, and holiday checkbox are distinct planned mechanisms, not fresh same-hash source/local pairs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Current-round source static and interaction pairing',
          basis:
            'The 2026-09-29 live capture timed out navigating to the verified Forms 9 URL after only three source/local pairs and produced no manifest. The complete authorized full-static-v9 cache uses an older audit protocol, so it is not imported into a current strict run; no same-hash source interaction is claimed.',
          verification: 'restricted-unverified',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-5')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-5-reference.tsx',
        'forms-5-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:fill',
          change: 'Enter the source-observed demo workspace address and wait for its availability feedback',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:click',
          change: 'Toggle Show password and inspect masking state without submitting the workspace',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '6:expand',
          change: 'Open Data region and expose the observed region choices',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '7:toggle',
          change: 'Choose Solo clinic while preserving the form’s disabled creation state',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '10:toggle',
          change: 'Toggle the protected-health-information consent checkbox',
        },
      ],
      inferences: [
        {
          scope: 'Create disabled-to-enabled transition after completing all required fields',
          basis:
            'A source-safe live probe filled the organization, the observed available `riverside` address, admin email, password and confirmation, chose a data region and plan, and accepted consent; the source status changed to ready and Create became enabled. The local typed store and preview are checked for the corresponding derived state, without clicking Create.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remote workspace provisioning result',
          basis:
            'Create was never clicked in the source. The local control is a callback-only request and does not create a workspace or display a successful provisioning result.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Equivalent control mechanisms across other viewports and themes',
          basis:
            'Eight static pairs cover all four viewport sizes and both themes; the five live interaction samples exercise distinct address, password visibility, region, plan, and consent mechanisms without multiplying those actions by layout.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-4')
    return {
      revision: 2,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-4-reference.tsx',
        'forms-4-reference.css',
        'index.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'forms4-edit-cancel:3:click',
          change: 'Open Asset tag inline editor, then Cancel to restore the source value row',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'forms4-condition-edit:5:select',
          change: 'Open Condition editor and select a different observed choice without saving',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '10:toggle',
          change: 'Toggle Condition tracking and verify its adjacent status copy',
        },
      ],
      inferences: [
        {
          scope: 'Other text/date rows, service-interval choices, and repeated edit/cancel paths',
          basis:
            'Rows share the typed property-ID edit/cancel host transitions; focused tests cover text, date, choice IDs, stale drafts and cancel restoration. Live source probes separately observed text, date and both choice editor controls. The browser samples pair the cancel path with a choice draft rather than multiplying each row and viewport.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Save and Add note outcomes',
          basis:
            'Those source actions were not invoked for outcome verification. The preview forwards typed host requests only and does not invent a saved value, note, or remote confirmation.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Condition picker expansion surface',
          basis:
            'A live source probe exposes a custom button/combobox with a listbox; the local Lumen control is a native select. Both sampled transitions select the same visible choice, but the expanded popup structure and keyboard affordance are not like-for-like in this harness.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Narrow source iframe height versus local content flow',
          basis:
            'At mobile and 320px the source preview canvas remains 720px high and crops lower rows in its screenshot. The local card retains all rows and footer in normal document flow for reachability; no source inner scroll owner is claimed.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Other viewport/theme combinations',
          basis:
            'Eight static captures compare four viewports across both themes; the sampled state transitions have no viewport/theme branches. The component keeps the bounded property list in natural flow at narrow widths.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-settings-form-6')
    return {
      revision: 1,
      lumenEntries: [
        'settings-form.tsx',
        'settings-form-6-reference.tsx',
        'settings-form-6-reference.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:fill',
          change: 'Type the observed workspace name into the confirmation field; no destructive action is activated',
        },
      ],
      inferences: [
        {
          scope: 'Cancel follow-up state',
          basis:
            'A live safe probe filled the confirmation field and clicked Cancel. The field disappeared and the button became Review deletion; its meaning and next state are unverified, so the preview leaves Cancel callback-only and does not claim parity.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Transfer, Archive, Delete outcomes',
          basis:
            'All three source buttons begin enabled, but none was activated. The preview only emits typed host callbacks and creates no transfer, archive, deletion, or success state.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: '320px reachability and source scroll ownership',
          basis:
            'Eight cached source pairs cover both themes and all four viewports. The local preview uses normal document flow and is checked at 320px; the source iframe clips lower content and its scroll owner was not verified.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-settings-form-5')
    return {
      revision: 1,
      lumenEntries: [
        'index.ts',
        'settings-form.tsx',
        'settings-form-5-reference.tsx',
        'settings-form-5-reference.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Open the Production actions menu and inspect Rotate/Revoke choices without selecting either',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '10:toggle',
          change: 'Disable Slack and observe its checked state and Connected label update',
        },
      ],
      inferences: [
        {
          scope: 'Reveal/Hide plaintext and Copy clipboard payload',
          basis:
            'The source key value is intentionally not read or captured. The local preview reveals only a host-provided redaction notice and keeps Copy callback-only; focused tests verify Reveal→Hide masking and the copy callback does not replace the masked display. Exact secret-string parity is not claimed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Rotate/Revoke completion or remote key mutation',
          basis:
            'The source menu is opened, but neither destructive menu item is selected. The local host forwards typed preview-request callbacks only and does not claim remote success or remove/replace a key.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'GitHub/Linear switch repetitions and 320px lower content',
          basis:
            'All three integrations share one ID-based controlled switch state; fixture/store tests cover all initial values and an off/on transition. Source and host 320px document-scroll checks verify bottom note reachability without a switch-by-viewport product.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-settings-form-4')
    return {
      revision: 1,
      lumenEntries: [
        'settings-form.tsx',
        'settings-form-4-reference.tsx',
        'settings-form-4-reference.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:select',
          change: 'Change Devan Rao through a native member-role select',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '5:expand',
          change: 'Open Devan Rao’s trigger-anchored copy/remove menu without invoking Remove',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:fill',
          change: 'Enter a syntactically valid local preview invite address',
        },
      ],
      inferences: [
        {
          scope: 'Other member roles and repeated menu triggers',
          basis:
            'Five non-owner rows use the same typed ID-based role/menu handlers. Store tests cover role guards, owner copy-only actions, clipboard feedback, and callback-only Remove; source Remove is intentionally not clicked.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Invite submission outcome',
          basis:
            'The UI adds only a host-owned local preview invitation and callback; it makes no claim about remote delivery. Focused host/store checks cover that local state transition.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: '320px content scrolling and other viewport/theme combinations',
          basis:
            'Eight static pairs cover the four source viewports and both themes. The source content region owns vertical scrolling; the preview keeps all rows and the seat summary reachable in normal flow.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-settings-form-3')
    return {
      revision: 1,
      lumenEntries: ['settings-form.tsx', 'settings-form-3-reference.tsx', 'settings-form-3-reference.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '1:toggle', change: 'Change the initially-dirty Dark theme radio' },
        { viewport: 'desktop', theme: 'dark', suffix: '3:select', change: 'Change Density through its native select control' },
        { viewport: 'desktop', theme: 'light', suffix: '5:click', change: 'Toggle the Weekly summary switch' },
        { viewport: 'desktop', theme: 'dark', suffix: '8:toggle', change: 'Toggle the notification-sounds checkbox; value changes without a Changed badge' },
        { viewport: 'desktop', theme: 'light', suffix: '9:click', change: 'Cancel restores the saved System theme and Comment replies baseline' },
        { viewport: 'desktop', theme: 'dark', suffix: '10:click', change: 'Save reaches the source-observed settled Preferences saved state' },
      ],
      inferences: [
        {scope: 'Repeated radio/select/switch/checkbox changes and alternate IDs', basis: 'All seven preferences use one typed ID/value transition and finite radio/select IDs. Focused store tests cover each mechanism and invalid IDs; one desktop select sample represents both selects.', verification: 'inferred-not-replayed'},
        {scope: 'Edits during pending Save', basis: 'A direct source probe changed Mentions while Saving. The switch changed, then the source returned to Unsaved preferences with enabled footer actions; the old timer did not save the edited draft. A focused race test covers the stale completion.', verification: 'inferred-not-replayed'},
        {scope: 'Other viewport/theme/action combinations and source 320px lower content', basis: 'Eight static pairs cover four viewports and both themes. The source fixed-height 320px iframe clips its lower switch/checkbox/footer; the host stays normal-flow and reachable by scrolling. State transitions have no theme branch.', verification: 'inferred-not-replayed'},
      ],
    }
  if (variantId === 'hbar-app-ui-settings-form-2')
    return {
      revision: 1,
      lumenEntries: [
        'settings-form.tsx',
        'settings-form-2-reference.tsx',
        'settings-form-2-reference.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:fill',
          change: 'Replace the captured taken username with a valid typed preview handle and clear its error',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '6:fill',
          change: 'Enter 161 Bio characters, retain the value, expose the over-limit alert and disable Save',
        },
      ],
      inferences: [
        {
          scope: 'Other text controls, character counts at or below 160, and repeated fill gestures',
          basis:
            'All five editable fields share the same host ID state update. Focused store/component tests cover source values, email semantics, exact 160/161 Bio boundaries, and username recovery without truncation; direct representative fills cover each distinct validation mechanism. A local Playwright continuity check separately confirms edits survive the event-log parent render before Cancel resets the draft.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Cancel and photo-selection outcomes',
          basis:
            'The source snapshot confirms the controls but no source interaction establishes their resulting state. Local Cancel resets only the preview draft; photo selection forwards a callback without simulating upload or remote success.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme/action combinations',
          basis:
            'Eight static pairs cover all four viewports and both themes, including the 320px stress view. Username and Bio validation use separate source-observed mechanisms, so equivalent layout combinations are not multiplied.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-1')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-1-reference.tsx',
        'forms-1-reference.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:fill',
          change: 'Clear Station code and check the 100% to 90% completion transition',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'forms1-method-revert:revert:click',
          change: 'Remove both selected methods to reach 90%, then Revert to restore them and 100%',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '10:select',
          change: 'Open Lead crew combobox and expose its host-supplied choices',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '12:toggle',
          change: 'Toggle the twelve-month embargo switch without submitting the plan',
        },
      ],
      inferences: [
        {
          scope: 'Other survey fields, Data release options, and equivalent combo/switch gestures',
          basis:
            'All fields and choices use the same typed host store paths. Focused tests cover field edits, both combobox value changes, switch changes, method capacity and Revert; the previous live source pass confirmed Lead crew and Revert behavior.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Save and station-photo removal outcomes',
          basis:
            'No remote save or photo-removal result is asserted. Both controls remain callback-only; the current source iframe is unavailable for further outcome verification.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme/action combinations and repeated gestures',
          basis:
            'Eight static pairs cover all four viewports and both themes. The four interaction samples cover completion, remove/revert, combobox expansion and switch toggling without multiplying equivalent mechanisms across layouts.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-forms-2')
    return {
      revision: 1,
      lumenEntries: [
        'form-workflows.tsx',
        'forms-2-reference.tsx',
        'forms-2-reference.css',
        'index.ts',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:fill',
          change: 'Enter a source-valid session title and verify readiness moves from 0/4 to 1/4',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:fill',
          change: 'Enter a source-valid 120-character abstract and verify the 480-left counter and second readiness item',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '15:click',
          change: 'Submit the empty preview form to expose the four source-observed validation messages; do not submit valid data',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '3:click',
          change: 'Choose Hands-on workshop and verify its source-observed 90-minute duration note',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '5:expand',
          change: 'Expand Track and expose the source-provided listbox choices',
        },
      ],
      inferences: [
        {
          scope: 'Other editable fields, format durations, and readiness transitions',
          basis:
            'Each field and choice uses the same typed host-owned store. Focused tests cover the 8/120-character readiness rules, email validation, dynamic 600-character count, 30/90/10-minute format durations, and bounded choice updates; safe source samples cover title and abstract readiness, format duration, and Track expansion.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Recording-consent click and valid proposal submission outcomes',
          basis:
            'The source consent checkbox was not safely operable because a floating navigation layer intercepted the pointer. No valid proposal was submitted. The local valid path only emits a typed host callback and does not claim remote completion.',
          verification: 'restricted-unverified',
        },
        {
          scope: 'Other viewport/theme/action combinations and 320px flow',
          basis:
            'Eight static pairs cover four viewports and both themes. The host keeps the three sections and readiness aside in normal document flow at 320px; source scroll ownership at the stress viewport was not established, so no source scroll behavior is claimed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-settings-form-1')
    return {
      revision: 1,
      lumenEntries: [
        'settings-form.tsx',
        'settings-form-1-reference.tsx',
        'settings-form-1-reference.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Switch from Workspace to Billing and expose its distinct host-supplied fields',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '17:click',
          change: 'Cancel returns the initially dirty workspace form to its saved feedback state',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '18:hover',
          change: 'Save action pointer feedback; live and host tests verify the asynchronous save result separately',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '6:click',
          change: 'Switch the narrow mobile navigation to Billing without losing access to the bottom save bar',
        },
      ],
      inferences: [
        {
          scope: 'Other section labels, text fields and select values',
          basis:
            'Five section buttons share the host ID selection path. Typed host fixtures and store tests cover every supplied section, editable field, valid select ID, textarea, prefixed input, checkbox and switch; one desktop and one narrow section switch establish the distinct content flow.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Save completion timing and save failure recovery',
          basis:
            'The live source shows pending then settled save feedback; the preview host tests delayed success and fail-once retry separately. A click screenshot is not paired because the independently scheduled source and local timers can reach different settled frames.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining viewport/theme/action combinations and repeated gestures',
          basis:
            'Eight static pairs cover all four widths and both themes. Interaction cases cover section selection, cancel, pending save and narrow navigation; identical controls are not multiplied across every layout.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-feedback-5')
    return {
      revision: 1,
      lumenEntries: ['feedback-workflows.tsx', 'feedback-inbox-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {viewport: 'desktop', theme: 'light', suffix: '2:click', change: 'Selecting the second unread thread replaces the entire detail while preserving the list'},
        {viewport: 'desktop', theme: 'dark', suffix: '3:click', change: 'A later neutral thread swaps sentiment, body, tags and account metrics'},
        {viewport: 'desktop', theme: 'light', suffix: '9:fill', change: 'The internal note accepts a draft inside the independent detail pane'},
        {viewport: 'desktop', theme: 'dark', suffix: '0:click', change: 'Archive read has no visible source result'},
        {viewport: 'desktop', theme: 'light', suffix: '8:click', change: 'Add tag has no visible source result'},
        {viewport: 'desktop', theme: 'dark', suffix: '10:click', change: 'Reply has no visible source result'},
        {viewport: 'desktop', theme: 'light', suffix: '11:click', change: 'Create issue has no visible source result'},
        {viewport: 'mobile', theme: 'light', suffix: '2:click', change: 'Narrow stacked panes retain selection and readable detail'},
        {viewport: 'stress', theme: 'dark', suffix: '6:click', change: 'Longer list scroll reaches a late thread without moving the detail footer'},
      ],
      inferences: [
        {scope: 'Other thread IDs, note text and repeated native gestures', basis: 'Seven host-provided details share one stable-ID selection path and one shared note draft. Unit tests cover stale IDs, duplicate IDs, empty/over-capacity lists, and draft persistence. Representative early, middle and late selections exercise the distinct pane flow.', verification: 'inferred-not-replayed'},
        {scope: 'Other viewport/theme/action combinations, including Archive', basis: 'Eight static pairs cover all four widths and both themes. The live source leaves Archive read, Add tag, Reply, Create issue and Archive visibly unchanged; each distinct control is observed, while their Cartesian combinations are not replayed.', verification: 'inferred-not-replayed'},
      ],
    }
  if (variantId === 'hbar-app-ui-feedback-6')
    return {
      revision: 1,
      lumenEntries: [
        'feedback-workflows.tsx',
        'feedback-insights-reference.tsx',
        'feedback-insights-reference.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Selecting the 90-day period updates the pressed state and the host-supplied summary data',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '2:click',
          change: 'Selecting 12 months changes the selected range and its source-observed totals',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:press-space',
          change: 'Keyboard activation selects the same period group at a narrow width',
        },
      ],
      inferences: [
        {
          scope: 'Repeated period selection gestures and untested range/layout combinations',
          basis:
            'The three native buttons share one aria-pressed period-group action and the host store maps each accepted ID to its own snapshot. Pointer samples cover both alternate ranges; Space covers the keyboard mechanism at one narrow state. Equivalent range/layout combinations are not multiplied.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme combinations',
          basis:
            'Eight static pairs cover all four audited widths and both themes. The responsive period group uses one semantic button flow; those combinations are not multiplied by every button gesture.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-feedback-4')
    return {
      revision: 1,
      lumenEntries: ['feedback-workflows.tsx', 'feedback-board-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {viewport: 'desktop', theme: 'light', suffix: '7:click', change: 'Vote adds one and changes the selected card affordance'},
        {viewport: 'desktop', theme: 'dark', suffix: '5:click', change: 'Removing an initial vote retains the baseline count and clears selected styling'},
        {viewport: 'desktop', theme: 'light', suffix: '2:click', change: 'New reorders the same five cards without fabricating records'},
        {viewport: 'desktop', theme: 'dark', suffix: '3:click', change: 'Shipped filters down to one card with correct pressed state'},
        {viewport: 'desktop', theme: 'light', suffix: '4:fill', change: 'Source search stores text but leaves the five cards visible'},
        {viewport: 'desktop', theme: 'dark', suffix: '0:click', change: 'New request is a source demo no-op'},
        {viewport: 'stress', theme: 'light', suffix: '7:click', change: 'Narrow vote updates within the bounded card list'},
        {viewport: 'mobile', theme: 'dark', suffix: '2:click', change: 'Mobile New order preserves stacked card flow'},
      ],
      inferences: [
        {scope: 'Other request IDs, repeat votes, query strings and native gestures', basis: 'All votes use a stable-ID toggle; all cards use the same semantic article. Host tests cover reverse, stale, duplicate and over-bound lists; one positive and one initial-vote removal are replayed. Search is intentionally input-only in the source demo.', verification: 'inferred-not-replayed'},
        {scope: 'Other viewport/theme/sort combinations and card scroll positions', basis: 'Eight static pairs cover four widths and both themes. Desktop and narrow state samples plus browser checks for long localized pane scrolling establish distinct mechanisms without multiplying each button across widths.', verification: 'inferred-not-replayed'},
      ],
    }
  if (variantId === 'hbar-app-ui-feedback-3')
    return {
      revision: 1,
      lumenEntries: ['feedback-workflows.tsx', 'feedback-rating-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {viewport: 'desktop', theme: 'light', suffix: '0:click', change: 'One-star rating reveals the low-score reasons and fixed caption'},
        {viewport: 'desktop', theme: 'dark', suffix: '3:click', change: 'Four-star rating switches to the positive reason family'},
        {viewport: 'desktop', theme: 'light', suffix: '3:hover', change: 'Star hover previews fill and caption without selecting or exposing reasons'},
        {viewport: 'desktop', theme: 'dark', suffix: 'rating-high:5:click', change: 'Positive reason chip toggles pressed state'},
        {viewport: 'desktop', theme: 'light', suffix: 'rating-high:9:fill', change: 'Optional comment drafts independently of selected reason'},
        {viewport: 'desktop', theme: 'dark', suffix: 'rating-high:11:click', change: 'Send rating has no visible source delivery result'},
        {viewport: 'desktop', theme: 'light', suffix: '10:click', change: 'No thanks has no visible source dismissal result'},
        {viewport: 'stress', theme: 'light', suffix: '3:click', change: 'Narrow ticket/star form retains its normal flow on positive choice'},
      ],
      inferences: [
        {scope: 'Other star counts, reason labels, repeated toggles and equivalent native gestures', basis: 'All five stars use one host rating selection; 1–3 share low reasons, 4–5 high reasons. Host tests cover stale IDs, deduplication, reset when switching families and keyboard Space; one action per distinct family is replayed.', verification: 'inferred-not-replayed'},
        {scope: 'Further viewport/theme/rating products and no-op buttons', basis: 'Eight static pairs cover four widths and both themes; desktop and 286px selections sample dynamic flow. The live preview exposes no Send or No thanks completion and equivalent permutations are not individually replayed.', verification: 'inferred-not-replayed'},
      ],
    }
  if (variantId === 'hbar-app-ui-feedback-2')
    return {
      revision: 1,
      lumenEntries: ['feedback-workflows.tsx', 'feedback-survey-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {viewport: 'desktop', theme: 'light', suffix: '4:click', change: 'Low score reveals detractor follow-up, reasons and comment'},
        {viewport: 'desktop', theme: 'dark', suffix: '9:click', change: 'Middle score reveals distinct improvement follow-up'},
        {viewport: 'desktop', theme: 'light', suffix: '11:click', change: 'High score reveals recommendation follow-up'},
        {viewport: 'desktop', theme: 'dark', suffix: 'survey-middle:12:click', change: 'Reason toggles pressed state within selected score'},
        {viewport: 'desktop', theme: 'light', suffix: 'survey-middle:18:fill', change: 'Optional comment accepts a draft independently of reason choice'},
        {viewport: 'desktop', theme: 'dark', suffix: 'survey-middle:20:click', change: 'Submission replaces form with score-specific acknowledgement'},
        {viewport: 'desktop', theme: 'light', suffix: '19:click', change: 'Ask me later is a source demo no-op'},
        {viewport: 'desktop', theme: 'light', suffix: '0:click', change: 'Dismiss is a source demo no-op'},
        {viewport: 'stress', theme: 'light', suffix: '9:click', change: 'Narrow six-column score flow and long form respond to selection'},
      ],
      inferences: [
        {scope: 'Other score numerals, repeated reason chips, reverse toggles and keyboard button gestures', basis: 'Three score bands each select one host-owned follow-up. All score IDs use one radio renderer and all reasons one stable-ID toggle; focused state/browser tests exercise reverse and stale guards. Equivalent controls are inferred, not individually replayed.', verification: 'inferred-not-replayed'},
        {scope: 'Other viewport/theme/score combinations and dismissal permutations', basis: 'Eight static pairs cover responsive layout and both themes. Desktop state transitions and one 286px change cover distinct mechanisms; close/later/Escape in the live preview have no content result.', verification: 'inferred-not-replayed'},
      ],
    }
  if (variantId === 'hbar-app-ui-feedback-1')
    return {
      revision: 1,
      lumenEntries: ['feedback-workflows.tsx', 'feedback-widget-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Issue changes the selected radio and contextual placeholder',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Praise exercises the other contextual prompt on the shared type mechanism',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '5:click',
          change: 'Attached screenshot toggles to the add affordance',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:fill',
          change: 'Draft text reduces the remaining character count and enables submission',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'feedback-draft:7:click',
          change: 'Send replaces the editing modal with a compact acknowledgement',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'feedback-sent:0:click',
          change: 'Send another returns to a cleared draft and retained type/attachment state',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '6:click',
          change: 'Cancel has no visible result in the source preview',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '2:click',
          change: 'Narrow segmented selection retains normal-flow privacy and actions',
        },
      ],
      inferences: [
        {
          scope: 'Repeated type, attachment and dismissal gestures',
          basis:
            'All type IDs use one controlled host transition and one radio renderer; attachment toggles one boolean. Close and Cancel are source demo no-ops, while native button activation shares the same handler. Focused tests cover reverse transitions, empty and stale IDs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Every character count, theme and viewport combination',
          basis:
            'A single bounded draft and remaining-count projection drives all lengths; tests cover empty, 400 and over-bound values. Eight static pairs cover four widths and both themes, while distinct state transitions are sampled at desktop and narrow boundary.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-editor-5')
    return {
      revision: 1,
      lumenEntries: ['editor.tsx', 'editor-reader-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Outline selection changes the current section and focus dimming without scrolling the document',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '7:click',
          change: 'Toggle outline collapses the desktop rail while keeping a reopen control',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '8:click',
          change: 'Focus turns off section dimming without changing selection',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'reader-outline-closed:7:click',
          change: 'The collapsed rail reopens without resetting the selected section',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '8:click',
          change: 'Focus remains reachable when the source hides outline and toggle on a narrow viewport',
        },
      ],
      inferences: [
        {
          scope: 'Other section IDs, heading levels, nav order and repeated clicks',
          basis:
            'One stable-ID Host transition selects a section without scrolling, while native buttons expose keyboard activation. Empty/one/duplicate/bound/overflow/stale ID cases and late-section selection are checked separately.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining theme, viewport and action products or manual scroll positions',
          basis:
            'Eight static pairs establish desktop outline and narrow hidden-rail flow. Independent Focus and outline state mechanisms are replayed; production checks verify pane-owned scroll preserves selection and reaches the last section.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-editor-4')
    return {
      revision: 1,
      lumenEntries: ['editor.tsx', 'editor-suggestions-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'Accept replaces only the matching inline text and removes its card',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '7:click',
          change: 'Dismiss removes the selected card while leaving document copy unchanged',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '6:click',
          change: 'Resolve removes a no-replacement card but retains its document phrase',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Accept all completes all cards and exposes the empty recovery state',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Inline suggestion selects its original ID without mutating the document',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '8:click',
          change: 'The narrow panel can reach and accept a later card',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'suggestions-complete:3:click',
          change: 'Restore returns all original cards and inline source copy',
        },
      ],
      inferences: [
        {
          scope: 'Other card IDs, action order and equivalent inline selections',
          basis:
            'One document-ID-bound Host transition drives card removal, accepted replacements, count, selected card, completion and recovery. Empty/one/duplicate/bound/overflow and stale callbacks have focused tests; representative accept, resolve, dismiss, accept-all and restore are replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining theme/width/action combinations and scroll positions',
          basis:
            'Eight static pairs expose the source narrow-header overlap. Local keeps the title and review toolbar in separate flex rows without copying a clipping defect; focused production checks cover long localized labels, short heights and list scrolling. Other equivalent combinations are not replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-editor-3')
    return {
      revision: 1,
      lumenEntries: ['editor.tsx', 'editor-code-reference.tsx', 'editor-code-model.ts', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Selecting a file replaces the highlighted TypeScript preview without changing footer metadata',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Closing the active file removes it and selects the first remaining file',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '6:click',
          change: 'Run is a visible source no-op rather than an invented executor',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '3:click',
          change: 'Closing an inactive file removes just that original ID and retains the selected file',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '4:click',
          change: 'A horizontally overflowing tab strip still reaches the later file',
        },
      ],
      inferences: [
        {
          scope: 'Other file IDs, close order, active line and final-tab behavior',
          basis:
            'One document-ID-bound host transition handles selection and removal. Focused tests cover stale/duplicate IDs, last-tab no-op, line cursor projection and empty/one/bound/overflow content; production browser verifies representative active and inactive removal and click-to-line feedback.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other themes, widths, Run gestures and long-source scroll positions',
          basis:
            'Eight static pairs cover normal-flow code pane, hidden narrow overview, horizontally scrollable tabs/source and flex-wrapped footer; browser checks representative vertical/horizontal scroll, long localized names and narrow footer reachability without multiplying each control by every layout.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-editor-2')
    return {
      revision: 1,
      lumenEntries: ['editor.tsx', 'editor-markdown-reference.tsx', 'editor-markdown-model.ts', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Write removes the preview and expands the controlled source editor',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:click',
          change: 'Preview removes the source and expands the semantic rendered document',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:fill',
          change: 'Source edit updates raw word statistics and rendered paragraph in the split view',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'markdown-preview:1:click',
          change: 'Returning from Preview restores the source with the same document value',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Selecting the already active Split tab is a source no-op',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '2:press-space',
          change: 'Narrow keyboard Preview replaces the only source pane with rendered content',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '3:fill',
          change: 'Narrow source edit updates the summary while Split keeps its preview hidden',
        },
      ],
      inferences: [
        {
          scope: 'Other source text, tab gestures and same-shape focus/hover states',
          basis:
            'One document-ID-bound Host source/mode transition drives both panes and raw-word formatter. Empty/body/inline/list/quote/unsupported markup and stale document callbacks have pure tests; representative wide and narrow edits plus keyboard mode selection are replayed. Source ArrowRight does not implement roving selection.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining theme/width mode combinations and long document scroll positions',
          basis:
            'Eight static pairs cover the 768px split-pane boundary and intrinsic header wrapping. Focused production checks verify source/preview scrolling, short heights, localized labels and mode preservation across resize, without a tab × layout gesture product.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-editor-1')
    return {
      revision: 1,
      lumenEntries: ['editor.tsx', 'editor-rich-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change:
            'Block trigger opens six menu radios in toolbar flow, enlarging its header and centering sibling tools',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'editor-block-open:2:click',
          change: 'Heading 1 changes only the selected block label and closes the menu',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Initially pressed Bold toggles off without formatting the body',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '5:click',
          change: 'Link toggles its pressed state without inventing a URL dialog',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '8:fill',
          change: 'Title edit shows Saving feedback while body counts stay unchanged',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'editor-edited:6:click',
          change: 'Undo after a real body edit is a verified source no-op',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '9:fill',
          change: 'Narrow body edit updates word and character counts with the wrapped toolbar intact',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'editor-block-open:6:press-space',
          change: 'Keyboard chooses the last menu radio and restores the narrow trigger',
        },
      ],
      inferences: [
        {
          scope: 'Other format toggles, block IDs and history actions',
          basis:
            'Five independent ID-bound booleans use one Host transition; live Italic/code/Link probing changes only pressed state. All six blocks use the same selection/close transition, and both Undo/Redo remain no-op after editing. Unit/browser checks cover both toggle directions, stale IDs, localized reordered menus and extended capacity.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated button gestures and viewport/theme permutations',
          basis:
            'Eight static pairs cover toolbar wrapping and document width in both themes. Representative menu open/selection, off/on format toggles, title/body edits and settled post-edit history no-op cover distinct mechanisms. Focused browser checks also observe Saving→Saved, bounded scrolling and callback recovery without clicking every control at every size.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-scheduling-7')
    return {
      revision: 1,
      lumenEntries: ['scheduling.tsx', 'scheduling-booking-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Monday updates the checked date, times heading and inline summary but retains all nine times',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '9:click',
          change: 'Independent time radio changes the summary without changing the selected day',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '17:click',
          change: 'Confirm has no visible source navigation, success or submission feedback',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '6:click',
          change: 'A date beyond the clipped strip retains all source slots and changes the title/summary',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '10:hover',
          change: 'Shared time radio hover feedback in the stacked intermediate layout',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '7:press-space',
          change: 'Narrow keyboard selection of an offscreen date scrolls the date strip and updates summary',
        },
      ],
      inferences: [
        {
          scope: 'Other date IDs, hour choices and disabled full days',
          basis:
            'One stable-ID day selection and one independent time selection use the same Host transitions for all records; disabled source radios are explicitly modeled and unit/browser tests cover empty, stale, duplicate, localized and capacity boundaries.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated gestures across other theme and viewport combinations',
          basis:
            'Eight static light/dark desktop/tablet/mobile/stress pairs cover two-column-to-stacked flow and day-strip clipping. Representative click, keyboard, hover and no-op Confirm cover distinct mechanisms without an exhaustive button × layout replay.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-scheduling-6')
    return {
      revision: 1,
      lumenEntries: [
        'scheduling.tsx',
        'scheduling-timeline-reference.tsx',
        'scheduling-timeline-model.ts',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change:
            'Previous week changes its heading and date columns and leaves the empty adjacent week without events',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Next week exercises the opposite calendar boundary and empty event set',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Today on the initial current week is a source no-op, not a newly invented projection',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Day tab reduces to the selected Wednesday and two events',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '6:click',
          change: 'Day header opens Monday single-day view with both matching events',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '12:click',
          change: 'Event press opens the inline title and duration editor in the footer',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '5:click',
          change: 'New creates and selects an Untitled event in the active day',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '17:hover',
          change: 'Shared event hover feedback in the five-column intermediate width',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '8:press-space',
          change: 'Narrow keyboard day selection changes the semantic view without a horizontal escape',
        },
      ],
      inferences: [
        {
          scope: 'Remaining date/event IDs and repeated week directions, view toggles, and themes',
          basis:
            'Shared ID-keyed Host transitions are sampled for week, single-day, current day, event selection and creation. Eight static viewport/theme pairs cover responsive column width, header hiding, clipping and colors; local tests cover duplicate, empty, stale, over-bound, localized and keyboard boundaries.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Editor title/duration/close/delete and pointer move/resize combinations',
          basis:
            'Live source probe observed direct title editing, duration resizing, close persistence, deletion, drag between days and bottom-edge resize. Distinct mechanisms receive focused local browser assertions; not every event/viewport permutation is replayed against the source.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-scheduling-5')
    return {
      revision: 1,
      lumenEntries: ['scheduling.tsx', 'scheduling-availability-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:select',
          change: 'Native timezone changes only the selected value, not daily intervals',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '7:click',
          change: 'Two-interval Tuesday becomes unavailable and decreases the Host-formatted day count',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:select',
          change: 'A native start time changes only its own interval option',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:select',
          change: 'A native end time changes independently without fabricated interval validation',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '10:click',
          change:
            'Remove the first Tuesday interval, keeping the second original interval and disabling its last removal',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '5:click',
          change: 'Add an interval to a single-interval day with the source default 13:00–17:00',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '15:click',
          change: 'Copy Tuesday has no visible source data result or invented toast',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '40:click',
          change: 'Save hours has no visible source submission feedback',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '14:hover',
          change: 'Shared add button pointer feedback in the wide rows',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '34:press-space',
          change: 'Narrow keyboard switch enables Saturday, inserts a default interval and updates the day count',
        },
      ],
      inferences: [
        {
          scope: 'Other day IDs, start/end choices and repeated add/remove cycles',
          basis:
            'Seven source rows share one ID-keyed Host transition. Tuesday removal, Monday addition and Saturday toggle sample three distinct mutations; live probing confirmed repeated addition appends 13:00–17:00, last interval removal is disabled and re-enabling a day resets to one 09:00–17:00 interval. Local tests cover duplicated/stale IDs and mutation of original IDs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other themes, widths, equivalent pointer/keyboard gestures and remaining no-op buttons',
          basis:
            'Eight static source/local pairs cover desktop, tablet and both narrow flows in two themes. Copy and Save are distinct sampled source no-ops; their other day labels share the same handlers. Space on narrow switch and native selects cover representative keyboard operation, without multiplying every action by layout.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-scheduling-4')
    return {
      revision: 4,
      lumenEntries: ['scheduling.tsx', 'scheduling-deadline-reference.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Tomorrow changes only the highlighted preset, retaining selected calendar date and deadline summary',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:click',
          change: 'No date is a pressed preset but does not clear the source date or time',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '6:select',
          change: 'Native month select changes its value without rebuilding calendar or deadline summary',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '22:click',
          change: 'Calendar day changes the pressed cell, time pane title and deadline summary',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '41:click',
          change: 'Radio selection changes the checked time and deadline summary, independently of date and preset',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '5:click',
          change: 'Previous month is a source no-op independent of native select value',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '58:click',
          change: 'Cancel does not reset the source deadline panel',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '59:click',
          change: 'Apply does not close the source deadline panel or show success',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '9:hover',
          change: 'Shared date hover feedback in the wide calendar flow',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '23:press-space',
          change: 'Narrow native Space selects a different date with a corresponding summary',
        },
      ],
      inferences: [
        {
          scope: 'Other preset/date/time IDs and equivalent gestures',
          basis:
            'Five presets, thirty date buttons and twenty time radios use three independent Host-owned ID transitions. Live source probing confirms Tomorrow and No date only highlight; date updates title/summary; time updates summary. Space is sampled for a narrow date; time radios share native button activation and local Enter/Space coverage. Local boundary tests cover stale, duplicate, empty and over-bound IDs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Next month and other month option values',
          basis:
            'Live source probing confirms both arrow buttons are no-ops; one represents the shared mechanism. Native select changes only itself, not the displayed day or summary. Other options reuse native behavior.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other themes, widths, repeated focus and scroll positions',
          basis:
            'Eight static pairs cover two themes and four viewport flows; dynamic samples cover desktop preset/date/time and narrow date keyboard behavior. The scrolling time pane, short-host reachability and time-radio Enter/Space are tested locally. A separately preserved narrow time Enter probe had matching DOM state but source clipping and hover changed a different preset in the before/after pixels; it is not counted as a matched replay. Source narrow initial centering clips top content, retained as explicit non-theme geometry review.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-scheduling-3')
    return {
      revision: 1,
      lumenEntries: ['scheduling.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:fill',
          change: 'Schedule name is an editable text value, not a required submit gate',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Remove the original first attendee without altering remaining draft fields',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:fill',
          change: 'Attendee query changes only its text, without inventing suggestions or admission',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:fill',
          change: 'Date is a plain editable textbox, not a native date picker',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '5:select',
          change: 'Starts selects a native source time option',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '6:select',
          change: 'Ends changes independently without interval validation',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '7:click',
          change: 'Attach is a source no-op without an invented file chooser',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '8:fill', change: 'Meeting link preserves a typed plain value' },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '9:fill',
          change: 'Notes becomes reachable through the body scroll owner, with header/footer preserved',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '10:click',
          change: 'Cancel does not reset or close the source card',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '11:click',
          change: 'Create is enabled for an empty draft and has no fabricated success result',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '2:press-space',
          change: 'Narrow native keyboard removal targets the original second attendee',
        },
      ],
      inferences: [
        {
          scope: 'Other input values, attendees, gestures and edited submit state',
          basis:
            'Live source probing verified that attendee Enter adds no person, an end before start adds no validation, Attach opens no chooser and Cancel/Create preserve filled name/query/date/link/notes and removed people. Input mechanisms are independent; one keyboard removal proves native ID-bound activation. Local tests cover reordered/duplicate IDs, empty and over-bound data.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other layouts/themes, passive copy and scroll edges',
          basis:
            'Eight static pairs cover the bounded form card, associated labels, equal time fields, attendee wrap and fixed-outside-body footer. Body scrolling and fade edges are observed locally at desktop/narrow/short Host; remaining repeated values and gestures are not multiplied by width or theme.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-scheduling-2')
    return {
      revision: 1,
      lumenEntries: ['scheduling.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'Duration radio updates its checked state and the inline calendar summary, not the time choices',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:select',
          change: 'Start is a native choice independent of the duration summary',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:select',
          change: 'End is independently selected without fabricated interval validation',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:click',
          change: 'More options is a source no-op, not an invented menu',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '13:click',
          change: 'Cancel is a source no-op, not a draft reset',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '14:click',
          change: 'Apply is a source no-op, not a fabricated success result',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '3:hover',
          change: 'Unselected duration pointer feedback in the wrapped radio flow',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '12:press-space',
          change: 'Native Custom radio activation updates the same inline summary without adding inputs',
        },
      ],
      inferences: [
        {
          scope: 'Other durations, time option values and equivalent keyboard gestures',
          basis:
            'Ten native button radios share ID-bound selection and the same Host-localized inline summary. Live Custom probing adds no editor; changing either native time leaves the summary unchanged, even when end precedes start. Space is replayed once; source ArrowRight does not implement roving selection. Local tests cover stale/reordered/duplicate IDs and original callback targets.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other widths/themes, passive identity and capacity',
          basis:
            'Eight static pairs cover the centered content-grown card, two equal flowing time fields, wrapped duration options, truncated identity/summary and ordered footer actions. Identity and helper text are passive. Local checks cover long translation, native option boundaries, explicit duration pane scrolling and short-host keyboard reachability.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-scheduling-1')
    return {
      revision: 1,
      lumenEntries: ['scheduling.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '14:click',
          change: 'Date selection changes the pressed cell and heading, not the six event records',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:select',
          change: 'Native month selection changes only its selected value',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:select',
          change: 'Native year selection does not fabricate a new calendar projection',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '34:select',
          change: 'Filter value changes while the public source keeps the same event list',
        },
        { viewport: 'desktop', theme: 'light', suffix: '0:click', change: 'Previous month is a source no-op' },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '35:click',
          change: 'Add does not open an invented creation form',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '14:hover',
          change: 'Shared date pointer feedback in stacked calendar flow',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '14:press-space',
          change: 'Native date keyboard selection at narrow width',
        },
      ],
      inferences: [
        {
          scope: 'Other date cells, native keyboard gestures and date/year/filter values',
          basis:
            'Thirty native date buttons share the same ID-bound selection. Source probing found that the heading keeps its Wednesday/June prefix as the date changes; the three selects alter only their own values. Native Space is replayed once; local tests cover reordered/stale/duplicate and over-bound data.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Next month, Add and passive event metadata',
          basis:
            'Live source Previous/Next and Add have no domain-state result. Previous and Add are representative no-op replays. Event articles, participants, time and location are passive content, not clickable rows.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other themes/viewports and calendar/agenda capacity',
          basis:
            'Eight static pairs cover seven-column flex flow, desktop two panes, stacked narrow panes, hidden compact filter and wrapped metadata. Empty/one/boundary-plus-one, long locale and pane scrolling receive local tests rather than per-date by per-layout replay.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-comments-6')
    return {
      revision: 1,
      lumenEntries: ['comments.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Second canvas pin selects its matching comment border and reply target',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:click',
          change: 'Resolve updates open count, marker styling, strike-through and reversible action',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '6:click',
          change: 'Locate selects the original second pin without changing resolution or history',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '9:fill',
          change: 'Native input changes only the controlled reply draft',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '10:click',
          change: 'Send is enabled but source-no-op, leaving comments and draft intact',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '1:press-space',
          change: 'Native pin keyboard selection works in the stacked layout',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '5:press-space',
          change: 'Narrow resolution scrolls to the original comment action',
        },
      ],
      inferences: [
        {
          scope: 'Repeated pin/locate/resolve actions, reopening and passive mode',
          basis:
            'Live source confirms one ID-keyed selection shared by pins and Locate, reversible resolution without removing comments, and passive Comment mode. Local browser checks cover reopen, all-resolved selection and draft-preserving target switches; same-mechanism markers are not replayed individually.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Hover/focus and input/submit keyboard variations',
          basis:
            'Source pin hover/focus has no changed border/background or outline; compact action hover changes color. Native input and always-enabled Send do not submit, clear the draft or add a result. Local checks cover these behaviors without replaying every equivalent gesture.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining themes/viewports, localized and excess records',
          basis:
            'Eight static pairs cover side-by-side versus stacked flow and pane scrolling. The source centers oversized narrow content with the title above the viewport; local safe centering keeps the header reachable. Long locale, empty/one/boundary-plus-one, duplicates and stale selection are separately tested.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-comments-5')
    return {
      revision: 1,
      lumenEntries: ['comments.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Unresolved filters out the initially resolved record without changing global counts',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Mentions projects the two mentioned records',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:click',
          change: 'Resolve updates count, pressed label, strike-through and mention badge',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '7:click',
          change: 'Reopen reverses the initially resolved record',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:hover',
          change: 'Shared per-comment action pointer feedback',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'comments-inbox-unresolved:3:click',
          change: 'Resolve inside Unresolved removes only that original row',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'comments-inbox-last-open:3:click',
          change: 'Resolving the last visible record reaches the real two-paragraph empty state',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'comments-inbox-empty:0:click',
          change: 'All restores the resolved records from an empty filtered view',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '3:press-space',
          change: 'Narrow native keyboard resolution keeps history owned by its scroll pane',
        },
      ],
      inferences: [
        {
          scope: 'Other record actions and resolved mentions',
          basis:
            'All five rows use stable-ID resolution. Source probing confirms that resolved mentions remain in Mentions but lose their badge. One resolve, one reopen, filtered removal and last-item empty state cover the distinct branches; local tests cover mutation and original targets.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Equivalent tab gestures, focus and passive document contexts',
          basis:
            'Source tabs are native buttons; ArrowRight does not change the selected tab. Local browser checks cover native focus/Space without inventing roving navigation. Author/context/body regions are passive, not links or selectable cards.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining viewport/theme interactions and excess records',
          basis:
            'Eight static pairs cover header wrapping, hidden narrow mention badges, text ellipsis and the 400px history scroll owner. Local long-locale, duplicate/stale-ID and boundary-plus-one checks cover those dimensions without multiplying every action by every viewport.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-comments-4')
    return {
      revision: 1,
      lumenEntries: ['comments.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Remove one attachment by stable ID while preserving the draft and suggestions',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:hover',
          change: 'Shared formatting toolbar pointer feedback',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '7:click',
          change: 'Attach is a source no-op without a fabricated picker or upload',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '8:click',
          change: 'Comment preserves the source draft, attachments and existing history',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '11:click',
          change: 'Choose a mention and replace the trailing query with its handle',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:fill',
          change: 'A draft without a trailing mention query hides suggestions',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'comments-composer-filtered:10:click',
          change: 'Name-filtered candidate inserts the original matching member',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'comments-composer-next:0:press-enter',
          change: 'ArrowDown then Enter selects the next member at narrow width',
        },
      ],
      inferences: [
        {
          scope: 'Equivalent format, link, mention-toolbar and submit gestures',
          basis:
            'Live source probing found no formatting, link dialog, toolbar mention insertion, file chooser or posted message. Representative attach/submit and toolbar hover are replayed. Local checks preserve drafts and verify no invented controls.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other candidates, reverse arrows, empty queries and dismissal',
          basis:
            'Options share stable-ID insertion and name-only filtering. Source Escape and outside click do not dismiss suggestions; Enter without candidates inserts a newline despite the helper label. Local browser tests cover these edges, wraparound and recovery from no matches.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated viewport/theme actions and content capacity',
          basis:
            'Eight static pairs cover attachment wrapping, popup anchoring and narrow history scrolling. The source toolbar has intrinsic width and can protrude at 286px; the owning stage keeps the trailing action reachable. Local long-locale and boundary-plus-one tests cover overflow without a button-by-layout product.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-comments-3')
    return {
      revision: 1,
      lumenEntries: ['comments.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:click',
          change: 'Thread resolution updates the pressed state and label',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:fill',
          change: 'Reply draft enables the only submit control',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'comments-review-filled:2:click',
          change: 'Enabled Reply preserves the source draft and existing discussion',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '0:hover', change: 'Thread resolution pointer feedback' },
        { viewport: 'desktop', theme: 'light', suffix: '1:focus', change: 'Reply field keyboard focus' },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '0:press-space',
          change: 'Narrow keyboard thread resolution without disturbing scroll owners',
        },
      ],
      inferences: [
        {
          scope: 'Reverse resolution and equivalent input values',
          basis:
            'Source probing confirms the same toggle reopens and leaves the input enabled. Local browser tests verify both directions, whitespace gating and draft preservation. No layout-by-button product is replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Passive code lines, suggestions and comments at other widths/themes',
          basis:
            'The source has three controls only; diff rows and suggested code are read-only. Eight static pairs plus local code-horizontal/message-vertical scroll, capacity and long localized tests cover their flow.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-comments-2')
    return {
      revision: 1,
      lumenEntries: ['comments.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Resolve synchronizes open count, range styling, note strike-through and pressed state',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:click',
          change: 'Inline range selects its associated comment without changing document content',
        },
        { viewport: 'desktop', theme: 'light', suffix: '7:click', change: 'An initially resolved annotation reopens' },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '6:click',
          change: 'Show in text selects the matching range and rail card',
        },
        { viewport: 'desktop', theme: 'light', suffix: '1:hover', change: 'Inline range pointer feedback' },
        { viewport: 'desktop', theme: 'light', suffix: '3:focus', change: 'Resolve button keyboard focus' },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '9:click',
          change: 'Compact Review is a verified source no-op, not a fabricated drawer',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '0:press-space',
          change: 'Native keyboard activation of a resolved range in the scroll-owned narrow document',
        },
      ],
      inferences: [
        {
          scope: 'Other annotation targets and repeated gestures',
          basis:
            'All three records use stable-ID selection and resolution toggles. Resolve/reopen, range selection and Show in text represent independent mechanisms; local tests cover target preservation after reorder and stale IDs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Document, rail capacity and narrow intrinsic width',
          basis:
            'Eight static pairs cover responsive rail replacement. The source compact summary has intrinsic width that can exceed a 286px canvas; the component-owned scroll region preserves access rather than clipping a hidden action. Local tests exercise the document vertical scroll and narrow horizontal reachability once.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-comments-1')
    return {
      revision: 1,
      lumenEntries: ['comments.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:click',
          change: 'Newest reverses top-level threads without reversing nested replies',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'A selected reaction decrements count and clears pressed state',
        },
        { viewport: 'desktop', theme: 'light', suffix: '2:click', change: 'More actions is a source preview no-op' },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'Reply is a source preview no-op, not a fabricated composer workflow',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '11:fill',
          change: 'Draft enables Comment without adding a thread',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'comments-discussion-filled:12:click',
          change: 'Enabled Comment preserves the source draft and thread',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '3:hover', change: 'Reaction control pointer feedback' },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '11:focus',
          change: 'Narrow composer focus and native editable surface',
        },
      ],
      inferences: [
        {
          scope: 'Repeated message reactions, reply and more controls',
          basis:
            'Three parent messages share one stable-ID reaction mechanism and two no-op callback mechanisms. Each mechanism is sampled once; local tests cover reversal, stable targets and repeated toggles.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other layouts, themes and input values',
          basis:
            'Eight static pairs cover both themes and all widths. Input trimming only gates Comment; empty, duplicate, long localized and over-capacity content are tested locally. No exhaustive control-by-layout replay is claimed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-wizard-7')
    return {
      revision: 1,
      lumenEntries: [
        'wizard.tsx',
        'wizard.css',
        'wizard-shipping-reference.css',
        'wizard/ShippingReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '5:click',
          change: 'Radio choice changes only the current question selection',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '10:click',
          change: 'Continue advances to unselected question 3 and disables itself',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '9:click',
          change: 'Previous returns to question 1 with its own default and disabled back boundary',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '4:click',
          change: 'Last dot jumps to question 5 with disabled Finish and natural subtitle wrap',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '11:click',
          change: 'Skip has no visible transition in the public preview',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'wizard-shipping-final-selected:10:click',
          change: 'Selected final Finish is enabled yet remains a source preview no-op',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'wizard-shipping-third-selected:10:click',
          change: 'Selecting a previously empty question enables next and advances to question 4',
        },
      ],
      inferences: [
        {
          scope: 'Other dot jumps, question selections and repeated keyboard gestures',
          basis:
            'Five Host questions share one current ID and ID-keyed selection map. Samples span pointer radio, forward/back/jump, disabled guard recovery and final no-op. Browser checks keyboard radio, per-question retention, first/last boundaries and all five headings without a dot-by-option matrix.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other themes/sizes, Skip repeats and long option lists',
          basis:
            'Eight static pairs cover centered compact card and stress subtitle wrapping; Skip is a passive preview action. Localized, duplicate, stale and 40-option capacity fixtures verify flow and scroll without inventing a completion state.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-wizard-6')
    return {
      revision: 1,
      lumenEntries: [
        'wizard.tsx',
        'wizard.css',
        'wizard-migration-reference.css',
        'wizard/MigrationReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Warning Review has no visible result in the source preview',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:click',
          change: 'Cancel migration is passive after natural narrow scrolling',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '2:press-space',
          change: 'Keyboard background action has no visible navigation in the preview',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '0:hover',
          change: 'Narrow warning action pointer feedback without task reordering',
        },
      ],
      inferences: [
        {
          scope: 'Timer digit equality across independent source/local page loads',
          basis:
            'The source starts at 64% and advances two points about every 1.5 seconds; independent browsers are not frame-synchronized. Host timer cadence, finite clamping, and an over-bound task list have local tests. Static captures cover 8 independently timed responsive-theme states rather than asserting identical transient digits.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated button gestures and passive task rows at other widths/themes',
          basis:
            'Three distinct preview controls are sampled, with pointer and keyboard activation. Six task rows have status-specific icons but no row click; 8 static pairs and localized/overflow fixtures cover wraps, clipping and capacity.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-wizard-5')
    return {
      revision: 1,
      lumenEntries: [
        'wizard.tsx',
        'wizard.css',
        'wizard-review-reference.css',
        'wizard/ReviewReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Campaign Edit leaves read-only review content intact in the public preview',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '3:toggle',
          change: 'Confirmation enables send at the content-grown footer',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '3:press-space',
          change: 'Narrow keyboard confirmation scrolls to the footer and enables send',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'wizard-review-confirmed:5:click',
          change: 'Enabled Schedule send has no visible completion transition in the source preview',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'wizard-review-confirmed:3:toggle',
          change: 'Unchecking confirmation re-disables send in narrow flow',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '2:click',
          change: 'Last section Edit is passive after natural overflow scroll',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'Back has no visible navigation in the source preview',
        },
      ],
      inferences: [
        {
          scope: 'Other Edit controls, repeated confirmation gestures and passive actions',
          basis:
            'Three section edits share one read-only button, and a single Host boolean gates the native send control. Baseline confirms disabled-send boundary. Browser covers pointer, keyboard, check/uncheck and enabled-send no-op without every button/layout combination.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme states and additional read-only rows',
          basis:
            'Eight static pairs cover card width, mobile step-label collapse and long row truncation. Three Host sections with nine rows share flow-based markup; localized/duplicate/empty/over-bound fixtures verify capacity and accessibility without fabricated editing or delivery.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-wizard-4')
    return {
      revision: 1,
      lumenEntries: [
        'wizard.tsx',
        'wizard.css',
        'wizard-environment-reference.css',
        'wizard/EnvironmentReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Deselecting Postgres updates count and weighted deploy estimate',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '4:press-space',
          change: 'Keyboard selection of storage updates checked tile in the two-column layout',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '1:click',
          change: 'Save and exit remains a source no-op in narrow chrome',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:click',
          change: 'Back is passive in the source preview, not a fabricated page transition',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'wizard-environment-empty:10:click',
          change: 'Zero selected still permits Set limits as a source no-op with zero estimate',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'environment-body:scroll:end',
          change: 'Service pane wheel reaches final tiles and safety copy while footer stays visible',
        },
      ],
      inferences: [
        {
          scope: 'Other service combinations and repeated gestures',
          basis:
            'Eight tiles share one ID-keyed Host toggle. Source probes establish each service deploy weight; local tests cover all 256 subsets, stale IDs, duplicate records and zero state. Pointer removal, keyboard addition and empty state cover distinct transitions without a button-by-layout cross product.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme combinations and passive progress labels',
          basis:
            'Eight static pairs cover three, two and one-column wrapping. Four steps are read-only progress labels, not buttons. The three passive actions and independent scrolling are sampled; localization and over-bound service lists have local browser coverage.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-wizard-3')
    return {
      revision: 1,
      lumenEntries: [
        'wizard.tsx',
        'wizard.css',
        'wizard-upgrade-reference.css',
        'wizard/UpgradeReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'Team selection moves the checked radio while invoice preview remains passive',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '6:click',
          change: 'Enterprise selection confirms the other radio boundary and static summary',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '1:click',
          change: 'Narrow numbered step selects Seats without replacing plan content',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '7:click', change: 'Next advances only the progress rail' },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '3:click',
          change: 'Review jump marks preceding steps complete in the stacked layout',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'wizard-upgrade-step-two:0:click',
          change: 'Returning to Plan restores first-step progress',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '5:click',
          change: 'Selecting the already checked Business option is a source no-op',
        },
      ],
      inferences: [
        {
          scope: 'Other step/radio clicks and keyboard gestures',
          basis:
            'Four steps share one Host index and three plans share one selected ID. Representative first/last selection, forward/jump/back and selected no-op cover distinct state changes; the passive invoice snapshot remains unchanged by plan clicks in live probes. Local browser tests keyboard and boundary updates.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme combinations and read-only invoice rows',
          basis:
            'Eight static pairs cover desktop split and narrow stack; rows are read-only Host data. Overflow and localized long copy are tested locally without inventing actions on line items.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-wizard-2')
    return {
      revision: 1,
      lumenEntries: [
        'wizard.tsx',
        'wizard.css',
        'wizard-invoice-reference.css',
        'wizard/InvoiceReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '13:click',
          change: 'Next step has no source business transition in this preview',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '2:click',
          change: 'Clear customer is a source no-op, not an invented reset',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '0:click',
          change: 'Close is a source no-op in the narrow layout',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '8:select',
          change: 'Currency select updates its own value, not the passive USD badge',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '1:fill',
          change: 'Customer input updates in the stacked narrow form',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'invoice-body:scroll:end',
          change: 'Native wheel reveals Collection and Billing address while header/footer stay fixed',
        },
      ],
      inferences: [
        {
          scope: 'Save draft and other passive action buttons',
          basis:
            'Live source probe also confirmed Save draft has no visible result; Close, Clear customer and Next sample distinct no-op controls. The local browser checks all four without inventing a submit or close state.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other fields, select options, layouts and themes',
          basis:
            'All eight text fields use the same Host value update; the three native selects share one mechanism. Six real states and eight static pairs cover movement, input, selection and responsive stacking; local tests cover empty, duplicate, localized and over-bound data.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-wizard-1')
    return {
      revision: 1,
      lumenEntries: [
        'wizard.tsx',
        'wizard.css',
        'wizard-information-reference.css',
        'wizard/InformationReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '12:click',
          change: 'Next advances the progress rail while retaining the information form',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '2:click',
          change: 'Completed jump marks preceding steps complete without inventing another page',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '3:fill',
          change: 'Narrow required first-name field updates in normal document flow',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '7:select',
          change: 'Native Role choice changes independently of step state',
        },
        { viewport: 'mobile', theme: 'dark', suffix: '1:click', change: 'Narrow numbered step button selects Payment' },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'wizard-information-step-two:11:click',
          change: 'Back returns to Information and re-disables itself',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'wizard-information-step-three:12:click',
          change: 'Next at final progress marker remains a no-op',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'wizard-information-empty-name:12:click',
          change: 'Empty starred field still advances progress, matching the source non-validating form',
        },
      ],
      inferences: [
        {
          scope: 'Other fields, options, steps and viewport/theme combinations',
          basis:
            'All eight fields use one Host value contract, two native selects share one option mechanism, and three rail steps share one index transition. The starred field is observed to be non-validating. Eight distinct states and eight static pairs cover input, selection, forward/back/jump/boundary and narrow flow; repeated controls are verified through focused tests.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-kanban-6')
    return {
      revision: 1,
      lumenEntries: [
        'kanban.tsx',
        'kanban.css',
        'kanban-compact-reference.css',
        'kanban/CompactReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'Passive card click does not open a detail view',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '6:click',
          change: 'Forward arrow appends the first task to Today and updates counts',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '1:click',
          change: 'Narrow tab selects Today without changing task data',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '4:press-space',
          change: 'Keyboard activation of card body remains passive',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '6:click',
          change: 'Forward move retains Inbox selection and removes moved card',
        },
      ],
      inferences: [
        {
          scope: 'Other cards, reverse arrows, column tabs and viewport/theme combinations',
          basis:
            'The ten cards share the same Host movement and selected-column contracts. One passive pointer and keyboard activation, forward moves in wide/narrow layouts, and one narrow tab cover distinct state mechanisms; eight static pairs cover visual modes. Edge disabled arrows and reverse movement have focused Host/browser tests.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Wide-screen pointer drag',
          basis:
            'Drag and arrow movements update the same Host column field and append order; the local browser verifies one native drag between column regions.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-kanban-5')
    return {
      revision: 1,
      lumenEntries: [
        'kanban.tsx',
        'kanban.css',
        'kanban-sprint-reference.css',
        'kanban/SprintReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Ordinary card click has no detail transition',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '4:click',
          change: 'Blocked card remains a passive card on the compact layout',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '0:press-space',
          change: 'Space grabs a card and announces keyboard movement',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'sprint-grabbed:move-right',
          change: 'ArrowRight changes the stage and capacity totals immediately',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'sprint-target:drop',
          change: 'Space drops the moved card and announces its destination',
        },
      ],
      inferences: [
        {
          scope: 'Other ten cards and repeated themes/layouts',
          basis:
            'All sprint cards share the same Host move contract; blocked and ordinary click, keyboard lift/move/drop are distinct branches. Static pairs cover all eight responsive/theme combinations.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Pointer drag',
          basis:
            'Pointer and keyboard movement update the same Host stage field; local browser verifies one pointer drop and recomputed point/capacity values.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-kanban-4')
    return {
      revision: 1,
      lumenEntries: [
        'kanban.tsx',
        'kanban.css',
        'kanban-detail-reference.css',
        'kanban/DetailReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Selecting a different card changes the detail pane and pressed card',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '8:click',
          change: 'Close details reveals the full board under the narrow overlay',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '11:click',
          change: 'Move to In review updates both column and detail status',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '10:click',
          change: 'Selecting the current status still announces the move',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'detail-closed:2:click',
          change: 'Reopening a card from the closed narrow board restores its details',
        },
      ],
      inferences: [
        {
          scope: 'Other cards, status buttons and themes',
          basis:
            'All seven cards and four status controls use the same Host selection/move contract; selecting an empty-activity card and moving the default card cover distinct detail states while eight static captures cover layouts.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Pointer drag',
          basis:
            'Pointer drop and status buttons update the same Host column field; representative pointer movement is checked locally without replaying every card/column pair.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-kanban-3')
    return {
      revision: 1,
      lumenEntries: [
        'kanban.tsx',
        'kanban.css',
        'kanban-regroup-reference.css',
        'kanban/RegroupReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Assignee tab regroups all nine cards into three owner columns',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '2:click',
          change: 'Priority tab regroups cards into three severity columns',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Card click has no detail transition on the source',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '3:press-space',
          change: 'Space grabs the card for a keyboard move',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'regroup-grabbed:move-right',
          change: 'ArrowRight changes the grabbed card status immediately',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'regroup-target:drop',
          change: 'Space completes the keyboard move and announces the destination',
        },
      ],
      inferences: [
        {
          scope: 'Other cards and repeated viewport/theme combinations',
          basis:
            'Nine cards share one controlled field-update path; sampled Assignee, Priority, no-op click and keyboard status movement cover distinct state branches, while all eight static pairs cover layout.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Pointer drag',
          basis:
            'Pointer and keyboard use the same Host onMove contract; a local browser check verifies representative pointer drop without multiplying every card by every column.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-kanban-2')
    return {
      revision: 2,
      lumenEntries: [
        'kanban.tsx',
        'kanban.css',
        'kanban-swimlanes-reference.css',
        'kanban/SwimlanesReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Collapse all hides cards in the three lanes',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '1:click',
          change: 'Independent lane disclosure preserves other lanes',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '2:click', change: 'Card click tests its source no-op outcome' },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '2:press-space',
          change: 'Keyboard grab announces the active card',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'swimlane-all-collapsed:0:click',
          change: 'Expand all restores three lane contents',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'swimlane-grabbed:move-stage',
          change: 'ArrowRight immediately moves the grabbed card into the next stage',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'swimlane-stage-moved:move-lane',
          change: 'ArrowDown moves the grabbed card into the next lane in the same stage',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'swimlane-lane-moved:drop',
          change: 'Space ends the keyboard move and announces the drop',
        },
      ],
      inferences: [
        {
          scope: 'Repeated cards and lanes',
          basis:
            'Three lanes use the same disclosure and card controls; collapse, expand, no-op click and keyboard cross-stage/cross-lane/drop samples cover distinct mechanisms without clicking every cell at each width.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Pointer drag and repeated viewport permutations',
          basis:
            'The same Host move contract handles both pointer and keyboard drop targets; representative keyboard transitions are replayed and responsive scroll ownership is checked locally.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-kanban-1')
    return {
      revision: 3,
      lumenEntries: [
        'kanban.tsx',
        'kanban.css',
        'kanban-reference.css',
        'kanban/BoardReference.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Adding to the first column tests card creation and count feedback',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Clicking a card tests selection/detail feedback without visiting every row',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '1:press-space',
          change: 'Native keyboard lift starts the accessible drag path on a narrow board',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'kanban-grabbed:1:press-arrowright',
          change: 'ArrowRight moves the grabbed card to the next column before the drop',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'kanban-composer-open:3:click',
          change: 'Cancel closes the inline composer without creating a card',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'kanban-composer-ready:2:click',
          change: 'Submitting text inserts the next card and updates the open count',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'kanban-grabbed-target:7:press-space',
          change: 'Keyboard drop ends the drag and announces its destination',
        },
      ],
      inferences: [
        {
          scope: 'Repeated columns, cards and themes',
          basis:
            'The same card and column mechanisms apply to host-provided records; representative creation, click and keyboard lift sample the changing branches without multiplying every card by each layout.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Board horizontal pan',
          basis:
            'Desktop and narrow static captures expose the board scroll owner; local overflow and responsive checks verify the same container while column positions are inferred.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-14')
    return {
      revision: 2,
      lumenEntries: [
        'authentication.tsx',
        'authentication-sign-in-approval-reference.css',
        'authentication/SignInApprovalAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Approval outcome replaces the pending request',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:click',
          change: 'Denial outcome distinguishes the security response on a narrow layout',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-approval-approved:0:click',
          change: 'Back from approval restores the pending request',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'auth-approval-blocked:0:click',
          change: 'Password action from the blocked state tests source navigation feedback',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'auth-approval-blocked:1:click',
          change: 'Back from denial restores the pending request',
        },
      ],
      inferences: [
        {
          scope: 'Button activation modality and theme permutations',
          basis:
            'Both native buttons use the same activation path across themes and widths; click samples cover the two distinct outcomes while keyboard and repeated viewport combinations are inferred.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Passive recent sign-in rows',
          basis:
            'The source exposes three list items, not interactive controls; host count, locale and overflow boundaries are tested without clicking every row.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-13')
    return {
      revision: 2,
      lumenEntries: [
        'authentication.tsx',
        'authentication-password-reset-reference.css',
        'authentication/PasswordResetAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:fill',
          change: 'Weak password updates only satisfied requirement bars and copy',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:fill',
          change: 'Strong password satisfies all requirements while confirmation remains empty',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-reset-strong:2:fill',
          change: 'Mismatched confirmation keeps Update disabled',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-reset-strong:2:fill',
          change: 'Matching confirmation enables Update',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Reveal changes native input type and accessible button name',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '3:toggle',
          change: 'Other-device sign-out preference toggles independently',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: 'auth-reset-ready:4:click',
          change: 'Valid update exercises the source completion branch',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-reset-ready-no-signout:4:click',
          change: 'Valid update with sign-out disabled distinguishes the alternate completion message',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'auth-reset-success:1:click',
          change: 'Set a different password returns from completion to the form',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-reset-success:0:click',
          change: 'Continue from completion has no documentation navigation',
        },
      ],
      inferences: [
        {
          scope: 'Password requirement combinations',
          basis:
            'Weak and strong values plus mismatched and matching confirmation cover the gating branches without testing every character permutation or viewport.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Passive device rows',
          basis:
            'Three device types and empty/over-bound host records are rendered as information; only the global sign-out preference is interactive.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-12')
    return {
      revision: 3,
      lumenEntries: [
        'authentication.tsx',
        'authentication-invitation-reference.css',
        'authentication/InvitationAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '1:fill', change: 'Name entry alone leaves Accept disabled' },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-invite-named:2:fill',
          change: 'Valid password after a name enables the native submit action',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-invite-success:0:click',
          change: 'Open workspace from confirmation has no documentation navigation',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Password reveal toggles the input type and accessible button name',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:click',
          change: 'Google alternative has no documentation navigation',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-invite-ready:4:click',
          change: 'Valid submit replaces the two-column form with confirmation while retaining organization context',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '5:click',
          change: 'Decline invitation has no documentation navigation',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'auth-invite-success:1:click',
          change: 'Review returns from confirmation to the filled invitation form',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: 'auth-invite-ready:4:click',
          change: 'Valid submit opens the single-column confirmation and review control',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '1:fill',
          change: 'Narrow name entry preserves the source form flow and disabled submit',
        },
      ],
      inferences: [
        {
          scope: 'Form validation states',
          basis:
            'Name-only and valid name/password represent the two gating branches; password reveal is separate. Repeated typing permutations and viewport combinations are inferred from shared controlled inputs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Static organization data',
          basis:
            'Members and projects are passive host records captured in eight light/dark layouts; no clicks are invented for them.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-11')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-workspace-reference.css',
        'authentication/WorkspacePickerAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:click',
          change: 'Selecting another ordinary workspace updates pressed row and Open action',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:fill',
          change: 'Search narrows the six workspaces to the Design match',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '6:click',
          change: 'Choosing an invitation updates the primary action and selection',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '8:click',
          change: 'Create workspace row demonstrates its own reference feedback',
        },
        { viewport: 'tablet', theme: 'dark', suffix: '0:click', change: 'Sign out has no documentation navigation' },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:fill',
          change: 'A no-match query reveals the host-owned empty state',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '9:click',
          change: 'Open action has no documentation navigation',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '3:press-space',
          change: 'Keyboard choice updates the narrow selected row without replaying every workspace',
        },
      ],
      inferences: [
        {
          scope: 'Repeated workspace rows',
          basis:
            'Ordinary workspace and invitation selection share host state; one of each plus a narrow keyboard choice covers the distinct feedback branches.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'List scroll and responsive layout',
          basis:
            'Eight static pairs show clipping and footer ownership; the invitation and create controls exercise scrolling into the list rather than multiplying every row by every viewport.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-10')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-account-reference.css',
        'authentication/AccountChooserAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Selecting the second account changes pressed state, workspace action and sign-in hint',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Expired contractor selection changes action to reauthentication and shows its session hint',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-account-contractor:4:click',
          change: 'Expired-account reauthentication action has no documentation navigation',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Use another account has no documentation navigation',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '4:click',
          change: 'Default account Continue has no documentation navigation',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '5:click',
          change: 'Sign out of all accounts has no documentation navigation',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '2:press-space',
          change: 'Keyboard selection of expired account preserves narrow truncation and wrapping',
        },
      ],
      inferences: [
        {
          scope: 'Repeated account rows',
          basis:
            'All remembered rows share one host-selected ID contract; normal and expired account choices cover their distinct action/hint outcomes without clicking each row at each width.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Responsive flow',
          basis:
            'Eight paired static captures cover light/dark across desktop, tablet, mobile and stress; narrow keyboard selection probes the clipping boundary once.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-9')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-passkey-reference.css',
        'authentication/PasskeyAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Choosing a second device moves pressed state, checkmark and Continue target',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-passkey-selected:3:click',
          change: 'Continue replaces choice card with device-confirmation request',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-passkey-request:0:click',
          change: 'Cancel request restores the selected device list',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Default device enters its own confirmation request',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:click',
          change: 'Password alternative has no documentation navigation',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '5:click',
          change: 'Email-link alternative has no documentation navigation',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '2:click',
          change: 'Third hardware-key selection changes the compact target',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '1:press-space',
          change: 'Keyboard selection preserves the observed narrow intrinsic row overflow',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '3:click',
          change: 'Narrow confirmation request keeps its footer in content flow',
        },
      ],
      inferences: [
        {
          scope: 'Repeated device rows and gestures',
          basis:
            'Three distinct device types share the same host-selected item contract; second and third row changes, keyboard selection, request and cancel represent their feedback without multiplying every viewport by every row.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Narrow source clipping',
          basis:
            'The stress reference has an intrinsic 251px device row in a 172px content column; eight static pairs and one narrow keyboard selection capture this source-visible behavior without treating it as a positioned overlay.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-8')
    return {
      revision: 2,
      lumenEntries: [
        'authentication.tsx',
        'authentication-enterprise-reference.css',
        'authentication/EnterpriseAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:fill',
          change: 'Unknown valid domain switches to generic Continue and an explanatory no-match aside',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-enterprise-mismatch:0:fill',
          change: 'Matching company domain restores provider-specific button and organization summary',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Continue enters short disabled Redirecting feedback before returning',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:click',
          change: 'Password alternative is a documentation demo no-op',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:fill',
          change: 'Second known domain updates provider, organization, directory, session and device policy data',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '1:press-enter',
          change: 'Native keyboard submit triggers the same pending redirect without the desktop aside',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '0:focus',
          change: 'Email focus retains the full-width tablet form flow',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '2:press-space',
          change: 'Narrow keyboard password alternative stays in the documentation preview',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '0:focus',
          change: 'Compact dark email control remains reachable without the aside',
        },
      ],
      inferences: [
        {
          scope: 'Other email strings and repeated gestures',
          basis:
            'Domain lookup has one host-owned input; unknown-valid and matched transitions plus invalid-email browser tests cover its branches. The same submit and alternative do not gain new feedback by multiplying themes and viewports.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Responsive two-column versus compact layout',
          basis:
            'Eight static pairs cover two themes and four viewports; right-side organization data is passive and disappears below the observed breakpoint.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-7')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-sign-up-reference.css',
        'authentication/SignUpAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:fill',
          change: 'One password criterion reveals Weak strength and one active meter segment',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-signup-complete:4:toggle',
          change: 'Agreement activates submit only after name, full email and all four password requirements',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-signup-ready:5:click',
          change: 'Documentation form submit has no destination or success feedback',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:fill',
          change: 'All four criteria update the list and Strong strength label',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-signup-password:3:click',
          change: 'Password reveal changes native type and accessible toggle label',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'auth-signup-invalid-email:1:fill',
          change: 'Incomplete email keeps submit disabled even with all other requirements met',
        },
        { viewport: 'tablet', theme: 'dark', suffix: '6:click', change: 'Sign-in navigation is a source demo no-op' },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '0:fill',
          change: 'Name edit preserves associated field and narrow flow',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:fill',
          change: 'Email field accepts a full address in dark compact layout',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '4:toggle',
          change: 'Native agreement toggles in clipped narrow card without horizontal overflow',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '3:focus',
          change: 'Reveal affordance retains keyboard focus at narrow boundary',
        },
      ],
      inferences: [
        {
          scope: 'Password permutations and equivalent gestures',
          basis:
            'Four criteria share one host-derived strength projection. Weak and Strong, reveal, consent and a complete form cover distinct feedback; intermediate Fair/Good states are host/browser-tested.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Responsive layout and theme',
          basis:
            'Eight static source/local pairs cover all viewport/theme combinations, with one narrow checkbox and focus probe rather than multiplying every form edit by each layout.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-6')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-code-reference.css',
        'authentication/CodeAuthentication.tsx',
        'authentication/CodeVerification.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '8:click',
          change: 'Recovery action replaces six digits with one recovery-code field',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-code-recovery-valid:1:click',
          change: 'Valid recovery code enters verifying feedback before host-owned success',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-code-five:5:fill',
          change: 'Sixth digit auto-starts verification and locks the submit while pending',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-code-verified:1:click',
          change: 'Verify another device returns from success to empty code entry',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:fill',
          change: 'First digit edit moves focus and retains a single numeric value',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-code-recovery:0:fill',
          change: 'Recovery entry uppercases and truncates a long value, enabling submit at eleven characters',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-code-verified:0:click',
          change: 'Continue has no navigation result in the documentation preview',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'auth-code-recovery:3:click',
          change: 'Switching back restores segmented text-code entry',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '9:click',
          change: 'Back-to-sign-in demo action has no source navigation feedback',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '8:press-space',
          change: 'Keyboard recovery switch keeps the narrow card and footer in flow',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '0:focus',
          change: 'Narrow first-digit focus retains a visible control boundary',
        },
      ],
      inferences: [
        {
          scope: 'Repeated digit fields, themes and equivalent gestures',
          basis:
            'The six inputs share one indexed renderer and host code draft. First digit, final digit, direct recovery edit, keyboard mode switch and eight static pairs cover distinct feedback without a Cartesian replay.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Countdown expiry and resend',
          basis:
            'The live reference decrements its disabled resend label; the host preview timer and re-enable/reset are tested with a simulated browser clock. Source/local timer seconds are not claimed as synchronized screenshot frames.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Verified result from complete code',
          basis:
            'The source completion was observed live after six digits and after a valid recovery code. Host-owned preview response and cleanup are browser-tested; asynchronous success is not conflated with the immediate pending interaction frame.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-5')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-magic-link-reference.css',
        'authentication/MagicLinkAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Different email replaces delivery summary with the prefilled email form',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-magic-form-invalid:1:click',
          change: 'Invalid email reveals a field error without sending',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-magic-form:1:click',
          change: 'Valid form submission returns to the delivery summary and resets the countdown',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-magic-form:2:click',
          change: 'Password-sign-in link has no documentation navigation result',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '0:hover', change: 'Primary mail-app button pointer feedback' },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '0:click',
          change: 'Mail-app action does not alter the documentation preview',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'auth-magic-form:0:fill',
          change: 'Host email input retains an edit in the narrow form',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '2:press-space',
          change: 'Keyboard opens the form while the narrow confirmation content stays in flow',
        },
      ],
      inferences: [
        {
          scope: 'Countdown expiry and resend',
          basis:
            'The live reference decrements the disabled resend label over time; a local browser check tests expiry, re-enable and reset. Independent source/local clocks are not treated as frame-synchronized interaction pairs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated themes, viewports and equivalent button gestures',
          basis:
            'Eight static pairs cover the responsive theme matrix. Eight paired actions cover branch navigation, validation, submit, edit, keyboard and no-result actions; equivalent permutations are inferred.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-4')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-two-step-reference.css',
        'authentication/TwoStepAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Continue enters the asynchronous pending state before revealing the account',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-two-step-invalid:1:click',
          change: 'Invalid email displays a field-level error instead of advancing',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-two-step-password:0:click',
          change: 'Back returns from the matched-account password view to email',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-two-step-password:4:click',
          change: 'Sign in enters its own pending state without inventing authentication success',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '2:click',
          change: 'Magic-link button leaves this documentation preview unchanged',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'auth-two-step-password:2:fill',
          change: 'Password input keeps the host-entered secret',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'auth-two-step-password:3:click',
          change: 'Show password toggles input type and accessible button name',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '3:click',
          change: 'Create-account action has no demo navigation result',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '0:fill',
          change: 'Narrow email edit remains readable in the flowing card',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'auth-two-step-password:1:click',
          change: 'Forgot-password action keeps the narrow account view',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'auth-two-step-password:3:press-space',
          change: 'Keyboard reveal changes the narrow password input without clipping',
        },
      ],
      inferences: [
        {
          scope: 'Repeated email/password strings, theme-width combinations and alternate activation gestures',
          basis:
            'Eight static pairs cover the responsive canvas. Eleven paired states exercise the distinct email gate, pending states, navigation, input, reveal and no-result actions; equivalent combinations are inferred, not replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Host callback outcomes',
          basis:
            'The documentation preview does not connect magic link, forgot password, account creation or sign-in to a backend. Host callbacks expose those intents without a fabricated success or route.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-3')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-quote-reference.css',
        'authentication/QuoteAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '13:click',
          change: 'Next arrow changes story, author, metrics and active dot to Daniel',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '12:click',
          change: 'Previous wraps from Mina to Rachel and moves the active dot',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '11:click',
          change: 'Named dot directly selects the third story',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '3:click',
          change: 'Password visibility swaps the native input type and accessible label',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '0:fill',
          change: 'Host email field retains an edit without affecting the hidden quote pane',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '4:click',
          change: 'Sign-in preview submit has no invented success result',
        },
        { viewport: 'tablet', theme: 'dark', suffix: '5:hover', change: 'Shared social button pointer feedback' },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '7:click',
          change: 'Representative provider action has no source demo transition',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '8:click',
          change: 'Account creation link has no source demo navigation result',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '1:click',
          change: 'Narrow forgot-password action preserves the form',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '3:press-space',
          change: 'Narrow keyboard password reveal retains field flow',
        },
      ],
      inferences: [
        {
          scope: 'Other carousel arrows, active dot and repeated story selections',
          basis:
            'Three host-owned stories share stable ID-based selection; next, wraparound previous and direct third-dot selection expose every distinct content state. Reverse equivalent permutations and the active-dot no-op are inferred, not counted as clicks.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Autonomous quote rotation',
          basis:
            'A separate live source probe observed the first-to-second transition after roughly eight seconds. Host-configured local timer progression and cleanup are browser-tested; independent clocks are not claimed as frame-synchronized screenshot pairs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme form and provider permutations',
          basis:
            'Eight static pairs cover the responsive split/hide boundary. Field edit, reveal, keyboard activation and representative no-result actions are sampled without replaying every native control in every viewport.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-2')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-provider-first-reference.css',
        'authentication/ProviderFirstAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:click',
          change: 'Switch email form to domain label, suffix and admin helper',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'auth-provider-sso:4:click',
          change: 'Return to email form and its disabled submit state',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '5:fill',
          change: 'Invalid email remains disabled without fabricating an error message',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '5:fill-valid',
          change: 'Valid email enables Continue without a business result',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-provider-email-valid:6:click',
          change: 'Email Continue submits with no source demo transition',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-provider-sso:5:fill',
          change: 'Nonempty domain enables Continue beside the fixed suffix',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-provider-sso-valid:6:click',
          change: 'SSO Continue is a separate no-result submission path',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '1:hover', change: 'Shared social provider pointer feedback' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:click',
          change: 'Representative provider click leaves the form unchanged',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '0:click',
          change: 'Create account has no source demo navigation result',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '4:press-space',
          change: 'Narrow keyboard SSO switch reflows the suffix and helper',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '7:click',
          change: 'Inline legal action retains the narrow form',
        },
      ],
      inferences: [
        {
          scope: 'Other provider and legal links',
          basis:
            'Host-owned providers share one ID-bound action and native button template; a representative provider hover/click and one legal action are paired. Their unclicked siblings are inferred, not counted as replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated themes, sizes, input strings and activation gestures',
          basis:
            'Eight static pairs cover the whole width/theme matrix. Both mode transitions, disabled/enabled gates and both no-result submit routes are paired at representative sizes; local unit tests cover the email/domain boundary and content capacity. No Cartesian replay is claimed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-1')
    return {
      revision: 1,
      lumenEntries: [
        'authentication.tsx',
        'authentication-sign-in-reference.css',
        'authentication/SignInAuthentication.tsx',
        'authentication/primitives.tsx',
        'authentication/content.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:fill',
          change: 'Email input retains host-entered value without submitting',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '5:click',
          change: 'Empty submit places validation beside the email input',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-email-only:5:click',
          change: 'Valid email with missing password reveals the distinct password error',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'auth-valid:5:click',
          change: 'Valid credentials enter the host-owned pending state',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Password reveal changes the input type and accessible button label',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:toggle',
          change: 'Remember-me checkbox toggles its checked state',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '6:hover', change: 'Representative provider hover feedback' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '6:click',
          change: 'Provider click leaves the reference demo unchanged',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Forgot-password demo action has no local visual transition',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '9:click',
          change: 'Create-account demo action preserves the card',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '10:click',
          change: 'Footer links share the no-navigation demo behavior',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '5:press-enter',
          change: 'Narrow form keyboard submission retains readable validation',
        },
      ],
      inferences: [
        {
          scope: 'Other provider and footer links',
          basis:
            'Three providers share one ID-bound renderer, and three footer actions share one host callback. One representative hover/click of each mechanism is paired; remaining labels are not claimed as clicked.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated themes, widths, gestures and input edits',
          basis:
            'Eight static pairs cover responsive form flow and 12 paired actions cover distinct validation, pending, toggle, reveal and no-op outcomes. Equivalent permutations are inferred; localized/overflow/host-failure cases are local-only.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-6')
    return {
      revision: 1,
      lumenEntries: ['notifications.tsx', 'notifications-bell-reference.css', 'notifications.css', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Native Projects link preserves the source fragment-only navigation',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:click',
          change: 'Bell opens the anchored five-row dialog with filtering and scroll owner',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'bell-open:7:click',
          change: 'An unread row changes only its read treatment and the badge count',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'bell-open:12:click',
          change: 'Footer action closes the panel without inventing a destination',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:click',
          change: 'Settings has no reference demo navigation result',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'bell-open:5:click',
          change: 'Unread tab projects three rows and preserves the fixed panel controls',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'bell-open:10:click',
          change: 'Already-read row has no invented state change',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'bell-open:6:click',
          change: 'Mark all read changes row tone, badge, and disabled action state',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'bell-open:3:expand-escape',
          change: 'Escape closes the popover and restores the bell focus',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'bell-unread:6:click',
          change: 'Mark all read from Unread reveals a separate empty-list state',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'bell-unread-empty:4:click',
          change: 'All restores the five read rows without resetting their status',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'bell-open:3:click',
          change: 'Bell toggling closes the panel while keeping trigger focus',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '3:press-space',
          change: 'Native keyboard opens the narrow panel; reference left-edge clipping is surfaced, not hidden',
        },
      ],
      inferences: [
        {
          scope: 'Other notification rows and nav links',
          basis:
            'Five typed rows share the same ID-bound read callback, three links share native anchor behavior, and representative unread/read rows plus one link are paired. The remaining same-mechanism items are not counted as individual clicks.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Outside pointer dismissal and other theme/viewport gesture combinations',
          basis:
            'Live source probes and local browser checks confirm outside dismissal; footer and Escape pairs cover distinct close/focus outcomes. Eight static pairs cover responsive flow; repeated permutations are not replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Host failure, missing capability, capacity and localized input',
          basis:
            'The source demo applies read state immediately. Host-confirmed failure/retry, unavailable callbacks, empty/one/duplicate/81 rows and translated short hosts are local-only evidence, not live outcomes.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other narrow viewport/theme popover permutations',
          basis:
            'A direct source probe shows left-edge clipping at 356px and 286px, and the stress Space pair exposes the feedback mismatch. The local panel stays inside the host; only the repeated widths/themes are inferred, while the paired failure remains explicit until reference fidelity and no-clipping requirements are reconciled.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-5')
    return {
      revision: 1,
      lumenEntries: [
        'notifications.tsx',
        'notifications-system-reference.css',
        'notifications.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Read the notice removes only the maintenance banner and enables restoration',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '4:click',
          change: 'Remind me later removes the billing banner through the secondary action',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '6:expand',
          change: 'Import failure expands three separate source-error list rows',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'system-expanded:6:click',
          change: 'Hide details collapses the error list without removing the banner',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '7:click',
          change: 'Retry failed has no invented result in the reference demo',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Update card is a distinct source no-op action, not a dismissal',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'system-dismissed:0:click',
          change: 'Restore all brings a dismissed row back and disables itself',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '2:press-space',
          change: 'Narrow native keyboard dismisses a single message',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'system-empty:0:click',
          change: 'Restore from the fully empty state repopulates all five rows',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '6:expand',
          change: 'Narrow details expansion preserves independently scrollable rows',
        },
      ],
      inferences: [
        {
          scope: 'Other primary outcomes and repeated dismiss buttons',
          basis:
            'Five typed messages share the same ID-targeted callback and row renderer. Real reference probes confirmed View DNS dismisses, while Increase limit is a no-op; one primary dismissal, one secondary dismissal and a keyboard close are paired. The remaining equivalent rows are inferred, not counted as paired clicks.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other theme, viewport and input permutations',
          basis:
            'All eight static pairs cover the responsive flow and colors. Desktop and 286px detail states, a tablet restore and native keyboard dismissal cover the different feedback and scrolling owners; no cartesian button matrix is claimed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Host persistence failure, capacity and localized input',
          basis:
            'The source demo transitions immediately. Host-confirmed async failure/retry, absent handler, empty/one/duplicate/81 messages and long translated copy are tested locally, not invented as live source outcomes.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-4')
    return {
      revision: 2,
      lumenEntries: [
        'notifications.tsx',
        'notifications-activity-reference.css',
        'notifications.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'Selecting Wei replaces the detail, primary action, facts and destination link',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Snoozed tab filters to Ana and clears the detail without selecting a new row',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Archived tab filters to Marco and retains the empty detail pane',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'activity-snoozed:3:click',
          change: 'Selecting Ana reveals the snoozed review context and facts',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'activity-archived:3:click',
          change: 'Selecting Marco reveals archived member context and actions',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '8:expand',
          change: 'Snooze opens the anchored four-choice menu',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'activity-snooze-menu:9:click',
          change: 'Later today moves Priya from Inbox to Snoozed and clears the detail',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '9:click',
          change: 'Archive moves Priya to Archived and clears the detail',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '7:click',
          change: 'Primary Grant access has no invented completion feedback in the reference demo',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'activity-snooze-menu:8:expand-escape',
          change: 'Escape closes the narrow anchored menu and restores the trigger',
        },
        { viewport: 'stress', theme: 'light', suffix: '6:click', change: 'Back replaces narrow detail with the list' },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'activity-back:4:click',
          change: 'Selecting Wei from narrow list returns to the detail pane',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '1:click',
          change: 'Switching tabs on the narrow detail shows the filtered list',
        },
      ],
      inferences: [
        {
          scope: 'Other row selections and repeated primary/link actions',
          basis:
            'Five typed host entries share the ID-keyed projection and detail renderer; both the second inbox row and each other view are actually replayed. Grant is the reference no-op representative; link destinations remain host-owned.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other Snooze menu choices, pointer and keyboard equivalents',
          basis:
            'The four menuitems invoke one confirmed transfer path with option ID. The menu-open and one option transfer are paired live; the different labels/options and failure/retry are locally exercised without claiming four source screenshots.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other theme/viewport interaction permutations and capacity',
          basis:
            'Eight static source/local pairs inspect four widths and two themes. Desktop, tablet and extreme-narrow dynamic samples cover pane/stack and overlay ownership. Empty/one/duplicate/81 rows, long translated copy and host failures are locally checked.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-3')
    return {
      revision: 1,
      lumenEntries: [
        'notifications.tsx',
        'notifications-preferences-reference.css',
        'notifications.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:click',
          change: 'Collaboration in-app bulk None changes three deliveries and the count',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Partially enabled Collaboration email bulk All changes one delivery and the button label',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '5:click',
          change: 'One enabled delivery switches off independently of other channels',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '30:click',
          change: 'Quiet hours switch changes without altering the delivery count',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '31:click',
          change: 'An unselected weekday becomes pressed and enables saving',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'preferences-dirty:38:click',
          change: 'Reset restores initial delivery, quiet-hour and day values with saved footer feedback',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'preferences-dirty:39:click',
          change: 'Save confirms the changed draft and disables the save action',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '8:press-space',
          change: 'Narrow keyboard activation reaches an off-screen channel and updates the count',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'preferences-dirty:38:press-enter',
          change: 'Narrow footer reset remains accessible after a changed delivery',
        },
      ],
      inferences: [
        {
          scope: 'Other event/channel switches and group headers',
          basis:
            'Seven host-supplied event rows share one ID-keyed toggle and three channel groups share one bulk reducer. Both switch directions and All/None paths have real replay; duplicate IDs, empty input and capacity are locally tested, not claimed as individual screenshots.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other weekdays, equivalent pointer/keyboard gestures and theme/viewport permutations',
          basis:
            'The weekday buttons share one ID-keyed set, while the business state has no viewport/theme branch. Eight static pairs cover layout and colors; desktop and narrow dynamic cases cover distinct scroll/focus boundaries.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Host persistence failures and delayed confirmations',
          basis:
            'The public reference demo saves immediately. Host-owned asynchronous success, failure/retry and absent-save behavior are tested locally; no reference-network failure is invented.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-2')
    return {
      revision: 1,
      lumenEntries: [
        'notifications.tsx',
        'notifications-toast-reference.css',
        'notifications.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Success toast appears in the corner and enables active-count summary',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Danger toast has independent icon, title and body',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Information toast provides its distinct message',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Progress toast uses the spinner tone and message',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'toast-success:5:click',
          change: 'Success Undo clears only its active toast',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'toast-success:6:click',
          change: 'Dismiss action clears an active toast',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'toast-stack:5:hover',
          change: 'A two-toast stack expands on pointer hover',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'toast-stack:4:click',
          change: 'Clear all removes the whole stack and restores the empty bar',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '0:press-space',
          change: 'Keyboard activation creates a toast beside the narrow card',
        },
      ],
      inferences: [
        {
          scope: 'Repeated toast triggers and alternative dismiss targets',
          basis:
            'Four tones have separate real creation screenshots. Shared ID-keyed removal, keyboard activation, Undo and bulk clear are exercised; repeated instances and equivalent buttons are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport and theme gesture permutations',
          basis:
            'Eight static pairs inspect card flow; desktop and 286px stress dynamic screenshots exercise distinct overlay and wrapping boundaries without multiplying every gesture.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Timed disappearance and hover pause',
          basis:
            'A separate direct live-reference probe records Info disappearing after six seconds. The local timer is tested separately; a timer checkpoint is not mislabeled as a button click in the paired interaction runner.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-1')
    return {
      revision: 1,
      lumenEntries: [
        'notifications.tsx',
        'notifications-center-reference.css',
        'notifications.css',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Unread tab filters eight rows to four and keeps section ownership',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Mentions tab retains one unread and one read mention',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:hover',
          change: 'Row hover reveals the two icon actions over the timestamp',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'First unread row becomes read and badge decrements',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '10:click',
          change: 'Previously read row becomes unread and badge increments',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '5:click',
          change: 'Dismiss reflows rows and decrements total, unread and mention counts',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '0:click',
          change: 'Bulk read removes badge and retains narrow grouped rows',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '2:press-space',
          change: 'Native keyboard activates the narrow unread filter',
        },
      ],
      inferences: [
        {
          scope: 'Remaining notification-row read, unread, dismiss and hover actions',
          basis:
            'All eight host entries share the same ID-keyed state transition and button renderer. Both read directions, dismissal and one hover are real-replayed; omitted repeated rows are inferred, not claimed as screenshots.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme interaction permutations',
          basis:
            'Eight static pairs cover four widths and two themes. Desktop and 286px stress samples exercise the different flow boundaries; state logic does not branch on viewport or theme.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-7')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-menu-reference.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Ordinary selection dismisses the menu and reports the selected action and report',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:hover',
          change: 'Export hover reveals the real nested CSV/Excel/PDF menu',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: 'dialog-menu-export:4:click',
          change: 'Nested CSV selection dismisses both menus and reports a distinct export result',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'dialog-menu-delete-keyboard:6:press-space',
          change: 'End navigates to the dangerous item before native Space activation and its target-specific result',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '1:menu-escape',
          change: 'Escape dismisses the menu without inventing a selection',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'dialog-menu-closed:0:click',
          change: 'The closed trigger reopens the same dialog/menu hierarchy',
        },
      ],
      inferences: [
        {
          scope: 'Other ordinary action rows, Export formats, repeated gestures and equivalent menu selection outcomes',
          basis:
            'The six source menuitem roles and three nested options were structurally observed. One ordinary result, one danger keyboard result and a nested export result traverse the distinct handlers; remaining ID-bound labels are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme action permutations, reverse keyboard navigation and passive separators',
          basis:
            'Eight static source/local pairs establish centered overlay geometry in four widths and two themes. Representative hover, narrow submenu selection, Escape and reopen cover state transitions; equivalent permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-6')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-evidence.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Archive preserves the sheet and reports its own result',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Download preserves the sheet and reports a different result',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: 'evidence-body:scroll:end',
          change: 'The observed sheet body scroll reveals the remaining history above a fixed footer',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: '2:press-space',
          change: 'Native keyboard activation reaches the narrow Archive action',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '1:click',
          change: 'Close dismisses the sheet without an action result',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'dialog-evidence-closed:0:click',
          change: 'The closed trigger reopens the sheet',
        },
      ],
      inferences: [
        {
          scope: 'Other passive metadata, control and history rows, repeated values and equivalent Download activation',
          basis:
            'These rows are not controls in the live iframe. Scroll ownership and both distinct action results are replayed; passive rows and repeated keyboard/pointer gestures are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme interaction permutations and reverse scroll gesture',
          basis:
            'Eight static pairs cover the four widths in light/dark. The sampled mobile scroll proves body ownership and fixed footer, while desktop/narrow action branches are replayed. Equivalent permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-5')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-alert.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:select',
          change: 'Delivery channel selection updates the native select value',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '3:fill', change: 'Threshold draft is visibly editable' },
        { viewport: 'tablet', theme: 'light', suffix: '4:fill', change: 'Multiline note draft is visibly editable' },
        { viewport: 'tablet', theme: 'dark', suffix: '5:click', change: 'Rule-enabled switch changes checked state' },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '5:press-space',
          change: 'Native keyboard activation toggles the switch in the narrow drawer',
        },
        { viewport: 'mobile', theme: 'dark', suffix: '6:click', change: 'Pristine Cancel closes without a guard' },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'dialog-alert-dirty:1:click',
          change: 'Dirty Close opens the unsaved-changes alertdialog',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'dialog-alert-guard:8:click',
          change: 'Keep editing dismisses guard while retaining draft',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'dialog-alert-guard:9:click',
          change: 'Discard changes closes and resets the draft',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'dialog-alert-dirty:7:click',
          change: 'Save changed rule closes drawer and reports update',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: 'dialog-alert-closed:0:click',
          change: 'Trigger reopens a pristine drawer',
        },
      ],
      inferences: [
        {
          scope: 'Other channel labels, threshold/note values, and dirty Cancel versus dirty Close',
          basis:
            'The same ID-keyed select and controlled fields own those values. Close and Cancel enter one guarded path; repeated values and equivalent gestures are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme interaction products and pristine Close versus pristine Cancel',
          basis:
            'Eight static source/local pairs cover four widths and two themes; representative interactions traverse desktop, tablet, mobile and stress. Equivalent permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-4')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-wizard.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:fill',
          change: 'Workspace name edits its visible URL slug in place',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '4:click',
          change: 'Continue replaces Workspace with Region in the stacked footer',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'dialog-wizard-region:3:click',
          change: 'Europe selection transfers pressed state from United States',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'dialog-wizard-region-selected:7:click',
          change: 'Selected region carries into Team summary',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'dialog-wizard-team:2:fill',
          change: 'Optional teammate draft fills in the narrow Team step',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'dialog-wizard-team-custom:4:click',
          change: 'Create closes and reports the edited workspace slug',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'dialog-wizard-team:3:click',
          change: 'Back restores Region and retains the selected choice',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'dialog-wizard-region:6:click',
          change: 'Back restores Workspace and its name draft',
        },
        { viewport: 'mobile', theme: 'light', suffix: '3:click', change: 'Cancel dismisses without a creation result' },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'dialog-wizard-region:1:press-space',
          change: 'Keyboard close dismisses the second step',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'dialog-wizard-closed:0:click',
          change: 'Closed trigger reopens the wizard',
        },
      ],
      inferences: [
        {
          scope: 'Other region buttons, name strings, invite addresses and equivalent gestures',
          basis:
            'One selected/unselected pressed transition, slug edit, optional draft and every distinct step change are replayed. Repeated choices and values share the same ID-keyed controls and are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme permutations and creation with no invitees',
          basis:
            'Eight static pairs cover four widths and two themes; dynamic cases hit desktop, tablet, mobile and stress flow boundaries. Optional invite text does not gate Create; omitted permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-3')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-invite.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '6:click',
          change: 'Empty submission shows both field errors in place',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'dialog-invite-empty:2:fill',
          change: 'Name correction clears only its own error in narrow flow',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '4:select',
          change: 'Role selection changes the selected option without inventing a new hint',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: 'dialog-invite-invalid:3:fill',
          change: 'Valid email corrects inline validation after a failed attempt',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'dialog-invite-valid:6:click',
          change: 'Valid submission closes and shows pending invite feedback',
        },
        { viewport: 'mobile', theme: 'dark', suffix: '5:click', change: 'Cancel dismisses the stacked-footer form' },
        { viewport: 'desktop', theme: 'light', suffix: '1:press-space', change: 'Keyboard close dismisses the dialog' },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'dialog-invite-closed:0:click',
          change: 'Closed trigger reopens in the narrow canvas',
        },
      ],
      inferences: [
        {
          scope: 'Equivalent per-field fill strings, role options and close gestures',
          basis:
            'Empty and corrected fields, one option change, valid submit, Cancel, keyboard close and reopen exercise distinct feedback paths. Repeated values and native button/select gestures share the same implementation and are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other theme/viewport permutations',
          basis:
            'Eight static source/local pairs cover four widths and two themes; dynamic cases sample desktop and both narrow boundaries. Validation logic has no theme/viewport branches; omitted permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-2')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-delete.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:fill',
          change: 'Incorrect resource name leaves destructive action disabled',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '2:fill-valid',
          change: 'Exact resource name enables deletion in narrow layout',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: 'dialog-delete-valid:4:click',
          change: 'Enabled destructive action closes and reports the deleted resource',
        },
        { viewport: 'mobile', theme: 'light', suffix: '3:click', change: 'Cancel dismisses without deletion' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:press-space',
          change: 'Keyboard close dismisses without deletion',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'dialog-delete-closed:0:click',
          change: 'Trigger reopens after a completed dismissal',
        },
      ],
      inferences: [
        {
          scope: 'Four read-only project metrics and other names',
          basis:
            'The original metrics are definition data, not controls. Wrong and exact-name fills exercise both disabled and enabled branches; repeated incorrect strings and passive metric gestures are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Equivalent close gestures across remaining widths and themes',
          basis:
            'Eight source/local static pairs cover four widths in two themes. Pointer Cancel, keyboard close, confirmation and reopen sample distinct feedback paths; equivalent permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-1')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-plan.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Close icon dismisses the plan comparison modal',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '2:press-space',
          change: 'Keyboard Cancel dismisses the stacked narrow modal',
        },
        { viewport: 'tablet', theme: 'dark', suffix: '3:click', change: 'Apply action confirms and closes the modal' },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'dialog-plan-closed:0:click',
          change: 'Visible trigger reopens the comparison after dismissal',
        },
      ],
      inferences: [
        {
          scope: 'Repeated close gestures, widths and themes',
          basis:
            'Close and Cancel use the same dismissal transition while confirmation also reports its action. Four widths in two themes are captured statically; remaining equivalent pointer and keyboard combinations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Five comparison rows',
          basis:
            'Rows are noninteractive definition data from a typed host contract, so their responsive truncation and scroll ownership are inspected in eight static pairs without invented row clicks.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-sidebar-7')
    return {
      revision: 1,
      lumenEntries: ['app-sidebar-full.tsx', 'app-sidebar-full.css', 'app-sidebar-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:click',
          change: 'Desktop Pipelines link retains Overview selection',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '13:click',
          change: 'Separate footer help link has no visible transition',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '8:hover', change: 'Desktop unselected Reports hover feedback' },
        { viewport: 'mobile', theme: 'dark', suffix: '16:click', change: 'Narrow close button collapses the dialog' },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '15:click',
          change: 'Exposed scrim strip closes the stress-width dialog',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'sidebar-full-closed:14:click',
          change: 'Collapsed trigger reopens the dialog',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '20:click',
          change: 'Narrow Pipelines link keeps the dialog open',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '16:press-space',
          change: 'Keyboard Space activates dialog close',
        },
      ],
      inferences: [
        {
          scope: 'Remaining favorite, workspace, reporting and account links',
          basis:
            'All 13 links and separate footer help link were structurally read from the live iframe. Desktop and narrow Pipelines clicks and desktop help click exercise the two link ownerships; other repeated href and row gestures are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme gestures and Escape',
          basis:
            'Eight static pairs cover the wide fixed pane and three narrow overlay widths in both themes. Mobile close/reopen and stress scrim sample distinct transitions; the remaining equivalent permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-sidebar-6')
    return {
      revision: 1,
      lumenEntries: [
        'app-sidebar-drawer.tsx',
        'app-sidebar-drawer.css',
        'app-sidebar-workflows.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '1:click',
          change: 'Exposed scrim strip closes the narrow overlay',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '2:click',
          change: 'Narrow drawer close button collapses to the opener',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'sidebar-drawer-closed:0:click',
          change: 'Closed drawer reopens from its header trigger',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:press-space',
          change: 'Keyboard Space activates the close button',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '4:click',
          change: 'Inbox link retains the open drawer and selected Home',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '7:hover',
          change: 'Representative unselected navigation row hover feedback',
        },
      ],
      inferences: [
        {
          scope: 'Other navigation links and repeated pointer or keyboard activation',
          basis:
            'The live iframe exposes twelve links in three groups with the same href and row mechanism; Inbox samples no visible navigation change, Customers samples unselected hover, and Space samples native button activation. Repeated links and gestures are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining viewport/theme interaction permutations and Escape',
          basis:
            'Eight static pairs cover four widths and both themes. Stress-width scrim and mobile close/reopen exercise the two real drawer transitions and exposed hit targets; Escape was probed on the live dialog and had no visible effect. Other equivalent permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-sidebar-5')
    return {
      revision: 1,
      lumenEntries: ['app-sidebar-tree.tsx', 'app-sidebar-tree.css', 'app-sidebar-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'mobile', theme: 'light', suffix: '2:click', change: 'Collapse a folder and its nested documents' },
        { viewport: 'desktop', theme: 'light', suffix: '3:click', change: 'Open folder row-action menu' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '7:click',
          change: 'Open the same row-action menu on a document',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'sidebar-tree-menu-open:4:click',
          change: 'Rename closes the menu without changing the reference tree',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '8:click',
          change: 'Selecting another document retains the initial visual selection',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '1:fill',
          change: 'Search keeps its draft without filtering the tree',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:click',
          change: 'New document has no visible reference transition',
        },
      ],
      inferences: [
        {
          scope: 'Other folders, documents, row menus and Duplicate/Delete outcomes',
          basis:
            'All four folders and twelve documents were read from the live iframe. Folder collapse, folder and document menus, menu dismissal and static page selection exercise the distinct mechanisms; other repeated rows and menu choices were inspected in the source and are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining width/theme interaction permutations',
          basis:
            'Eight static pairs cover four widths and two themes; narrow folder and search samples test row hit targets while the same fixed 256px pane and scroll owner persist across widths. Other permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-sidebar-4')
    return {
      revision: 1,
      lumenEntries: ['app-sidebar-dual.tsx', 'app-sidebar-dual.css', 'app-sidebar-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Projects rail selection swaps the complete contextual panel',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '11:click',
          change: 'Representative page selection retains the initial page while pointer feedback appears',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '8:click',
          change: 'New automation has no visible reference transition',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '9:fill',
          change: 'Search draft persists without filtering the contextual list',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '7:click',
          change: 'Narrow rail settings action has no visible reference transition',
        },
      ],
      inferences: [
        {
          scope: 'Other section icons and contextual page rows',
          basis:
            'All seven section data sets were structurally read from the live iframe; Projects exercises the section-replacement mechanism and Playbooks the page-row mechanism. The remaining repeated clicks are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining viewport/theme interaction permutations',
          basis:
            'Eight static pairs cover four widths and both themes. The 56px rail stays fixed; the contextual pane is 256px at wider sizes and fills the remaining width below 640px. The mobile settings action tests narrow hit geometry, while other repeated dynamic permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-sidebar-3')
    return {
      revision: 2,
      lumenEntries: [
        'app-sidebar-workspace.tsx',
        'app-sidebar-workspace.css',
        'app-sidebar-workflows.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '0:click', change: 'Workspace switcher opens radio menu' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'sidebar-workspace-open:2:click',
          change: 'Selecting Atlas updates workspace identity',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:fill',
          change: 'Scoped search retains draft without inventing navigation filtering',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '6:click',
          change: 'Representative workspace link and selected-row feedback',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'sidebar-workspace-open:0:click',
          change: 'Switcher closes an already-open menu',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'sidebar-workspace-open:4:click',
          change: 'Create workspace closes the menu without switching identity',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'sidebar-workspace-open:0:expand-escape',
          change: 'Escape dismisses the workspace menu on narrow canvas',
        },
      ],
      inferences: [
        {
          scope: 'Other pinned, workspace and administration links',
          basis:
            'All three groups use the same semantic link and ID-bound callback; one representative link is replayed, the remaining sibling destinations are inferred-not-replayed. The full 3/5/3 structure is checked in eight static pairs.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining workspace menu choices and viewport/theme permutations',
          basis:
            'One radio choice exercises host-owned workspace selection, while other choices share that mechanism. Four-width/two-theme static coverage and a mobile link sample exercise the unchanged 256px sidebar flow.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-sidebar-2')
    return {
      revision: 4,
      lumenEntries: ['app-sidebar-rail.tsx', 'app-sidebar-rail.css', 'app-sidebar-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '0:hover', change: 'Overview hover reveals flyout or tooltip' },
        { viewport: 'desktop', theme: 'dark', suffix: '1:hover', change: 'Selected Automation hover feedback' },
        { viewport: 'mobile', theme: 'light', suffix: '6:hover', change: 'Narrow rail second-group hover feedback' },
        { viewport: 'desktop', theme: 'dark', suffix: '10:hover', change: 'Support affordance feedback' },
        { viewport: 'desktop', theme: 'light', suffix: '11:click', change: 'Account button opens account feedback' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'sidebar-rail-flyout-open:1:click',
          change: 'Clicking the hovered Automation icon retains its flyout',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'sidebar-rail-flyout-open:2:click',
          change: 'Agent runs selection from an opened flyout',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'sidebar-rail-account-open:12:click',
          change: 'Account settings selection from the account menu',
        },
      ],
      inferences: [
        {
          scope: 'Other rail icons and repeated pointer/focus gestures',
          basis:
            'Each icon family shares one stable ID-bound mechanism; representative selected, unselected, second-group and footer outcomes are replayed, while other icon repeats are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining viewport/theme permutations',
          basis:
            'Eight static pairs cover four widths and both themes. The rail preserves layout across widths; desktop and narrow dynamic samples exercise its shared state transitions.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-sidebar-1')
    return {
      revision: 1,
      lumenEntries: [
        'app-sidebar-primary.tsx',
        'app-sidebar-primary.css',
        'app-sidebar-workflows.tsx',
        'LumenProvider.tsx',
      ],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '11:click', change: 'Collapse primary sidebar to icon rail' },
        { viewport: 'desktop', theme: 'dark', suffix: '12:click', change: 'Profile opens account menu' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'sidebar-account-open:13:click',
          change: 'Representative account choice after opening the profile menu',
        },
        { viewport: 'desktop', theme: 'light', suffix: '1:click', change: 'Representative navigation link feedback' },
        { viewport: 'mobile', theme: 'light', suffix: '15:click', change: 'Close mobile navigation dialog' },
      ],
      inferences: [
        {
          scope: 'Other navigation links, account items and backdrop closure',
          basis:
            'Grouped links and menu items each share an ID-bound handler. A representative link, account choice, collapse and drawer-close outcome are replayed. Backdrop and close button share the same drawer state action; backdrop itself is inferred, not claimed as replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme interaction permutations',
          basis:
            'Eight static pairs cover all four widths and both themes; dynamic samples exercise desktop and narrow overlay branches whose state logic is theme-independent.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-agent-plan-6')
    return {
      revision: 1,
      lumenEntries: ['agent-plan.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:click',
          change: 'Edit opens the goal textarea with Save/Cancel and locks footer actions',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Run replaces review actions with running feedback and Stop',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'summary-edit:0:fill',
          change: 'Goal input shows a real typed draft without prematurely committing it',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'summary-changed:1:click',
          change: 'Save trims and commits the edited goal, then restores footer actions',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: 'summary-changed:2:click',
          change: 'Cancel discards the changed draft and restores the original goal',
        },
        {
          viewport: 'stress',
          theme: 'dark',
          suffix: 'summary-empty:1:click',
          change: 'Whitespace-only Save closes editing while preserving the previous goal',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'summary-running:0:click',
          change: 'Stop restores the idle review actions on the narrowest canvas',
        },
        { viewport: 'desktop', theme: 'light', suffix: '1:hover', change: 'Primary Run button hover feedback' },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '0:press-enter',
          change: 'Keyboard activation reaches the goal editor on the narrowest canvas',
        },
      ],
      inferences: [
        {
          scope: 'Equivalent button gestures, themes and widths',
          basis:
            'Native controls share their activation mechanism. Distinct edit/fill/save/cancel/empty-save/run/stop outcomes are replayed once; eight static pairs and local locale/capacity checks cover layout risks.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Metrics, tools and breakdown records',
          basis:
            'The real summary records are passive, not actionable controls. No invented click, drag or row-selection cases are generated.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-agent-approval-3') return queuePlan
  if (variantId === 'hbar-app-ui-agent-approval-4') return permissionPlan
  if (variantId === 'hbar-app-ui-agent-approval-5') return costPlan
  if (variantId === 'hbar-app-ui-agent-approval-6') return historyPlan
  if (variantId === 'hbar-app-ui-agent-plan-1') return checklistPlan
  if (variantId === 'hbar-app-ui-agent-plan-2') return planReviewPlan
  if (variantId === 'hbar-app-ui-agent-plan-3') return planTreePlan
  if (variantId === 'hbar-app-ui-agent-plan-4') return planActualPlan
  if (variantId === 'hbar-app-ui-agent-plan-5') return planBoardPlan
  if (variantId === 'hbar-app-ui-ai-usage-1')
    return {
      revision: 1,
      lumenEntries: ['usage.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: '30-day selection replaces all four totals and seven day bars with four week bars',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '2:click',
          change: '90-day selection displays three monthly buckets and its own totals',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:hover',
          change: 'Representative day pointer entry replaces the inline hint with usage and spend',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '9:focus',
          change: 'Keyboard focus on a different day reveals that original point detail',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'usage-detail:0:focus',
          change: 'Leaving the focused bar restores the chart hint without changing the selected range',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'usage-month:3:hover',
          change: 'New range points reveal their own week data, not stale day details',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'usage-month:0:press-enter',
          change: 'Narrow keyboard return restores the seven-day totals and bars',
        },
      ],
      inferences: [
        {
          scope: 'Every other bar and equivalent activation gesture',
          basis:
            'All points use the same ID-based ephemeral detail handler; days, weeks and monthly datasets are checked as separate data projections. Hover/focus are replayed on representative points rather than every bar.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated viewport/theme transitions and passive metrics',
          basis:
            'Eight static pairs cover responsive structure and theme. Range state has no viewport/theme branch, and metrics have no actionable behavior. Native Arrow navigation did not select another source tab, so no custom keyboard selection is invented.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-ai-usage-2')
    return {
      revision: 1,
      lumenEntries: ['usage.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Requests sorting changes model order and the Share metric together',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '2:press-enter',
          change: 'Keyboard Tokens sorting changes order, relative widths and emphasis without changing billing facts',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'usage-model-requests:0:click',
          change: 'Return to Cost restores the original model order and cost-relative bars',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:focus',
          change: 'Native sort-tab focus does not silently activate a different sort',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'usage-model-row:0:hover',
          change: 'One representative passive model row receives background hover feedback, not a click action',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '2:press-enter',
          change: 'Narrow keyboard sorting keeps compact row summaries and costs associated with their models',
        },
      ],
      inferences: [
        {
          scope: 'Other model row hovers and equivalent sort gestures',
          basis:
            'All passive rows share one renderer and hover rule. The three distinct sort outcomes are replayed; models are not actionable controls and do not acquire invented clicks or expansion.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated viewport/theme transitions and pagination stress data',
          basis:
            'Eight static pairs cover responsive presentation. Sorting logic is viewport-independent; host paging is a local capacity extension tested separately, not claimed as a source interaction.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-ai-usage-3')
    return {
      revision: 1,
      lumenEntries: ['usage.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Tier 2 increases all ceilings and clears the near-capacity warning without changing current usage',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '2:press-enter',
          change: 'Tier 3 changes ceilings, ratios and the highest-tier footer through keyboard activation',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'usage-limits-raised:0:press-enter',
          change: 'Returning to Tier 1 restores the capacity warning and narrow meter values',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change:
            'Request an increase has no visible result in the public preview; do not invent successful submission',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:hover',
          change: 'Footer request control has representative pointer feedback',
        },
      ],
      inferences: [
        {
          scope: 'Repeated tier gestures, focus and remaining widths/themes',
          basis:
            'Three distinct tier outcomes and a narrow return are replayed. The same controlled tabs and projection handle other equivalent gestures; static pairs cover responsive geometry.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Passive utilisation meters',
          basis:
            'The source exposes progressbar values but no meter action. Ratio and capacity updates are verified together on tier changes rather than clicking each bar.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-ai-usage-4')
    return {
      revision: 1,
      lumenEntries: ['usage.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:click',
          change: 'Platform filters members and recalculates total spend and seats together',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'usage-members-platform:0:fill',
          change: 'Name search combines with selected team and uses singular seat copy',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '0:fill',
          change: 'An unmatched name produces the original two-line empty state and zero total',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'usage-members-empty:0:fill',
          change: 'Clearing search restores matching members while retaining the selected team',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'usage-members-platform:1:press-enter',
          change: 'Narrow keyboard return to All teams restores the complete member list and total',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:focus',
          change: 'Search focus has visual feedback without changing results',
        },
      ],
      inferences: [
        {
          scope: 'Other team labels, repeated member rows and equivalent activation gestures',
          basis:
            'One shared team-ID filter and name predicate determine results; filtering, composition, empty and recovery are replayed. Passive rows are not buttons. Remaining team values are checked in host projection tests.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated theme/viewport interactions and host pagination',
          basis:
            'Eight static pairs cover all four widths and both themes. The data projection has no viewport branch. Pagination above 50 members is a separately tested local capacity extension, not a claimed source feature.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-ai-usage-5')
    return {
      revision: 2,
      lumenEntries: ['usage.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:range-end',
          change: 'Native End reaches the maximum cap and changes budget ratio and forecast to within budget',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '0:range-home',
          change:
            'Native Home reaches minimum cap, clamps consumption to 100%, and keeps the source over-budget forecast',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Adding one threshold does not deselect the other active reminders',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:press-space',
          change: 'Keyboard removal changes only the selected threshold',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'Pause-requests switch changes independently without inventing submission feedback',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '5:press-enter',
          change:
            'Weekly digest turns on with native Enter after keyboard focus is ready; actual focus/scroll preparation is saved separately',
        },
      ],
      inferences: [
        {
          scope: 'Intermediate cap values and repeated pointer/key gestures',
          basis:
            'The two distinct forecast branches and cap boundaries are replayed. Keys start from a focused control, with native focus/scroll preparation retained as separate before/after images. Step quantization, intermediate ratios and restoration are checked locally rather than replaying every slider position.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Equivalent reminder values, repeated themes and passive summary text',
          basis:
            'Add/remove pressed states and independent switches are sampled separately. Each control is ID-bound; unselected/selected states and eight static pairs cover presentation. The real source has no save button or submission outcome.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-ai-usage-6')
    return {
      revision: 1,
      lumenEntries: ['usage.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Enterprise replaces Scale as the sole selected plan; usage and allowance remain unchanged',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '1:press-space',
          change: 'Native Space selects a plan from a focused keyboard baseline',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '1:press-enter',
          change: 'Enter selects the stacked narrow plan; real focus/scroll preparation is captured separately',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Stay on overage has no visible result in the public source preview',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Upgrade has no visible result in the public source preview; no success or payment is invented',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:hover',
          change: 'Hovering an unselected plan keeps its fill and selection unchanged, matching the source no-op',
        },
      ],
      inferences: [
        {
          scope: 'The other plan and repeated activation gestures',
          basis:
            'Both cards share the ID-keyed controlled selection. Source observation confirms native button Enter/Space, not arrow-driven roving selection. Local state tests cover reverse selection, duplicate/stale IDs and disabled plans.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Passive allowance split, benefits and repeated themes/viewports',
          basis:
            'The source bar and benefit rows have no controls. Eight static pairs cover their flow. Both distinct footer actions are replayed once; repeated activations cannot justify invented source business outcomes.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-ai-usage-7')
    return {
      revision: 1,
      lumenEntries: ['usage.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Capped filters the log and recomputes billed total while retaining its expanded detail',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:click',
          change: 'Errors shows the upstream-timeout call and its billed total, without opening it automatically',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Opening a completed request replaces the previously expanded capped request',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'usage-requests-error:3:click',
          change: 'The filtered error row reveals the real timeout status and zero output tokens',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: 'usage-requests-error-open:0:press-enter',
          change: 'Returning to All retains the expanded error ID and restores all rows and total',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '6:press-enter',
          change: 'Native Enter collapses the default capped row after real focus/scroll preparation',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '3:hover',
          change: 'A representative collapsed request shows row pointer feedback without expanding',
        },
      ],
      inferences: [
        {
          scope: 'Other request rows and equivalent click/Space gestures',
          basis:
            'Rows share a single ID-keyed exclusive disclosure model. Success/capped/error content was read from the rendered source, while replay samples state mechanisms instead of generating one test per row.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme gestures and large-history pagination',
          basis:
            'Eight static pairs cover all widths/themes. Unit and production tests cover filter restoration, duplicate/stale IDs, empty and 50-row pagination; pagination is a host capacity extension, not a source feature.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-ai-usage-8')
    return {
      revision: 1,
      lumenEntries: ['usage.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '0:click',
          change: 'Details is an independent source no-op action; no dialog or success state is invented',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Upgrade is a separate source no-op action, retaining the compact usage summary',
        },
        {
          viewport: 'tablet',
          theme: 'light',
          suffix: '0:hover',
          change: 'The text-style Details action has its own pointer feedback',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:hover',
          change: 'The filled Upgrade action has distinct pointer feedback',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '1:press-space',
          change: 'Native keyboard activation keeps the narrow widget stable after focus preparation',
        },
      ],
      inferences: [
        {
          scope: 'Other viewport/theme actions and equivalent Enter activation',
          basis:
            'Two native buttons share activation semantics, but each independent action and each visual button style is sampled. Eight static pairs cover responsive layout and both themes.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Sparkline, primary progress and secondary meters',
          basis:
            'Rendered DOM exposes passive visual indicators, not controls. Geometry, ratios and text flow are compared without clicking bars or generating fake meter interactions.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-shell-6')
    return {
      revision: 1,
      lumenEntries: ['app-shell-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Collapse the expanded product folder without changing the selected document',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '9:click',
          change: 'Expand meeting notes as a distinct three-file subtree',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '12:click',
          change: 'Selecting API versioning changes title, metadata and word count while retaining the preview body',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '22:fill',
          change: 'Controlled title synchronizes header, tree and document heading',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '25:click',
          change: 'Initially active text format can be removed',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '26:click',
          change: 'Independent text format toggles without restyling the preview body',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '29:click',
          change: 'Block-format control exposes its own pressed state',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '24:click',
          change: 'Document actions opens the five-item menu',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'documents-menu:25:click',
          change: 'Duplicate closes the menu without fabricating a business mutation',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '11:tree-arrowdown',
          change: 'Tree arrow moves focus only; selection changes only on activation',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'New-document demo callback is a source no-op',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '35:click',
          change: 'Closing the initial document drawer reveals the narrow reader',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '47:click',
          change: 'Narrow file selection keeps the drawer open while changing document metadata and both tree copies',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'documents-closed:21:click',
          change: 'Drawer can be reopened with the current selection retained',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'documents-closed:32:click',
          change: 'Narrow formatting moves block actions into its own menu',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'documents-format-menu:34:press-space',
          change: 'Narrow Quote action closes its menu; unlike desktop toggle it does not change pressed state',
        },
      ],
      inferences: [
        {
          scope: 'Other file rows, folder toggles and duplicate gestures',
          basis:
            'One ID-bound selection/title transition and one disclosure/roving-focus implementation. Two document metadata records are observed; remaining fixture metadata is representative host data, not individually verified reference output.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other text/block toggles and passive menu/action rows',
          basis:
            'Shared pressed-state logic is tested with active-off, inactive-on and a block format. Representative close-only and no-op actions retain paired evidence; no persistence, share, export or deletion success is invented.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining widths/themes, hover and keyboard permutations',
          basis:
            'Eight static pairs retain all widths/themes. Distinct narrow drawer/formatting mechanisms and one tree keyboard transition are replayed; focused local tests exercise boundary, overflow, localization and remaining navigation keys.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-shell-8')
    return {
      revision: 2,
      lumenEntries: ['app-shell-adaptive.tsx', 'app-shell-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '15:click',
          change: 'Empty archive queue has distinct copy and no clear-search action',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '9:click',
          change: 'Queue filter replaces the work-order list and count',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '22:click',
          change: 'Customer sort reorders the same IDs alphabetically',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '20:fill',
          change: 'Search filters customer, job number and engineer, displaying an empty result',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '39:click',
          change: 'Clear the initially flagged follow-up without changing the job',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '35:click',
          change: 'Flag a previously unflagged job for follow-up',
        },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '17:click',
          change: 'Open the complete queue drawer above the bottom navigation',
        },
        { viewport: 'mobile', theme: 'dark', suffix: '18:click', change: 'Expose and focus the compact search field' },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '48:click',
          change: 'Bottom navigation changes the active queue and card list',
        },
      ],
      inferences: [
        {
          scope: 'Remaining queue buttons, repeated flags, pointer/keyboard gestures and no-op demo actions',
          basis:
            'All queue choices share an ID-bound filter and all flag controls share one toggle; representative before/after pairs and controlled state tests cover the distinct feedback without claiming every button was replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other theme and width interaction combinations',
          basis:
            'Eight static pairs capture 4 viewports in both themes, while dynamic pairs cover each distinct desktop and mobile mechanism. Responsive rail is a CSS layout transition, not an extra clickable control.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-shell-9')
    return {
      revision: 1,
      lumenEntries: ['app-shell-chat.tsx', 'app-shell-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Collapse the desktop history sidebar while keeping the conversation pane',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '3:click',
          change: 'Sidebar model radio updates both selected model and header/composer labels',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '7:click',
          change: 'Recent thread replaces welcome content with its messages',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'chat-thread-open:1:click',
          change: 'New chat returns to welcome and clears the draft',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '18:click',
          change: 'Header model trigger opens the alternative model menu',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '20:fill',
          change: 'Native composer accepts text and enables Send',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '25:click',
          change: 'Suggested task inserts its text and focuses composer',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'chat-suggestion:24:click',
          change: 'Public demo Send leaves draft intact without inventing a reply',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '19:click', change: 'Share is an observed public demo no-op' },
        {
          viewport: 'mobile',
          theme: 'light',
          suffix: '16:click',
          change: 'Mobile navigation opens the full model/history drawer',
        },
      ],
      inferences: [
        {
          scope: 'Other recent threads, pinned row, quick actions, prompt chips and native button gestures',
          basis:
            'Each family shares one ID-bound handler; representative model, thread and suggestion outcomes are replayed. Repeated labels and public demo no-op buttons are not individually claimed as replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining theme/viewport feedback permutations and model menu selections',
          basis:
            'Eight static pairs cover four widths and both themes. The menu opening and sidebar model selection exercise distinct feedback while contract tests cover IDs, stale state, long locale and capacity.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-shell-7')
    return {
      revision: 1,
      lumenEntries: ['app-shell-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '1:click', change: 'Organisation opens a radio-choice menu' },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'scope-organisation:3:click',
          change: 'Organisation changes independently, preserving project and data',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'scope-project:4:click',
          change: 'Project changes the prefix of every database name, without changing its row metrics',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'scope-environment:6:click',
          change: 'Staging replaces the database inventory, connection counts and system status',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'scope-environment:7:click',
          change: 'Preview uses its distinct branch/PR inventory',
        },
        { viewport: 'desktop', theme: 'light', suffix: '5:click', change: 'Status opens a regional health dialog' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '8:click',
          change: 'Data disclosure visually hides its nested navigation links while retaining stable DOM nodes',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '18:click',
          change: 'Notice dismissal returns space to navigation without moving the footer',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '19:click',
          change: 'Account opens a bottom-anchored action menu',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'scope-account:20:click',
          change: 'Account action closes its demo menu without inventing persistence',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '6:fill',
          change: 'Search retains input but does not filter the original demo',
        },
        { viewport: 'desktop', theme: 'light', suffix: '20:click', change: 'Create database is a source demo no-op' },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '23:click',
          change: 'Close the initially open narrow navigation to expose card flow',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '27:click',
          change: 'Narrow navigation link keeps its drawer open and follows the native database anchor',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'scope-closed:3:click',
          change: 'Combined organisation/project menu replaces separate triggers at narrow widths',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'scope-combined:8:click',
          change: 'Project selection from combined menu updates the narrow database cards',
        },
      ],
      inferences: [
        {
          scope: 'Other organisation/project choices, navigation rows and create/account demo callbacks',
          basis:
            'Shared ID-bound callbacks and independently projected scope state; one representative per distinct transition is captured. Repeated buttons are not replayed or claimed individually matched.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated widths, themes, hover/focus and menu key permutations',
          basis:
            'Eight static pairs retain responsive/theme coverage. Narrow combined menus and drawer get separate samples; local tests cover roving menu keys, long labels, stale IDs and overflow.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-shell-5')
    return {
      revision: 3,
      lumenEntries: ['app-shell-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '11:click',
          change: 'Unread filter removes the already-read selection without changing the reading pane',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '12:click',
          change: 'Assigned filter produces its distinct three-record subset',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '13:click',
          change: 'Escalated filter reaches the real empty list while preserving the reader',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'inbox-empty:14:click',
          change: 'Clear filters restores all conversations',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '9:fill',
          change: 'Search matches list copy, independently of the current reader',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '16:click',
          change: 'Selecting another conversation replaces its full body and marks only it read',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'inbox-unread:15:click',
          change: 'Selecting an unread result removes it from the filtered list but retains it in the reader',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '26:click',
          change: 'Per-conversation star updates icon, accessible label and pressed state',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '29:click',
          change: 'More actions opens the real four-item menu',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'inbox-menu:30:click',
          change: 'Menu action closes without inventing a source-side business mutation',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:hover',
          change: 'Rail hover reveals the shared anchored tooltip',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '25:click',
          change: 'Reply is a source no-op rather than a fabricated editor',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '30:click',
          change: 'Attachment action and native scroll-to-target feedback',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '15:click',
          change: 'Narrow selection replaces the list with the reading pane',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'inbox-reading:24:click',
          change: 'Back restores the existing list and selection',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '6:click',
          change: 'Narrow mailbox trigger opens the evidenced overlay',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'inbox-mailboxes:34:click',
          change: 'Mailbox action closes the drawer without changing the inbox',
        },
      ],
      inferences: [
        {
          scope: 'Repeated conversations, mailbox icons and menu rows',
          basis:
            'Shared ID-bound selection/read/star and close-only action paths. Distinct long/short/attachment data is host-owned, and per-record isolation is tested without repeating each gesture across records.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Sort, compose, account and remaining passive action outputs',
          basis:
            'Rendered preview observations establish no business result for equivalent demo callbacks; representative reply, attachment and menu actions retain real paired evidence. No fabricated send/delete/archive success is added.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Keyboard, reverse toggles and responsive permutations',
          basis:
            'Representative source keyboard observations and focused local checks cover list selection, filter activation and dismiss/recovery. Eight static pairs retain the complete width/theme matrix without multiplying every action by it.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-shell-4')
    return {
      revision: 1,
      lumenEntries: ['app-shell-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '15:click',
          change: 'Hide the full-height schedule column and grow the story pane',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '17:click',
          change: 'Review filter selects four stories without changing agenda',
        },
        { viewport: 'desktop', theme: 'light', suffix: '18:click', change: 'Edits filter selects two warning stories' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '22:click',
          change: 'Next month changes calendar but retains selected date and agenda',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '41:click',
          change: 'A later date changes selection and removes earlier agenda entries',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '60:click',
          change: 'Adjacent-month date reaches the real agenda empty state without changing displayed month',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'editorial-empty:65:click',
          change: 'Show today restores the fixture date and agenda',
        },
        { viewport: 'desktop', theme: 'light', suffix: '1:hover', change: 'Shared navigation hover feedback' },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Fragment navigation does not invent a new selected page',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '19:click',
          change: 'New story has no business result in the source preview',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '65:click',
          change: 'Agenda records are actions with no source selection or detail dialog',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '21:click',
          change: 'Close the initial navigation drawer to inspect compact story cards',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'editorial-navigation-closed:15:click',
          change: 'Schedule opens as a normal-flow bottom pane with no calendar',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'editorial-schedule:20:click',
          change: 'Close the bottom schedule and return height to the main pane',
        },
      ],
      inferences: [
        {
          scope: 'Repeated navigation, calendar dates and agenda actions',
          basis:
            'Shared native controls and ID-bound callbacks; only selection/future-list, empty/recovery, month-only and independent no-op mechanisms are replayed. Passive story rows are not buttons.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Reverse month, repeated keyboard gestures and filter permutations',
          basis:
            'Month arithmetic, date/filter independence and stale/duplicate IDs are covered by pure-state tests; focused production checks exercise keyboard activation and drawer recovery without multiplying every button by themes and widths.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other responsive transitions and metadata',
          basis:
            'Eight static pairs retain the full structure matrix; a narrow bottom-pane case distinguishes normal flow from the actual navigation overlay. Passive account copy and status dots do not need clicks.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-shell-3')
    return {
      revision: 1,
      lumenEntries: ['app-shell-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '1:click',
          change: 'Collapse full navigation into the icon rail without losing main content',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '18:click',
          change: 'Signed selects seven active/renewing agreements',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '19:click',
          change: 'Attention selects three overdue/approval agreements',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '2:fill',
          change: 'Search matches contract or counterparty independently of metrics',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'contracts-attention:2:fill',
          change: 'Search plus filter reaches the real empty result state',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'contracts-empty:20:click',
          change: 'Clear search restores both the query and All filter',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '7:click',
          change: 'Open the account menu anchored beneath the avatar',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'contracts-account:8:click',
          change: 'A representative account item closes the menu and restores focus',
        },
        { viewport: 'desktop', theme: 'light', suffix: '9:hover', change: 'Shared navigation hover feedback' },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '9:click',
          change: 'Fragment navigation retains the selected contracts page',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '6:click',
          change: 'Create is a source action with no fabricated business result',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '49:click',
          change: 'Dismiss initial narrow navigation to expose the card flow',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'contracts-navigation-closed:3:click',
          change: 'Mobile search opens a normal-flow row under the header',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'contracts-search:8:fill',
          change: 'Mobile query filters the same underlying collection',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: 'contracts-search-query:9:click',
          change: 'Close search hides its row while retaining the current query',
        },
      ],
      inferences: [
        {
          scope: 'Repeated navigation, contract anchors and account choices',
          basis:
            'Observed fragment destinations and shared close/focus callbacks; one representative per mechanism is replayed. Data records remain native links, not selectable buttons.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Notifications/settings, reverse collapse, dismissal and equivalent gestures',
          basis:
            'Three top actions were observed as source no-ops. Create represents that group; focused production checks cover reverse collapse, menu keyboard navigation and drawer Escape without multiplying themes/viewports.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other queries, radio gestures and static metadata',
          basis:
            'Match, filtered result, empty and reset are distinct tested branches; repeated query strings and passive metrics do not need extra screenshots. Eight static pairs retain all responsive structures.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-shell-2')
    return {
      revision: 1,
      lumenEntries: ['app-shell-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:click',
          change: 'Area selection swaps navigation, heading, action and all records together',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '1:hover',
          change: 'Shared icon rail pointer feedback without changing the selected area',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '6:click',
          change: 'Workspace menu opens with native radio selection semantics',
        },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'rail-workspace:8:click',
          change: 'Choose Europe: change the workspace label and close its menu, retaining the area',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: 'rail-workspace:10:click',
          change: 'Add workspace closes the source demo menu without creating a result',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '8:click',
          change: 'Fragment anchor leaves the selected navigation and records unchanged',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '27:click',
          change: 'One record represents the source row action with no detail result',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '26:click',
          change: 'Primary source action does not fabricate a workflow result',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '5:click',
          change: 'Account avatar is an action, not a menu trigger',
        },
        {
          viewport: 'mobile',
          theme: 'dark',
          suffix: '42:click',
          change: 'Area selection inside the drawer updates Fleet but leaves the drawer open',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '39:click',
          change: 'Close the initial mobile drawer to expose narrow records',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'rail-navigation-closed:25:click',
          change: 'Reopen navigation from the narrow header',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '39:press-escape',
          change: 'Escape closes the drawer and returns focus',
        },
      ],
      inferences: [
        {
          scope: 'Other area buttons and 55 record actions',
          basis:
            'All five observed datasets use the same area projection and row template. Desktop Dispatch plus narrow Fleet sample content replacement; one native record action represents the no-result callback mechanism.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other workspaces, fragment links and equivalent gestures',
          basis:
            'Menu radios share selection/close behavior; anchors retain their fragment behavior. Eight static pairs cover responsive and theme structure without multiplying every action by every viewport.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Remaining menu keyboard directions, repeated hover and backdrop dismissal',
          basis:
            'Shared native buttons, menu focus navigation and common drawer close path are checked by focused production tests; these are not claimed as source/local screenshot replays.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-shell-1')
    return {
      revision: 1,
      lumenEntries: ['app-shell-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: '2:click',
          change: 'Collapse the single nested navigation group',
        },
        { viewport: 'desktop', theme: 'dark', suffix: '17:click', change: 'Open the account overlay above the footer' },
        {
          viewport: 'desktop',
          theme: 'dark',
          suffix: 'shell-account:18:click',
          change: 'Choose one account item and restore trigger focus without inventing a destination',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '0:click',
          change: 'Workspace options is a verified source no-op action',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '21:fill',
          change: 'Search accepts text but the original demo does not filter its records',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '22:click',
          change: 'Book shipment is an independent source no-op action',
        },
        {
          viewport: 'desktop',
          theme: 'light',
          suffix: '4:click',
          change: 'A nested anchor changes the fragment, not the selected item or records',
        },
        { viewport: 'desktop', theme: 'light', suffix: '1:hover', change: 'Shared navigation link pointer feedback' },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: '24:click',
          change: 'Close the default narrow drawer and reveal mobile record cards',
        },
        {
          viewport: 'stress',
          theme: 'light',
          suffix: 'shell-navigation-closed:18:click',
          change: 'Reopen the drawer from the narrow header',
        },
        {
          viewport: 'tablet',
          theme: 'dark',
          suffix: '24:press-escape',
          change: 'Escape dismisses the drawer and restores the opening trigger',
        },
      ],
      inferences: [
        {
          scope: 'Repeated navigation/footer/facility links and account items',
          basis:
            'Anchors share fragment navigation; account items share close-and-restore behavior. A representative from each mechanism is replayed, not every label.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Repeated button gestures, backdrop dismissal and other viewport/theme interactions',
          basis:
            'Native controls and common close handlers; source Escape/link behavior was manually observed. Eight static pairs cover responsive structure and both themes. Production tests cover the reverse disclosure transition and short-height scroll owners.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Metrics and shipment rows',
          basis:
            'Source DOM exposes passive content, not selectable records. Table-to-card flow and read order are compared without adding click tests for static data.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
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
