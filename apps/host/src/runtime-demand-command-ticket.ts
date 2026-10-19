import { CommandError, type CommandExecutionTicket } from '@hbar/commands'
import type { HostRuntimeDemandHold } from './runtime-host-demand'

/** One preparation, one exact accepted ticket. Following/ACK never repeats admission or restore. */
export function createDemandCommandTicket(options: {
  readonly signal: AbortSignal
  readonly acquire: (signal: AbortSignal) => Promise<HostRuntimeDemandHold>
  readonly restore: (hold: HostRuntimeDemandHold, signal: AbortSignal) => Promise<void>
  /** Must not dispatch on a synchronous throw; Host supplies the audited RuntimeControllerAdapter.trackCommand. */
  readonly start: (hold: HostRuntimeDemandHold) => CommandExecutionTicket
}): CommandExecutionTicket {
  let hold: HostRuntimeDemandHold | undefined
  let released = false
  const release = () => {
    if (!hold || released) return
    released = true
    hold.release()
  }
  const prepared = (async () => {
    options.signal.throwIfAborted()
    hold = await options.acquire(options.signal)
    // A failed/lost restore reply may hide accepted physical work. Its exact hold stays quarantined.
    await options.restore(hold, options.signal)
    try {
      options.signal.throwIfAborted()
      return options.start(hold)
    } catch (error) {
      // restore returned successfully and no command ticket was admitted.
      release()
      throw error
    }
  })()
  const view = (selected: Promise<CommandExecutionTicket>): CommandExecutionTicket => {
    const result = selected.then((ticket) => ticket.result)
    const settled = selected.then((ticket) => ticket.settled)
    void result.catch(() => undefined)
    void settled.catch(() => undefined)
    return {
      result,
      settled,
      acknowledge: async () => {
        const ticket = await selected
        if (!ticket.acknowledge)
          throw new CommandError('COMMAND_ACK_REQUIRED', 'The original managed command has no acknowledgment')
        await ticket.acknowledge()
        release()
      },
      follow: (followOptions) =>
        view(
          selected.then((ticket) => {
            if (!ticket.follow)
              throw new CommandError('COMMAND_RECONCILIATION_REQUIRED', 'The original command cannot be followed')
            return ticket.follow(followOptions)
          }),
        ),
    }
  }
  return view(prepared)
}
