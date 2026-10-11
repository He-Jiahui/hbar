import type { RuntimeSnapshot } from '@hbar/contracts/runtime'

export function changedRuntimeGenerations(before: RuntimeSnapshot, after: RuntimeSnapshot): string[] {
  if (after.instanceId !== before.instanceId) throw new Error('The stable Host identity changed during a local source update')
  return after.units.flatMap(unit => {
    const current = unit.generations.find(generation => generation.role === 'default' && generation.phase === 'serving')
    const previous = before.units.find(value => value.descriptor.id === unit.descriptor.id)?.generations.find(generation => generation.role === 'default')
    return current && previous && (current.generation !== previous.generation || current.incarnation !== previous.incarnation) ? [unit.descriptor.id] : []
  })
}
/** Desktop observes the Host's own source watcher. One read at a time; no restart or credential replacement. */
export function monitorDesktopRuntime(options: {
  readonly initial: RuntimeSnapshot
  readonly read: () => Promise<RuntimeSnapshot>
  readonly verifyIdentity: () => Promise<void>
  readonly onUpdate: (unitIds: readonly string[]) => void
  readonly onSourceStatus: (state: NonNullable<RuntimeSnapshot['sourceReload']>) => void
  readonly onError: (error: unknown) => void
  readonly intervalMs?: number
}) {
  let previous = options.initial, running = false, disposed = false, sourceRevision = previous.sourceReload?.revision ?? 0
  const tick = async () => {
    if (disposed || running) return
    running = true
    try {
      const current = await options.read()
      if (disposed) return
      const changed = changedRuntimeGenerations(previous, current)
      if (changed.length) { await options.verifyIdentity(); if (!disposed) options.onUpdate(changed) }
      if (current.sourceReload && current.sourceReload.revision !== sourceRevision) {
        sourceRevision = current.sourceReload.revision; options.onSourceStatus(current.sourceReload)
      }
      previous = current
    } catch (error) { if (!disposed) options.onError(error) }
    finally { running = false }
  }
  const timer = setInterval(() => { tick().catch(options.onError) }, options.intervalMs ?? 1_000)
  timer.unref()
  return () => { disposed = true; clearInterval(timer) }
}
