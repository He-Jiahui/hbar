import { describe, expect, test } from 'bun:test'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/specs'
import { HBAR_APP_UI_CATEGORIES, HBAR_APP_UI_CATEGORY_COUNTS } from '../packages/hbar-app-ui/src/types'
import { renderAuditEvidencePage } from '../scripts/reactbits-audit-evidence-page'
import { auditSamplingPlan, sampledInteractionIds } from '../scripts/reactbits-audit-sampling'

test('notification center samples distinct feedback and labels repeated rows as inference', () => {
  const id = 'hbar-app-ui-notifications-1'
  const plan = auditSamplingPlan(id)!
  expect(plan.samples).toHaveLength(8)
  expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([
    `${id}:2:click`, `${id}:4:hover`, `${id}:4:click`, `${id}:5:click`,
  ])
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:0:click`])
  expect(plan.inferences.some((item) => item.scope.includes('Remaining notification-row'))).toBe(true)
  expect(plan.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})

test('toast sampling differentiates payload, stack, Undo, dismiss, clear and narrow keyboard feedback', () => {
  const id = 'hbar-app-ui-notifications-2'
  const plan = auditSamplingPlan(id)!
  expect(plan.samples).toHaveLength(9)
  expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([
    `${id}:0:click`, `${id}:2:click`, `${id}:toast-success:5:click`, `${id}:toast-stack:4:click`,
  ])
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:0:press-space`])
  expect(plan.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})

test('preference sampling covers state-changing mechanisms without replaying every matrix cell', () => {
  const id = 'hbar-app-ui-notifications-3'
  const plan = auditSamplingPlan(id)!
  expect(plan.samples).toHaveLength(9)
  expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([
    `${id}:1:click`, `${id}:30:click`, `${id}:preferences-dirty:38:click`,
  ])
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:8:press-space`])
  expect(plan.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})

test('activity sampling distinguishes view projection, move confirmation, menu and narrow pane transitions', () => {
  const id = 'hbar-app-ui-notifications-4'
  const plan = auditSamplingPlan(id)!
  expect(plan.samples).toHaveLength(13)
  expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([
    `${id}:4:click`, `${id}:2:click`, `${id}:activity-archived:3:click`,
    `${id}:activity-snooze-menu:9:click`, `${id}:7:click`,
  ])
  expect(sampledInteractionIds(id, 'stress', 'dark')).toEqual([`${id}:activity-back:4:click`])
  expect(plan.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})

test('system banner sampling covers dismissal, detail disclosure, restoration and reference no-ops', () => {
  const id = 'hbar-app-ui-notifications-5'
  const plan = auditSamplingPlan(id)!
  expect(plan.samples).toHaveLength(10)
  expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([
    `${id}:1:click`, `${id}:6:expand`, `${id}:7:click`,
  ])
  expect(sampledInteractionIds(id, 'stress', 'dark')).toEqual([`${id}:system-empty:0:click`])
  expect(plan.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})

test('bell sampling separates filtering, confirmed reads, close focus and a narrow source clipping conflict', () => {
  const id = 'hbar-app-ui-notifications-6'
  const plan = auditSamplingPlan(id)!
  expect(plan.samples).toHaveLength(13)
  expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([
    `${id}:1:click`, `${id}:3:click`, `${id}:bell-open:7:click`, `${id}:bell-open:12:click`,
  ])
  expect(sampledInteractionIds(id, 'tablet', 'light')).toEqual([
    `${id}:bell-unread:6:click`, `${id}:bell-unread-empty:4:click`,
  ])
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:3:press-space`])
  expect(plan.inferences.some((entry) => entry.scope.includes('narrow viewport') && entry.basis.includes('feedback mismatch'))).toBe(true)
  expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})

test('sign-in samples distinct validation, pending, reveal, remember and demo no-op feedback', () => {
  const id = 'hbar-app-ui-authentication-1'
  const plan = auditSamplingPlan(id)!
  expect(plan.samples).toHaveLength(12)
  expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([
    `${id}:0:fill`, `${id}:5:click`, `${id}:auth-email-only:5:click`, `${id}:auth-valid:5:click`,
  ])
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:5:press-enter`])
  expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})

test('compact usage samples two independent actions and button styles, not passive bars', () => {
  const id = 'hbar-app-ui-ai-usage-8'
  expect(auditSamplingPlan(id)!.samples).toHaveLength(5)
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:1:press-space`])
  const cases = usageCompactInteractionCases(snapshot([control(0), control(1)]), id)
  expect(cases.filter((c) => c.action === 'press').every((c) => c.focusBefore)).toBe(true)
  expect(() => usageCompactInteractionCases(snapshot([]), id)).toThrow('actions changed')
  expect(auditSamplingPlan(id)!.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})

test('request log samples status filtering, exclusive detail, recovery and narrow keyboard collapse', () => {
  const id = 'hbar-app-ui-ai-usage-7'
  expect(auditSamplingPlan(id)!.samples).toHaveLength(7)
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:6:press-enter`])
  const cases = usageRequestInteractionCases(
    snapshot([control(3, { tag: 'button', capabilities: ['press', 'click'] })]),
    id,
    'usage-requests-error',
  )
  expect(cases.filter((c) => c.action === 'press').every((c) => c.focusBefore)).toBe(true)
  expect(cases.some((c) => c.id === `${id}:usage-requests-error:3:click`)).toBe(true)
  expect(auditSamplingPlan(id)!.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})

test('overage samples choice feedback and both source no-op actions without replaying every plan', () => {
  const id = 'hbar-app-ui-ai-usage-6'
  expect(auditSamplingPlan(id)!.samples).toHaveLength(6)
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:1:press-enter`])
  const controls = [0, 1].map((index) =>
    control(index, { tag: 'button', role: 'radio', capabilities: ['click', 'press'] }),
  )
  const cases = usageOverageInteractionCases(snapshot(controls), id)
  expect(cases.filter((item) => item.action === 'press').every((item) => item.focusBefore)).toBe(true)
  expect(cases.filter((item) => item.action === 'click').every((item) => !item.focusBefore)).toBe(true)
  expect(() => usageOverageInteractionCases(snapshot([]), id)).toThrow('Overage plan controls changed')
  expect(auditSamplingPlan(id)!.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
})

test('budget samples numeric branches, independent threshold states and native switch activation', () => {
  const id = 'hbar-app-ui-ai-usage-5'
  expect(auditSamplingPlan(id)!.samples).toHaveLength(6)
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:5:press-enter`])
  expect(auditSamplingPlan(id)!.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  const slider = control(0, { tag: 'input', type: 'range', name: '', labelFor: 'Monthly cap', capabilities: ['fill'] })
  expect(usageBudgetSliderCases(snapshot([slider]), id).map((item) => item.key)).toEqual(['Home', 'End'])
  expect(usageBudgetSliderCases(snapshot([slider]), id).every((item) => item.focusBefore)).toBe(true)
  const toggle = control(1, { role: 'switch', capabilities: ['click', 'press'] })
  const cases = usageBudgetInteractionCases(snapshot([slider, toggle]), id)
  expect(cases.filter((item) => item.action === 'press').every((item) => item.focusBefore)).toBe(true)
  expect(cases.filter((item) => item.action === 'click').every((item) => !item.focusBefore)).toBe(true)
  expect(() => usageBudgetSliderCases(snapshot([]), id)).toThrow('Budget slider changed')
})

test('member usage samples distinct filter outcomes and honestly infers repeated row/team gestures', () => {
  const plan = auditSamplingPlan('hbar-app-ui-ai-usage-4')!
  expect(plan.samples).toHaveLength(6)
  expect(sampledInteractionIds('hbar-app-ui-ai-usage-4', 'stress', 'light')).toEqual([
    'hbar-app-ui-ai-usage-4:usage-members-platform:1:press-enter',
  ])
  expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  const input = control(0, { tag: 'input', type: 'search', name: 'Search members', capabilities: ['fill'] })
  expect(
    usageMemberScenarioCases(snapshot([input]), 'hbar-app-ui-ai-usage-4', 'usage-members-platform')[0]!.fillValue,
  ).toBe('Sofia')
  expect(
    usageMemberScenarioCases(snapshot([input]), 'hbar-app-ui-ai-usage-4', 'usage-members-empty')[0]!.fillValue,
  ).toBe('')
})

test('rate limits sample tier outcomes and request feedback without clicking passive meters', () => {
  const plan = auditSamplingPlan('hbar-app-ui-ai-usage-3')!
  expect(plan.samples).toHaveLength(5)
  expect(sampledInteractionIds('hbar-app-ui-ai-usage-3', 'stress', 'light')).toEqual([
    'hbar-app-ui-ai-usage-3:usage-limits-raised:0:press-enter',
  ])
  expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})

test('model spend samples three sort outcomes and a passive row without repeated model clicks', () => {
  const plan = auditSamplingPlan('hbar-app-ui-ai-usage-2')!
  expect(plan.samples).toHaveLength(6)
  expect(plan.samples.filter((sample) => sample.suffix.includes('usage-model-row'))).toHaveLength(1)
  expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})

test('usage overview groups range, point detail, restoration and keyboard feedback into seven samples', () => {
  const id = 'hbar-app-ui-ai-usage-1'
  expect(auditSamplingPlan(id)?.samples).toHaveLength(7)
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:usage-month:0:press-enter`])
  expect(auditSamplingPlan(id)?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})

test('plan tree sampling covers distinct disclosure content and retry without per-row gesture products', () => {
  const id = 'hbar-app-ui-agent-plan-3'
  expect(auditSamplingPlan(id)?.samples).toHaveLength(9)
  expect(sampledInteractionIds(id, 'desktop', 'dark')).toEqual(
    ['tree-shipping-open:3:click', '0:click', '3:click', '4:click', '2:click', '0:hover', '2:hover'].map(
      (suffix) => `${id}:${suffix}`,
    ),
  )
  expect(sampledInteractionIds(id, 'stress', 'light')).toEqual(
    ['3:press-enter', '2:press-space'].map((suffix) => `${id}:${suffix}`),
  )
  expect(sampledInteractionIds(id, 'tablet', 'dark')).toEqual([])
  expect(auditSamplingPlan(id)?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
})
import { includesLumenAuditFile, lumenDependencyFiles } from '../scripts/reactbits-audit-scope'
import {
  REACTBITS_PRO_THEMES,
  REACTBITS_PRO_VIEWPORTS,
  agentFailureDynamicCaseIds,
  agentLogDynamicCaseIds,
  auditBrowserArguments,
  assessInteractionCoverage,
  alignedCanvasPadding,
  fullAuditMatrixSelected,
  diffApprovalDynamicCaseIds,
  diffApprovalScenarioCases,
  inlineApprovalDynamicCaseIds,
  inlineApprovalScenarioCases,
  queueApprovalDynamicCaseIds,
  queueApprovalScenarioCases,
  queueApprovalScenarioPlans,
  referenceAccessBlockReason,
  permissionApprovalScenarioCases,
  planReviewScenarioCases,
  passiveTableRowHoverCase,
  passiveModelRowHoverCase,
  usageMemberScenarioCases,
  usageBudgetSliderCases,
  usageBudgetInteractionCases,
  usageOverageInteractionCases,
  usageRequestInteractionCases,
  usageCompactInteractionCases,
  planBoardScrollCase,
  passiveScrollDelta,
  checkableStates,
  cachedInventorySourcePath,
  interactionCases,
  interactionCheckpointMatches,
  interactionFeedbackMatches,
  interactionWorkersPerVariant,
  interactiveControlSelector,
  liveActivityDelta,
  magicLinkInteractionDelta,
  codeAuthenticationInteractionDelta,
  passwordResetInteractionDelta,
  manualReviewGate,
  rootGeometryMatches,
  selectInteractionCases,
  semanticRoleTree,
  semanticRoleTreeMatches,
  semanticInteractionDelta,
  dialogMenuInteractionDelta,
  timedActivityDelta,
  visibleControls,
  type ControlSnapshot,
  type SemanticSnapshot,
} from '../scripts/reactbits-pro-audit'

test('live reference checkpoints and access denials are blocked instead of treated as mounted previews', () => {
  expect(referenceAccessBlockReason(200, 'Vercel Security Checkpoint')).toBe('vercel-security-checkpoint')
  expect(referenceAccessBlockReason(403, 'Access denied')).toBe('http-403')
  expect(referenceAccessBlockReason(429, '')).toBe('http-429-rate-limited')
  expect(referenceAccessBlockReason(200, 'Notifications 6 | React Bits Pro')).toBeNull()
  expect(referenceAccessBlockReason(404, 'Not found')).toBeNull()
})

test('local-only recapture binds inventory to the source screenshots it copies', () => {
  const options = { sourceInventoryPath: undefined, sourceCaptureRoot: 'artifacts/source-a', localOnly: true }
  expect(cachedInventorySourcePath(options)?.replaceAll('\\', '/').endsWith(
    'artifacts/source-a/source-inventory.json',
  )).toBe(true)
  expect(cachedInventorySourcePath({ ...options, sourceInventoryPath: 'explicit.json' })).toBe('explicit.json')
  expect(cachedInventorySourcePath({ ...options, localOnly: false })).toBeUndefined()
})

function control(index: number, overrides: Partial<ControlSnapshot> = {}): ControlSnapshot {
  return {
    index,
    rect: { x: 12, y: 24, width: 70, height: 32 },
    tag: 'button',
    role: null,
    type: 'button',
    name: `Action ${index}`,
    disabled: false,
    visible: true,
    expanded: null,
    pressed: null,
    selected: null,
    state: null,
    stablePath: `button:nth-of-type(${index + 1})`,
    labelFor: null,
    describedBy: null,
    capabilities: ['hover', 'focus', 'click', 'press'],
    options: [],
    ...overrides,
  }
}

function snapshot(controls: readonly ControlSnapshot[]): SemanticSnapshot {
  return {
    rootTag: 'div',
    rootRect: { width: 400, height: 300 },
    bodyTextLength: 0,
    textLineCount: 0,
    truncatedTextCount: 0,
    horizontalOverflow: false,
    axSnapshot: '',
    tree: [],
    controls,
  }
}

describe('React Bits Pro visual audit contract', () => {
  test('sign-in approval samples distinct decision outcomes, recovery and source no-op without row permutations', () => {
    const id = 'hbar-app-ui-authentication-14'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(5)
    expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([`${id}:0:click`])
    expect(sampledInteractionIds(id, 'mobile', 'dark')).toEqual([`${id}:1:click`])
    expect(sampledInteractionIds(id, 'tablet', 'light')).toEqual([`${id}:auth-approval-blocked:0:click`])
    expect(auditSamplingPlan(id)?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  })
  test('password reset feedback ignores hidden demo bytes but checks device outcomes and accessible copy', () => {
    const sourceBefore = {...snapshot([control(0, {name: 'Update password', disabled: true})]), axSnapshot: '- checkbox "Sign out of my other devices" [checked]\n- text: Ends', bodyTextLength: 495}
    const localBefore = {...sourceBefore, bodyTextLength: 405}
    const sourceAfter = {...snapshot([control(0, {name: 'Update password', disabled: true})]), axSnapshot: '- checkbox "Sign out of my other devices"\n- text: Stays', bodyTextLength: 497}
    const localAfter = {...sourceAfter, bodyTextLength: 407}
    expect(passwordResetInteractionDelta(sourceBefore, sourceAfter).signature).toBe(passwordResetInteractionDelta(localBefore, localAfter).signature)
    expect(passwordResetInteractionDelta(sourceBefore, sourceAfter).changed).toBe(true)
    expect(passwordResetInteractionDelta(sourceBefore, sourceAfter).signature).not.toBe(passwordResetInteractionDelta(localBefore, {...localAfter, axSnapshot: '- checkbox "Sign out of my other devices"\n- text: Ends'}).signature)
  })
  test('password reset samples validation, reveal, sign-out and distinct completion messages without form permutations', () => {
    const id = 'hbar-app-ui-authentication-13'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(10)
    expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([
      `${id}:0:fill`, `${id}:auth-reset-strong:2:fill`, `${id}:auth-reset-ready-no-signout:4:click`,
    ])
    expect(sampledInteractionIds(id, 'tablet', 'light')).toEqual([`${id}:3:toggle`])
    expect(sampledInteractionIds(id, 'mobile', 'light')).toEqual([`${id}:auth-reset-ready:4:click`])
    expect(auditSamplingPlan(id)?.inferences.every((item) => item.verification === 'inferred-not-replayed')).toBe(true)
  })
  test('invitation audit samples native validation, reveal, confirmation, review and no-op alternatives', () => {
    const id = 'hbar-app-ui-authentication-12'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(10)
    expect(sampledInteractionIds(id, 'desktop', 'light')).toContain(`${id}:auth-invite-success:0:click`)
    expect(sampledInteractionIds(id, 'tablet', 'dark')).toEqual([`${id}:auth-invite-success:1:click`])
    expect(sampledInteractionIds(id, 'stress', 'dark')).toEqual([`${id}:1:fill`])
  })
  test('workspace audit samples search, invitation, create and sticky action mechanisms without row-layout multiplication', () => {
    const id = 'hbar-app-ui-authentication-11'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(8)
    expect(sampledInteractionIds(id, 'desktop', 'light')).toEqual([`${id}:3:click`, `${id}:1:fill`])
    expect(sampledInteractionIds(id, 'mobile', 'dark')).toEqual([`${id}:1:fill`])
    expect(sampledInteractionIds(id, 'stress', 'dark')).toEqual([`${id}:3:press-space`])
  })
  test('account audit samples normal and expired selection plus independent no-ops without row permutations', () => {
    const id = 'hbar-app-ui-authentication-10'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(7)
    expect(sampledInteractionIds(id, 'desktop', 'light')).toContain(`${id}:auth-account-contractor:4:click`)
    expect(sampledInteractionIds(id, 'stress', 'dark')).toEqual([`${id}:2:press-space`])
    expect(sampledInteractionIds(id, 'mobile', 'light')).toEqual([`${id}:5:click`])
  })
  test('passkey audit samples selection, request, cancellation and fallbacks without per-device permutation', () => {
    const id = 'hbar-app-ui-authentication-9'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(9)
    expect(sampledInteractionIds(id, 'desktop', 'light')).toContain(`${id}:auth-passkey-request:0:click`)
    expect(sampledInteractionIds(id, 'stress', 'light')).toContain(`${id}:1:press-space`)
    expect(sampledInteractionIds(id, 'tablet', 'light')).toEqual([`${id}:5:click`])
  })
  test('enterprise audit samples domain transitions and pending redirect without probing passive organization data', () => {
    const id = 'hbar-app-ui-authentication-8'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(9)
    expect(sampledInteractionIds(id, 'desktop', 'light')).toContain(`${id}:auth-enterprise-mismatch:0:fill`)
    expect(sampledInteractionIds(id, 'tablet', 'dark')).toContain(`${id}:1:press-enter`)
    expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([`${id}:2:press-space`])
  })
  test('sign-up samples strength, consent, reveal, valid and invalid gates without replaying every form combination', () => {
    const id = 'hbar-app-ui-authentication-7'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(11)
    expect(sampledInteractionIds(id, 'desktop', 'light')).toContain(`${id}:auth-signup-complete:4:toggle`)
    expect(sampledInteractionIds(id, 'desktop', 'dark')).toContain(`${id}:auth-signup-password:3:click`)
    expect(sampledInteractionIds(id, 'tablet', 'light')).toContain(`${id}:auth-signup-invalid-email:1:fill`)
    expect(sampledInteractionIds(id, 'mobile', 'light')).toEqual([`${id}:0:fill`])
  })
  test('magic-link audit ignores independent countdown clocks but preserves visible state changes', () => {
    const sourceBefore = { ...snapshot([control(0, { name: 'Resend link in 0:39', disabled: true })]), axSnapshot: '- button "Resend link in 0:39" [disabled]', bodyTextLength: 400 }
    const localBefore = { ...snapshot([control(0, { name: 'Resend link in 0:45', disabled: true })]), axSnapshot: '- button "Resend link in 0:45" [disabled]', bodyTextLength: 320 }
    const sourceAfter = { ...snapshot([control(0, { name: 'Resend link', disabled: false })]), axSnapshot: '- button "Resend link"', bodyTextLength: 385 }
    const localAfter = { ...sourceAfter, bodyTextLength: 305 }
    expect(magicLinkInteractionDelta(sourceBefore, sourceAfter).signature).toBe(magicLinkInteractionDelta(localBefore, localAfter).signature)
    expect(magicLinkInteractionDelta(sourceBefore, sourceAfter).changed).toBe(true)
    const differentResult = { ...sourceAfter, axSnapshot: '- button "Resend failed"' }
    expect(magicLinkInteractionDelta(sourceBefore, sourceAfter).signature).not.toBe(magicLinkInteractionDelta(localBefore, differentResult).signature)
  })
  test('code-verification audit ignores only elapsed seconds while retaining real state feedback', () => {
    const sourceBefore = { ...snapshot([control(0, { name: 'Resend in 0:21', disabled: true })]), axSnapshot: '- button "Resend in 0:21" [disabled]', bodyTextLength: 400 }
    const localBefore = { ...snapshot([control(0, { name: 'Resend in 0:28', disabled: true })]), axSnapshot: '- button "Resend in 0:28" [disabled]', bodyTextLength: 320 }
    const sourceAfter = { ...snapshot([control(0, { name: 'Resend code', disabled: false })]), axSnapshot: '- button "Resend code"', bodyTextLength: 385 }
    const localAfter = { ...sourceAfter, bodyTextLength: 305 }
    expect(codeAuthenticationInteractionDelta(sourceBefore, sourceAfter).signature).toBe(codeAuthenticationInteractionDelta(localBefore, localAfter).signature)
    expect(codeAuthenticationInteractionDelta(sourceBefore, sourceAfter).changed).toBe(true)
    const different = { ...sourceAfter, controls: [control(0, { name: 'Resend code', disabled: true })], axSnapshot: '- button "Resend code" [disabled]' }
    expect(codeAuthenticationInteractionDelta(sourceBefore, sourceAfter).signature).not.toBe(codeAuthenticationInteractionDelta(localBefore, different).signature)
  })
  test('dialog menu result matching cannot equate different same-length action labels', () => {
    const before = { ...snapshot([control(0)]), axSnapshot: '- button "Report actions" [expanded]' }
    const rename = { ...snapshot([control(0)]), axSnapshot: '- button "Report actions"\n- paragraph: Rename report selected\n- paragraph: Applied to Weekly active users.', bodyTextLength: 73 }
    const deleted = { ...rename, axSnapshot: '- button "Report actions"\n- paragraph: Delete report selected\n- paragraph: Applied to Weekly active users.' }
    expect(rename.bodyTextLength).toBe(deleted.bodyTextLength)
    expect(semanticInteractionDelta(before, rename).signature).toBe(semanticInteractionDelta(before, deleted).signature)
    expect(dialogMenuInteractionDelta(before, rename).signature).not.toBe(dialogMenuInteractionDelta(before, deleted).signature)
  })
  test('counts actual text input changes as feedback independently of semantic roles', () => {
    const input = control(0, { tag: 'input', type: 'text', name: '', value: '' })
    const before = snapshot([input])
    const filled = snapshot([{ ...input, value: 'audit sample' }])
    const result = semanticInteractionDelta(before, filled)
    expect(result.changed).toBe(true)
    expect(result.signature).toContain('audit sample')
    expect(semanticInteractionDelta(before, snapshot([{ ...input, value: '' }])).changed).toBe(false)
    expect(semanticInteractionDelta(before, filled).signature).not.toBe(
      semanticInteractionDelta(before, snapshot([{ ...input, value: 'different' }])).signature,
    )
  })
  test('board sampling replays native scroll owners rather than passive card gestures', () => {
    const id = 'hbar-app-ui-agent-plan-5'
    const owner = control(0, { tag: 'ol', role: 'list', capabilities: ['scroll'] })
    expect(planBoardScrollCase(id, owner, 'column', 'end').id).toBe(`${id}:board-column:0:scroll:end`)
    const stack = { ...owner, tag: 'div', role: null }
    expect(planBoardScrollCase(id, stack, 'stack', 'middle').wheelDeltaY).toBe(500)
    expect(planBoardScrollCase(id, stack, 'stack', 'end').wheelDeltaY).toBe(2000)
    expect(() => planBoardScrollCase(id, control(0), 'column', 'end')).toThrow('scroll-only')
    expect(() => planBoardScrollCase(id, { ...owner, visible: false }, 'column', 'end')).toThrow('scroll-only')
    expect(() => planBoardScrollCase(id, owner, 'column', 'middle')).toThrow('end boundary')
    expect(auditSamplingPlan(id)?.samples).toHaveLength(3)
    expect(sampledInteractionIds(id, 'desktop', 'dark')).toHaveLength(1)
    expect(sampledInteractionIds(id, 'stress', 'light')).toHaveLength(2)
    expect(sampledInteractionIds(id, 'tablet', 'dark')).toEqual([])
  })

  test('native scroll feedback includes direction and reached boundary even when all text is unchanged', () => {
    const before = { ...snapshot([]), observedScroll: { top: 0, left: 0, maximum: 100 } }
    const middle = { ...before, observedScroll: { ...before.observedScroll, top: 50 } }
    const end = { ...before, observedScroll: { ...before.observedScroll, top: 100 } }
    expect(passiveScrollDelta(before, middle).changed).toBe(true)
    expect(passiveScrollDelta(before, end).signature).not.toBe(passiveScrollDelta(before, middle).signature)
    expect(passiveScrollDelta(before, before).changed).toBe(false)
    expect(passiveScrollDelta(end, before).signature).not.toBe(passiveScrollDelta(before, end).signature)
    expect(() => passiveScrollDelta(snapshot([]), end)).toThrow('observed positions')
  })
  test('observed passive timing rows receive hover probes, never invented focus or click controls', () => {
    const id = 'hbar-app-ui-agent-plan-4'
    const row = control(0, { tag: 'tr', role: 'row', type: null, capabilities: ['hover'] })
    const probe = passiveTableRowHoverCase(id, row)
    expect(probe.id).toBe(`${id}:passive-row:0:hover`)
    expect(probe.action).toBe('hover')
    expect(probe.scenario).toBe('passive-table-row')
    expect(probe.control.capabilities).toEqual(['hover'])
    expect(() => passiveTableRowHoverCase(id, control(0))).toThrow('hover-only')
    expect(() => passiveTableRowHoverCase(id, { ...row, capabilities: ['hover', 'click'] })).toThrow('hover-only')
    expect(() => passiveTableRowHoverCase(id, { ...row, visible: false })).toThrow('visible row')
    expect(() => passiveTableRowHoverCase(id, { ...row, index: -1 })).toThrow('visible row')
    expect(auditSamplingPlan(id)?.samples).toHaveLength(2)
    expect(sampledInteractionIds(id, 'desktop', 'dark')).toEqual([probe.id])
    expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([probe.id])
    expect(sampledInteractionIds(id, 'mobile', 'dark')).toEqual([])
  })
  test('model spend passive div probes reject invented click or focus capabilities', () => {
    const id = 'hbar-app-ui-ai-usage-2'
    const row = control(0, { tag: 'div', role: null, type: null, capabilities: ['hover'] })
    expect(passiveModelRowHoverCase(id, row).id).toBe(`${id}:usage-model-row:0:hover`)
    expect(() => passiveModelRowHoverCase(id, control(0))).toThrow('passive div')
    expect(() => passiveModelRowHoverCase(id, { ...row, capabilities: ['hover', 'click'] })).toThrow('hover-only')
  })
  test('keeps the full 38-category and 300-variant matrix explicit', () => {
    expect(HBAR_APP_UI_CATEGORIES).toHaveLength(38)
    expect(HBAR_APP_UI_VARIANT_SPECS).toHaveLength(300)
    expect(new Set(HBAR_APP_UI_VARIANT_SPECS.map((spec) => spec.id)).size).toBe(300)
    expect(Object.values(HBAR_APP_UI_CATEGORY_COUNTS).reduce((total, count) => total + count, 0)).toBe(300)
  })

  test('defines eight static source/local combinations per variant', () => {
    expect(REACTBITS_PRO_VIEWPORTS).toHaveLength(4)
    expect(REACTBITS_PRO_THEMES).toEqual(['dark', 'light'])
    expect(REACTBITS_PRO_VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`)).toEqual([
      '1440x900',
      '1024x768',
      '390x844',
      '320x720',
    ])
    expect(REACTBITS_PRO_VIEWPORTS.length * REACTBITS_PRO_THEMES.length).toBe(8)
    expect(fullAuditMatrixSelected(REACTBITS_PRO_VIEWPORTS, REACTBITS_PRO_THEMES)).toBe(true)
    expect(fullAuditMatrixSelected([REACTBITS_PRO_VIEWPORTS[2]], ['dark'])).toBe(false)
  })

  test('keeps the live Stop and away-from-bottom Jump as separate log states', () => {
    const ids = agentLogDynamicCaseIds('hbar-app-ui-agent-activity-5')
    expect(ids).toHaveLength(10)
    expect(ids).toContain('hbar-app-ui-agent-activity-5:running:4:click')
    expect(ids).toContain('hbar-app-ui-agent-activity-5:away:4:press-space')
    expect(
      interactionCases(snapshot([control(4)]), 'hbar-app-ui-agent-activity-5', 'running').map((item) => item.id),
    ).toEqual(ids.filter((id) => id.includes(':running:')))
  })

  test('captures Cancel retry as a second-state control in every viewport and theme', () => {
    const ids = agentFailureDynamicCaseIds('hbar-app-ui-agent-activity-7')
    expect(ids).toHaveLength(5)
    expect(ids).toContain('hbar-app-ui-agent-activity-7:retry-queued:1:click')
    expect(
      interactionCases(
        snapshot([control(1, { name: 'Cancel retry' })]),
        'hbar-app-ui-agent-activity-7',
        'retry-queued',
      ).map((item) => item.id),
    ).toEqual([...ids])
  })

  test('bounds parallel action replay across multiple selected variants', () => {
    expect(interactionWorkersPerVariant(8, 1)).toBe(8)
    expect(interactionWorkersPerVariant(8, 2)).toBe(4)
    expect(interactionWorkersPerVariant(2, 3)).toBe(1)
  })

  test('requires both the Hide request control and decisions after disclosure', () => {
    const id = 'hbar-app-ui-agent-approval-1'
    const ids = inlineApprovalDynamicCaseIds(id)
    const expanded = snapshot([
      control(0, {
        name: 'Hide request',
        expanded: 'true',
        capabilities: ['hover', 'focus', 'click', 'press', 'expand'],
      }),
      control(1, { name: 'Reject' }),
      control(2, { name: 'Delete 12 projects' }),
      control(3, { name: 'Host request payload', tag: 'pre', type: null, capabilities: ['hover', 'focus', 'no-op'] }),
    ])
    expect(ids).toHaveLength(24)
    expect(inlineApprovalScenarioCases(expanded, id).map((item) => item.id)).toEqual([...ids])
    expect(ids).toContain(`${id}:inline-request-open:0:expand-escape`)
    expect(ids).toContain(`${id}:inline-request-open:2:press-space`)
    expect(ids).toContain(`${id}:inline-request-open:3:scroll-arrowright`)
    expect(() => inlineApprovalScenarioCases(snapshot([]), id)).toThrow('Missing focusable request payload')
  })

  test('makes the HTTP/1 browser transport an explicit opt-in', () => {
    expect(auditBrowserArguments(false)).toEqual(['--disable-lcd-text'])
    expect(auditBrowserArguments(true)).toEqual(['--disable-lcd-text', '--disable-http2', '--disable-quic'])
  })

  test('audits all three distinct decisions and the payload after Show diff', () => {
    const id = 'hbar-app-ui-agent-approval-2'
    const expanded = snapshot([
      control(0, { name: 'Hide diff', expanded: 'true', capabilities: ['hover', 'focus', 'click', 'press', 'expand'] }),
      control(1, { name: 'Reject' }),
      control(2, { name: 'Always allow' }),
      control(3, { name: 'Approve' }),
      control(4, { name: 'Host diff payload', tag: 'pre', type: null, capabilities: ['hover', 'focus', 'no-op'] }),
    ])
    const ids = diffApprovalDynamicCaseIds(id)
    expect(ids).toHaveLength(29)
    expect(diffApprovalScenarioCases(expanded, id).map((item) => item.id)).toEqual([...ids])
    expect(ids).toContain(`${id}:diff-request-open:0:expand-escape`)
    expect(ids).toContain(`${id}:diff-request-open:2:press-space`)
    expect(ids).toContain(`${id}:diff-request-open:3:click`)
    expect(ids).toContain(`${id}:diff-request-open:4:scroll-end`)
    expect(() => diffApprovalScenarioCases(snapshot([]), id)).toThrow('Missing focusable diff payload')
  })

  test('keeps the exhaustive queue inventory available for explicit diagnostics, not the default gate', () => {
    const id = 'hbar-app-ui-agent-approval-3'
    const ids = queueApprovalDynamicCaseIds(id)
    expect(ids).toHaveLength(270)
    expect(new Set(ids).size).toBe(270)
    const collected: string[] = []
    for (const plan of queueApprovalScenarioPlans) {
      const controls = [
        control(0, {
          name: plan.expanded ? 'Hide request' : 'Show request',
          expanded: String(plan.expanded),
          capabilities: ['hover', 'focus', 'click', 'press', 'expand'],
        }),
        control(1, { name: 'Reject' }),
        control(2, { name: 'Approve' }),
      ]
      if (plan.expanded)
        controls.push(
          control(3, {
            tag: 'pre',
            type: null,
            name: 'Host request payload',
            capabilities: ['hover', 'focus', 'no-op'],
          }),
        )
      const cases = queueApprovalScenarioCases(snapshot(controls), id, plan)
      expect(cases).toHaveLength(plan.expanded ? 24 : 17)
      collected.push(...cases.map((item) => item.id))
      for (const index of [1, 2])
        expect(cases.some((item) => item.control.index === index && item.action === 'click')).toBe(true)
      expect(() => queueApprovalScenarioCases(snapshot(controls.slice(1)), id, plan)).toThrow(
        'Unexpected live queue controls',
      )
      expect(() =>
        queueApprovalScenarioCases(
          snapshot([
            control(0, { name: plan.expanded ? 'Hide request' : 'Show request', expanded: String(!plan.expanded) }),
            ...controls.slice(1),
          ]),
          id,
          plan,
        ),
      ).toThrow('Queue disclosure state')
    }
    expect(collected).toEqual([...ids])
    const terminalPrefixes = queueApprovalScenarioPlans.filter((plan) => plan.decisions.length === 2 && !plan.expanded)
    expect(terminalPrefixes.map((plan) => plan.decisions.join('/'))).toEqual([
      'Approve/Approve',
      'Approve/Reject',
      'Reject/Approve',
      'Reject/Reject',
    ])
    // Each of four prefixes has both final decisions: all eight terminal rows
    // are captured by real action-after screenshots, not a fabricated empty DOM.
    expect(terminalPrefixes.length * 2).toBe(8)
    expect((17 + ids.length) * REACTBITS_PRO_VIEWPORTS.length * REACTBITS_PRO_THEMES.length).toBe(2296)
    const firstOpen = queueApprovalScenarioPlans[0]
    expect(() =>
      queueApprovalScenarioCases(
        snapshot([
          control(0, { name: 'Hide request', expanded: 'true' }),
          control(1, { name: 'Reject' }),
          control(2, { name: 'Approve' }),
          control(3, { tag: 'div' }),
        ]),
        id,
        firstOpen,
      ),
    ).toThrow('Missing focusable queue payload')
  })

  test('scopes queue code to its dependencies while retaining global styles and registries', async () => {
    const dependencies = await lumenDependencyFiles(['agent-approval.tsx', 'LumenProvider.tsx'])
    for (const file of [
      'agent-approval.tsx',
      'LumenSurface.tsx',
      'primitives.tsx',
      'LumenProvider.tsx',
      'theme.ts',
      'forms.tsx',
    ]) {
      expect(includesLumenAuditFile(file, dependencies)).toBe(true)
    }
    expect(includesLumenAuditFile('agent-activity.tsx', dependencies)).toBe(false)
    expect(includesLumenAuditFile('agent-activity.css', dependencies)).toBe(true)
    expect(includesLumenAuditFile('styles.css', dependencies)).toBe(true)
    expect(includesLumenAuditFile('index.ts', dependencies)).toBe(true)
    expect(includesLumenAuditFile('source-catalog.json', dependencies)).toBe(true)
    expect(includesLumenAuditFile('agent-activity.tsx', undefined)).toBe(true)
    await expect(lumenDependencyFiles(['../package.json'])).rejects.toThrow('escapes its source boundary')
  })

  test('samples distinct queue changes and labels inferred equivalent cases honestly', () => {
    const id = 'hbar-app-ui-agent-approval-3'
    const plan = auditSamplingPlan(id)
    expect(plan?.samples).toHaveLength(11)
    expect(renderAuditEvidencePage([], 'representative-states')).toContain('inferred, not replayed')
    expect(sampledInteractionIds(id, 'desktop', 'dark')).toHaveLength(7)
    expect(sampledInteractionIds(id, 'stress', 'light')).toHaveLength(4)
    expect(sampledInteractionIds(id, 'tablet', 'dark')).toEqual([])
    expect(sampledInteractionIds(id, 'mobile', 'light')).toEqual([])
    expect(
      plan?.inferences.every((entry) => entry.verification === 'inferred-not-replayed' && entry.basis.length > 30),
    ).toBe(true)
    const all = REACTBITS_PRO_VIEWPORTS.flatMap((viewport) =>
      REACTBITS_PRO_THEMES.flatMap((theme) =>
        sampledInteractionIds(id, viewport.id, theme).map((caseId) => `${theme}/${viewport.id}/${caseId}`),
      ),
    )
    expect(new Set(all).size).toBe(11)
    expect(all).toContain(`light/stress/${id}:queue-ar-open:2:click`)
    const captured = all.map((value) => {
      const [theme, viewport, caseId] = value.split('/')
      return { theme: theme ?? '', viewport: viewport ?? '', id: caseId ?? '' }
    })
    expect(assessInteractionCoverage(all, captured).missing).toEqual([])
    expect(assessInteractionCoverage(all, captured.slice(1)).missing).toHaveLength(1)
    expect(() => sampledInteractionIds('unreviewed-variant', 'desktop', 'dark')).toThrow(
      'Missing reviewed interaction sampling plan',
    )
  })

  test('samples permission behavior groups without multiplying scope combinations by gestures', () => {
    const id = 'hbar-app-ui-agent-approval-4'
    const plan = auditSamplingPlan(id)
    expect(plan?.samples).toHaveLength(10)
    expect(sampledInteractionIds(id, 'desktop', 'dark')).toHaveLength(5)
    expect(sampledInteractionIds(id, 'stress', 'light')).toHaveLength(5)
    expect(sampledInteractionIds(id, 'mobile', 'dark')).toEqual([])
    expect(plan?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
    const controls = [
      ...[0, 1, 2].map((index) =>
        control(index, { tag: 'input', type: 'checkbox', capabilities: ['toggle', 'focus'] }),
      ),
      control(3, { name: 'Hide request', expanded: 'true' }),
      control(4, { name: 'Reject' }),
      control(5, { name: 'Approve' }),
      control(6, { tag: 'pre', capabilities: ['focus', 'no-op'] }),
    ]
    expect(permissionApprovalScenarioCases(snapshot(controls), id, 'permission-open').map((item) => item.id)).toContain(
      `${id}:permission-open:6:scroll-arrowright`,
    )
    expect(() => permissionApprovalScenarioCases(snapshot(controls.slice(0, 6)), id, 'permission-open')).toThrow(
      'Missing focusable permission request payload',
    )
    expect(
      permissionApprovalScenarioCases(snapshot(controls.slice(0, 6)), id, 'permission-empty').some(
        (item) => item.key === 'ArrowRight',
      ),
    ).toBe(false)
  })

  test('treats checked-state changes as real feedback even when text and control count stay unchanged', () => {
    expect(checkableStates('- checkbox "Read" [checked]\n- checkbox "Export"\n- button "Approve"')).toEqual([
      'checkbox:checked',
      'checkbox:unchecked',
    ])
    expect(checkableStates('- checkbox "All" [mixed]\n- switch "Enabled" [checked]\n- radio "Choice"')).toEqual([
      'checkbox:mixed',
      'switch:checked',
      'radio:unchecked',
    ])
    expect(checkableStates('- button "Text with [checked]"')).toEqual([])
  })

  test('history samples data-changing groups and recovery without clicking passive rows', () => {
    const id = 'hbar-app-ui-agent-approval-6'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(7)
    expect(sampledInteractionIds(id, 'desktop', 'dark')).toHaveLength(5)
    expect(sampledInteractionIds(id, 'stress', 'light')).toHaveLength(2)
    expect(sampledInteractionIds(id, 'tablet', 'light')).toEqual([])
    expect(auditSamplingPlan(id)?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(
      true,
    )
    expect(sampledInteractionIds(id, 'stress', 'light')).toContain(`${id}:history-empty:6:click`)
  })

  test('checklist samples independent run and disclosure changes rather than every step', () => {
    const id = 'hbar-app-ui-agent-plan-1'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(6)
    expect(sampledInteractionIds(id, 'desktop', 'dark')).toHaveLength(4)
    expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([
      `${id}:4:press-enter`,
      `${id}:plan-paused:0:press-space`,
    ])
    expect(sampledInteractionIds(id, 'tablet', 'light')).toEqual([])
    expect(auditSamplingPlan(id)?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(
      true,
    )
  })

  test('plan review samples mechanisms and discovers input Enter only in the real draft scenario', () => {
    const id = 'hbar-app-ui-agent-plan-2'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(9)
    expect(sampledInteractionIds(id, 'desktop', 'dark')).toHaveLength(7)
    expect(sampledInteractionIds(id, 'stress', 'light')).toEqual([
      `${id}:plan-draft:27:press-enter`,
      `${id}:plan-running:29:press-space`,
    ])
    expect(auditSamplingPlan(id)?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(
      true,
    )
    const draft = snapshot([
      control(27, { tag: 'input', name: 'Add a step', capabilities: ['fill', 'focus'] }),
      control(28, { name: 'Add' }),
    ])
    expect(
      planReviewScenarioCases(draft, id, 'plan-draft').some((item) => item.id === `${id}:plan-draft:27:press-enter`),
    ).toBe(true)
    expect(() => planReviewScenarioCases(snapshot([]), id, 'plan-draft')).toThrow('Missing live plan draft input')
  })

  test('cost approval samples distinct outcomes and wrapping instead of passive metrics', () => {
    const id = 'hbar-app-ui-agent-approval-5'
    expect(auditSamplingPlan(id)?.samples).toHaveLength(7)
    expect(sampledInteractionIds(id, 'desktop', 'dark')).toHaveLength(4)
    expect(sampledInteractionIds(id, 'stress', 'light')).toHaveLength(3)
    expect(sampledInteractionIds(id, 'tablet', 'light')).toEqual([])
    expect(auditSamplingPlan(id)?.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(
      true,
    )
    const expanded = snapshot([
      control(0, { name: 'Hide request', expanded: 'true' }),
      control(1, { name: 'Reject' }),
      control(2, { name: 'Approve' }),
      control(3, { tag: 'pre', capabilities: ['focus', 'no-op'] }),
    ])
    const ids = interactionCases(expanded, id, 'cost-request-open').map((item) => item.id)
    expect(ids).toContain(`${id}:cost-request-open:2:press-space`)
    expect(ids).toContain(`${id}:cost-request-open:1:press-enter`)
  })

  test('renders separate source/local before/after evidence without hiding missing images', () => {
    const page = renderAuditEvidencePage([
      {
        label: '<script>untrusted label</script>',
        status: 'matched',
        images: ['source-before.png', 'local-before.png', 'source-after.png', 'local-after.png'].map((path) => ({
          label: path,
          path,
        })),
      },
      { label: 'incomplete', status: 'missing', images: [{ label: 'Missing local after', path: null }] },
    ])
    expect(page.match(/<details>/g)).toHaveLength(2)
    expect(page.match(/<img /g)).toHaveLength(4)
    expect(page).toContain('&lt;script&gt;untrusted label&lt;/script&gt;')
    expect(page).not.toContain('<script>')
    expect(page).toContain('Missing capture')
    expect(page).toContain('does not replace the review ledger or manual sign-off')
  })

  test('discovers actionable roles without treating passive landmarks and meters as controls', () => {
    expect(interactiveControlSelector).toContain('[role="radio"]')
    expect(interactiveControlSelector).toContain('[role="button"]')
    expect(interactiveControlSelector).toContain('[aria-expanded]')
    expect(interactiveControlSelector.split(',')).not.toContain('[role]')
    expect(interactiveControlSelector).not.toContain('[role="progressbar"]')
    expect(interactiveControlSelector).not.toContain('[role="status"]')
  })

  test('audits every visible control even when controls share the same shape', () => {
    const cases = interactionCases(snapshot([control(0), control(1), control(2, { visible: false })]), 'card-1')
    expect(cases.map((item) => item.id)).toEqual([
      'card-1:0:hover',
      'card-1:0:focus',
      'card-1:0:click',
      'card-1:0:press-enter',
      'card-1:0:press-space',
      'card-1:1:hover',
      'card-1:1:focus',
      'card-1:1:click',
      'card-1:1:press-enter',
      'card-1:1:press-space',
    ])
  })

  test('gates semantic hierarchy independently of localized copy and control count', () => {
    const source =
      '- table "Run history":\n  - rowgroup:\n    - row "Invoice":\n      - cell "Invoice":\n        - button "Re-run Invoice"'
    const translated =
      '- table "Verlauf":\n  - rowgroup:\n    - row "Rechnung":\n      - cell "Rechnung":\n        - button "Erneut ausführen"'
    expect(semanticRoleTree(source)).toEqual(['0:table', '1:rowgroup', '2:row', '3:cell', '4:button'])
    expect(semanticRoleTreeMatches(source, translated)).toBe(true)
    expect(semanticRoleTreeMatches(source, `- main:\n  ${translated.replaceAll('\n', '\n  ')}`)).toBe(false)
    expect(semanticRoleTreeMatches(source, translated.replace('cell', 'listitem'))).toBe(false)
    expect(semanticRoleTreeMatches('', '')).toBe(false)
  })

  test('attributes the live timeline clock to the source instead of a hover or Stop', () => {
    const running = snapshot([control(0, { name: 'Stop' })])
    const stopped = snapshot([control(0, { name: 'Stop', disabled: true })])
    const before = {
      ...running,
      axSnapshot:
        '- banner:\n  - text: Running 9.9s\n  - button "Stop"\n- list:\n  - listitem: Reconciling flagged entries 9.9s',
    }
    const rollover = {
      ...running,
      axSnapshot:
        '- banner:\n  - text: Running 10.0s\n  - button "Stop"\n- list:\n  - listitem: Reconciling flagged entries 10.0s',
    }
    const after = {
      ...stopped,
      axSnapshot:
        '- banner:\n  - text: Stopped 10.0s\n  - button "Stop" [disabled]\n- list:\n  - listitem: Reconciling flagged entries Stopped',
    }
    expect(liveActivityDelta(before, rollover)?.changed).toBe(false)
    expect(liveActivityDelta(before, after)?.changed).toBe(true)
    expect(liveActivityDelta(before, after)?.signature).toBe(liveActivityDelta(rollover, after)?.signature)
  })

  test('uses the same visible-only control set for structure and interaction gates', () => {
    const source = snapshot([control(0, { visible: false }), control(1)])
    const local = snapshot([control(0, { visible: false }), control(1, { visible: false }), control(2)])
    expect(visibleControls(source).map((item) => item.index)).toEqual([1])
    expect(visibleControls(local).map((item) => item.index)).toEqual([2])
    expect(visibleControls(source)).toHaveLength(visibleControls(local).length)
    expect(interactionCases(source, 'card-1')).toHaveLength(5)
  })

  test('allows a development-only exact case filter without inventing interactions', () => {
    const cases = interactionCases(snapshot([control(0), control(1)]), 'card-1')
    expect(selectInteractionCases(cases, ['card-1:1:click']).map((item) => item.id)).toEqual(['card-1:1:click'])
    expect(selectInteractionCases(cases, [])).toBe(cases)
    expect(selectInteractionCases(cases, ['card-1:9:click'])).toEqual([])
  })

  test('retains download, upload, no-op, and applicable keyboard feedback cases', () => {
    const cases = interactionCases(
      snapshot([
        control(0, { capabilities: ['download'] }),
        control(1, { tag: 'input', type: 'file', capabilities: ['upload'] }),
        control(2, { tag: 'div', type: null, capabilities: ['no-op'] }),
        control(3, { role: 'tab', capabilities: ['tab', 'expand'] }),
      ]),
      'workflow-1',
    )
    expect(cases.map((item) => item.id)).toEqual([
      'workflow-1:0:download',
      'workflow-1:1:upload',
      'workflow-1:2:no-op',
      'workflow-1:3:tab-arrowright',
      'workflow-1:3:tab-arrowleft',
      'workflow-1:3:tab-home',
      'workflow-1:3:tab-end',
      'workflow-1:3:expand',
      'workflow-1:3:expand-escape',
    ])
  })

  test('detects missing, duplicate, and invented interaction evidence', () => {
    const expected = ['dark/desktop/card-1:0:click', 'light/mobile/card-1:0:click']
    expect(
      assessInteractionCoverage(expected, [
        { id: 'card-1:0:click', variantId: 'card-1', theme: 'dark', viewport: 'desktop', status: 'matched' },
        { id: 'card-1:0:click', variantId: 'card-1', theme: 'dark', viewport: 'desktop', status: 'matched' },
        { id: 'card-1:9:click', variantId: 'card-1', theme: 'dark', viewport: 'desktop', status: 'matched' },
      ]),
    ).toEqual({
      missing: ['light/mobile/card-1:0:click'],
      duplicate: ['dark/desktop/card-1:0:click'],
      unexpected: ['dark/desktop/card-1:9:click'],
    })
  })

  test('does not mistake a mobile width mismatch for a theme-token difference', () => {
    expect(rootGeometryMatches({ width: 400, height: 474 }, { width: 400, height: 471 })).toBe(true)
    expect(rootGeometryMatches({ width: 292, height: 474 }, { width: 366, height: 471 })).toBe(false)
    expect(rootGeometryMatches({ width: 1086, height: 480 }, { width: 1070, height: 329 })).toBe(false)
    expect(rootGeometryMatches({ width: 0, height: 474 }, { width: 0, height: 474 })).toBe(false)
  })

  test('aligns the local stage to the real iframe content box without double padding', () => {
    expect(
      alignedCanvasPadding({ top: 32, right: 32, bottom: 32, left: 32 }, { top: 12, right: 12, bottom: 12, left: 12 }),
    ).toEqual({ top: 20, right: 20, bottom: 20, left: 20 })
    expect(
      alignedCanvasPadding({ top: 24, right: 24, bottom: 24, left: 24 }, { top: 0, right: 0, bottom: 0, left: 0 }),
    ).toEqual({ top: 24, right: 24, bottom: 24, left: 24 })
    expect(
      alignedCanvasPadding(
        { top: 24, right: 24, bottom: 24, left: 24 },
        { top: 0, right: 24, bottom: 0, left: 24 },
        true,
      ),
    ).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  test('resumes only a matching case with complete paired before/after captures', () => {
    const capture = {
      id: 'card-11:0:click',
      status: 'captured' as const,
      directory: 'capture',
      before: 'before.png',
      after: 'after.png',
      beforeSnapshot: 'before.json',
      afterSnapshot: 'after.json',
    }
    const result = {
      variantId: 'card-11',
      id: capture.id,
      theme: 'dark' as const,
      viewport: 'mobile',
      action: 'click' as const,
      caseHash: 'source-and-control-hash',
      source: capture,
      local: capture,
      status: 'matched',
    }
    const expected = {
      variantId: result.variantId,
      id: result.id,
      theme: result.theme,
      viewport: result.viewport,
      caseHash: result.caseHash,
    }
    expect(interactionCheckpointMatches(result, expected)).toBe(true)
    expect(interactionCheckpointMatches(result, { ...expected, caseHash: 'changed-source' })).toBe(false)
    expect(interactionCheckpointMatches({ ...result, local: { ...capture, after: null } }, expected)).toBe(false)
    expect(interactionCheckpointMatches({ ...result, source: { ...capture, status: 'error' } }, expected)).toBe(false)
    expect(interactionCheckpointMatches({ ...result, status: 'lumen-different' }, expected)).toBe(false)
  })

  test('gates visual interaction feedback even when DOM state is unchanged', () => {
    expect(interactionFeedbackMatches(0.06, 0.07)).toBe(true)
    expect(interactionFeedbackMatches(0, 0)).toBe(true)
    expect(interactionFeedbackMatches(0.06, 0)).toBe(false)
    expect(interactionFeedbackMatches(0.32, 0.07)).toBe(false)
    expect(interactionFeedbackMatches(Number.NaN, 0)).toBe(false)
  })

  test('requires a current explicit visual sign-off after the complete machine audit', () => {
    const review = {
      fingerprint: 'paired-static-and-interaction-hash',
      reviewedAt: '2026-09-23T00:00:00.000Z',
      note: 'Compared all eight source/local viewports and interaction feedback.',
      staticCombinations: 8,
      interactionCases: 560,
    }
    expect(manualReviewGate([], review.fingerprint, undefined, 8, 560)).toEqual({
      status: 'needs-review',
      manualReview: false,
      reason: 'manual-review-required',
    })
    expect(manualReviewGate([], review.fingerprint, review, 8, 560)).toEqual({
      status: 'passed',
      manualReview: true,
    })
    expect(manualReviewGate([], 'changed-source-or-local-screenshot', review, 8, 560).reason).toBe(
      'manual-review-stale',
    )
    expect(manualReviewGate([], review.fingerprint, review, 8, 561).status).toBe('needs-review')
    expect(manualReviewGate([], review.fingerprint, { ...review, note: '' }, 8, 560).status).toBe('needs-review')
    expect(manualReviewGate(['visual-feedback-mismatch'], review.fingerprint, review, 8, 560).status).toBe('needs-fix')
  })

  test('separates automatic deployment progress from Stop and rerun feedback', () => {
    const steps = (states: readonly string[]) =>
      states.map((state, index) => `  - listitem: Step ${index} ${state}`).join('\n')
    const running = snapshot([control(0, { name: 'Stop' })])
    const queued = (count: number) => Array.from({ length: count }, () => 'Queued')
    const first = { ...running, axSnapshot: steps(['Running', ...queued(6)]) }
    const later = { ...running, axSnapshot: steps(['Done', 'Running', ...queued(5)]) }
    const stopped = {
      ...later,
      controls: [control(0, { name: 'Run again' })],
      axSnapshot: steps(['Done', 'Stopped', ...queued(5)]),
    }
    const localStopped = {
      ...first,
      controls: [control(0, { name: 'Run again' })],
      axSnapshot: steps(['Stopped', ...queued(6)]),
    }
    expect(timedActivityDelta(first, later, 'hover')?.changed).toBe(false)
    expect(timedActivityDelta(later, stopped, 'click')?.signature).toBe(
      timedActivityDelta(first, localStopped, 'click')?.signature,
    )
    expect(timedActivityDelta(first, stopped, 'click')?.signature).toBe(
      timedActivityDelta(first, localStopped, 'click')?.signature,
    )
    expect(timedActivityDelta(first, { ...first, axSnapshot: '' }, 'hover')).toBeNull()
  })
})
