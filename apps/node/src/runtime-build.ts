import type { RuntimeBuildUnit } from '@hbar/runtime'
import { NODE_PROCESS_FINGERPRINT } from './execution-contract'

export function nodeRuntimeBuildUnit(): RuntimeBuildUnit {
  return {
    descriptor: {
      id: 'node.execution',
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: false,
      contractFingerprint: NODE_PROCESS_FINGERPRINT,
      storageSchema: 0,
    },
    entrypoint: 'apps/node/src/execution-process.ts',
  }
}
