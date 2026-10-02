import { expect, test } from 'bun:test'
import {
  isDiagramCode,
  diagramSourceFailure,
  MAX_DIAGRAM_CHARACTERS,
  MAX_DIAGRAM_PENDING,
  clampDiagramZoom,
  fitDiagramZoom,
} from '../packages/app-react/src/markdown-diagram-model'
import { createDiagramRenderQueue, type DiagramRenderResult } from '../packages/app-react/src/markdown-diagram-render'

const valid = 'flowchart LR\n A[Read] --> B[Review] --> C[Continue]'
test('static Mermaid has bounded source and never passes author execution/resource directives to the renderer', () => {
  expect(diagramSourceFailure('')).toBe('empty')
  expect(diagramSourceFailure(valid)).toBeNull()
  expect(diagramSourceFailure(`graph LR\n${' '.repeat(MAX_DIAGRAM_CHARACTERS - 9)}`)).toBeNull()
  expect(diagramSourceFailure(`graph LR\n${' '.repeat(MAX_DIAGRAM_CHARACTERS - 8)}`)).toBe('too_large')
  expect(diagramSourceFailure('unknownDiagram\n A-->B')).toBe('invalid')
  for (const source of [
    '---\nconfig:\n  securityLevel: loose\n---\ngraph LR\n A-->B',
    '%%{init: {"themeCSS":"@import url(https://evil.invalid)"}}%%\ngraph LR\n A-->B',
    'graph LR\n A[<img src="https://evil.invalid">]',
    'graph LR\n A[&#60;img src=//evil.invalid&#62;]',
    'graph LR\n A@{img: "//evil.invalid/pixel.png"}',
    'graph LR\n A-->B\n classDef default fill:url(//evil.invalid)',
    'graph LR\n A-->B; click A "javascript:alert(1)"',
    'graph LR\n A[fa:fa-home]',
    'graph LR\n A[$$x$$]',
    'gantt\n title Safe title\n todayMarker stroke:url(//evil.invalid/pixel)',
    'graph LR\n A[![image](//evil.invalid/pixel)]',
    'gantt\n title Safe title\n href Task: //evil.invalid',
  ])
    expect(diagramSourceFailure(source)).toBe('restricted')
  expect(diagramSourceFailure('mindmap\n root((Read))')).toBe('restricted')
})

test('explicit and plain Mermaid fences are recognized without treating other language code as a diagram', () => {
  expect(isDiagramCode('MERMAID', '')).toBe(true)
  expect(isDiagramCode(null, valid)).toBe(true)
  expect(isDiagramCode('plaintext', valid)).toBe(true)
  expect(isDiagramCode('javascript', valid)).toBe(false)
  expect(isDiagramCode(null, 'ordinary text')).toBe(false)
})

test('render queue cancels pending owners, holds active physical ownership and discards late outcomes', async () => {
  const physical: { source: string; resolve: (result: DiagramRenderResult) => void }[] = []
  const renderer = createDiagramRenderQueue(
    (input) => new Promise((resolve) => physical.push({ source: input.source, resolve })),
  )
  const a = new AbortController()
  const b = new AbortController()
  const original = renderer({ source: valid, dark: false, signal: a.signal })
  const pending = renderer({ source: `${valid}\n%% second`, dark: false, signal: b.signal })
  b.abort()
  expect((await pending).status).toBe('cancelled')
  const replacement = renderer({ source: `${valid}\n%% replacement`, dark: true, signal: new AbortController().signal })
  a.abort()
  expect((await original).status).toBe('cancelled')
  expect(physical).toHaveLength(1)
  physical[0]?.resolve({ status: 'failed', reason: 'invalid' })
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(physical).toHaveLength(2)
  expect(physical[1]?.source).toContain('replacement')
  physical[1]?.resolve({ status: 'ready', svg: '<svg/>', previewSvg: '<svg/>', width: 200, height: 100 })
  expect((await replacement).status).toBe('ready')
})

test('queue capacity rejects locally, abort releases pending capacity, failed rendering can be retried', async () => {
  const physical: ((result: DiagramRenderResult) => void)[] = []
  const renderer = createDiagramRenderQueue(() => new Promise((resolve) => physical.push(resolve)))
  const controllers = Array.from({ length: MAX_DIAGRAM_PENDING + 1 }, () => new AbortController())
  const accepted = controllers.map((controller) => renderer({ source: valid, dark: false, signal: controller.signal }))
  expect(await renderer({ source: valid, dark: false, signal: new AbortController().signal })).toEqual({
    status: 'failed',
    reason: 'busy',
  })
  controllers.slice(1).forEach((controller) => controller.abort())
  const retry = renderer({ source: valid, dark: false, signal: new AbortController().signal })
  physical[0]?.({ status: 'failed', reason: 'invalid' })
  expect(await accepted[0]).toEqual({ status: 'failed', reason: 'invalid' })
  await Promise.resolve()
  await Promise.resolve()
  physical[1]?.({ status: 'ready', svg: '<svg/>', previewSvg: '<svg/>', width: 1, height: 1 })
  expect((await retry).status).toBe('ready')
  expect((await Promise.all(accepted.slice(1))).every((result) => result.status === 'cancelled')).toBe(true)
})

test('fit and zoom remain within the observed 5–300 percent range', () => {
  expect(clampDiagramZoom(0)).toBe(0.05)
  expect(clampDiagramZoom(10)).toBe(3)
  expect(clampDiagramZoom(Number.NaN)).toBe(1)
  expect(fitDiagramZoom(1200, 300, 848, 600)).toBeCloseTo(2 / 3)
  expect(fitDiagramZoom(200, 100, 900, 600)).toBe(1)
})
