import { cleanup } from '@testing-library/react'
import chaiDom from 'chai-dom'
import { afterEach, chai, vi } from 'vitest'

chai.use(chaiDom)
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
