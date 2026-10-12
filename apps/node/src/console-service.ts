import { HbarError } from '@hbar/contracts'
import { nodeConsoleMethods, type NodeConsoleMethod } from '@hbar/contracts/node-console'
import { nodeFloorSchema } from '@hbar/contracts/node'
import type { NodeStatePort } from '@hbar/contracts/node-state'
import type { NodeLinkStatus } from '@hbar/contracts/node-link-state'
import { nodeFingerprint, type NodeIdentity, type WorkspaceNodeService, validateNodeRoots } from '@hbar/node-core'

export class NodeConsoleService {
  constructor(
    private readonly state: NodeStatePort,
    private readonly identity: NodeIdentity,
    private readonly dataRoot: string,
    private readonly node?: WorkspaceNodeService,
    private readonly link?: { readonly linked: boolean; readonly connection: NodeLinkStatus; unlink(): Promise<void> },
  ) {}
  async invoke(method: NodeConsoleMethod, input: unknown): Promise<unknown> {
    const value = nodeConsoleMethods[method].input.parse(input)
    let result: unknown
    switch (method) {
      case 'node.status': {
        if (!this.node) throw new HbarError('NODE_OFFLINE', 'Start the workspace node to inspect live status')
        result = {
          capabilities: this.node.capabilities(),
          fingerprint: nodeFingerprint(this.identity.publicKey),
          paused: this.node.isPaused,
          running: this.node.running,
          linked: this.link?.linked ?? !!(await this.state.call('config.get', { key: 'link' })),
          connection: this.link?.connection ?? { phase: 'unlinked', reasonCode: null, nextAttemptAt: null },
        }
        break
      }
      case 'node.policy.get':
        result = this.node?.policy ?? (await this.state.call('floor.get', {})) ?? nodeFloorSchema.parse({ roots: [] })
        break
      case 'node.policy.set': {
        const floor = nodeFloorSchema.parse(value)
        result = this.node
          ? await this.node.setPolicy(floor)
          : await this.state.call('floor.set', await validateNodeRoots(floor, this.dataRoot))
        break
      }
      case 'node.pause': {
        const { paused } = nodeConsoleMethods['node.pause'].input.parse(value)
        if (this.node) await this.node.pause(paused)
        else await this.state.call('config.set', { key: 'paused', value: paused })
        result = { accepted: true }
        break
      }
      case 'node.kill': {
        if (!this.node) throw new HbarError('NODE_OFFLINE', 'No live node process to cancel')
        const request = nodeConsoleMethods['node.kill'].input.parse(value)
        const keys = request.all ? this.node.running : [request.operationId ?? '']
        result = await Promise.all(keys.map((operationId) => this.node?.cancel(operationId)))
        break
      }
      case 'node.audit':
        result = await this.state.call('audit.list', nodeConsoleMethods['node.audit'].input.parse(value))
        break
      case 'node.unlink':
        if (this.link) await this.link.unlink()
        else await this.state.call('config.set', { key: 'link', value: null })
        result = { accepted: true }
        break
    }
    return nodeConsoleMethods[method].output.parse(result)
  }
}
