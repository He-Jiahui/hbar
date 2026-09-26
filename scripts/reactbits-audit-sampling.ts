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
  if (variantId === 'hbar-app-ui-authentication-7')
    return {
      revision: 1,
      lumenEntries: ['authentication.tsx', 'authentication-sign-up-reference.css', 'authentication/SignUpAuthentication.tsx', 'authentication/primitives.tsx', 'authentication/content.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '2:fill', change: 'One password criterion reveals Weak strength and one active meter segment' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-signup-complete:4:toggle', change: 'Agreement activates submit only after name, full email and all four password requirements' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-signup-ready:5:click', change: 'Documentation form submit has no destination or success feedback' },
        { viewport: 'desktop', theme: 'dark', suffix: '2:fill', change: 'All four criteria update the list and Strong strength label' },
        { viewport: 'desktop', theme: 'dark', suffix: 'auth-signup-password:3:click', change: 'Password reveal changes native type and accessible toggle label' },
        { viewport: 'tablet', theme: 'light', suffix: 'auth-signup-invalid-email:1:fill', change: 'Incomplete email keeps submit disabled even with all other requirements met' },
        { viewport: 'tablet', theme: 'dark', suffix: '6:click', change: 'Sign-in navigation is a source demo no-op' },
        { viewport: 'mobile', theme: 'light', suffix: '0:fill', change: 'Name edit preserves associated field and narrow flow' },
        { viewport: 'mobile', theme: 'dark', suffix: '1:fill', change: 'Email field accepts a full address in dark compact layout' },
        { viewport: 'stress', theme: 'light', suffix: '4:toggle', change: 'Native agreement toggles in clipped narrow card without horizontal overflow' },
        { viewport: 'stress', theme: 'dark', suffix: '3:focus', change: 'Reveal affordance retains keyboard focus at narrow boundary' },
      ],
      inferences: [
        { scope: 'Password permutations and equivalent gestures', basis: 'Four criteria share one host-derived strength projection. Weak and Strong, reveal, consent and a complete form cover distinct feedback; intermediate Fair/Good states are host/browser-tested.', verification: 'inferred-not-replayed' },
        { scope: 'Responsive layout and theme', basis: 'Eight static source/local pairs cover all viewport/theme combinations, with one narrow checkbox and focus probe rather than multiplying every form edit by each layout.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-6')
    return {
      revision: 1,
      lumenEntries: ['authentication.tsx', 'authentication-code-reference.css', 'authentication/CodeAuthentication.tsx', 'authentication/CodeVerification.tsx', 'authentication/primitives.tsx', 'authentication/content.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '8:click', change: 'Recovery action replaces six digits with one recovery-code field' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-code-recovery-valid:1:click', change: 'Valid recovery code enters verifying feedback before host-owned success' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-code-five:5:fill', change: 'Sixth digit auto-starts verification and locks the submit while pending' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-code-verified:1:click', change: 'Verify another device returns from success to empty code entry' },
        { viewport: 'desktop', theme: 'dark', suffix: '0:fill', change: 'First digit edit moves focus and retains a single numeric value' },
        { viewport: 'desktop', theme: 'dark', suffix: 'auth-code-recovery:0:fill', change: 'Recovery entry uppercases and truncates a long value, enabling submit at eleven characters' },
        { viewport: 'desktop', theme: 'dark', suffix: 'auth-code-verified:0:click', change: 'Continue has no navigation result in the documentation preview' },
        { viewport: 'tablet', theme: 'light', suffix: 'auth-code-recovery:3:click', change: 'Switching back restores segmented text-code entry' },
        { viewport: 'tablet', theme: 'dark', suffix: '9:click', change: 'Back-to-sign-in demo action has no source navigation feedback' },
        { viewport: 'stress', theme: 'light', suffix: '8:press-space', change: 'Keyboard recovery switch keeps the narrow card and footer in flow' },
        { viewport: 'stress', theme: 'dark', suffix: '0:focus', change: 'Narrow first-digit focus retains a visible control boundary' },
      ],
      inferences: [
        { scope: 'Repeated digit fields, themes and equivalent gestures', basis: 'The six inputs share one indexed renderer and host code draft. First digit, final digit, direct recovery edit, keyboard mode switch and eight static pairs cover distinct feedback without a Cartesian replay.', verification: 'inferred-not-replayed' },
        { scope: 'Countdown expiry and resend', basis: 'The live reference decrements its disabled resend label; the host preview timer and re-enable/reset are tested with a simulated browser clock. Source/local timer seconds are not claimed as synchronized screenshot frames.', verification: 'inferred-not-replayed' },
        { scope: 'Verified result from complete code', basis: 'The source completion was observed live after six digits and after a valid recovery code. Host-owned preview response and cleanup are browser-tested; asynchronous success is not conflated with the immediate pending interaction frame.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-5')
    return {
      revision: 1,
      lumenEntries: ['authentication.tsx', 'authentication-magic-link-reference.css', 'authentication/MagicLinkAuthentication.tsx', 'authentication/primitives.tsx', 'authentication/content.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '2:click', change: 'Different email replaces delivery summary with the prefilled email form' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-magic-form-invalid:1:click', change: 'Invalid email reveals a field error without sending' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-magic-form:1:click', change: 'Valid form submission returns to the delivery summary and resets the countdown' },
        { viewport: 'desktop', theme: 'dark', suffix: 'auth-magic-form:2:click', change: 'Password-sign-in link has no documentation navigation result' },
        { viewport: 'desktop', theme: 'dark', suffix: '0:hover', change: 'Primary mail-app button pointer feedback' },
        { viewport: 'tablet', theme: 'light', suffix: '0:click', change: 'Mail-app action does not alter the documentation preview' },
        { viewport: 'mobile', theme: 'dark', suffix: 'auth-magic-form:0:fill', change: 'Host email input retains an edit in the narrow form' },
        { viewport: 'stress', theme: 'light', suffix: '2:press-space', change: 'Keyboard opens the form while the narrow confirmation content stays in flow' },
      ],
      inferences: [
        { scope: 'Countdown expiry and resend', basis: 'The live reference decrements the disabled resend label over time; a local browser check tests expiry, re-enable and reset. Independent source/local clocks are not treated as frame-synchronized interaction pairs.', verification: 'inferred-not-replayed' },
        { scope: 'Repeated themes, viewports and equivalent button gestures', basis: 'Eight static pairs cover the responsive theme matrix. Eight paired actions cover branch navigation, validation, submit, edit, keyboard and no-result actions; equivalent permutations are inferred.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-4')
    return {
      revision: 1,
      lumenEntries: ['authentication.tsx', 'authentication-two-step-reference.css', 'authentication/TwoStepAuthentication.tsx', 'authentication/primitives.tsx', 'authentication/content.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '1:click', change: 'Continue enters the asynchronous pending state before revealing the account' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-two-step-invalid:1:click', change: 'Invalid email displays a field-level error instead of advancing' },
        { viewport: 'desktop', theme: 'dark', suffix: 'auth-two-step-password:0:click', change: 'Back returns from the matched-account password view to email' },
        { viewport: 'desktop', theme: 'dark', suffix: 'auth-two-step-password:4:click', change: 'Sign in enters its own pending state without inventing authentication success' },
        { viewport: 'tablet', theme: 'light', suffix: '2:click', change: 'Magic-link button leaves this documentation preview unchanged' },
        { viewport: 'tablet', theme: 'light', suffix: 'auth-two-step-password:2:fill', change: 'Password input keeps the host-entered secret' },
        { viewport: 'tablet', theme: 'dark', suffix: 'auth-two-step-password:3:click', change: 'Show password toggles input type and accessible button name' },
        { viewport: 'mobile', theme: 'dark', suffix: '3:click', change: 'Create-account action has no demo navigation result' },
        { viewport: 'stress', theme: 'light', suffix: '0:fill', change: 'Narrow email edit remains readable in the flowing card' },
        { viewport: 'stress', theme: 'light', suffix: 'auth-two-step-password:1:click', change: 'Forgot-password action keeps the narrow account view' },
        { viewport: 'stress', theme: 'light', suffix: 'auth-two-step-password:3:press-space', change: 'Keyboard reveal changes the narrow password input without clipping' },
      ],
      inferences: [
        { scope: 'Repeated email/password strings, theme-width combinations and alternate activation gestures', basis: 'Eight static pairs cover the responsive canvas. Eleven paired states exercise the distinct email gate, pending states, navigation, input, reveal and no-result actions; equivalent combinations are inferred, not replayed.', verification: 'inferred-not-replayed' },
        { scope: 'Host callback outcomes', basis: 'The documentation preview does not connect magic link, forgot password, account creation or sign-in to a backend. Host callbacks expose those intents without a fabricated success or route.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-3')
    return {
      revision: 1,
      lumenEntries: ['authentication.tsx', 'authentication-quote-reference.css', 'authentication/QuoteAuthentication.tsx', 'authentication/primitives.tsx', 'authentication/content.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'dark', suffix: '13:click', change: 'Next arrow changes story, author, metrics and active dot to Daniel' },
        { viewport: 'desktop', theme: 'light', suffix: '12:click', change: 'Previous wraps from Mina to Rachel and moves the active dot' },
        { viewport: 'desktop', theme: 'dark', suffix: '11:click', change: 'Named dot directly selects the third story' },
        { viewport: 'tablet', theme: 'light', suffix: '3:click', change: 'Password visibility swaps the native input type and accessible label' },
        { viewport: 'tablet', theme: 'light', suffix: '0:fill', change: 'Host email field retains an edit without affecting the hidden quote pane' },
        { viewport: 'tablet', theme: 'dark', suffix: '4:click', change: 'Sign-in preview submit has no invented success result' },
        { viewport: 'tablet', theme: 'dark', suffix: '5:hover', change: 'Shared social button pointer feedback' },
        { viewport: 'tablet', theme: 'dark', suffix: '7:click', change: 'Representative provider action has no source demo transition' },
        { viewport: 'mobile', theme: 'light', suffix: '8:click', change: 'Account creation link has no source demo navigation result' },
        { viewport: 'stress', theme: 'light', suffix: '1:click', change: 'Narrow forgot-password action preserves the form' },
        { viewport: 'stress', theme: 'light', suffix: '3:press-space', change: 'Narrow keyboard password reveal retains field flow' },
      ],
      inferences: [
        { scope: 'Other carousel arrows, active dot and repeated story selections', basis: 'Three host-owned stories share stable ID-based selection; next, wraparound previous and direct third-dot selection expose every distinct content state. Reverse equivalent permutations and the active-dot no-op are inferred, not counted as clicks.', verification: 'inferred-not-replayed' },
        { scope: 'Autonomous quote rotation', basis: 'A separate live source probe observed the first-to-second transition after roughly eight seconds. Host-configured local timer progression and cleanup are browser-tested; independent clocks are not claimed as frame-synchronized screenshot pairs.', verification: 'inferred-not-replayed' },
        { scope: 'Other viewport/theme form and provider permutations', basis: 'Eight static pairs cover the responsive split/hide boundary. Field edit, reveal, keyboard activation and representative no-result actions are sampled without replaying every native control in every viewport.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-2')
    return {
      revision: 1,
      lumenEntries: ['authentication.tsx', 'authentication-provider-first-reference.css', 'authentication/ProviderFirstAuthentication.tsx', 'authentication/primitives.tsx', 'authentication/content.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'dark', suffix: '4:click', change: 'Switch email form to domain label, suffix and admin helper' },
        { viewport: 'desktop', theme: 'dark', suffix: 'auth-provider-sso:4:click', change: 'Return to email form and its disabled submit state' },
        { viewport: 'desktop', theme: 'light', suffix: '5:fill', change: 'Invalid email remains disabled without fabricating an error message' },
        { viewport: 'desktop', theme: 'light', suffix: '5:fill-valid', change: 'Valid email enables Continue without a business result' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-provider-email-valid:6:click', change: 'Email Continue submits with no source demo transition' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-provider-sso:5:fill', change: 'Nonempty domain enables Continue beside the fixed suffix' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-provider-sso-valid:6:click', change: 'SSO Continue is a separate no-result submission path' },
        { viewport: 'desktop', theme: 'dark', suffix: '1:hover', change: 'Shared social provider pointer feedback' },
        { viewport: 'desktop', theme: 'dark', suffix: '2:click', change: 'Representative provider click leaves the form unchanged' },
        { viewport: 'tablet', theme: 'light', suffix: '0:click', change: 'Create account has no source demo navigation result' },
        { viewport: 'stress', theme: 'light', suffix: '4:press-space', change: 'Narrow keyboard SSO switch reflows the suffix and helper' },
        { viewport: 'stress', theme: 'light', suffix: '7:click', change: 'Inline legal action retains the narrow form' },
      ],
      inferences: [
        { scope: 'Other provider and legal links', basis: 'Host-owned providers share one ID-bound action and native button template; a representative provider hover/click and one legal action are paired. Their unclicked siblings are inferred, not counted as replayed.', verification: 'inferred-not-replayed' },
        { scope: 'Repeated themes, sizes, input strings and activation gestures', basis: 'Eight static pairs cover the whole width/theme matrix. Both mode transitions, disabled/enabled gates and both no-result submit routes are paired at representative sizes; local unit tests cover the email/domain boundary and content capacity. No Cartesian replay is claimed.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-authentication-1')
    return {
      revision: 1,
      lumenEntries: ['authentication.tsx', 'authentication-sign-in-reference.css', 'authentication/SignInAuthentication.tsx', 'authentication/primitives.tsx', 'authentication/content.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '0:fill', change: 'Email input retains host-entered value without submitting' },
        { viewport: 'desktop', theme: 'light', suffix: '5:click', change: 'Empty submit places validation beside the email input' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-email-only:5:click', change: 'Valid email with missing password reveals the distinct password error' },
        { viewport: 'desktop', theme: 'light', suffix: 'auth-valid:5:click', change: 'Valid credentials enter the host-owned pending state' },
        { viewport: 'desktop', theme: 'dark', suffix: '3:click', change: 'Password reveal changes the input type and accessible button label' },
        { viewport: 'desktop', theme: 'dark', suffix: '4:toggle', change: 'Remember-me checkbox toggles its checked state' },
        { viewport: 'desktop', theme: 'dark', suffix: '6:hover', change: 'Representative provider hover feedback' },
        { viewport: 'desktop', theme: 'dark', suffix: '6:click', change: 'Provider click leaves the reference demo unchanged' },
        { viewport: 'desktop', theme: 'dark', suffix: '1:click', change: 'Forgot-password demo action has no local visual transition' },
        { viewport: 'tablet', theme: 'light', suffix: '9:click', change: 'Create-account demo action preserves the card' },
        { viewport: 'tablet', theme: 'light', suffix: '10:click', change: 'Footer links share the no-navigation demo behavior' },
        { viewport: 'stress', theme: 'light', suffix: '5:press-enter', change: 'Narrow form keyboard submission retains readable validation' },
      ],
      inferences: [
        { scope: 'Other provider and footer links', basis: 'Three providers share one ID-bound renderer, and three footer actions share one host callback. One representative hover/click of each mechanism is paired; remaining labels are not claimed as clicked.', verification: 'inferred-not-replayed' },
        { scope: 'Repeated themes, widths, gestures and input edits', basis: 'Eight static pairs cover responsive form flow and 12 paired actions cover distinct validation, pending, toggle, reveal and no-op outcomes. Equivalent permutations are inferred; localized/overflow/host-failure cases are local-only.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-6')
    return {
      revision: 1,
      lumenEntries: ['notifications.tsx', 'notifications-bell-reference.css', 'notifications.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '1:click', change: 'Native Projects link preserves the source fragment-only navigation' },
        { viewport: 'desktop', theme: 'light', suffix: '3:click', change: 'Bell opens the anchored five-row dialog with filtering and scroll owner' },
        { viewport: 'desktop', theme: 'light', suffix: 'bell-open:7:click', change: 'An unread row changes only its read treatment and the badge count' },
        { viewport: 'desktop', theme: 'light', suffix: 'bell-open:12:click', change: 'Footer action closes the panel without inventing a destination' },
        { viewport: 'desktop', theme: 'dark', suffix: '4:click', change: 'Settings has no reference demo navigation result' },
        { viewport: 'desktop', theme: 'dark', suffix: 'bell-open:5:click', change: 'Unread tab projects three rows and preserves the fixed panel controls' },
        { viewport: 'desktop', theme: 'dark', suffix: 'bell-open:10:click', change: 'Already-read row has no invented state change' },
        { viewport: 'desktop', theme: 'dark', suffix: 'bell-open:6:click', change: 'Mark all read changes row tone, badge, and disabled action state' },
        { viewport: 'desktop', theme: 'dark', suffix: 'bell-open:3:expand-escape', change: 'Escape closes the popover and restores the bell focus' },
        { viewport: 'tablet', theme: 'light', suffix: 'bell-unread:6:click', change: 'Mark all read from Unread reveals a separate empty-list state' },
        { viewport: 'tablet', theme: 'light', suffix: 'bell-unread-empty:4:click', change: 'All restores the five read rows without resetting their status' },
        { viewport: 'tablet', theme: 'dark', suffix: 'bell-open:3:click', change: 'Bell toggling closes the panel while keeping trigger focus' },
        { viewport: 'stress', theme: 'light', suffix: '3:press-space', change: 'Native keyboard opens the narrow panel; reference left-edge clipping is surfaced, not hidden' },
      ],
      inferences: [
        { scope: 'Other notification rows and nav links', basis: 'Five typed rows share the same ID-bound read callback, three links share native anchor behavior, and representative unread/read rows plus one link are paired. The remaining same-mechanism items are not counted as individual clicks.', verification: 'inferred-not-replayed' },
        { scope: 'Outside pointer dismissal and other theme/viewport gesture combinations', basis: 'Live source probes and local browser checks confirm outside dismissal; footer and Escape pairs cover distinct close/focus outcomes. Eight static pairs cover responsive flow; repeated permutations are not replayed.', verification: 'inferred-not-replayed' },
        { scope: 'Host failure, missing capability, capacity and localized input', basis: 'The source demo applies read state immediately. Host-confirmed failure/retry, unavailable callbacks, empty/one/duplicate/81 rows and translated short hosts are local-only evidence, not live outcomes.', verification: 'inferred-not-replayed' },
        { scope: 'Other narrow viewport/theme popover permutations', basis: 'A direct source probe shows left-edge clipping at 356px and 286px, and the stress Space pair exposes the feedback mismatch. The local panel stays inside the host; only the repeated widths/themes are inferred, while the paired failure remains explicit until reference fidelity and no-clipping requirements are reconciled.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-5')
    return {
      revision: 1,
      lumenEntries: ['notifications.tsx', 'notifications-system-reference.css', 'notifications.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '1:click', change: 'Read the notice removes only the maintenance banner and enables restoration' },
        { viewport: 'desktop', theme: 'dark', suffix: '4:click', change: 'Remind me later removes the billing banner through the secondary action' },
        { viewport: 'desktop', theme: 'light', suffix: '6:expand', change: 'Import failure expands three separate source-error list rows' },
        { viewport: 'desktop', theme: 'dark', suffix: 'system-expanded:6:click', change: 'Hide details collapses the error list without removing the banner' },
        { viewport: 'desktop', theme: 'light', suffix: '7:click', change: 'Retry failed has no invented result in the reference demo' },
        { viewport: 'desktop', theme: 'dark', suffix: '3:click', change: 'Update card is a distinct source no-op action, not a dismissal' },
        { viewport: 'tablet', theme: 'light', suffix: 'system-dismissed:0:click', change: 'Restore all brings a dismissed row back and disables itself' },
        { viewport: 'stress', theme: 'light', suffix: '2:press-space', change: 'Narrow native keyboard dismisses a single message' },
        { viewport: 'stress', theme: 'dark', suffix: 'system-empty:0:click', change: 'Restore from the fully empty state repopulates all five rows' },
        { viewport: 'stress', theme: 'light', suffix: '6:expand', change: 'Narrow details expansion preserves independently scrollable rows' },
      ],
      inferences: [
        { scope: 'Other primary outcomes and repeated dismiss buttons', basis: 'Five typed messages share the same ID-targeted callback and row renderer. Real reference probes confirmed View DNS dismisses, while Increase limit is a no-op; one primary dismissal, one secondary dismissal and a keyboard close are paired. The remaining equivalent rows are inferred, not counted as paired clicks.', verification: 'inferred-not-replayed' },
        { scope: 'Other theme, viewport and input permutations', basis: 'All eight static pairs cover the responsive flow and colors. Desktop and 286px detail states, a tablet restore and native keyboard dismissal cover the different feedback and scrolling owners; no cartesian button matrix is claimed.', verification: 'inferred-not-replayed' },
        { scope: 'Host persistence failure, capacity and localized input', basis: 'The source demo transitions immediately. Host-confirmed async failure/retry, absent handler, empty/one/duplicate/81 messages and long translated copy are tested locally, not invented as live source outcomes.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-4')
    return {
      revision: 2,
      lumenEntries: ['notifications.tsx', 'notifications-activity-reference.css', 'notifications.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '4:click', change: 'Selecting Wei replaces the detail, primary action, facts and destination link' },
        { viewport: 'desktop', theme: 'dark', suffix: '1:click', change: 'Snoozed tab filters to Ana and clears the detail without selecting a new row' },
        { viewport: 'desktop', theme: 'light', suffix: '2:click', change: 'Archived tab filters to Marco and retains the empty detail pane' },
        { viewport: 'desktop', theme: 'dark', suffix: 'activity-snoozed:3:click', change: 'Selecting Ana reveals the snoozed review context and facts' },
        { viewport: 'desktop', theme: 'light', suffix: 'activity-archived:3:click', change: 'Selecting Marco reveals archived member context and actions' },
        { viewport: 'desktop', theme: 'dark', suffix: '8:expand', change: 'Snooze opens the anchored four-choice menu' },
        { viewport: 'desktop', theme: 'light', suffix: 'activity-snooze-menu:9:click', change: 'Later today moves Priya from Inbox to Snoozed and clears the detail' },
        { viewport: 'desktop', theme: 'dark', suffix: '9:click', change: 'Archive moves Priya to Archived and clears the detail' },
        { viewport: 'desktop', theme: 'light', suffix: '7:click', change: 'Primary Grant access has no invented completion feedback in the reference demo' },
        { viewport: 'tablet', theme: 'dark', suffix: 'activity-snooze-menu:8:expand-escape', change: 'Escape closes the narrow anchored menu and restores the trigger' },
        { viewport: 'stress', theme: 'light', suffix: '6:click', change: 'Back replaces narrow detail with the list' },
        { viewport: 'stress', theme: 'dark', suffix: 'activity-back:4:click', change: 'Selecting Wei from narrow list returns to the detail pane' },
        { viewport: 'stress', theme: 'light', suffix: '1:click', change: 'Switching tabs on the narrow detail shows the filtered list' },
      ],
      inferences: [
        { scope: 'Other row selections and repeated primary/link actions', basis: 'Five typed host entries share the ID-keyed projection and detail renderer; both the second inbox row and each other view are actually replayed. Grant is the reference no-op representative; link destinations remain host-owned.', verification: 'inferred-not-replayed' },
        { scope: 'Other Snooze menu choices, pointer and keyboard equivalents', basis: 'The four menuitems invoke one confirmed transfer path with option ID. The menu-open and one option transfer are paired live; the different labels/options and failure/retry are locally exercised without claiming four source screenshots.', verification: 'inferred-not-replayed' },
        { scope: 'Other theme/viewport interaction permutations and capacity', basis: 'Eight static source/local pairs inspect four widths and two themes. Desktop, tablet and extreme-narrow dynamic samples cover pane/stack and overlay ownership. Empty/one/duplicate/81 rows, long translated copy and host failures are locally checked.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-3')
    return {
      revision: 1,
      lumenEntries: ['notifications.tsx', 'notifications-preferences-reference.css', 'notifications.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'dark', suffix: '0:click', change: 'Collaboration in-app bulk None changes three deliveries and the count' },
        { viewport: 'desktop', theme: 'light', suffix: '1:click', change: 'Partially enabled Collaboration email bulk All changes one delivery and the button label' },
        { viewport: 'desktop', theme: 'dark', suffix: '5:click', change: 'One enabled delivery switches off independently of other channels' },
        { viewport: 'desktop', theme: 'light', suffix: '30:click', change: 'Quiet hours switch changes without altering the delivery count' },
        { viewport: 'desktop', theme: 'dark', suffix: '31:click', change: 'An unselected weekday becomes pressed and enables saving' },
        { viewport: 'desktop', theme: 'light', suffix: 'preferences-dirty:38:click', change: 'Reset restores initial delivery, quiet-hour and day values with saved footer feedback' },
        { viewport: 'desktop', theme: 'dark', suffix: 'preferences-dirty:39:click', change: 'Save confirms the changed draft and disables the save action' },
        { viewport: 'stress', theme: 'light', suffix: '8:press-space', change: 'Narrow keyboard activation reaches an off-screen channel and updates the count' },
        { viewport: 'stress', theme: 'dark', suffix: 'preferences-dirty:38:press-enter', change: 'Narrow footer reset remains accessible after a changed delivery' },
      ],
      inferences: [
        { scope: 'Other event/channel switches and group headers', basis: 'Seven host-supplied event rows share one ID-keyed toggle and three channel groups share one bulk reducer. Both switch directions and All/None paths have real replay; duplicate IDs, empty input and capacity are locally tested, not claimed as individual screenshots.', verification: 'inferred-not-replayed' },
        { scope: 'Other weekdays, equivalent pointer/keyboard gestures and theme/viewport permutations', basis: 'The weekday buttons share one ID-keyed set, while the business state has no viewport/theme branch. Eight static pairs cover layout and colors; desktop and narrow dynamic cases cover distinct scroll/focus boundaries.', verification: 'inferred-not-replayed' },
        { scope: 'Host persistence failures and delayed confirmations', basis: 'The public reference demo saves immediately. Host-owned asynchronous success, failure/retry and absent-save behavior are tested locally; no reference-network failure is invented.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-2')
    return {
      revision: 1,
      lumenEntries: ['notifications.tsx', 'notifications-toast-reference.css', 'notifications.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '0:click', change: 'Success toast appears in the corner and enables active-count summary' },
        { viewport: 'desktop', theme: 'dark', suffix: '1:click', change: 'Danger toast has independent icon, title and body' },
        { viewport: 'desktop', theme: 'light', suffix: '2:click', change: 'Information toast provides its distinct message' },
        { viewport: 'desktop', theme: 'dark', suffix: '3:click', change: 'Progress toast uses the spinner tone and message' },
        { viewport: 'desktop', theme: 'light', suffix: 'toast-success:5:click', change: 'Success Undo clears only its active toast' },
        { viewport: 'desktop', theme: 'dark', suffix: 'toast-success:6:click', change: 'Dismiss action clears an active toast' },
        { viewport: 'desktop', theme: 'dark', suffix: 'toast-stack:5:hover', change: 'A two-toast stack expands on pointer hover' },
        { viewport: 'desktop', theme: 'light', suffix: 'toast-stack:4:click', change: 'Clear all removes the whole stack and restores the empty bar' },
        { viewport: 'stress', theme: 'light', suffix: '0:press-space', change: 'Keyboard activation creates a toast beside the narrow card' },
      ],
      inferences: [
        { scope: 'Repeated toast triggers and alternative dismiss targets', basis: 'Four tones have separate real creation screenshots. Shared ID-keyed removal, keyboard activation, Undo and bulk clear are exercised; repeated instances and equivalent buttons are inferred-not-replayed.', verification: 'inferred-not-replayed' },
        { scope: 'Other viewport and theme gesture permutations', basis: 'Eight static pairs inspect card flow; desktop and 286px stress dynamic screenshots exercise distinct overlay and wrapping boundaries without multiplying every gesture.', verification: 'inferred-not-replayed' },
        { scope: 'Timed disappearance and hover pause', basis: 'A separate direct live-reference probe records Info disappearing after six seconds. The local timer is tested separately; a timer checkpoint is not mislabeled as a button click in the paired interaction runner.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-notifications-1')
    return {
      revision: 1,
      lumenEntries: ['notifications.tsx', 'notifications-center-reference.css', 'notifications.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '2:click', change: 'Unread tab filters eight rows to four and keeps section ownership' },
        { viewport: 'desktop', theme: 'dark', suffix: '3:click', change: 'Mentions tab retains one unread and one read mention' },
        { viewport: 'desktop', theme: 'light', suffix: '4:hover', change: 'Row hover reveals the two icon actions over the timestamp' },
        { viewport: 'desktop', theme: 'light', suffix: '4:click', change: 'First unread row becomes read and badge decrements' },
        { viewport: 'desktop', theme: 'dark', suffix: '10:click', change: 'Previously read row becomes unread and badge increments' },
        { viewport: 'desktop', theme: 'light', suffix: '5:click', change: 'Dismiss reflows rows and decrements total, unread and mention counts' },
        { viewport: 'stress', theme: 'light', suffix: '0:click', change: 'Bulk read removes badge and retains narrow grouped rows' },
        { viewport: 'stress', theme: 'dark', suffix: '2:press-space', change: 'Native keyboard activates the narrow unread filter' },
      ],
      inferences: [
        { scope: 'Remaining notification-row read, unread, dismiss and hover actions', basis: 'All eight host entries share the same ID-keyed state transition and button renderer. Both read directions, dismissal and one hover are real-replayed; omitted repeated rows are inferred, not claimed as screenshots.', verification: 'inferred-not-replayed' },
        { scope: 'Other viewport/theme interaction permutations', basis: 'Eight static pairs cover four widths and two themes. Desktop and 286px stress samples exercise the different flow boundaries; state logic does not branch on viewport or theme.', verification: 'inferred-not-replayed' },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-7')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-menu-reference.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '1:click', change: 'Ordinary selection dismisses the menu and reports the selected action and report' },
        { viewport: 'desktop', theme: 'dark', suffix: '3:hover', change: 'Export hover reveals the real nested CSV/Excel/PDF menu' },
        { viewport: 'mobile', theme: 'light', suffix: 'dialog-menu-export:4:click', change: 'Nested CSV selection dismisses both menus and reports a distinct export result' },
        { viewport: 'stress', theme: 'dark', suffix: 'dialog-menu-delete-keyboard:6:press-space', change: 'End navigates to the dangerous item before native Space activation and its target-specific result' },
        { viewport: 'tablet', theme: 'light', suffix: '1:menu-escape', change: 'Escape dismisses the menu without inventing a selection' },
        { viewport: 'mobile', theme: 'dark', suffix: 'dialog-menu-closed:0:click', change: 'The closed trigger reopens the same dialog/menu hierarchy' },
      ],
      inferences: [
        {
          scope: 'Other ordinary action rows, Export formats, repeated gestures and equivalent menu selection outcomes',
          basis: 'The six source menuitem roles and three nested options were structurally observed. One ordinary result, one danger keyboard result and a nested export result traverse the distinct handlers; remaining ID-bound labels are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme action permutations, reverse keyboard navigation and passive separators',
          basis: 'Eight static source/local pairs establish centered overlay geometry in four widths and two themes. Representative hover, narrow submenu selection, Escape and reopen cover state transitions; equivalent permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-6')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-evidence.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '2:click', change: 'Archive preserves the sheet and reports its own result' },
        { viewport: 'desktop', theme: 'dark', suffix: '3:click', change: 'Download preserves the sheet and reports a different result' },
        { viewport: 'mobile', theme: 'light', suffix: 'evidence-body:scroll:end', change: 'The observed sheet body scroll reveals the remaining history above a fixed footer' },
        { viewport: 'stress', theme: 'dark', suffix: '2:press-space', change: 'Native keyboard activation reaches the narrow Archive action' },
        { viewport: 'tablet', theme: 'light', suffix: '1:click', change: 'Close dismisses the sheet without an action result' },
        { viewport: 'mobile', theme: 'dark', suffix: 'dialog-evidence-closed:0:click', change: 'The closed trigger reopens the sheet' },
      ],
      inferences: [
        {
          scope: 'Other passive metadata, control and history rows, repeated values and equivalent Download activation',
          basis: 'These rows are not controls in the live iframe. Scroll ownership and both distinct action results are replayed; passive rows and repeated keyboard/pointer gestures are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme interaction permutations and reverse scroll gesture',
          basis: 'Eight static pairs cover the four widths in light/dark. The sampled mobile scroll proves body ownership and fixed footer, while desktop/narrow action branches are replayed. Equivalent permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-5')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-alert.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '2:select', change: 'Delivery channel selection updates the native select value' },
        { viewport: 'desktop', theme: 'dark', suffix: '3:fill', change: 'Threshold draft is visibly editable' },
        { viewport: 'tablet', theme: 'light', suffix: '4:fill', change: 'Multiline note draft is visibly editable' },
        { viewport: 'tablet', theme: 'dark', suffix: '5:click', change: 'Rule-enabled switch changes checked state' },
        { viewport: 'mobile', theme: 'light', suffix: '5:press-space', change: 'Native keyboard activation toggles the switch in the narrow drawer' },
        { viewport: 'mobile', theme: 'dark', suffix: '6:click', change: 'Pristine Cancel closes without a guard' },
        { viewport: 'stress', theme: 'light', suffix: 'dialog-alert-dirty:1:click', change: 'Dirty Close opens the unsaved-changes alertdialog' },
        { viewport: 'stress', theme: 'dark', suffix: 'dialog-alert-guard:8:click', change: 'Keep editing dismisses guard while retaining draft' },
        { viewport: 'tablet', theme: 'light', suffix: 'dialog-alert-guard:9:click', change: 'Discard changes closes and resets the draft' },
        { viewport: 'desktop', theme: 'dark', suffix: 'dialog-alert-dirty:7:click', change: 'Save changed rule closes drawer and reports update' },
        { viewport: 'mobile', theme: 'light', suffix: 'dialog-alert-closed:0:click', change: 'Trigger reopens a pristine drawer' },
      ],
      inferences: [
        {
          scope: 'Other channel labels, threshold/note values, and dirty Cancel versus dirty Close',
          basis: 'The same ID-keyed select and controlled fields own those values. Close and Cancel enter one guarded path; repeated values and equivalent gestures are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme interaction products and pristine Close versus pristine Cancel',
          basis: 'Eight static source/local pairs cover four widths and two themes; representative interactions traverse desktop, tablet, mobile and stress. Equivalent permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-4')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-wizard.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '2:fill', change: 'Workspace name edits its visible URL slug in place' },
        { viewport: 'mobile', theme: 'dark', suffix: '4:click', change: 'Continue replaces Workspace with Region in the stacked footer' },
        { viewport: 'tablet', theme: 'light', suffix: 'dialog-wizard-region:3:click', change: 'Europe selection transfers pressed state from United States' },
        { viewport: 'tablet', theme: 'dark', suffix: 'dialog-wizard-region-selected:7:click', change: 'Selected region carries into Team summary' },
        { viewport: 'stress', theme: 'light', suffix: 'dialog-wizard-team:2:fill', change: 'Optional teammate draft fills in the narrow Team step' },
        { viewport: 'desktop', theme: 'dark', suffix: 'dialog-wizard-team-custom:4:click', change: 'Create closes and reports the edited workspace slug' },
        { viewport: 'stress', theme: 'dark', suffix: 'dialog-wizard-team:3:click', change: 'Back restores Region and retains the selected choice' },
        { viewport: 'desktop', theme: 'light', suffix: 'dialog-wizard-region:6:click', change: 'Back restores Workspace and its name draft' },
        { viewport: 'mobile', theme: 'light', suffix: '3:click', change: 'Cancel dismisses without a creation result' },
        { viewport: 'mobile', theme: 'dark', suffix: 'dialog-wizard-region:1:press-space', change: 'Keyboard close dismisses the second step' },
        { viewport: 'stress', theme: 'light', suffix: 'dialog-wizard-closed:0:click', change: 'Closed trigger reopens the wizard' },
      ],
      inferences: [
        {
          scope: 'Other region buttons, name strings, invite addresses and equivalent gestures',
          basis: 'One selected/unselected pressed transition, slug edit, optional draft and every distinct step change are replayed. Repeated choices and values share the same ID-keyed controls and are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other viewport/theme permutations and creation with no invitees',
          basis: 'Eight static pairs cover four widths and two themes; dynamic cases hit desktop, tablet, mobile and stress flow boundaries. Optional invite text does not gate Create; omitted permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-3')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-invite.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '6:click', change: 'Empty submission shows both field errors in place' },
        { viewport: 'stress', theme: 'dark', suffix: 'dialog-invite-empty:2:fill', change: 'Name correction clears only its own error in narrow flow' },
        { viewport: 'tablet', theme: 'light', suffix: '4:select', change: 'Role selection changes the selected option without inventing a new hint' },
        { viewport: 'mobile', theme: 'light', suffix: 'dialog-invite-invalid:3:fill', change: 'Valid email corrects inline validation after a failed attempt' },
        { viewport: 'desktop', theme: 'dark', suffix: 'dialog-invite-valid:6:click', change: 'Valid submission closes and shows pending invite feedback' },
        { viewport: 'mobile', theme: 'dark', suffix: '5:click', change: 'Cancel dismisses the stacked-footer form' },
        { viewport: 'desktop', theme: 'light', suffix: '1:press-space', change: 'Keyboard close dismisses the dialog' },
        { viewport: 'stress', theme: 'light', suffix: 'dialog-invite-closed:0:click', change: 'Closed trigger reopens in the narrow canvas' },
      ],
      inferences: [
        {
          scope: 'Equivalent per-field fill strings, role options and close gestures',
          basis: 'Empty and corrected fields, one option change, valid submit, Cancel, keyboard close and reopen exercise distinct feedback paths. Repeated values and native button/select gestures share the same implementation and are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
        {
          scope: 'Other theme/viewport permutations',
          basis: 'Eight static source/local pairs cover four widths and two themes; dynamic cases sample desktop and both narrow boundaries. Validation logic has no theme/viewport branches; omitted permutations are inferred-not-replayed.',
          verification: 'inferred-not-replayed',
        },
      ],
    }
  if (variantId === 'hbar-app-ui-app-dialog-2')
    return {
      revision: 1,
      lumenEntries: ['app-dialog.tsx', 'app-dialog-delete.css', 'app-dialog.css', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'desktop', theme: 'light', suffix: '2:fill', change: 'Incorrect resource name leaves destructive action disabled' },
        { viewport: 'mobile', theme: 'dark', suffix: '2:fill-valid', change: 'Exact resource name enables deletion in narrow layout' },
        { viewport: 'tablet', theme: 'dark', suffix: 'dialog-delete-valid:4:click', change: 'Enabled destructive action closes and reports the deleted resource' },
        { viewport: 'mobile', theme: 'light', suffix: '3:click', change: 'Cancel dismisses without deletion' },
        { viewport: 'desktop', theme: 'dark', suffix: '1:press-space', change: 'Keyboard close dismisses without deletion' },
        { viewport: 'stress', theme: 'light', suffix: 'dialog-delete-closed:0:click', change: 'Trigger reopens after a completed dismissal' },
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
        { viewport: 'desktop', theme: 'light', suffix: '1:click', change: 'Close icon dismisses the plan comparison modal' },
        { viewport: 'mobile', theme: 'dark', suffix: '2:press-space', change: 'Keyboard Cancel dismisses the stacked narrow modal' },
        { viewport: 'tablet', theme: 'dark', suffix: '3:click', change: 'Apply action confirms and closes the modal' },
        { viewport: 'stress', theme: 'light', suffix: 'dialog-plan-closed:0:click', change: 'Visible trigger reopens the comparison after dismissal' },
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
        { viewport: 'desktop', theme: 'light', suffix: '3:click', change: 'Desktop Pipelines link retains Overview selection' },
        { viewport: 'desktop', theme: 'dark', suffix: '13:click', change: 'Separate footer help link has no visible transition' },
        { viewport: 'desktop', theme: 'dark', suffix: '8:hover', change: 'Desktop unselected Reports hover feedback' },
        { viewport: 'mobile', theme: 'dark', suffix: '16:click', change: 'Narrow close button collapses the dialog' },
        { viewport: 'stress', theme: 'light', suffix: '15:click', change: 'Exposed scrim strip closes the stress-width dialog' },
        { viewport: 'mobile', theme: 'dark', suffix: 'sidebar-full-closed:14:click', change: 'Collapsed trigger reopens the dialog' },
        { viewport: 'mobile', theme: 'light', suffix: '20:click', change: 'Narrow Pipelines link keeps the dialog open' },
        { viewport: 'mobile', theme: 'dark', suffix: '16:press-space', change: 'Keyboard Space activates dialog close' },
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
      lumenEntries: ['app-sidebar-drawer.tsx', 'app-sidebar-drawer.css', 'app-sidebar-workflows.tsx', 'LumenProvider.tsx'],
      samples: [
        { viewport: 'stress', theme: 'light', suffix: '1:click', change: 'Exposed scrim strip closes the narrow overlay' },
        { viewport: 'mobile', theme: 'dark', suffix: '2:click', change: 'Narrow drawer close button collapses to the opener' },
        { viewport: 'mobile', theme: 'dark', suffix: 'sidebar-drawer-closed:0:click', change: 'Closed drawer reopens from its header trigger' },
        { viewport: 'desktop', theme: 'dark', suffix: '2:press-space', change: 'Keyboard Space activates the close button' },
        { viewport: 'mobile', theme: 'light', suffix: '4:click', change: 'Inbox link retains the open drawer and selected Home' },
        { viewport: 'desktop', theme: 'dark', suffix: '7:hover', change: 'Representative unselected navigation row hover feedback' },
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
        { viewport: 'desktop', theme: 'dark', suffix: '7:click', change: 'Open the same row-action menu on a document' },
        {
          viewport: 'desktop', theme: 'light', suffix: 'sidebar-tree-menu-open:4:click',
          change: 'Rename closes the menu without changing the reference tree',
        },
        { viewport: 'desktop', theme: 'light', suffix: '8:click', change: 'Selecting another document retains the initial visual selection' },
        { viewport: 'mobile', theme: 'dark', suffix: '1:fill', change: 'Search keeps its draft without filtering the tree' },
        { viewport: 'desktop', theme: 'dark', suffix: '0:click', change: 'New document has no visible reference transition' },
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
