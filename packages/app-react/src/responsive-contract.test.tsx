import { describe, expect, it } from 'vitest'

import { WORKSPACE_VIEWPORT_MEDIA, workspaceViewportTier } from './responsive-contract'

describe('workspace viewport contract', () => {
  it('assigns each exact breakpoint to one stable layout tier', () => {
    expect(workspaceViewportTier(639.99, 16)).toBe('narrow')
    expect(workspaceViewportTier(640, 16)).toBe('compact')
    expect(workspaceViewportTier(640.01, 16)).toBe('compact')
    expect(workspaceViewportTier(767.99, 16)).toBe('compact')
    expect(workspaceViewportTier(768, 16)).toBe('tablet')
    expect(workspaceViewportTier(768.01, 16)).toBe('tablet')
    expect(workspaceViewportTier(1023.99, 16)).toBe('tablet')
    expect(workspaceViewportTier(1024, 16)).toBe('wide')
    expect(workspaceViewportTier(1024.01, 16)).toBe('wide')
  })

  it('keeps boundaries tied to the root font size', () => {
    expect(workspaceViewportTier(40 * 20 - 0.01, 20)).toBe('narrow')
    expect(workspaceViewportTier(40 * 20, 20)).toBe('compact')
    expect(workspaceViewportTier(48 * 20 - 0.01, 20)).toBe('compact')
    expect(workspaceViewportTier(48 * 20, 20)).toBe('tablet')
    expect(workspaceViewportTier(64 * 20 - 0.01, 20)).toBe('tablet')
    expect(workspaceViewportTier(64 * 20, 20)).toBe('wide')
  })

  it('rejects invalid geometry instead of choosing an accidental layout', () => {
    expect(() => workspaceViewportTier(800, 0)).toThrow(RangeError)
    expect(() => workspaceViewportTier(Number.NaN, 16)).toThrow(RangeError)
  })

  it('publishes the same three width boundaries for CSS and JavaScript', () => {
    expect(WORKSPACE_VIEWPORT_MEDIA).toEqual({
      narrow: '(width < 40rem)',
      compact: '(width >= 40rem) and (width < 48rem)',
      tablet: '(width >= 48rem) and (width < 64rem)',
      narrowShell: '(width < 64rem)',
      tabletAndUp: '(width >= 48rem)',
      wide: '(width >= 64rem)',
      coarseNarrow: '(width < 40rem) and (pointer: coarse)',
    })
  })
})
