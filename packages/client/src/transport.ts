import type { RpcMethod, RpcParams, RpcResults } from '@hbar/contracts'

export interface ClientTransport {
  call<M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResults[M]>
}
