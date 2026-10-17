import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import type { StoragePort } from '@hbar/storage'

/** An explicit on/off background setting owns ordinary completion. Turning it off must
 * not transfer automatic continuation to the legacy budget scheduler. Missing preserves
 * an existing client that has never opted into these background controls.
 */
export async function backendOwnsOrdinaryCompletion(storage: StoragePort): Promise<boolean> {
  const layers = await storage.call('settingsLayers', ['settings:global'])
  return layers.some(
    (layer) => layer.id === 'settings:global' && Object.hasOwn(layer.values, BACKEND_UNATTENDED_VALUE_KEY),
  )
}

/** Missing preserves existing client Goal behavior; an explicitly saved value must be true. */
export async function backendAllowsGoalContinuation(storage: StoragePort): Promise<boolean> {
  const layers = await storage.call('settingsLayers', ['settings:global'])
  const layer = layers.find((value) => value.id === 'settings:global')
  return (
    layer === undefined ||
    !Object.hasOwn(layer.values, BACKEND_UNATTENDED_VALUE_KEY) ||
    layer.values[BACKEND_UNATTENDED_VALUE_KEY] === true
  )
}
