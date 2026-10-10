import { createMessageResources, RuntimeCommandError, type ResourceReferenceSource } from '@hbar/app-runtime'
import {
  createResourceCommandClient,
  createSettingsCommandClient,
  createSessionLaunchTargetReader,
  type HbarClient,
} from '@hbar/client'
import type { ResourceCandidate } from '@hbar/contracts/resources'
import type { ResourceReference } from '@hbar/contracts/resources'
import type { HbarRuntimeView } from '@hbar/app-react'
import { acquireResourceImage } from './resource-image'
import { hostPersistenceId } from './host-identity'

export interface ResourcePlatform {
  openSystem(candidate: ResourceCandidate): Promise<void>
  openBrowser(candidate: ResourceCandidate, source: ResourceReferenceSource, signal?: AbortSignal): Promise<void>
  openText?(
    candidate: ResourceCandidate,
    text: string,
    source: ResourceReferenceSource,
    reference: ResourceReference,
    signal?: AbortSignal,
  ): Promise<void>
}
export function createWebMessageResources(client: HbarClient, runtime: HbarRuntimeView, platform?: ResourcePlatform) {
  const resources = createResourceCommandClient(client)
  const settings = createSettingsCommandClient(client)
  const targets = createSessionLaunchTargetReader(client)
  return createMessageResources({
    ...(platform?.openText ? { openText: platform.openText } : {}),
    owns(source) {
      const navigation = runtime.state.navigation.getSnapshot()
      const tabs = runtime.state.workspaceTabs.getSnapshot()
      return (
        (() => {
          const host = client.connectionHost()
          return host !== null && hostPersistenceId(host) === runtime.hostId
        })() &&
        navigation.workspaceId === source.workspaceId &&
        navigation.sessionId === source.sessionId &&
        (source.sourceTabInstanceKey === null ||
          tabs.items.some(
            (tab) =>
              tab.kind === 'session' &&
              tab.sessionId === source.sessionId &&
              tab.instanceKey === source.sourceTabInstanceKey,
          ))
      )
    },
    async target(source, signal) {
      const result = await targets.read(source.sessionId, { signal })
      signal.throwIfAborted()
      return { sessionId: source.sessionId, expectedRevision: result.revision }
    },
    resolve: (input, signal) => resources.execute('resource.resolve', input, { signal }),
    text: (input, signal) => resources.execute('resource.text', input, { signal }),
    async media(input, signal) {
      return acquireResourceImage(await client.readResourceMedia(input, signal), signal)
    },
    async defaultMode(kind, signal) {
      const result = await settings.execute('settings.get', { scope: { kind: 'global' } }, { signal })
      signal.throwIfAborted()
      return result.resolution.reports[`f:client.resource${kind === 'web' ? 'Web' : 'File'}OpenMode`]
        ?.effectiveValue === 'system'
        ? 'system'
        : 'internal'
    },
    async openSystem(candidate, signal) {
      signal.throwIfAborted()
      if (platform) return platform.openSystem(candidate)
      if (!/^https?:\/\//.test(candidate.location))
        throw new RuntimeCommandError('PLATFORM_UNAVAILABLE', 'Native file opening is unavailable')
      const opened = window.open(candidate.location, '_blank', 'noopener,noreferrer')
      if (opened) opened.opener = null
    },
    async openBrowser(candidate, source, signal) {
      signal.throwIfAborted()
      if (platform) return platform.openBrowser(candidate, source, signal)
      const opened = window.open(candidate.location, '_blank', 'noopener,noreferrer')
      if (opened) opened.opener = null
    },
  })
}
