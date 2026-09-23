import { describe, expect, test } from 'bun:test'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/specs'
import { HBAR_APP_UI_CATEGORIES, HBAR_APP_UI_CATEGORY_COUNTS } from '../packages/hbar-app-ui/src/types'
import {
  REACTBITS_PRO_THEMES,
  REACTBITS_PRO_VIEWPORTS,
  assessInteractionCoverage,
  alignedCanvasPadding,
  fullAuditMatrixSelected,
  interactionCases,
  interactionCheckpointMatches,
  interactionFeedbackMatches,
  liveActivityDelta,
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
    const source = '- table "Run history":\n  - rowgroup:\n    - row "Invoice":\n      - cell "Invoice":\n        - button "Re-run Invoice"'
    const translated = '- table "Verlauf":\n  - rowgroup:\n    - row "Rechnung":\n      - cell "Rechnung":\n        - button "Erneut ausführen"'
    expect(semanticRoleTree(source)).toEqual(['0:table', '1:rowgroup', '2:row', '3:cell', '4:button'])
    expect(semanticRoleTreeMatches(source, translated)).toBe(true)
    expect(semanticRoleTreeMatches(source, `- main:\n  ${translated.replaceAll('\n', '\n  ')}`)).toBe(false)
    expect(semanticRoleTreeMatches(source, translated.replace('cell', 'listitem'))).toBe(false)
    expect(semanticRoleTreeMatches('', '')).toBe(false)
  })

  test('attributes the live timeline clock to the source instead of a hover or Stop', () => {
    const running = snapshot([control(0, { name: 'Stop' })])
    const stopped = snapshot([control(0, { name: 'Stop', disabled: true })])
    const before = { ...running, axSnapshot: '- banner:\n  - text: Running 9.9s\n  - button "Stop"\n- list:\n  - listitem: Reconciling flagged entries 9.9s' }
    const rollover = { ...running, axSnapshot: '- banner:\n  - text: Running 10.0s\n  - button "Stop"\n- list:\n  - listitem: Reconciling flagged entries 10.0s' }
    const after = { ...stopped, axSnapshot: '- banner:\n  - text: Stopped 10.0s\n  - button "Stop" [disabled]\n- list:\n  - listitem: Reconciling flagged entries Stopped' }
    expect(liveActivityDelta(before, rollover)?.changed).toBe(false)
    expect(liveActivityDelta(before, after)?.changed).toBe(true)
    expect(liveActivityDelta(before, after)?.signature).toBe(
      liveActivityDelta(rollover, after)?.signature,
    )
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
    expect(rootGeometryMatches({ width: 0, height: 474 }, { width: 0, height: 474 })).toBe(false)
  })

  test('aligns the local stage to the real iframe content box without double padding', () => {
    expect(
      alignedCanvasPadding({ top: 32, right: 32, bottom: 32, left: 32 }, { top: 12, right: 12, bottom: 12, left: 12 }),
    ).toEqual({ top: 20, right: 20, bottom: 20, left: 20 })
    expect(
      alignedCanvasPadding({ top: 24, right: 24, bottom: 24, left: 24 }, { top: 0, right: 0, bottom: 0, left: 0 }),
    ).toEqual({ top: 24, right: 24, bottom: 24, left: 24 })
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
  })

  test('gates visual interaction feedback even when DOM state is unchanged', () => {
    expect(interactionFeedbackMatches(0.06, 0.07)).toBe(true)
    expect(interactionFeedbackMatches(0, 0)).toBe(true)
    expect(interactionFeedbackMatches(0.06, 0)).toBe(false)
    expect(interactionFeedbackMatches(0.32, 0.07)).toBe(false)
    expect(interactionFeedbackMatches(Number.NaN, 0)).toBe(false)
  })

  test('separates automatic deployment progress from Stop and rerun feedback', () => {
    const steps = (states: readonly string[]) => states.map((state, index) => `  - listitem: Step ${index} ${state}`).join('\n')
    const running = snapshot([control(0, {name: 'Stop'})])
    const queued = (count: number) => Array.from({length: count}, () => 'Queued')
    const first = {...running, axSnapshot: steps(['Running', ...queued(6)])}
    const later = {...running, axSnapshot: steps(['Done', 'Running', ...queued(5)])}
    const stopped = {...later, controls: [control(0, {name: 'Run again'})], axSnapshot: steps(['Done', 'Stopped', ...queued(5)])}
    const localStopped = {...first, controls: [control(0, {name: 'Run again'})], axSnapshot: steps(['Stopped', ...queued(6)])}
    expect(timedActivityDelta(first, later, 'hover')?.changed).toBe(false)
    expect(timedActivityDelta(later, stopped, 'click')?.signature).toBe(timedActivityDelta(first, localStopped, 'click')?.signature)
    expect(timedActivityDelta(first, {...first, axSnapshot: ''}, 'hover')).toBeNull()
  })
})
