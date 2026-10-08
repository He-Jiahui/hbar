export interface NativeInvokeBridge {
  readonly invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>
}

/** Validate the narrow Tauri bridge before adapting its unknown responses. */
export function readNativeInvokeBridge(scope: unknown): NativeInvokeBridge | null {
  if (typeof scope !== 'object' || scope === null) return null
  const bridge: unknown = Reflect.get(scope, '__TAURI_INTERNALS__')
  if (typeof bridge !== 'object' || bridge === null) return null
  const invoke: unknown = Reflect.get(bridge, 'invoke')
  if (typeof invoke !== 'function') return null
  return {
    invoke: async (command, args) => {
      const value: unknown = Reflect.apply(invoke, bridge, args === undefined ? [command] : [command, args])
      return await value
    },
  }
}
