import type { StoragePort } from './index'
import {
  nodeRegistryStateMethods,
  type NodeRegistryStatePort,
  type NodeRegistryMethod,
  type NodeRegistryInput,
  type NodeRegistryOutput,
} from '@hbar/contracts/node-registry'

/** Private, typed adapter. It exposes no generic StoragePort to a network node. */
export class StorageNodeRegistryPort implements NodeRegistryStatePort {
  constructor(private readonly storage: StoragePort) {}
  async call<Method extends NodeRegistryMethod>(
    method: Method,
    input: NodeRegistryInput<Method>,
  ): Promise<NodeRegistryOutput<Method>> {
    const value = nodeRegistryStateMethods[method].input.parse(input)
    let result: unknown
    switch (method) {
      case 'identity.ensure':
        result = await this.storage.call(
          'nodeIdentityEnsure',
          nodeRegistryStateMethods['identity.ensure'].input.parse(value),
        )
        break
      case 'node.list':
        result = await this.storage.call('nodes')
        break
      case 'node.get':
        result = await this.storage.call('node', nodeRegistryStateMethods['node.get'].input.parse(value).nodeId)
        break
      case 'node.register':
        result = await this.storage.call('nodeRegister', nodeRegistryStateMethods['node.register'].input.parse(value))
        break
      case 'node.touch': {
        const checked = nodeRegistryStateMethods['node.touch'].input.parse(value)
        result = await this.storage.call('nodeTouch', checked.nodeId, checked.time, checked.capabilities)
        break
      }
      case 'node.revoke': {
        const checked = nodeRegistryStateMethods['node.revoke'].input.parse(value)
        result = await this.storage.call('nodeRevoke', checked.nodeId, checked.time)
        break
      }
    }
    // The selected method's schema validates the associated generic output.
    return nodeRegistryStateMethods[method].output.parse(result) as NodeRegistryOutput<Method>
  }
}
