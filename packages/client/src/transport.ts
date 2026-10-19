import type { RpcMethod, RpcParams, RpcResults } from '@hbar/contracts'

export interface ClientCallOptions {
  readonly signal?: AbortSignal | undefined
}

export interface ClientTransport {
  call<M extends RpcMethod>(method: M, params: RpcParams<M>, options?: ClientCallOptions): Promise<RpcResults[M]>
}
