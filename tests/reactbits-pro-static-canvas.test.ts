import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { AuditContentGeometry } from '../scripts/reactbits-audit-content-geometry'
import { assessStaticContentGeometry, manualReviewGate, rootGeometryMatches } from '../scripts/reactbits-pro-audit'

const canvas = { width: 286, height: 640, padding: { top: 0, right: 0, bottom: 0, left: 0 } }
const reachable: AuditContentGeometry = {
  viewport: { width: 286, height: 640 },
  extent: { width: 286, height: 692 },
  clippedRegions: [],
  scrollOwners: [
    {
      path: '$viewport',
      tag: 'viewport',
      axes: ['y'],
      client: { width: 286, height: 640 },
      scroll: { width: 286, height: 692 },
      maxScroll: { x: 0, y: 52 },
    },
  ],
}
const clipped: AuditContentGeometry = {
  ...reachable,
  scrollOwners: [],
  clippedRegions: [
    {
      region: { path: '$root > footer', tag: 'footer', role: null, kind: 'semantic-region' },
      owner: {
        path: '$root > div',
        tag: 'div',
        overflowX: 'hidden',
        overflowY: 'hidden',
        client: { width: 286, height: 640 },
        scroll: { width: 286, height: 692 },
      },
      axes: ['y'],
      amount: { top: 0, right: 0, bottom: 52, left: 0 },
      unreachable: true,
    },
  ],
}

describe('independent static viewport and content gates', () => {
  test('keeps the intrinsic root-height gate even when complete content extents match', () => {
    const result = assessStaticContentGeometry(reachable, reachable, canvas, canvas, true)
    expect(result.failures).toEqual([])
    expect(result.extentMatched).toBe(true)
    expect(rootGeometryMatches({ width: 286, height: 640 }, { width: 286, height: 692 })).toBe(false)
  })

  test('identical viewport PNGs and a signed review cannot waive an unreachable source footer', () => {
    const result = assessStaticContentGeometry(clipped, reachable, canvas, canvas, true)
    expect(result.viewportMatched).toBe(true)
    expect(result.extentMatched).toBe(true)
    expect(result.failures).toEqual(['source-content-clipped'])
    const gate = manualReviewGate(
      result.failures,
      'identical-viewport-pngs',
      {
        fingerprint: 'identical-viewport-pngs',
        reviewedAt: '2026-09-29T23:00:00.000Z',
        note: 'Synthetic sign-off must not override source content clipping.',
        staticCombinations: 8,
        interactionCases: 5,
      },
      8,
      5,
    )
    expect(gate).toEqual({ status: 'needs-fix', manualReview: false })
    expect(assessStaticContentGeometry(reachable, clipped, canvas, canvas, true).failures).toEqual([
      'local-content-clipped',
    ])
  })

  test('rejects mismatched content extent and exact viewport size independently', () => {
    expect(
      assessStaticContentGeometry(
        reachable,
        {
          ...reachable,
          extent: { width: 286, height: 900 },
        },
        canvas,
        canvas,
        true,
      ).failures,
    ).toEqual(['content-extent-mismatch'])
    expect(
      assessStaticContentGeometry(
        reachable,
        {
          ...reachable,
          viewport: { width: 287, height: 640 },
        },
        canvas,
        canvas,
        true,
      ).failures,
    ).toEqual(['viewport-geometry-mismatch'])
  })

  test('rejects old snapshots or missing viewport evidence rather than inventing geometry', () => {
    expect(assessStaticContentGeometry(undefined, reachable, canvas, canvas, true).failures).toEqual([
      'content-geometry-missing',
    ])
    expect(assessStaticContentGeometry(reachable, reachable, canvas, canvas, false).failures).toEqual([
      'viewport-screenshot-missing',
    ])
  })
})

describe('static viewport PNG comparison', () => {
  let fixtureRoot = ''
  const comparator = resolve('scripts/compare-reactbits-pro-visuals.py')
  const pythonImport = `import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("visual_audit", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
`

  function runPython(code: string, ...args: string[]) {
    const result = Bun.spawnSync(['python', '-c', code, comparator, ...args], { stdout: 'pipe', stderr: 'pipe' })
    return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() }
  }

  beforeAll(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'hbar-reactbits-static-canvas-'))
    const result = runPython(
      `from PIL import Image
from pathlib import Path
import sys
root = Path(sys.argv[2])
Image.new("RGB", (286, 640), "white").save(root / "source-viewport.png")
Image.new("RGB", (286, 640), "white").save(root / "local-viewport.png")
Image.new("RGB", (286, 692), "white").save(root / "local-root.png")
`,
      fixtureRoot,
    )
    if (result.exitCode !== 0) throw new Error(`PNG fixtures could not be created: ${result.stderr}`)
  }, 20_000)

  afterAll(async () => {
    if (!fixtureRoot) return
    const absolute = resolve(fixtureRoot)
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith('hbar-reactbits-static-canvas-'))
      throw new Error(`Refusing to remove an unexpected fixture directory: ${absolute}`)
    await rm(absolute, { recursive: true, force: true })
  })

  test('rejects unequal exact PNGs while labelling historical normalization explicitly', () => {
    const result = runPython(
      `${pythonImport}
root = Path(sys.argv[2])
try:
    module.compare_pair(root / "source-viewport.png", root / "local-root.png", root / "invalid-diff.png", require_same_size=True)
    raise AssertionError("An unequal viewport PNG was resized")
except ValueError as error:
    assert "Viewport PNG dimensions differ" in str(error)
assert not (root / "invalid-diff.png").exists()
metrics = module.compare_pair(root / "source-viewport.png", root / "local-root.png", root / "legacy-diff.png")
print(json.dumps(metrics))
`,
      fixtureRoot,
    )
    expect(result.exitCode).toBe(0)
    const metrics = JSON.parse(result.stdout) as {
      comparisonMode: string
      heightDelta: number
      normalizedMae: number
    }
    expect(metrics.comparisonMode).toBe('intrinsic-normalized-legacy')
    expect(metrics.heightDelta).toBe(52)
    expect(metrics.normalizedMae).toBe(0)
  })

  async function compareManifest(name: string, localViewportPath: string | undefined) {
    const directory = join(fixtureRoot, name)
    await mkdir(directory)
    await writeFile(
      join(directory, 'capture-manifest.json'),
      JSON.stringify({
        captureProtocolVersion: 17,
        records: ['source', 'local'].map((kind) => ({
          kind,
          id: 'test-auth',
          theme: 'light',
          viewport: 'stress',
          referenceCanvas: canvas,
          screenshot: join(fixtureRoot, kind === 'source' ? 'source-viewport.png' : 'local-root.png'),
          viewportScreenshot: kind === 'source' ? join(fixtureRoot, 'source-viewport.png') : localViewportPath,
        })),
      }),
    )
    const result = Bun.spawnSync(['python', comparator, '--root', directory], { stdout: 'pipe', stderr: 'pipe' })
    return { directory, exitCode: result.exitCode, stderr: result.stderr.toString() }
  }

  test('uses explicit same-sized viewport images without resizing the separate intrinsic roots', async () => {
    const result = await compareManifest('matching', join(fixtureRoot, 'local-viewport.png'))
    expect(result.exitCode).toBe(0)
    const report = (await Bun.file(join(result.directory, 'visual-report.json')).json()) as {
      pairs: readonly {
        comparisonMode: string
        local: { height: number }
        heightDelta: number
        normalizedMae: number
      }[]
    }
    expect(report.pairs).toHaveLength(1)
    expect(report.pairs[0]?.comparisonMode).toBe('viewport-exact')
    expect(report.pairs[0]?.local.height).toBe(640)
    expect(report.pairs[0]?.heightDelta).toBe(0)
    expect(report.pairs[0]?.normalizedMae).toBe(0)
  })

  test('does not fall back to an intrinsic root when a new viewport PNG is absent or incorrectly sized', async () => {
    const absent = await compareManifest('absent', undefined)
    expect(absent.exitCode).not.toBe(0)
    expect(absent.stderr).toContain('requires explicit viewport PNGs')
    const unequal = await compareManifest('unequal', join(fixtureRoot, 'local-root.png'))
    expect(unequal.exitCode).not.toBe(0)
    expect(unequal.stderr).toContain('viewport PNG does not match reference canvas')
  })
})
