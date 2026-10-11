import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarContextCompactionMarker } from '@hbar/app-react'
import { MAX_CONTEXT_COMPACTION_MARKERS, type ContextCompactionMarker } from '@hbar/contracts/context-history'
import { mergeContextCompactionMarkers } from '../packages/app-runtime/src/context-compaction-markers'
import { projectSessionTimelineSequence } from '../packages/app-react/src/session-message-model'
import { contextHistoryCopy } from '../apps/web/src/context-history-copy'
import { sessionMessage } from './session-message.fixtures'

function marker(seq: number, overrides: Partial<ContextCompactionMarker> = {}): ContextCompactionMarker {
  return { id: `compaction-${seq}`, sessionId: 'session', seq, time: seq, trigger: 'automatic', ...overrides }
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`conversation record names automatic/manual/unknown compaction in ${locale}`, () => {
    const labels = contextHistoryCopy(locale)
    for (const trigger of ['automatic', 'manual', null] as const) {
      const html = renderToStaticMarkup(
        <HbarContextCompactionMarker marker={marker(2, { trigger })} sessionId="session" labels={labels} />,
      )
      expect(html).toContain(labels.compacted(trigger))
      expect(html).toContain('data-context-compaction-marker="compaction-2"')
      expect(html).toContain('data-tier="sm"')
      expect(html).not.toContain('hbar-session-execution-spinner')
    }
    expect(
      renderToStaticMarkup(<HbarContextCompactionMarker marker={marker(2)} sessionId="other" labels={labels} />),
    ).toBe('')
    const long = 'A long translated completion record '.repeat(30)
    expect(
      renderToStaticMarkup(
        <HbarContextCompactionMarker marker={marker(2)} sessionId="session" labels={{ compacted: () => long }} />,
      ),
    ).toContain(long)
  })
}

test('completed facts retain exact sequence order around messages and precede uncommitted streams', () => {
  const result = projectSessionTimelineSequence({
    sessionId: 'session',
    messages: [
      sessionMessage([{ type: 'text', text: 'Before' }], { id: 'before', seq: 1 }),
      sessionMessage([{ type: 'text', text: 'Between' }], { id: 'between', seq: 5 }),
      sessionMessage([{ type: 'text', text: 'After' }], { id: 'after', seq: 9 }),
    ],
    streams: {
      live: { id: 'live', sessionId: 'session', runId: 'run', text: '', thinking: '', version: 1, offset: 0 },
    },
    runs: [],
    contextCompactions: [marker(7), marker(3), marker(3), marker(2, { sessionId: 'foreign' })],
  })
  expect(
    result.map((item) =>
      item.kind === 'message'
        ? item.projection.message.id
        : item.kind === 'contextCompaction'
          ? item.marker.seq
          : item.kind,
    ),
  ).toEqual(['before', 3, 'between', 7, 'after', 'stream'])
})

test.each([0, 1, 10, MAX_CONTEXT_COMPACTION_MARKERS, MAX_CONTEXT_COMPACTION_MARKERS + 1])(
  'loaded completion collection stays bounded with %i input records',
  (count) => {
    const input = Array.from({ length: count }, (_, index) => marker(index + 1))
    const records = mergeContextCompactionMarkers('session', input, [
      ...input,
      marker(1, { id: 'foreign', sessionId: 'other' }),
    ])
    expect(records).toHaveLength(Math.min(count, MAX_CONTEXT_COMPACTION_MARKERS))
    expect(new Set(records.map((value) => value.id)).size).toBe(records.length)
    if (count) expect(records.at(-1)?.seq).toBe(count)
    expect(
      projectSessionTimelineSequence({
        sessionId: 'session',
        messages: [],
        runs: [],
        streams: {},
        contextCompactions: records,
      }).filter((item) => item.kind === 'contextCompaction'),
    ).toHaveLength(records.length)
  },
)

test('page merge preserves loaded older records, rejects future facts and prunes paged-out messages', () => {
  const recent = mergeContextCompactionMarkers('session', [marker(80)], [marker(90), marker(999)], 0, 100)
  const older = mergeContextCompactionMarkers('session', recent, [marker(5), marker(90)], 0, 100)
  expect(older.map((value) => value.seq)).toEqual([5, 80, 90])
  expect(mergeContextCompactionMarkers('session', older, [], 50, 100).map((value) => value.seq)).toEqual([80, 90])
})
