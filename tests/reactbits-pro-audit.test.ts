import { describe, expect, test } from 'bun:test'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/specs'
import { HBAR_APP_UI_CATEGORIES, HBAR_APP_UI_CATEGORY_COUNTS } from '../packages/hbar-app-ui/src/types'
import { renderAuditEvidencePage } from '../scripts/reactbits-audit-evidence-page'
import { auditSamplingPlan, sampledInteractionIds } from '../scripts/reactbits-audit-sampling'

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
  permissionApprovalScenarioCases,
  planReviewScenarioCases,
  passiveTableRowHoverCase,
  passiveModelRowHoverCase,
  usageMemberScenarioCases,
  usageBudgetSliderCases,
  usageBudgetInteractionCases,
  planBoardScrollCase,
  passiveScrollDelta,
  checkableStates,
  interactionCases,
  interactionCheckpointMatches,
  interactionFeedbackMatches,
  interactionWorkersPerVariant,
  interactiveControlSelector,
  liveActivityDelta,
  manualReviewGate,
  rootGeometryMatches,
  selectInteractionCases,
  semanticRoleTree,
  semanticRoleTreeMatches,
  timedActivityDelta,
  visibleControls,
  type ControlSnapshot,
  type SemanticSnapshot,
} from '../scripts/reactbits-pro-audit'

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
    expect(auditBrowserArguments(false)).toEqual([])
    expect(auditBrowserArguments(true)).toEqual(['--disable-http2', '--disable-quic'])
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
