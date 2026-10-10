import type { HostInfo } from '@hbar/contracts'

/** Namespaces persisted Web state by data root while retaining old Host compatibility. */
export function hostPersistenceId(host: Pick<HostInfo, 'instanceId' | 'dataRootId'>): string {
  return host.dataRootId ?? host.instanceId
}
