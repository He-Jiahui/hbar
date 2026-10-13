import type { NodeStatePort } from '@hbar/contracts/node-state'
import type { NodeLocalConfirmationPort } from '@hbar/contracts/node-confirmations'

/** Adapts B-owned confirmation records in the node's private SQLite database. */
export class NodeLocalConfirmationStorage implements NodeLocalConfirmationPort {
  constructor(private readonly state: NodeStatePort) {}

  list(input: { readonly includeResolved: boolean }) {
    return this.state.call('local-confirmation.list', input)
  }
  get(input: { readonly id: string }) {
    return this.state.call('local-confirmation.get', input)
  }
  latest(input: { readonly operationId: string }) {
    return this.state.call('local-confirmation.latest', input)
  }
  create(input: Parameters<NodeLocalConfirmationPort['create']>[0]) {
    return this.state.call('local-confirmation.create', input)
  }
  resolve(input: Parameters<NodeLocalConfirmationPort['resolve']>[0]) {
    return this.state.call('local-confirmation.resolve', input)
  }
}
