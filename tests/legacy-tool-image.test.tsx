import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ContentBlock } from '@hbar/contracts'
import { HbarToolResultImages } from '../packages/app-react/src/session-images'
import { legacyToolImageSource } from '../packages/app-react/src/legacy-tool-image'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6DYkAAAAASUVORK5CYII='
const result = (details: unknown): Extract<ContentBlock, { type: 'tool_result' }> => ({
  type: 'tool_result',
  callId: 'original',
  name: 'computer_screenshot',
  text: 'Computer screenshot 2560x1600',
  isError: false,
  details,
})
test('historical computer and browser screenshots render their original bytes without a resource capability', () => {
  for (const details of [
    { data: png, mime: 'image/png', width: 2560, height: 1600 },
    { data: png, mime: 'image/png', page: { url: 'https://fixture.invalid' } },
  ]) {
    const source = result(details)
    expect(legacyToolImageSource(source)).toBe(`data:image/png;base64,${png}`)
    const html = renderToStaticMarkup(
      <HbarToolResultImages sessionId="session" messageId="original-message" result={source} />,
    )
    expect(html).toContain(`src="data:image/png;base64,${png}"`)
    expect(html).toContain('alt="Computer screenshot 2560x1600"')
    expect(html).toContain('loading="lazy"')
  }
})
test('legacy compatibility rejects absent, unsupported, malformed and oversized inline image metadata', () => {
  for (const details of [
    null,
    {},
    { data: png },
    { data: png, mime: 'image/svg+xml' },
    { data: '<svg/>', mime: 'image/png' },
    { data: 'A', mime: 'image/png' },
    { data: 'A'.repeat(14_000_000), mime: 'image/png' },
  ])
    expect(legacyToolImageSource(result(details))).toBeNull()
})
