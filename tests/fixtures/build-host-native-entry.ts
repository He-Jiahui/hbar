const candidate: unknown = require('./hbar_workspace_query.node')
if (
  !candidate ||
  typeof candidate !== 'object' ||
  !('nativeVersion' in candidate) ||
  typeof candidate.nativeVersion !== 'function'
)
  throw new Error('Native build fixture API is unavailable')
const native = candidate as { nativeVersion(): string }
export const version = native.nativeVersion()
