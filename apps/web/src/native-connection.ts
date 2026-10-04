export interface HbarNativeConnection {
  readonly url: string
  readonly token: string
  readonly instanceId: string
}

interface TauriInvokeBridge {
  readonly invoke: (command: string) => Promise<unknown>
}

function parseConnection(value: unknown, expectedOrigin: string): HbarNativeConnection {
  if (!value || typeof value !== 'object') throw new Error('Desktop connection response is invalid')
  const candidate = value as Partial<HbarNativeConnection>
  if (
    typeof candidate.url !== 'string' ||
    typeof candidate.token !== 'string' ||
    typeof candidate.instanceId !== 'string' ||
    candidate.token.length === 0 ||
    candidate.token.length > 4096 ||
    candidate.instanceId.length === 0 ||
    candidate.instanceId.length > 256
  )
    throw new Error('Desktop connection response is invalid')
  const url = new URL(candidate.url)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.origin !== expectedOrigin)
    throw new Error('Desktop connection origin does not match the workbench')
  return { url: url.origin, token: candidate.token, instanceId: candidate.instanceId }
}

/** Reads credentials only from Tauri's injected main-window bridge. Ordinary Web clients return null. */
export async function loadNativeConnection(
  scope: unknown,
  expectedOrigin: string,
): Promise<HbarNativeConnection | null> {
  const bridge = (scope as { readonly __TAURI_INTERNALS__?: TauriInvokeBridge } | null)?.__TAURI_INTERNALS__
  if (!bridge || typeof bridge.invoke !== 'function') return null
  return parseConnection(await bridge.invoke('connection_info'), expectedOrigin)
}
