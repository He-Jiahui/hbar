import { describe, expect, test } from 'bun:test'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/specs'
import { HBAR_APP_UI_CATEGORIES, HBAR_APP_UI_CATEGORY_COUNTS } from '../packages/hbar-app-ui/src/types'
import {
  REACTBITS_PRO_THEMES,
  REACTBITS_PRO_VIEWPORTS,
  assessInteractionCoverage,
  alignedCanvasPadding,
  interactionCases,
  rootGeometryMatches,
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
})
