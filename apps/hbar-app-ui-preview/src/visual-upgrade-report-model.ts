import { createStore } from 'zustand/vanilla'
import { z } from 'zod'

const captureSchema = z.strictObject({
  family: z.string().min(1).max(120),
  locale: z.enum(['zh-CN', 'en-US']),
  theme: z.enum(['dark', 'light']),
  width: z.number().int().min(320).max(4096),
  phase: z.enum(['before', 'after']),
  src: z.string().regex(/^\/visual-upgrade\/screenshots\/(before|after)\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.png$/),
})
export const visualUpgradeEvidenceSchema = z.strictObject({
  before: z.string().regex(/^[a-f0-9]{8,40}$/),
  after: z.string().regex(/^[a-f0-9]{8,40}$/),
  captures: z.array(captureSchema).max(1000),
})
export type VisualUpgradeCapture = z.output<typeof captureSchema>
export type VisualUpgradeEvidence = z.output<typeof visualUpgradeEvidenceSchema>

/** The preview owns bounded, read-only evidence; production services are never contacted. */
export function createVisualUpgradeReportModel() {
  const state = createStore<{
    readonly status: 'loading' | 'ready' | 'error'
    readonly evidence: VisualUpgradeEvidence | null
  }>(() => ({ status: 'loading', evidence: null }))
  let request: AbortController | null = null
  async function load() {
    request?.abort()
    const controller = new AbortController()
    request = controller
    state.setState({ status: 'loading' })
    try {
      const response = await fetch('/visual-upgrade/index.json', { signal: controller.signal })
      if (!response.ok) throw new Error('Evidence response unavailable')
      const value: unknown = await response.json()
      const evidence = visualUpgradeEvidenceSchema.parse(value)
      if (request === controller) state.setState({ status: 'ready', evidence })
    } catch {
      if (!controller.signal.aborted && request === controller) state.setState({ status: 'error' })
    }
  }
  return {
    state,
    load,
    dispose: () => {
      request?.abort()
      request = null
    },
  }
}
