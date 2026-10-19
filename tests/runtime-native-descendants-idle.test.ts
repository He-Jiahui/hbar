import { expect, test } from 'bun:test'
import { nativeDescendantsConfirmed } from '@hbar/plugin-sdk'
import { runtimeIdleAuthoritySchema } from '@hbar/contracts/runtime'

test('only self-only native job with no physical shell or direct child suppresses descendant uncertainty', () => {
  const authority = runtimeIdleAuthoritySchema.parse({
    owner: { unitId: 'local', generation: 1, incarnation: 'test-owner' },
    nativeActive: 1,
  })
  expect(nativeDescendantsConfirmed(undefined, 0, 0)).toBe(false)
  expect(nativeDescendantsConfirmed(authority, 1, 0)).toBe(false)
  expect(nativeDescendantsConfirmed(authority, 0, 1)).toBe(false)
  expect(nativeDescendantsConfirmed({ ...authority, nativeActive: 2 }, 0, 0)).toBe(false)
  expect(nativeDescendantsConfirmed({ ...authority, nativeActive: 0 }, 0, 0)).toBe(false)
  expect(nativeDescendantsConfirmed(authority, 0, 0)).toBe(true)
  // Later native sampling remains authoritative; no probe cleared the historical bit.
  expect(nativeDescendantsConfirmed({ ...authority, nativeActive: 2 }, 0, 0)).toBe(false)
})
