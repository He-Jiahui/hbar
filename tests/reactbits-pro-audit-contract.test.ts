import { describe, expect, test } from 'bun:test'
import type {
  HbarAppUiAuditManifest,
  HbarAppUiInteractionCapture,
  HbarAppUiInteractionRecord,
  HbarAppUiInteractionResult,
} from '../packages/hbar-app-ui/src/index'
import {
  interactionCheckpointMatches,
  manualReviewGate,
  semanticInteractionDelta,
  type SemanticSnapshot,
} from '../scripts/reactbits-pro-audit'

const before: SemanticSnapshot = {
  rootTag: 'form',
  rootRect: { width: 320, height: 420 },
  bodyTextLength: 4,
  textLineCount: 1,
  truncatedTextCount: 0,
  horizontalOverflow: false,
  axSnapshot: '- checkbox "Consent"',
  tree: [],
  controls: [],
}
const after: SemanticSnapshot = { ...before, axSnapshot: '- checkbox "Consent" [checked]' }
const capture: HbarAppUiInteractionCapture = {
  id: 'consent:toggle',
  status: 'captured',
  directory: 'interactions/consent',
  before: 'before.png',
  after: 'after.png',
  beforeSnapshot: 'before.json',
  afterSnapshot: 'after.json',
}

describe('public audit report contracts', () => {
  test('represents typed DOM/AX states without losing the normalized consumer API', () => {
    const result: HbarAppUiInteractionResult<SemanticSnapshot> = {
      id: capture.id,
      variantId: 'hbar-app-ui-forms-12',
      capability: 'toggle',
      status: 'matched',
      before,
      after,
    }
    const delta = semanticInteractionDelta(result.before, result.after)
    expect(delta.changed).toBe(true)
    expect(result.before.axSnapshot).not.toBe(result.after.axSnapshot)
    expect(JSON.stringify(result)).toContain('[checked]')
  })

  test('keeps paired image/snapshot paths and visible feedback in the detailed runner record', () => {
    const delta = semanticInteractionDelta(before, after)
    const result = {
      id: capture.id,
      variantId: 'hbar-app-ui-forms-12',
      action: 'toggle',
      capability: 'toggle',
      viewport: 'stress',
      theme: 'light' as const,
      caseHash: 'captured-source-and-control',
      control: { tag: 'input', type: 'checkbox', stablePath: 'input#consent' },
      source: capture,
      local: { ...capture, directory: 'interactions/consent/local' },
      status: 'matched',
      feedback: {
        sourceChanged: delta.changed,
        localChanged: delta.changed,
        deltaMatched: true,
        sourceDelta: delta,
        localDelta: delta,
      },
    } satisfies HbarAppUiInteractionRecord
    const serialized = JSON.stringify(result)
    expect(serialized).toContain('before.json')
    expect(serialized).toContain('after.png')
    expect(result.feedback.deltaMatched).toBe(true)
    const expected = {
      variantId: result.variantId,
      id: result.id,
      theme: result.theme,
      viewport: result.viewport,
      caseHash: result.caseHash,
    }
    expect(interactionCheckpointMatches(result, expected)).toBe(true)
    expect(interactionCheckpointMatches({ ...result, local: { ...capture, afterSnapshot: null } }, expected)).toBe(
      false,
    )
    expect(interactionCheckpointMatches({ ...result, status: 'lumen-different' }, expected)).toBe(false)
  })

  test('accepts real structured manifest failures and does not promote them to a signed pass', () => {
    const manifest: HbarAppUiAuditManifest = {
      schemaVersion: 1,
      runId: 'contract-test',
      reference: {
        url: 'https://reference.invalid/app-ui',
        generatedAt: '2026-10-02T00:00:00Z',
        sourceDirectoryHash: 'catalog',
      },
      categories: ['forms'],
      variants: [],
      selected: ['hbar-app-ui-forms-12'],
      viewports: [{ id: 'stress', width: 320, height: 720 }],
      themes: ['light'],
      staticCombinations: 1,
      interactionCases: 1,
      errors: [{ id: 'hbar-app-ui-forms-12', theme: 'light', viewport: 'stress', reason: 'source-content-clipped' }],
    }
    expect(JSON.stringify(manifest.errors)).toContain('source-content-clipped')
    const reasons = manifest.errors.map((issue) => (typeof issue === 'string' ? issue : issue.reason))
    expect(manualReviewGate(reasons, 'current', undefined, 1, 1).status).toBe('needs-fix')
    expect(manualReviewGate([], 'current', undefined, 1, 1).status).toBe('needs-review')
    const legacy: HbarAppUiAuditManifest = { ...manifest, errors: ['missing-pair'] }
    expect(legacy.errors).toEqual(['missing-pair'])
  })
})
