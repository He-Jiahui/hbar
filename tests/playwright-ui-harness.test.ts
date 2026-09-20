import { describe, expect, test } from 'bun:test'
import { UiInteractionCoverage } from '../e2e/support/ui-interaction-coverage.ts'

describe('production UI evidence report', () => {
  test('reports platform-specific totals and stable uncovered ids', () => {
    const web = new UiInteractionCoverage('web').report('2026-09-20T00:00:00.000Z')
    const tauri = new UiInteractionCoverage('tauri').report('2026-09-20T00:00:00.000Z')

    expect(web.applicable).toBeGreaterThan(80)
    expect(tauri.applicable).toBeGreaterThan(web.applicable)
    expect(web.uncovered).not.toContain('desktop.window.resize')
    expect(tauri.uncovered).toContain('desktop.window.resize')
    expect(web.uncovered).toEqual(new UiInteractionCoverage('web').report('later').uncovered)
  })
})
